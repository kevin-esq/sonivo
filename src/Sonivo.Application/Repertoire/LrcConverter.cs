using System.Globalization;
using System.Text;
using System.Text.Json;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>Result of converting LRC into the stored shape (ChordPro text + ADR-0031 marks).</summary>
public sealed record LrcConversion(string Lyrics, string ChordTimingJson, int MarkCount);

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

        // LRC convention: the [offset] tag is SUBTRACTED from the marks. The UI offset is added.
        var shift = -parsed.Metadata.OffsetMs + extraOffsetMs;
        var marks = parsed.Entries
            .Select(e => new
            {
                lineIndex = position[e.LineIndex],
                atMs = Math.Max(0, e.AtMs + shift),
            })
            .OrderBy(m => m.atMs)
            .ToList();

        var json = marks.Count == 0
            ? string.Empty
            : JsonSerializer.Serialize(marks, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            });

        var normalized = ChordTimingJsonNormalizer.Normalize(json) ?? string.Empty;
        return new LrcConversion(string.Join("\n", lines), normalized, marks.Count);
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
