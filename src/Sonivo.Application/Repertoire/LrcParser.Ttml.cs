using System.Globalization;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Sonivo.Application.Repertoire;

public static partial class LrcParser
{
    private static readonly XNamespace Ttml = "http://www.w3.org/ns/ttml";

    private static LrcParseResult ParseTtml(string text, string encoding, List<string> warnings)
    {
        var entries = new List<LrcEntry>();
        var words = new List<LyricWord>();
        var errors = new List<LrcError>();
        try
        {
            using var input = new StringReader(text);
            using var reader = XmlReader.Create(input, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = MaxBytes,
            });
            var document = XDocument.Load(reader, LoadOptions.SetLineInfo | LoadOptions.PreserveWhitespace);
            var lyricNamespace = document.Root?.Name.Namespace ?? Ttml;
            if (document.Root?.Name == Ttml + "tt" && document.Root.Attribute(SonivoLyricsDocument.Namespace + "version") is not null)
            {
                return SonivoLyricsDocument.Import(document, encoding);
            }
            if (document.Root?.Name.LocalName != "tt" || document.Root.Element(lyricNamespace + "body") is not { } body)
            {
                errors.Add(new(0, "lyrics.invalidTtml"));
            }
            else if (body.DescendantsAndSelf().Any(e => (string?)e.Attribute("timeContainer") == "seq"))
            {
                errors.Add(new(0, "lyrics.unsupportedTiming"));
            }
            else
            {
                SeparateBackgroundVocals(body, lyricNamespace);
                foreach (var paragraph in body.Descendants(lyricNamespace + "p"))
                {
                    if (entries.Count >= Math.Min(MaxLines, MaxMarks))
                    {
                        errors.Add(new(0, "lyrics.tooManyMarks"));
                        break;
                    }
                    if (!TryLyricTime((string?)paragraph.Attribute("begin"), out var begin) ||
                        !TryLyricTime((string?)paragraph.Attribute("end"), out var end) || end <= begin)
                    {
                        errors.Add(new(((IXmlLineInfo)paragraph).LineNumber, "lyrics.invalidTiming"));
                        continue;
                    }
                    var lyric = new StringBuilder();
                    var pieces = new List<(int Offset, int Length, int Start, int End)>();
                    foreach (var node in paragraph.DescendantNodes())
                    {
                        if (node is XText value)
                        {
                            var content = System.Text.RegularExpressions.Regex.Replace(value.Value, @"\s+", " ");
                            var span = value.Ancestors(lyricNamespace + "span").FirstOrDefault(e => e.Attribute("begin") is not null);
                            if (span is not null)
                            {
                                if (!TryLyricTime((string?)span.Attribute("begin"), out var start) ||
                                    !TryLyricTime((string?)span.Attribute("end"), out var finish) ||
                                    start < begin || finish > end || finish <= start)
                                {
                                    errors.Add(new(((IXmlLineInfo)span).LineNumber, "lyrics.invalidTiming"));
                                }
                                else pieces.Add((lyric.Length, content.Length, start, finish));
                            }
                            lyric.Append(content);
                        }
                        else if (node is XElement element && element.Name == lyricNamespace + "br") lyric.Append(' ');
                    }
                    var rawText = lyric.ToString();
                    var wordIndex = 0;
                    foreach (System.Text.RegularExpressions.Match word in System.Text.RegularExpressions.Regex.Matches(rawText, @"\S+"))
                    {
                        var timed = pieces.Where(p => p.Offset < word.Index + word.Length && p.Offset + p.Length > word.Index).ToList();
                        if (timed.Count > 0)
                        {
                            // A span covering a whole phrase does not provide individual word timing.
                            if (timed.Any(p => System.Text.RegularExpressions.Regex.Matches(rawText.Substring(p.Offset, p.Length), @"\S+").Count > 1))
                                warnings.Add("lyrics.incompleteWordTiming");
                            else words.Add(new(entries.Count, wordIndex, timed.Min(p => p.Start), timed.Max(p => p.End)));
                        }
                        wordIndex++;
                    }
                    entries.Add(new(entries.Count, begin, System.Text.RegularExpressions.Regex.Replace(rawText, @"\s+", " ").Trim(), end));
                    if (entries.Count + words.Count > MaxMarks)
                    {
                        errors.Add(new(0, "lyrics.tooManyMarks"));
                        break;
                    }
                }
                if (entries.Count == 0 && errors.Count == 0) errors.Add(new(0, "lyrics.noLines"));
                if (document.Root.Element(lyricNamespace + "head") is not null) warnings.Add("lyrics.metadataOmitted");
            }
        }
        catch (XmlException)
        {
            errors.Add(new(0, "lyrics.invalidXml"));
        }
        return new(entries.OrderBy(e => e.AtMs).ThenBy(e => e.LineIndex).ToList(), EmptyMetadata, errors, warnings.Distinct().ToList(), encoding)
        {
            Format = "ttml",
            Words = words,
        };
    }

    private static void SeparateBackgroundVocals(XElement body, XNamespace lyricNamespace)
    {
        XNamespace metadata = "http://www.w3.org/ns/ttml#metadata";
        foreach (var paragraph in body.Descendants(lyricNamespace + "p").ToList())
        {
            var backgrounds = paragraph.Descendants(lyricNamespace + "span")
                .Where(e => (string?)e.Attribute(metadata + "role") == "x-bg").ToList();
            if (backgrounds.Count == 0) continue;
            var additional = new List<XElement>();
            foreach (var background in backgrounds)
            {
                var copy = new XElement(lyricNamespace + "p", background.Nodes());
                var starts = background.DescendantsAndSelf().Select(e => TryLyricTime((string?)e.Attribute("begin"), out var value) ? (int?)value : null).Where(v => v.HasValue).ToList();
                var ends = background.DescendantsAndSelf().Select(e => TryLyricTime((string?)e.Attribute("end"), out var value) ? (int?)value : null).Where(v => v.HasValue).ToList();
                copy.SetAttributeValue("begin", starts.Count > 0 ? TimeClock(starts.Min()!.Value) : (string?)paragraph.Attribute("begin"));
                copy.SetAttributeValue("end", ends.Count > 0 ? TimeClock(ends.Max()!.Value) : (string?)paragraph.Attribute("end"));
                additional.Add(copy);
                background.Remove();
            }
            paragraph.AddAfterSelf(additional);
        }
    }

    private static string TimeClock(int ms) => string.Create(CultureInfo.InvariantCulture, $"{ms / 3600000:D2}:{ms / 60000 % 60:D2}:{ms / 1000 % 60:D2}.{ms % 1000:D3}");

    // Apple lyric clocks use absolute mm:ss.mmm or hh:mm:ss.mmm values.
    private static bool TryLyricTime(string? text, out int milliseconds)
    {
        milliseconds = 0;
        if (text is null) return false;
        var decimalSeconds = System.Text.RegularExpressions.Regex.Match(text, @"^(\d{1,7})\.(\d{1,3})$",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
        if (decimalSeconds.Success)
        {
            var millisecondsValue = (long)int.Parse(decimalSeconds.Groups[1].Value, CultureInfo.InvariantCulture) * 1000 +
                int.Parse(decimalSeconds.Groups[2].Value.PadRight(3, '0'), CultureInfo.InvariantCulture);
            if (millisecondsValue > int.MaxValue) return false;
            milliseconds = (int)millisecondsValue;
            return true;
        }
        var match = System.Text.RegularExpressions.Regex.Match(text, @"^(?:(\d{1,3}):)?(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
        if (!match.Success) return false;
        var hours = match.Groups[1].Success ? int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) : 0;
        var minutes = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        var seconds = int.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
        if (seconds >= 60 || (match.Groups[1].Success && minutes >= 60)) return false;
        var fraction = match.Groups[4].Success ? int.Parse(match.Groups[4].Value.PadRight(3, '0'), CultureInfo.InvariantCulture) : 0;
        var value = ((long)hours * 3600 + minutes * 60 + seconds) * 1000 + fraction;
        if (value > int.MaxValue) return false;
        milliseconds = (int)value;
        return true;
    }
}
