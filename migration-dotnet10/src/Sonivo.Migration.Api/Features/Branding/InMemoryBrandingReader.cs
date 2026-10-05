using System.Collections.Frozen;

namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Sandbox store: three representative tenants used to exercise localization,
/// contrast derivation and asset links without a database. The lookup table is
/// a <see cref="FrozenDictionary{TKey,TValue}"/> so reads are allocation-free
/// and branch-predictable (frozen collections are optimized for read-only
/// lookups on the request hot path).
/// </summary>
public sealed class InMemoryBrandingReader : IBrandingReader
{
    private static readonly FrozenDictionary<string, TenantBranding> Tenants = Build();

    public ValueTask<TenantBranding?> FindBySlugAsync(string slug, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return ValueTask.FromResult(Tenants.GetValueOrDefault(slug));
    }

    private static FrozenDictionary<string, TenantBranding> Build()
    {
        TenantBranding[] seed =
        [
            new()
            {
                TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                Slug = "grace-community",
                DisplayName = "Grace Community",
                PrimaryHex = "#0369a1",
                SecondaryHex = "#0ea5e9",
                AccentHex = "#0284c7",
                SuccessHex = "#047857",
                WarningHex = "#b45309",
                ErrorHex = "#b91c1c",
                Typography = "inter",
                ThemeDefault = "system",
                CoverKind = "gradient",
                CoverValue = "ocean",
                DefaultLocale = "es",
                WelcomeText = "Bienvenido a la comunidad de canto",
                LoginHeadline = "Accede al repertorio del grupo",
                Tagline = "Cantamos juntos",
                Verse = "Cantad al Señor un cántico nuevo",
                HasLogo = true,
                HasBanner = true,
                HasFavicon = false,
                ShowPlatformCredit = true,
                Version = 7,
                UpdatedAt = new DateTimeOffset(2026, 9, 28, 10, 15, 0, TimeSpan.Zero)
            },
            new()
            {
                TenantId = Guid.Parse("22222222-2222-2222-2222-222222222222"),
                Slug = "riverside-band",
                DisplayName = "Riverside Band",
                PrimaryHex = "#6d4ee0",
                SecondaryHex = "#a78bfa",
                AccentHex = "#8366f1",
                Typography = "poppins",
                ThemeDefault = "dark",
                CoverKind = "emoji",
                CoverValue = "🎸",
                DefaultLocale = "en",
                WelcomeText = "Welcome to Riverside Band",
                LoginHeadline = "Sign in to your setlists",
                Tagline = "Play loud, play together",
                HasLogo = false,
                HasBanner = true,
                HasFavicon = true,
                ShowPlatformCredit = false,
                Version = 3,
                UpdatedAt = new DateTimeOffset(2026, 8, 14, 18, 40, 0, TimeSpan.Zero)
            },
            new()
            {
                TenantId = Guid.Parse("33333333-3333-3333-3333-333333333333"),
                Slug = "coro-luz",
                DisplayName = "Coro Luz",
                PrimaryHex = "#047857",
                SecondaryHex = "#10b981",
                AccentHex = "#059669",
                Typography = "lora",
                ThemeDefault = "light",
                CoverKind = "gradient",
                CoverValue = "forest",
                DefaultLocale = "pt",
                LoginHeadline = "Entre no repertório do coro",
                HasLogo = true,
                HasBanner = false,
                HasFavicon = false,
                ShowPlatformCredit = true,
                Version = 1,
                UpdatedAt = new DateTimeOffset(2026, 7, 2, 9, 5, 0, TimeSpan.Zero)
            }
        ];

        return seed.ToFrozenDictionary(tenant => tenant.Slug, StringComparer.OrdinalIgnoreCase);
    }
}
