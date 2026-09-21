using Microsoft.Extensions.Configuration;

namespace Sonivo.Infrastructure.Blobs;

// ADR-0035: R2 config section. Values come from per-environment configuration
// only (local user env R2__*, Render env later) — never in git, never logged.
public sealed class R2Options
{
    public const string SectionName = "R2";

    public string AccountId { get; set; } = string.Empty;
    public string AccessKey { get; set; } = string.Empty;
    public string Secret { get; set; } = string.Empty;
    public string BucketName { get; set; } = string.Empty;

    // All four values are required: partial config keeps the Postgres default.
    public bool IsComplete =>
        !string.IsNullOrWhiteSpace(AccountId)
        && !string.IsNullOrWhiteSpace(AccessKey)
        && !string.IsNullOrWhiteSpace(Secret)
        && !string.IsNullOrWhiteSpace(BucketName);

    public static bool IsConfigured(IConfiguration configuration)
        => configuration.GetSection(SectionName).Get<R2Options>()?.IsComplete == true;
}
