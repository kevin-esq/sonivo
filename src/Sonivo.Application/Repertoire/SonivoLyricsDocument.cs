using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// Sonivo TTML v1: a portable TTML projection plus a lossless Sonivo source/timeline.
/// Arrangement text and its validated timeline remain the persisted domain model.
/// </summary>
public static class SonivoLyricsDocument
{
    public static readonly XNamespace Namespace = "https://sonivo.lat/ns/lyrics/1";
    private static readonly XNamespace Ttml = "http://www.w3.org/ns/ttml";

    public static string Export(string? source, string? timingJson)
    {
        source = (source ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');
        var timing = ChordTimingJsonNormalizer.Normalize(timingJson) ?? "[]";
        ChordTimingJsonNormalizer.ValidateWordReferences(timing, source);
        using var json = JsonDocument.Parse(timing);
        var marks = json.RootElement.EnumerateArray().ToList();
        var lines = source.Split('\n');
        var body = new XElement(Ttml + "body");
        var div = new XElement(Ttml + "div");
        body.Add(div);
        for (var index = 0; index < lines.Length; index++)
        {
            var paragraph = new XElement(Ttml + "p");
            var lineMarks = marks.Where(e => e.TryGetProperty("lineIndex", out var line) && line.GetInt32() == index).ToList();
            var start = lineMarks.FirstOrDefault(e => e.TryGetProperty("atMs", out _));
            if (start.ValueKind == JsonValueKind.Object)
            {
                paragraph.SetAttributeValue("begin", Clock(start.GetProperty("atMs").GetInt32()));
                if (start.TryGetProperty("endMs", out var end)) paragraph.SetAttributeValue("end", Clock(end.GetInt32()));
            }
            var visible = Regex.Replace(lines[index], @"\[[^\]]*\]|\{[^}]*\}", string.Empty);
            var wordIndex = 0;
            foreach (Match token in Regex.Matches(visible, @"\s+|\S+"))
            {
                if (string.IsNullOrWhiteSpace(token.Value)) { paragraph.Add(new XText(token.Value)); continue; }
                var word = lineMarks.FirstOrDefault(e => e.TryGetProperty("wordIndex", out var value) && value.GetInt32() == wordIndex);
                if (word.ValueKind == JsonValueKind.Object)
                    paragraph.Add(new XElement(Ttml + "span", new XAttribute("begin", Clock(word.GetProperty("startMs").GetInt32())), new XAttribute("end", Clock(word.GetProperty("endMs").GetInt32())), token.Value));
                else paragraph.Add(new XText(token.Value));
                wordIndex++;
            }
            div.Add(paragraph);
        }
        return new XDocument(new XDeclaration("1.0", "utf-8", null),
            new XElement(Ttml + "tt", new XAttribute("xmlns", Ttml.NamespaceName), new XAttribute(XNamespace.Xmlns + "sonivo", Namespace),
                new XAttribute(Namespace + "version", "1"),
                new XElement(Ttml + "head", new XElement(Ttml + "metadata", new XElement(Namespace + "source", source), new XElement(Namespace + "timeline", timing))), body)).ToString();
    }

    internal static LrcParseResult Import(XDocument document, string encoding)
    {
        var errors = new List<LrcError>();
        var empty = new LrcParseResult([], new(null, null, null, null, 0), errors, [], encoding) { Format = "sonivo-ttml" };
        try
        {
            var metadata = document.Root?.Element(Ttml + "head")?.Element(Ttml + "metadata");
            var source = metadata?.Element(Namespace + "source")?.Value;
            var rawTiming = metadata?.Element(Namespace + "timeline")?.Value;
            if ((string?)document.Root?.Attribute(Namespace + "version") != "1" || source is null || rawTiming is null || source.Split('\n').Length > LrcParser.MaxLines)
                return empty with { Errors = [new(0, "lyrics.invalidTtml")] };
            var timing = ChordTimingJsonNormalizer.Normalize(rawTiming) ?? "[]";
            ChordTimingJsonNormalizer.ValidateWordReferences(timing, source);
            var lines = source.Split('\n');
            var entries = new List<LrcEntry>();
            var words = new List<LyricWord>();
            var instrumentals = new List<LyricInstrumental>();
            using var json = JsonDocument.Parse(timing);
            foreach (var mark in json.RootElement.EnumerateArray())
            {
                if (mark.TryGetProperty("type", out _))
                {
                    instrumentals.Add(new(mark.GetProperty("startMs").GetInt32(), mark.GetProperty("endMs").GetInt32()));
                    continue;
                }
                var line = mark.GetProperty("lineIndex").GetInt32();
                if (line >= lines.Length) throw new ValidationException("Invalid lyric line reference.");
                if (mark.TryGetProperty("wordIndex", out var word))
                    words.Add(new(line, word.GetInt32(), mark.GetProperty("startMs").GetInt32(), mark.GetProperty("endMs").GetInt32()));
                else entries.Add(new(line, mark.GetProperty("atMs").GetInt32(), lines[line], mark.TryGetProperty("endMs", out var end) ? end.GetInt32() : null));
            }
            return empty with { Entries = entries, Words = words, Instrumentals = instrumentals, SourceText = source };
        }
        catch (ValidationException)
        {
            return empty with { Errors = [new(0, "lyrics.invalidTiming")] };
        }
    }

    private static string Clock(int ms) => string.Create(CultureInfo.InvariantCulture, $"{ms / 3600000:D2}:{ms / 60000 % 60:D2}:{ms / 1000 % 60:D2}.{ms % 1000:D3}");
}
