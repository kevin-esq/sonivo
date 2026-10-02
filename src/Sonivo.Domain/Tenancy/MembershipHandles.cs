using System.Globalization;
using System.Text;

namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Login handle rules (ADR-0046/0047). A handle is stored next to the GroupId,
/// never as a single "handle@slug" string, and is used by members without an
/// email to sign in as <c>handle@slug</c>.
/// </summary>
public static class MembershipHandles
{
    public const int MinLength = 3;
    public const int MaxLength = 32;

    /// <summary>Characters allowed in a handle: lowercase letters, digits, dot, underscore, hyphen.</summary>
    public static bool IsValid(string? handle)
    {
        if (handle is null || handle.Length is < MinLength or > MaxLength)
        {
            return false;
        }

        foreach (var c in handle)
        {
            var ok = c is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '.' or '_' or '-';
            if (!ok)
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>Lowercases and trims a candidate; returns null when nothing usable remains.</summary>
    public static string? Normalize(string? handle)
    {
        if (string.IsNullOrWhiteSpace(handle))
        {
            return null;
        }

        return handle.Trim().ToLowerInvariant();
    }

    /// <summary>
    /// Derives a valid, non-empty handle from a display name. Accents are folded,
    /// anything outside the allow-list becomes a hyphen, and the result is padded
    /// to the minimum length. Uniqueness is resolved by the caller.
    /// </summary>
    public static string Derive(string displayName)
    {
        var builder = new StringBuilder(displayName.Length);
        foreach (var c in displayName.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            var lower = char.ToLowerInvariant(c);
            builder.Append(lower is (>= 'a' and <= 'z') or (>= '0' and <= '9') ? lower : '-');
        }

        var collapsed = CollapseSeparators(builder.ToString());
        if (collapsed.Length < MinLength)
        {
            collapsed = collapsed.Length == 0 ? "miembro" : collapsed + "-miembro";
        }

        return collapsed.Length > MaxLength ? collapsed[..MaxLength].TrimEnd('-', '.', '_') : collapsed;
    }

    /// <summary>Appends a numeric suffix until the handle fits the maximum length.</summary>
    public static string WithSuffix(string handle, int suffix)
    {
        var tail = "-" + suffix.ToString(CultureInfo.InvariantCulture);
        var room = MaxLength - tail.Length;
        var head = handle.Length > room ? handle[..room].TrimEnd('-', '.', '_') : handle;
        return head + tail;
    }

    private static string CollapseSeparators(string value)
    {
        var builder = new StringBuilder(value.Length);
        var lastSeparator = false;
        foreach (var c in value)
        {
            var separator = c is '-' or '.' or '_';
            if (separator)
            {
                if (!lastSeparator && builder.Length > 0)
                {
                    builder.Append(c);
                }
            }
            else
            {
                builder.Append(c);
            }

            lastSeparator = separator;
        }

        return builder.ToString().TrimEnd('-', '.', '_');
    }
}
