using System.Text;
using System.Text.RegularExpressions;

namespace Sonivo.Application.Repertoire;

/// <summary>A malformed line found while parsing an .lrc file.</summary>
public sealed record LrcError(int Line, string Reason);

/// <summary>One timed lyric line. <see cref="LineIndex"/> indexes the produced lyrics text.</summary>
public sealed record LrcEntry(int LineIndex, int AtMs, string Text);

/// <summary>[ti]/[ar]/[al]/[by]/[offset] tags.</summary>
public sealed record LrcMetadata(string? Title, string? Artist, string? Album, string? By, int OffsetMs);

public sealed record LrcParseResult(
    IReadOnlyList<LrcEntry> Entries,
    LrcMetadata Metadata,
    IReadOnlyList<LrcError> Errors,
    IReadOnlyList<string> Warnings,
    string Encoding);

/// <summary>
/// Parses the LRC lyric format (ADR-0050). Pure and dependency-free: it is the single
/// place that decides encoding, validates limits and reports per-line errors, so the API
/// can return <c>errors[{ line, reason }]</c> without duplicating rules.
/// </summary>
public static partial class LrcParser
{
    public const int MaxBytes = 256 * 1024;
    public const int MaxLines = 5_000;
    public const int MaxMarks = ChordTimingJsonNormalizer.MaxMarks;

    private static readonly Regex TimeTag = TimeTagRegex();
    private static readonly Regex MetaTag = MetaTagRegex();

    public static LrcParseResult Parse(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);

        var warnings = new List<string>();
        var errors = new List<LrcError>();

        if (bytes.Length > MaxBytes)
        {
            errors.Add(new LrcError(0, $"file is larger than {MaxBytes / 1024} KiB"));
            return new LrcParseResult([], EmptyMetadata, errors, warnings, "unknown");
        }

        var (text, encoding, fallback) = Decode(bytes);
        if (fallback)
        {
            warnings.Add(
                "not valid UTF-8: decoded as Windows-1252; accented characters may be wrong");
        }

        var rawLines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        if (rawLines.Length > MaxLines)
        {
            errors.Add(new LrcError(0, $"file has more than {MaxLines} lines"));
            return new LrcParseResult([], EmptyMetadata, errors, warnings, encoding);
        }

        string? title = null, artist = null, album = null, by = null;
        var offsetMs = 0;

        // lineIndex -> marks (ms), preserving first-seen order of the lyric lines.
        var order = new List<int>();
        var textByIndex = new Dictionary<int, string>();
        var marksByIndex = new Dictionary<int, List<int>>();
        var nextIndex = 0;
        var totalMarks = 0;

        for (var i = 0; i < rawLines.Length; i++)
        {
            var lineNumber = i + 1;
            var line = rawLines[i].Trim();
            if (line.Length == 0)
            {
                continue;
            }

            var meta = MetaTag.Match(line);
            if (meta.Success)
            {
                var value = meta.Groups[2].Value.Trim();
                switch (meta.Groups[1].Value.ToLowerInvariant())
                {
                    case "ti": title = value; break;
                    case "ar": artist = value; break;
                    case "al": album = value; break;
                    case "by": by = value; break;
                    case "offset":
                        if (int.TryParse(value, out var parsed)) offsetMs = parsed;
                        else errors.Add(new LrcError(lineNumber, "offset is not an integer"));
                        break;
                }

                continue;
            }

            var times = new List<int>();
            foreach (Match m in TimeTag.Matches(line))
            {
                times.Add(ToMilliseconds(m));
            }

            var remainder = TimeTag.Replace(line, string.Empty).Trim();

            if (times.Count == 0)
            {
                errors.Add(new LrcError(lineNumber, "no time mark"));
                continue;
            }

            // Only *unbalanced* brackets are an error: ChordPro chords (e.g. "[Am]") are valid text.
            var opens = remainder.Count(c => c == '[');
            var closes = remainder.Count(c => c == ']');
            if (opens != closes)
            {
                errors.Add(new LrcError(lineNumber, "unbalanced bracket"));
            }

            if (!textByIndex.ContainsKey(nextIndex))
            {
                order.Add(nextIndex);
                textByIndex[nextIndex] = remainder;
                marksByIndex[nextIndex] = [];
            }

            foreach (var ms in times)
            {
                marksByIndex[nextIndex].Add(ms);
                totalMarks++;
            }

            nextIndex++;
        }

