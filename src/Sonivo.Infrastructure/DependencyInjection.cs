using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Connection string 'Default' is not configured.");

        var useInMemory = configuration.GetValue("UseInMemoryDatabase", false);

        services.AddDbContext<SonivoDbContext>(options =>
        {
            if (useInMemory)
            {
                options.UseInMemoryDatabase(
                    configuration["InMemoryDatabaseName"] ?? "sonivo-inmemory");
            }
            else
            {
                options.UseNpgsql(connectionString);
            }
        });

        services.AddDataProtection()
            .SetApplicationName("Sonivo")
            .PersistKeysToDbContext<SonivoDbContext>();

        services
            .AddIdentityCore<ApplicationUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 8;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = false;
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.SignIn.RequireConfirmedEmail = false;
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<SonivoDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders();

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IGroupStore, EfGroupStore>();
        services.AddScoped<IMembershipStore, EfMembershipStore>();
        services.AddScoped<IInvitationStore, EfInvitationStore>();
        services.AddScoped<ISongStore, EfSongStore>();
        services.AddScoped<IArrangementStore, EfArrangementStore>();
        services.AddScoped<IResourceStore, EfResourceStore>();
        services.AddScoped<ISetlistStore, EfSetlistStore>();
        services.AddScoped<IEventStore, EfEventStore>();
        services.AddScoped<IUserDirectory, EfUserDirectory>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddSingleton<IPublicOrigin, ConfigurationPublicOrigin>();
        services.AddHttpClient<IEmailSender, GmailEmailSender>();

        return services;
    }
}
