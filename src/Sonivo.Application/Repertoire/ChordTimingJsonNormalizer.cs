using System.Text.Json;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// Validates and normalizes Arrangement.ChordTimingJson (ADR-0031 / T-SYNC-01).
/// Shape: array of { "lineIndex": number (&gt;=0 integer), "atMs": number (&gt;=0 integer) }.
/// Empty / whitespace / [] → null (clears marks). Cap: <see cref="MaxMarks"/>.
/// Duplicate lineIndex allowed; consumers SHOULD treat last-in-array as winning for a line.
/// Output order is ascending by atMs.
/// </summary>
public static class ChordTimingJsonNormalizer
{
    public const int MaxMarks = 2000;

    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>
    /// Returns null when marks are cleared; otherwise a compact JSON array string.
    /// Throws <see cref="ValidationException"/> when the payload is malformed.
    /// </summary>
    public static string? Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var trimmed = raw.Trim();
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(trimmed);
        }
        catch (JsonException)
        {
            throw new ValidationException("chordTimingJson must be a JSON array of timing marks.");
        }

        using (doc)
        {
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                throw new ValidationException("chordTimingJson must be a JSON array of timing marks.");
            }

            var marks = new List<Mark>(doc.RootElement.GetArrayLength());
            foreach (var element in doc.RootElement.EnumerateArray())
            {
                marks.Add(ParseMark(element));
            }

            if (marks.Count == 0)
            {
                return null;
            }

            if (marks.Count > MaxMarks)
            {
                throw new ValidationException(
                    $"chordTimingJson must contain at most {MaxMarks} marks.");
            }

            marks.Sort(static (a, b) => a.AtMs.CompareTo(b.AtMs));

            return JsonSerializer.Serialize(
                marks.Select(m => new { lineIndex = m.LineIndex, atMs = m.AtMs }),
                WriteOptions);
        }
    }

    private static Mark ParseMark(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new ValidationException(
                "Each chordTimingJson mark must be an object with lineIndex and atMs.");
        }

        if (!element.TryGetProperty("lineIndex", out var lineIndexEl))
        {
            throw new ValidationException("Each chordTimingJson mark requires lineIndex.");
        }

        if (!element.TryGetProperty("atMs", out var atMsEl))
        {
            throw new ValidationException("Each chordTimingJson mark requires atMs.");
        }

        return new Mark(
            ReadNonNegativeInt(lineIndexEl, "lineIndex"),
            ReadNonNegativeInt(atMsEl, "atMs"));
    }

    private static int ReadNonNegativeInt(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Number || !el.TryGetInt32(out var value) || value < 0)
        {
            throw new ValidationException(
                $"chordTimingJson {name} must be an integer greater than or equal to 0.");
        }

        return value;
    }

    private readonly record struct Mark(int LineIndex, int AtMs);
}
