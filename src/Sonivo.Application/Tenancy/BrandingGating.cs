using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;

namespace Sonivo.Application.Tenancy;

/// <summary>
/// Server-authoritative plan gating for brand writes (ADR-0071,
/// PHASE-PLANS-SPEC §6.2/§6.4). Rejects fields the group's plan does not include;
/// the client mirrors the same capability map (validation symmetry).
/// </summary>
public static class BrandingGating
{
    public static void EnsureAllowed(BrandingCapabilities caps, UpdateGroupBrandingCommand c)
    {
        if (!caps.Accent && (c.AccentHex is not null || c.AccentColorHex is not null))
        {
            throw new ValidationException("Your plan does not include custom colours.");
        }

        if (!caps.SplitColors && (c.SecondaryHex is not null || c.SuccessHex is not null || c.WarningHex is not null || c.ErrorHex is not null))
        {
            throw new ValidationException("Your plan does not include separate primary/secondary colours.");
        }

        if (!caps.Font && c.Typography is not null && !string.Equals(c.Typography, "system", StringComparison.Ordinal))
        {
            throw new ValidationException("Your plan does not include custom typography.");
        }

        if (!caps.Icon && (c.CoverKind is not null || c.CoverValue is not null))
        {
            throw new ValidationException("Your plan does not include a custom group icon.");
        }

        if (!caps.BrandName && (c.DisplayName is not null || c.Tagline is not null || c.Verse is not null))
        {
            throw new ValidationException("Your plan does not include a custom brand name.");
        }

        if (!caps.WelcomeText && c.WelcomeText is not null)
        {
            throw new ValidationException("Your plan does not include a custom welcome text.");
        }

        if (!caps.LoginBranding && c.LoginHeadline is not null)
        {
            throw new ValidationException("Your plan does not include login branding.");
        }

        if (!caps.RemovePoweredBy && !c.ShowSonivoCredit)
        {
            throw new ValidationException("Your plan does not allow removing the Sonivo credit.");
        }
    }
}
