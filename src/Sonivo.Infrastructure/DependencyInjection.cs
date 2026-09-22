using Amazon.S3;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Blobs;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;
using Sonivo.Infrastructure.Whisper;

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
                options.SignIn.RequireConfirmedEmail = true;
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
        // ADR-0035: R2 configured (all four R2__* values present) → R2 singleton,
        // else the Postgres default. Values are never logged (see Program.cs startup line).
        services.Configure<R2Options>(configuration.GetSection(R2Options.SectionName));
        if (R2Options.IsConfigured(configuration))
        {
            services.AddSingleton<IAmazonS3>(sp =>
                R2BlobStore.CreateClient(sp.GetRequiredService<IOptions<R2Options>>().Value));
            // T-R2-02: R2-first dual-read + lazy backfill; Postgres ResourceBlobs kept as fallback.
            services.AddSingleton<R2BlobStore>();
            services.AddScoped<PostgresBlobStore>();
            services.AddScoped<IBlobStore, DualReadBlobStore>();
        }
        else
        {
            services.AddScoped<IBlobStore, PostgresBlobStore>();
        }
        services.AddScoped<ISetlistStore, EfSetlistStore>();
        services.AddScoped<IEventStore, EfEventStore>();
        services.AddScoped<IEventGroupResolver, EfEventGroupResolver>();
        services.AddScoped<IUserDirectory, EfUserDirectory>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddSingleton<IPublicOrigin, ConfigurationPublicOrigin>();
        services.AddHttpClient<IEmailSender, GmailEmailSender>();
        // ADR-0032: Whisper config has no secrets; the fake transcriber replaces
        // IAudioTranscriber in unit/API tests so no model is ever downloaded there.
        services.Configure<DigitizeOptions>(configuration.GetSection("Whisper"));
        services.Configure<WhisperOptions>(configuration.GetSection("Whisper"));
        services.AddSingleton<IAudioTranscriber, WhisperAudioTranscriber>();

        return services;
    }
}
