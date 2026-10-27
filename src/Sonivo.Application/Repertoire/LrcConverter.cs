using System.Globalization;
using System.Text;
using System.Text.Json;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>Result of converting LRC into the stored shape (ChordPro text + ADR-0031 marks).</summary>
public sealed record LrcConversion(string Lyrics, string ChordTimingJson, int MarkCount)
{
    public IReadOnlyList<string> Warnings { get; init; } = [];
    public int WordCount { get; init; }
}

/// <summary>
/// Converts between the LRC interchange format and what Sonivo stores: plain ChordPro
/// lyrics plus <c>ChordTimingJson</c> marks (ADR-0031). No new Arrangement column is added
/// (ADR-0050): LRC is import/export only.
/// </summary>
public static class LrcConverter
{
    /// <summary>
    /// LRC → (lyrics text, chordTimingJson). One lyric line per source line; every time mark
    /// becomes a mark on that line. The LRC <c>[offset]</c> plus <paramref name="extraOffsetMs"/>
    /// shift every mark (never below zero).
    /// </summary>
    public static LrcConversion ToChordPro(LrcParseResult parsed, int extraOffsetMs = 0)
    {
        ArgumentNullException.ThrowIfNull(parsed);

        var lineIndexes = parsed.Entries
            .Select(e => e.LineIndex)
            .Distinct()
            .OrderBy(i => i)
            .ToList();

        var lines = new List<string>(lineIndexes.Count);
        var position = new Dictionary<int, int>(lineIndexes.Count);
        foreach (var index in lineIndexes)
        {
            position[index] = lines.Count;
            lines.Add(parsed.Entries.First(e => e.LineIndex == index).Text);
        }
        if (parsed.SourceText is { } source)
        {
            lines = source.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Split('\n').ToList();
            position = Enumerable.Range(0, lines.Count).ToDictionary(index => index);
        }
        // Arrangement normalizes its body with Trim(). Remap before preview so saved
        // word/line references cannot drift when the input has blank edge lines.
        var body = string.Join("\n", lines);
        var leadingWhitespace = body.Length - body.TrimStart().Length;
        var removedLines = body[..leadingWhitespace].Count(c => c == '\n');
        lines = body.Trim().Split('\n').ToList();
        position = position.Where(item => item.Value >= removedLines && item.Value < removedLines + lines.Count)
            .ToDictionary(item => item.Key, item => item.Value - removedLines);

        // LRC convention: the [offset] tag is SUBTRACTED from the marks. The UI offset is added.
        var shift = -(long)parsed.Metadata.OffsetMs + extraOffsetMs;
        var marks = new List<object>();
        foreach (var entry in parsed.Entries)
        {
            if (!position.TryGetValue(entry.LineIndex, out var lineIndex)) continue;
            var atMs = Shift(entry.AtMs, shift);
            if (entry.EndMs is { } end)
            {
                var endMs = Shift(end, shift);
                if (endMs <= atMs) continue;
                marks.Add(new { lineIndex, atMs, endMs });
            }
            else marks.Add(new { lineIndex, atMs });
        }
        var wordCount = 0;
        foreach (var word in parsed.Words)
        {
            if (!position.TryGetValue(word.LineIndex, out var lineIndex)) continue;
            var startMs = Shift(word.StartMs, shift);
            var endMs = Shift(word.EndMs, shift);
            if (endMs <= startMs) continue;
            marks.Add(new { lineIndex, wordIndex = word.WordIndex, startMs, endMs });
            wordCount++;
        }
        foreach (var instrumental in parsed.Instrumentals)
        {
            var startMs = Shift(instrumental.StartMs, shift);
            var endMs = Shift(instrumental.EndMs, shift);
            if (endMs > startMs) marks.Add(new { type = "instrumental", startMs, endMs });
        }

        var json = marks.Count == 0
            ? string.Empty
            : JsonSerializer.Serialize(marks, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            });

        var normalized = ChordTimingJsonNormalizer.Normalize(json) ?? string.Empty;
        var clipped = parsed.Entries.Any(e => !position.ContainsKey(e.LineIndex) || e.AtMs + shift < 0) ||
            parsed.Words.Any(w => w.StartMs + shift < 0) || parsed.Instrumentals.Any(i => i.StartMs + shift < 0);
        return new LrcConversion(string.Join("\n", lines), normalized, marks.Count)
        {
            WordCount = wordCount,
            Warnings = clipped ? ["lyrics.clippedTiming"] : [],
        };
    }

    private static int Shift(int time, long shift)
    {
        var value = Math.Max(0, time + shift);
        if (value > int.MaxValue) throw new ValidationException("Lyric time exceeds the supported millisecond range.");
        return (int)value;
    }

    /// <summary>
    /// (lyrics, chordTimingJson) → LRC text. Throws <see cref="ValidationException"/> when the
    /// arrangement has no marks (there is nothing to time) or the marks JSON is malformed.
    /// </summary>
    public static string ToLrc(string? lyrics, string? chordTimingJson, LrcMetadata? metadata = null)
    {
        if (string.IsNullOrWhiteSpace(chordTimingJson))
        {
            throw new ValidationException("This arrangement has no time marks to export.");
        }

        var lines = (lyrics ?? string.Empty)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(chordTimingJson);
        }
        catch (JsonException)
        {
            throw new ValidationException("Stored time marks are malformed.");
        }

        var builder = new StringBuilder();
        if (metadata is not null)
        {
            AppendTag(builder, "ti", metadata.Title);
            AppendTag(builder, "ar", metadata.Artist);
            AppendTag(builder, "al", metadata.Album);
            AppendTag(builder, "by", metadata.By);
        }

        using (doc)
        {
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                throw new ValidationException("Stored time marks are malformed.");
            }

            var rendered = new List<(int AtMs, string Text)>();
            foreach (var element in doc.RootElement.EnumerateArray())
            {
                if (!element.TryGetProperty("lineIndex", out var lineIndexEl) ||
                    !element.TryGetProperty("atMs", out var atMsEl) ||
                    !lineIndexEl.TryGetInt32(out var lineIndex) ||
                    !atMsEl.TryGetInt32(out var atMs) ||
                    lineIndex < 0 || lineIndex >= lines.Length)
                {
                    continue;
                }

                rendered.Add((atMs, lines[lineIndex]));
            }

            foreach (var (atMs, text) in rendered.OrderBy(r => r.AtMs))
            {
                builder.Append('[').Append(FormatTime(atMs)).Append(']').Append(text).Append('\n');
            }
        }

        return builder.ToString();
    }

    private static void AppendTag(StringBuilder builder, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            builder.Append('[').Append(name).Append(':').Append(value).Append("]\n");
        }
    }

    private static string FormatTime(int atMs)
    {
        var totalSeconds = atMs / 1000;
        var centis = (atMs % 1000) / 10;
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{totalSeconds / 60:D2}:{totalSeconds % 60:D2}.{centis:D2}");
    }
}
