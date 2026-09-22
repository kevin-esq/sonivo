namespace Sonivo.Infrastructure;

// Pure shape check for the Gmail:From setting (bare addr or "Name <addr>").
// Gmail silently rewrites the From header to the OAuth account unless the
// address is a verified SendAs alias with an exact match — see PHASE-AUTH-SPEC.
public static class GmailFromValidator
{
    public static bool IsValid(string? from) =>
        TryExtractAddress(from, out _);

    public static bool TryExtractAddress(string? from, out string? address)
    {
        address = null;
        if (string.IsNullOrWhiteSpace(from))
        {
            return false;
        }

        var trimmed = from.Trim();
        if (trimmed.Contains('<', StringComparison.Ordinal)
            || trimmed.Contains('>', StringComparison.Ordinal))
        {
            var open = trimmed.LastIndexOf('<');
            var close = trimmed.LastIndexOf('>');
            if (open < 0 || close < 0 || close <= open + 1 || close != trimmed.Length - 1)
            {
                return false;
            }

            trimmed = trimmed[(open + 1)..close].Trim();
        }

        if (!IsAddrShape(trimmed))
        {
            return false;
        }

        address = trimmed;
        return true;
    }

    private static bool IsAddrShape(string candidate)
    {
        if (candidate.Length == 0 || candidate.Contains(' ', StringComparison.Ordinal))
        {
            return false;
        }

        var at = candidate.IndexOf('@');
        if (at <= 0 || at != candidate.LastIndexOf('@') || at == candidate.Length - 1)
        {
            return false;
        }

        var domain = candidate[(at + 1)..];
        var dot = domain.IndexOf('.');
        return dot > 0 && dot < domain.Length - 1;
    }
}
