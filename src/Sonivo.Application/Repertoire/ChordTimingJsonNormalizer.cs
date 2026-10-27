using System.Text.Json;
using System.Text.RegularExpressions;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// Validates legacy line marks and additive word/instrumental intervals in Arrangement.ChordTimingJson.
/// Empty / whitespace / [] → null (clears marks). Cap: <see cref="MaxMarks"/>.
/// Output order is ascending by audio start time.
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

            var marks = new List<Entry>(doc.RootElement.GetArrayLength());
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

            marks.Sort(static (a, b) => a.StartMs.CompareTo(b.StartMs));
            var intervals = marks.Where(static mark => mark.EndMs.HasValue).ToList();
            var endByLine = new Dictionary<int, int>();
            foreach (var interval in intervals.Where(m => m.LineIndex.HasValue))
            {
                var line = interval.LineIndex!.Value;
                if (endByLine.TryGetValue(line, out var previousEnd) && interval.StartMs < previousEnd)
                {
                    throw new ValidationException("chordTimingJson words on the same line cannot overlap.");
                }
                endByLine[line] = interval.EndMs!.Value;
            }
            var instrumentalEnd = -1;
            foreach (var instrumental in intervals.Where(m => !m.LineIndex.HasValue))
            {
                if (instrumental.StartMs < instrumentalEnd ||
                    marks.Any(m => m.LineIndex.HasValue && m.StartMs < instrumental.EndMs &&
                        (m.EndMs ?? m.LineEndMs ?? m.StartMs) > instrumental.StartMs))
                {
                    throw new ValidationException("chordTimingJson instrumental intervals cannot overlap vocals or other instrumentals.");
                }
                instrumentalEnd = instrumental.EndMs!.Value;
            }
            return JsonSerializer.Serialize(marks.Select(m => m.Value), WriteOptions);
        }
    }

    public static void ValidateWordReferences(string? normalizedJson, string? lyricSource)
    {
        if (string.IsNullOrWhiteSpace(normalizedJson)) return;
        using var document = JsonDocument.Parse(normalizedJson);
        var lines = (lyricSource ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n');
        foreach (var element in document.RootElement.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty("wordIndex", out var wordIndexEl)) continue;
            var lineIndex = element.GetProperty("lineIndex").GetInt32();
            var wordIndex = wordIndexEl.GetInt32();
            if (lineIndex >= lines.Length)
            {
                throw new ValidationException("chordTimingJson lineIndex must reference an existing lyric line.");
            }

            var plainLine = Regex.Replace(lines[lineIndex], @"\[[^\]]*\]|\{[^}]*\}", string.Empty);
            var wordCount = Regex.Matches(plainLine, @"\S+").Count;
            if (wordIndex >= wordCount)
            {
                throw new ValidationException("chordTimingJson wordIndex must reference an existing word.");
            }
        }
    }

    private static Entry ParseMark(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new ValidationException(
                "Each chordTimingJson mark must be an object with lineIndex and atMs.");
        }

        if (element.TryGetProperty("type", out var typeEl) &&
            typeEl.ValueKind == JsonValueKind.String &&
            typeEl.GetString() == "instrumental")
        {
            var startMs = ReadRequiredInt(element, "startMs");
            var endMs = ReadRequiredInt(element, "endMs");
            if (endMs <= startMs)
            {
                throw new ValidationException("chordTimingJson endMs must be greater than startMs.");
            }

            return new Entry(startMs, endMs, new { type = "instrumental", startMs, endMs });
        }

        var lineIndex = ReadRequiredInt(element, "lineIndex");
        if (element.TryGetProperty("wordIndex", out var wordIndexEl))
        {
            var wordIndex = ReadNonNegativeInt(wordIndexEl, "wordIndex");
            var startMs = ReadRequiredInt(element, "startMs");
            var endMs = ReadRequiredInt(element, "endMs");
            if (endMs <= startMs)
            {
                throw new ValidationException("chordTimingJson endMs must be greater than startMs.");
            }

            return new Entry(startMs, endMs, new { lineIndex, wordIndex, startMs, endMs }, lineIndex);
        }

        var atMs = ReadRequiredInt(element, "atMs");
        if (element.TryGetProperty("endMs", out var lineEnd))
        {
            var endMs = ReadNonNegativeInt(lineEnd, "endMs");
            if (endMs <= atMs) throw new ValidationException("chordTimingJson endMs must be greater than atMs.");
            // Line intervals may overlap; word/instrumental validation is separate.
            return new Entry(atMs, null, new { lineIndex, atMs, endMs }, lineIndex, endMs);
        }
        return new Entry(atMs, null, new { lineIndex, atMs }, lineIndex);
    }

    private static int ReadRequiredInt(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value))
        {
            throw new ValidationException($"Each chordTimingJson entry requires {name}.");
        }

        return ReadNonNegativeInt(value, name);
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

    private sealed record Entry(int StartMs, int? EndMs, object Value, int? LineIndex = null, int? LineEndMs = null);
}
