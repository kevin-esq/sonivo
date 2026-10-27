using System.Text;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>Converts TTML pasted into an Arrangement body through the same bounded import path.</summary>
public static class RawTtmlLyrics
{
    public static LrcConversion? ConvertIfPresent(string? body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        var trimmed = body.AsSpan().TrimStart();
        if (!trimmed.StartsWith("<tt", StringComparison.Ordinal) &&
            !trimmed.StartsWith("<?xml", StringComparison.Ordinal)) return null;

        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(body));
        if (parsed.Errors.Count > 0 || parsed.Format is not ("ttml" or "sonivo-ttml"))
            throw new ValidationException("Invalid TTML lyrics.");

        var converted = LrcConverter.ToChordPro(parsed);
        if (string.IsNullOrWhiteSpace(converted.Lyrics))
            throw new ValidationException("TTML lyrics have no readable lines.");
        return converted;
    }
}
