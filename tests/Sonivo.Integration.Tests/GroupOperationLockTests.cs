using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

public sealed class GroupOperationLockTests
{
    [Fact]
    public async Task Lifecycle_and_ownership_operations_serialize_on_the_same_group_lock()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG")
            ?? "Host=localhost;Port=5433;Database=sonivo_plans_integration_test;Username=sonivo;Password=sonivo";
        var parsed = new NpgsqlConnectionStringBuilder(connectionString);
        Assert.StartsWith("sonivo_plans_", parsed.Database, StringComparison.Ordinal);
        var options = new DbContextOptionsBuilder<SonivoDbContext>().UseNpgsql(connectionString).Options;
        await using var first = new SonivoDbContext(options);
        await using var second = new SonivoDbContext(options);
        await using var firstTransaction = await first.Database.BeginTransactionAsync();
        await using var secondTransaction = await second.Database.BeginTransactionAsync();
        var groupId = Guid.NewGuid();
        await new EfGroupOperationLock(first).LockAsync(groupId, CancellationToken.None);

        await using var command = second.Database.GetDbConnection().CreateCommand();
        command.Transaction = secondTransaction.GetDbTransaction();
        command.CommandText = "SELECT pg_try_advisory_xact_lock(hashtextextended(@groupId, 0))";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "groupId";
        parameter.Value = groupId.ToString();
        command.Parameters.Add(parameter);
        Assert.False((bool)(await command.ExecuteScalarAsync())!);

        await firstTransaction.CommitAsync();
        await new EfGroupOperationLock(second).LockAsync(groupId, CancellationToken.None);
        await secondTransaction.CommitAsync();
    }
}
