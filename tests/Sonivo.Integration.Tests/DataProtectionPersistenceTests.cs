using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

public class DataProtectionPersistenceTests
{
    [Fact]
    public async Task Protect_persists_key_ring_in_the_database()
    {
        var name = $"sonivo-dp-{Guid.NewGuid():N}";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = "Host=unused",
                ["UseInMemoryDatabase"] = "true",
                ["InMemoryDatabaseName"] = name
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(config);
        await using var provider = services.BuildServiceProvider();
        await using var scope = provider.CreateAsyncScope();
        var protector = scope.ServiceProvider
            .GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("sonivo-ops-test");

        var cipher = protector.Protect("cookie-payload");
        Assert.Equal("cookie-payload", protector.Unprotect(cipher));

        var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
        Assert.True(await db.DataProtectionKeys.AnyAsync());
    }
}
