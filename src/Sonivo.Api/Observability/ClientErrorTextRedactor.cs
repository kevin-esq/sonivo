using System.Text.RegularExpressions;

namespace Sonivo.Api.Observability;

internal static partial class ClientErrorTextRedactor
{
    private static readonly Regex UrlPattern = new(
        "(?i)\\b(?:https?://|www\\.)[^\\s<>\"']+|(?<![\\w])/(?:[^\\s?#<>\"']*)(?:\\?[^\\s#<>\"']*|#[^\\s<>\"']+)|(?<![\\w])(?:\\?[^\\s#<>\"']+|#[^\\s<>\"']+)",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex EmailPattern = new(
        @"(?i)(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9-])",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex BearerPattern = new(
        @"(?i)\bBearer\s+[A-Z0-9._~+/-]+=*",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex JwtPattern = new(
        @"(?<![A-Z0-9_-])[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}(?![A-Z0-9_-])",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex GuidPattern = new(
        @"(?<![A-F0-9])[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}(?![A-F0-9])",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex HexPattern = new(
        @"(?<![A-F0-9])[A-F0-9]{24,}(?![A-F0-9])",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex EncodedTokenPattern = new(
        @"(?<![A-Z0-9+/_=-])[A-Z0-9+/_-]{24,}={0,2}(?![A-Z0-9+/_=-])",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    internal static string Redact(string value)
    {
        // shortcut: recognize common token-shaped values, not names or free-form personal data; expand only for a demonstrated leak.
        value = UrlPattern.Replace(value, ReplaceUrl);
        value = EmailPattern.Replace(value, "[email]");
        value = BearerPattern.Replace(value, "[token]");
        value = JwtPattern.Replace(value, "[token]");
        value = GuidPattern.Replace(value, "[id]");
        value = HexPattern.Replace(value, "[token]");
        return EncodedTokenPattern.Replace(value, match => IsEncodedToken(match.Value) ? "[token]" : match.Value);
    }

    private static bool IsEncodedToken(string value)
    {
        if (value.Any(char.IsDigit) || value.IndexOfAny(['+', '/', '=']) >= 0) return true;

        var frequencies = value.GroupBy(character => character).Select(group => group.Count());
        return frequencies.Count() >= 12
            && frequencies.Sum(count =>
            {
                var probability = (double)count / value.Length;
                return -probability * Math.Log2(probability);
            }) >= 4.5;
    }

    private static string ReplaceUrl(Match match)
    {
        var value = match.Value;
        var punctuation = value.Length - value.TrimEnd('.', ',', '!', '?', ';', ':', ')', ']', '}').Length;
        return "[url]" + value[^punctuation..];
    }
}
