namespace Sonivo.Domain.Billing;

/// <summary>
/// Brand personalization level a plan unlocks (ADR-0071, PHASE-PLANS-SPEC §5.1/§6.2).
/// </summary>
public enum BrandingLevel
{
    None = 0,
    Basic = 1,
    Advanced = 2
}

/// <summary>
/// The brand capabilities a plan allows. The saved brand config is filtered by
/// this at render/validation; forbidden fields are ignored, never deleted.
/// </summary>
public sealed record BrandingCapabilities(
    bool Themes,
    bool Accent,
    bool Intensity,
    bool Icon,
    bool SplitColors,
    bool GradientStyle,
    bool Font,
    bool BrandName,
    bool WelcomeText,
    bool LoginBranding,
    bool Logo,
    bool Banner,
    bool RemovePoweredBy)
{
    public static readonly BrandingCapabilities None =
        new(false, false, false, false, false, false, false, false, false, false, false, false, false);

    public static readonly BrandingCapabilities Basic =
        new(true, true, true, true, false, false, false, false, false, false, false, false, false);

    public static readonly BrandingCapabilities Advanced =
        new(true, true, true, true, true, true, true, true, true, true, true, true, true);

    public static BrandingCapabilities For(BrandingLevel level) => level switch
    {
        BrandingLevel.Advanced => Advanced,
        BrandingLevel.Basic => Basic,
        _ => None
    };
}

/// <summary>Hard limits per plan. <c>null</c> means unlimited.</summary>
public sealed record PlanLimits(
    int? Members,
    int? Groups,
    int? Songs,
    int? Setlists,
    int? EventsPerMonth,
    int? StorageGb,
    string StorageScope);

/// <summary>Non-limit features per plan.</summary>
public sealed record PlanFeatures(
    string RolesLevel,
    string HistoryLevel,
    bool Stats,
    string Support,
    BrandingLevel Branding,
    bool RemovePoweredBy);

/// <summary>Billing lifecycle states (ADR-0071/0073, PHASE-PLANS-SPEC §4).</summary>
public static class BillingStatuses
{
    public const string Active = "active";
    public const string Trialing = "trialing";
    public const string PastDue = "past_due";
    public const string ReadOnly = "read_only";

    public static readonly IReadOnlyList<string> All = [Active, Trialing, PastDue, ReadOnly];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}

/// <summary>A plan definition from the single-source catalog.</summary>
public sealed record PlanDefinition(
    string Id,
    int PriceMonthlyMxn,
    int TrialDays,
    bool TrialRequiresCard,
    PlanLimits Limits,
    PlanFeatures Features)
{
    public BrandingCapabilities BrandingCapabilities => BrandingCapabilities.For(Features.Branding);
}

/// <summary>
/// The entitlements catalog (ADR-0071). This is the ONLY place plan numbers and
/// capabilities live (PHASE-PLANS-SPEC §6.1/§6.2). Values are placeholder v0.1 and
/// are meant to be tuned here without touching the rest of the code.
/// </summary>
public static class PlanCatalog
{
    public const string Starter = "starter";
    public const string Pro = "pro";
    public const string Studio = "studio";

    /// <summary>
    /// Placeholder default until billing exists: existing groups keep their full
    /// brand capabilities (Studio/Advanced) so nothing regresses on rollout.
    /// </summary>
    public const string DefaultPlanId = Studio;

    public static readonly IReadOnlyDictionary<string, PlanDefinition> Plans =
        new Dictionary<string, PlanDefinition>(StringComparer.Ordinal)
        {
            [Starter] = new(
                Starter,
                PriceMonthlyMxn: 99,
                TrialDays: 14,
                TrialRequiresCard: false,
                Limits: new PlanLimits(Members: 5, Groups: 1, Songs: 50, Setlists: 5, EventsPerMonth: 10, StorageGb: 1, StorageScope: "group"),
                Features: new PlanFeatures(RolesLevel: "basic", HistoryLevel: "basic", Stats: false, Support: "email", Branding: BrandingLevel.None, RemovePoweredBy: false)),

            [Pro] = new(
                Pro,
                PriceMonthlyMxn: 199,
                TrialDays: 14,
                TrialRequiresCard: false,
                Limits: new PlanLimits(Members: 15, Groups: 1, Songs: 500, Setlists: 50, EventsPerMonth: null, StorageGb: 10, StorageScope: "group"),
                Features: new PlanFeatures(RolesLevel: "advanced", HistoryLevel: "full", Stats: true, Support: "priority", Branding: BrandingLevel.Basic, RemovePoweredBy: false)),

            [Studio] = new(
                Studio,
                PriceMonthlyMxn: 499,
                TrialDays: 14,
                TrialRequiresCard: true,
                Limits: new PlanLimits(Members: null, Groups: 3, Songs: null, Setlists: null, EventsPerMonth: null, StorageGb: 50, StorageScope: "organization"),
                Features: new PlanFeatures(RolesLevel: "advanced", HistoryLevel: "full", Stats: true, Support: "priority", Branding: BrandingLevel.Advanced, RemovePoweredBy: true))
        };

    public static bool IsKnown(string? planId) =>
        planId is not null && Plans.ContainsKey(planId);

    /// <summary>Resolves a plan id, falling back to the default for unknown/legacy ids.</summary>
    public static PlanDefinition Get(string? planId) =>
        IsKnown(planId) ? Plans[planId!] : Plans[DefaultPlanId];

    public static BrandingCapabilities BrandingCapabilitiesFor(string? planId) =>
        Get(planId).BrandingCapabilities;
}
