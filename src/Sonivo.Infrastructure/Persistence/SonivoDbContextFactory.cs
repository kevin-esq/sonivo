using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Persistence;

public sealed class SonivoDbContextFactory : IDesignTimeDbContextFactory<SonivoDbContext>
{
    public SonivoDbContext CreateDbContext(string[] args)
    {
        var basePath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "Sonivo.Api"));
        if (!Directory.Exists(basePath))
        {
            basePath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "src", "Sonivo.Api"));
        }

        var configuration = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration["SONIVO_MIGRATION_CONNECTION"]
            ?? throw new InvalidOperationException(
                "SONIVO_MIGRATION_CONNECTION is required for EF Core design-time operations. "
                + "Keep this privileged connection out of the web application's runtime configuration.");
        var optionsBuilder = new DbContextOptionsBuilder<SonivoDbContext>();
        optionsBuilder.UseNpgsql(connectionString);
        return new SonivoDbContext(optionsBuilder.Options);
    }
}
