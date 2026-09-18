using System.Text.RegularExpressions;

namespace Sonivo.Api.Auth;

/// <summary>
/// Allowlisted post-OAuth return paths (join invite). Rejects absolute/external URLs.
/// Mirrors web <c>safeJoinNextPath</c>.
/// </summary>
public static partial class OAuthNext
{
    private static readonly Regex JoinNextPath = JoinNextPathRegex();

    public static string? Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (!trimmed.StartsWith("/", StringComparison.Ordinal)
            || trimmed.StartsWith("//", StringComparison.Ordinal)
            || trimmed.Contains("://", StringComparison.Ordinal)
            || trimmed.Contains('\\'))
        {
            return null;
        }

        if (!JoinNextPath.IsMatch(trimmed))
        {
            return null;
        }

        return trimmed;
    }

    [GeneratedRegex(@"^/join/[A-Za-z0-9._~-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex JoinNextPathRegex();
}
