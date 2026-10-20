using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Persistence;

/// <summary>
/// Runs bounded data operations in a transaction, with only the context values
/// explicitly set by the caller. Group scope remains application-verified.
/// </summary>
public sealed class EfGroupDataOperation : IGroupDataOperation
{
    private readonly SonivoDbContext _db;
    private readonly IGroupDatabaseScope _scope;

    public EfGroupDataOperation(SonivoDbContext db, IGroupDatabaseScope scope)
    {
        _db = db;
        _scope = scope;
    }

    public async Task<T> ExecuteAsUserAsync<T>(
        Guid userId,
        Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("Authenticated user id is required.", nameof(userId));
        }

        return await ExecuteInTransactionAsync(async operationToken =>
        {
            await _scope.SetAuthenticatedUserAsync(userId, operationToken);
            return await operation(operationToken);
        }, cancellationToken);
    }

    public async Task<T> ExecuteInTransactionAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);

        if (!_db.Database.IsRelational() || _db.Database.CurrentTransaction is not null)
        {
            return await operation(cancellationToken);
        }

        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var result = await operation(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return result;
            }
            catch
            {
                await transaction.RollbackAsync(CancellationToken.None);
                _db.ChangeTracker.Clear();
                throw;
            }
        });
    }
}