        if (totalMarks > MaxMarks)
        {
            errors.Add(new LrcError(0, $"file has more than {MaxMarks} time marks"));
            return new LrcParseResult([], EmptyMetadata, errors, warnings, encoding);
        }

        var entries = new List<LrcEntry>(totalMarks);
        var previous = int.MinValue;
        var unordered = false;
        foreach (var index in order)
        {
            foreach (var ms in marksByIndex[index])
            {
                if (ms < previous)
                {
                    unordered = true;
                }

                previous = ms;
                entries.Add(new LrcEntry(index, ms, textByIndex[index]));
            }
        }

        if (unordered)
        {
            warnings.Add("time marks are not in ascending order; they will be sorted on import");
        }

        entries.Sort(static (a, b) => a.AtMs.CompareTo(b.AtMs));

        var metadata = new LrcMetadata(title, artist, album, by, offsetMs);
        return new LrcParseResult(entries, metadata, errors, warnings, encoding);
    }

    private static LrcMetadata EmptyMetadata => new(null, null, null, null, 0);

    private static int ToMilliseconds(Match m)
    {
        var minutes = int.Parse(m.Groups[1].Value);
        var seconds = int.Parse(m.Groups[2].Value);
        var fraction = m.Groups[3].Success ? m.Groups[3].Value : string.Empty;
        var millis = fraction.Length switch
        {
            0 => 0,
            1 => int.Parse(fraction) * 100,
            2 => int.Parse(fraction) * 10,
            _ => int.Parse(fraction.PadRight(3, '0')[..3]),
        };

        return ((minutes * 60) + seconds) * 1000 + millis;
    }

    private static (string Text, string Encoding, bool Fallback) Decode(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
        {
            return (Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3), "utf-8-bom", false);
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
        {
            return (Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2), "utf-16le-bom", false);
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
        {
            return (Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2), "utf-16be-bom", false);
        }

        try
        {
            var strict = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
            return (strict.GetString(bytes), "utf-8", false);
        }
        catch (DecoderFallbackException)
        {
            return (Windows1252.Decode(bytes), "windows-1252", true);
        }
    }

    [GeneratedRegex(@"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")]
    private static partial Regex TimeTagRegex();

    [GeneratedRegex(@"^\[(ti|ar|al|by|offset):(.*)\]$", RegexOptions.IgnoreCase)]
    private static partial Regex MetaTagRegex();
}

/// <summary>
/// Minimal Windows-1252 decoder (0xA0–0xFF are Latin-1; 0x80–0x9F have a fixed table).
/// Kept local so no extra NuGet package is needed for the encoding fallback.
/// </summary>
internal static class Windows1252
{
    private static readonly char[] High =
    [
        '\u20AC', '\u0081', '\u201A', '\u0192', '\u201E', '\u2026', '\u2020', '\u2021',
        '\u02C6', '\u2030', '\u0160', '\u2039', '\u0152', '\u008D', '\u017D', '\u008F',
        '\u0090', '\u2018', '\u2019', '\u201C', '\u201D', '\u2022', '\u2013', '\u2014',
        '\u02DC', '\u2122', '\u0161', '\u203A', '\u0153', '\u009D', '\u017E', '\u0178',
    ];

    public static string Decode(byte[] bytes)
    {
        var chars = new char[bytes.Length];
        for (var i = 0; i < bytes.Length; i++)
        {
            var b = bytes[i];
            chars[i] = b is >= 0x80 and <= 0x9F ? High[b - 0x80] : (char)b;
        }

        return new string(chars);
    }
}
