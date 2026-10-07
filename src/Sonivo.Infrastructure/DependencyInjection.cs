using Amazon.S3;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing.Payments;
using Sonivo.Infrastructure.Blobs;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Notifications;
using Sonivo.Infrastructure.Payments;
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
        services.AddScoped<IGroupBrandingStore, EfGroupBrandingStore>();
        services.AddScoped<IAccountAuditStore, EfAccountAuditStore>();
        services.AddScoped<IMembershipStore, EfMembershipStore>();
        services.AddScoped<IGroupAuditStore, EfGroupAuditStore>();
        services.AddScoped<INotificationStore, EfNotificationStore>();
        services.AddScoped<IInvitationStore, EfInvitationStore>();
        services.AddScoped<ISongStore, EfSongStore>();
        services.AddScoped<IArrangementStore, EfArrangementStore>();
        services.AddScoped<IResourceStore, EfResourceStore>();
        // T-R2-04: R2 configured (all four R2__* values present) → R2 singleton,
        // else the filesystem fallback (local dev without creds, CI).
        // Values are never logged (see Program.cs startup line).
        services.Configure<R2Options>(configuration.GetSection(R2Options.SectionName));
        services.Configure<BlobsOptions>(configuration.GetSection(BlobsOptions.SectionName));
        if (R2Options.IsConfigured(configuration))
        {
            services.AddSingleton<IAmazonS3>(sp =>
                R2BlobStore.CreateClient(sp.GetRequiredService<IOptions<R2Options>>().Value));
            services.AddSingleton<R2BlobStore>();
            services.AddScoped<IBlobStore>(sp => sp.GetRequiredService<R2BlobStore>());
        }
        else
        {
            services.AddSingleton<FileSystemBlobStore>();
            services.AddScoped<IBlobStore>(sp => sp.GetRequiredService<FileSystemBlobStore>());
        }
        services.AddScoped<ISetlistStore, EfSetlistStore>();
        services.AddScoped<IEventStore, EfEventStore>();
        services.AddScoped<ITaskStore, EfTaskStore>();
        services.AddScoped<IWebhookEventStore, EfWebhookEventStore>();
        services.AddScoped<IEventGroupResolver, EfEventGroupResolver>();
        services.AddScoped<IUserDirectory, EfUserDirectory>();
        services.AddScoped<IEventNotifier, EventNotifier>();
        services.AddScoped<IManagedAccountNotifier, ManagedAccountNotifier>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddSingleton<IPublicOrigin, ConfigurationPublicOrigin>();
        // ADR-0068: provider-agnostic transport, selected by Email:Transport.
        // "api" (HTTP JSON) is required on hosts that block outbound SMTP
        // (serverless free tiers block 25/465/587); "smtp" is the default.
        var emailTransport = configuration["Email:Transport"];
        if (string.Equals(emailTransport, "api", StringComparison.OrdinalIgnoreCase))
        {
            services.AddHttpClient<IEmailSender, ApiEmailSender>();
        }
        else
        {
            services.AddSingleton<IEmailSender, SmtpEmailSender>();
        }
        // ADR-0073 §9.13: provider-agnostic payments. "manual" (default) is the
        // invoice-based flow with no gateway; "sandbox" is a signed test gateway.
        // Secrets come from configuration only and are never logged.
        var paymentsProvider = configuration["Payments:Provider"];
        if (string.Equals(paymentsProvider, "sandbox", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IPaymentProvider>(_ => new SandboxPaymentProvider(
                configuration["Payments:WebhookSecret"] ?? string.Empty,
                configuration["Payments:CheckoutBaseUrl"] ?? string.Empty));
        }
        else
        {
            services.AddSingleton<IPaymentProvider, ManualPaymentProvider>();
        }

        // ADR-0032: Whisper config has no secrets; the fake transcriber replaces
        // IAudioTranscriber in unit/API tests so no model is ever downloaded there.
        services.Configure<DigitizeOptions>(configuration.GetSection("Whisper"));
        services.Configure<WhisperOptions>(configuration.GetSection("Whisper"));
        services.AddSingleton<IAudioTranscriber, WhisperAudioTranscriber>();

        return services;
    }
}
