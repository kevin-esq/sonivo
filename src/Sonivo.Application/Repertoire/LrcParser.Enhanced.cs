using System.Text;
using System.Text.RegularExpressions;

namespace Sonivo.Application.Repertoire;

public static partial class LrcParser
{
    private static LrcParseResult AddEnhancedTiming(LrcParseResult parsed)
    {
        var words = new List<LyricWord>();
        var entries = new List<LrcEntry>();
        var errors = parsed.Errors.ToList();
        var warnings = parsed.Warnings.ToList();
        var enhanced = false;
        foreach (var entry in parsed.Entries)
        {
            var tags = Regex.Matches(entry.Text, @"<(\d{1,3}:\d{2}(?:\.\d{1,3})?)>");
            if (tags.Count == 0) { entries.Add(entry); continue; }
            enhanced = true;
            var text = new StringBuilder();
            var boundaries = new List<(int Offset, int Time)>();
            var position = 0;
            foreach (Match tag in tags)
            {
                text.Append(entry.Text[position..tag.Index]);
                if (!TryLyricTime(tag.Groups[1].Value, out var time) || time < entry.AtMs ||
                    (boundaries.Count > 0 && time <= boundaries[^1].Time))
                {
                    errors.Add(new(entry.LineIndex + 1, "lyrics.invalidTiming"));
                }
                boundaries.Add((text.Length, time));
                position = tag.Index + tag.Length;
            }
            text.Append(entry.Text[position..]);
            var raw = text.ToString();
            var wordIndex = 0;
            foreach (Match word in Regex.Matches(raw, @"\S+"))
            {
                var starts = boundaries.Where(b => b.Offset <= word.Index).ToList();
                var ends = boundaries.Where(b => b.Offset >= word.Index + word.Length).ToList();
                if (starts.Count > 0 && ends.Count > 0 && ends[0].Time > starts[^1].Time)
                    words.Add(new(entry.LineIndex, wordIndex, starts[^1].Time, ends[0].Time));
                else warnings.Add("lyrics.incompleteWordTiming");
                wordIndex++;
            }
            int? lineEnd = boundaries.Count > 0 && boundaries[^1].Offset >= raw.TrimEnd().Length && boundaries[^1].Time > entry.AtMs
                ? boundaries[^1].Time : null;
            entries.Add(entry with { Text = raw.Trim(), EndMs = lineEnd });
        }
        if (words.Count + entries.Count > MaxMarks) errors.Add(new(0, "lyrics.tooManyMarks"));
        return parsed with { Entries = entries, Words = words, Errors = errors, Warnings = warnings.Distinct().ToList(), Format = enhanced ? "elrc" : "lrc" };
    }
}
