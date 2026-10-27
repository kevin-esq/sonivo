using System.Text;
using System.Text.Json;
using Sonivo.Application.Repertoire;

namespace Sonivo.Application.Tests;

public class RichLyricsTests
{
    [Fact]
    public void Large_native_exports_stay_within_the_import_limit_and_keep_all_word_timing()
    {
        var source = string.Join(" ", Enumerable.Range(0, 1900).Select(i => $"word{i}"));
        var words = Enumerable.Range(0, 1900).Select(i => (object)new { lineIndex = 0, wordIndex = i, startMs = i * 1000, endMs = (i + 1) * 1000 }).ToList();
        words.Insert(0, new { lineIndex = 0, atMs = 0, endMs = 1900000 });
        var xml = SonivoLyricsDocument.Export(source, JsonSerializer.Serialize(words));
        Assert.True(Encoding.UTF8.GetByteCount(xml) <= LrcParser.MaxBytes);
        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(xml));
        Assert.Empty(parsed.Errors);
        Assert.Equal(1900, parsed.Words.Count);
        Assert.Equal(source, LrcConverter.ToChordPro(parsed).Lyrics);
    }

    [Fact]
    public void Import_remaps_leading_blank_lines_to_the_normalized_arrangement_body()
    {
        var xml = SonivoLyricsDocument.Export("\nMorning light\n", """[{"lineIndex":1,"atMs":1000,"endMs":3000}]""");
        var result = LrcConverter.ToChordPro(LrcParser.Parse(Encoding.UTF8.GetBytes(xml)));
        Assert.Equal("Morning light", result.Lyrics);
        Assert.Contains("\"lineIndex\":0", result.ChordTimingJson);
    }

    [Fact]
    public void Apple_background_spans_become_parallel_lines_without_inventing_grouped_word_times()
    {
        const string input = """
            <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>
              <p begin="00:01.000" end="00:04.000"><span ttm:role="x-bg"><span begin="00:01.000" end="00:03.000">(Oh)</span></span> <span begin="00:02.000" end="00:04.000">Morning light</span></p>
            </div></body></tt>
            """;
        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(input));
        Assert.Empty(parsed.Errors);
        var conversion = LrcConverter.ToChordPro(parsed);
        Assert.Equal("Morning light\n(Oh)", conversion.Lyrics);
        Assert.Single(parsed.Words);
        Assert.Equal(1, parsed.Words[0].LineIndex);
        Assert.Contains("lyrics.incompleteWordTiming", parsed.Warnings);
    }

    [Theory]
    [InlineData("{\"syncedLyrics\":\"[00:01.00]Original light\"}", "Original light", 1)]
    [InlineData("{\"lyrics\":{\"syncType\":\"LINE_SYNCED\",\"lines\":[{\"startTimeMs\":\"1000\",\"words\":\"Original light\",\"endTimeMs\":\"3000\"}]}}", "Original light", 1)]
    [InlineData("{title: Original}\n[Am]Original light", "{title: Original}\n[Am]Original light", 0)]
    public void Provider_payloads_and_plain_charts_normalize_without_provider_specific_storage(string input, string expected, int marks)
    {
        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(input));
        Assert.Empty(parsed.Errors);
        var converted = LrcConverter.ToChordPro(parsed);
        Assert.Equal(expected, converted.Lyrics);
        Assert.Equal(marks, converted.MarkCount);
    }

    [Fact]
    public void Sonivo_ttml_round_trip_preserves_chordpro_untimed_lines_words_and_instrumentals()
    {
        const string source = "{title: Original}\n[Am]Morning light\n\nUntimed <echo> & night";
        const string timing = """[{"lineIndex":1,"atMs":1000,"endMs":3000},{"lineIndex":1,"wordIndex":0,"startMs":1000,"endMs":2000},{"lineIndex":1,"wordIndex":1,"startMs":2000,"endMs":3000},{"type":"instrumental","startMs":4000,"endMs":5000}]""";
        var xml = SonivoLyricsDocument.Export(source, timing);
        Assert.Contains("https://sonivo.lat/ns/lyrics/1", xml);
        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(xml));
        Assert.Empty(parsed.Errors);
        var restored = LrcConverter.ToChordPro(parsed);
        Assert.Equal(source, restored.Lyrics);
        Assert.Equal(ChordTimingJsonNormalizer.Normalize(timing), restored.ChordTimingJson);
    }

    [Fact]
    public void Enhanced_lrc_keeps_word_timing_and_reports_a_missing_final_boundary()
    {
        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes("[00:01.000]<00:01.000>Morning <00:02.200>light<00:03.400>\n[00:05.000]<00:05.000>Unfinished"));
        var converted = LrcConverter.ToChordPro(parsed);
        Assert.Equal("Morning light\nUnfinished", converted.Lyrics);
        using var json = JsonDocument.Parse(converted.ChordTimingJson);
        var words = json.RootElement.EnumerateArray().Where(e => e.TryGetProperty("wordIndex", out _)).ToList();
        Assert.Equal(2, words.Count);
        Assert.Equal(2200, words[0].GetProperty("endMs").GetInt32());
        Assert.Equal(3400, words[1].GetProperty("endMs").GetInt32());
        Assert.Contains("lyrics.incompleteWordTiming", parsed.Warnings);
    }

    [Fact]
    public void Timed_spans_keep_real_word_intervals_including_split_syllables_and_parallel_vocals()
    {
        const string xml = """
            <tt xmlns="http://www.w3.org/ns/ttml"><body><div>
            <p begin="00:01.000" end="00:04.000"><span begin="00:01.000" end="00:01.200">Sun</span><span begin="00:01.200" end="00:02.000">rise</span> <span begin="00:02.500" end="00:03.000">glows</span></p>
            <p begin="00:01.100" end="00:02.200"><span begin="00:01.100" end="00:02.200">(Oh)</span></p>
            </div></body></tt>
            """;
        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(xml));
        Assert.Empty(parsed.Errors);
        var converted = LrcConverter.ToChordPro(parsed, 100);
        Assert.Equal("Sunrise glows\n(Oh)", converted.Lyrics);
        using var document = JsonDocument.Parse(converted.ChordTimingJson);
        var words = document.RootElement.EnumerateArray().Where(e => e.TryGetProperty("wordIndex", out _)).ToList();
        Assert.Equal(3, words.Count);
        Assert.Equal(1100, words[0].GetProperty("startMs").GetInt32());
        Assert.Equal(2100, words[0].GetProperty("endMs").GetInt32());
        Assert.Equal(1200, words[1].GetProperty("startMs").GetInt32());
        Assert.Equal(1, words[1].GetProperty("lineIndex").GetInt32());
        Assert.Equal(1, words[2].GetProperty("wordIndex").GetInt32());
        ChordTimingJsonNormalizer.ValidateWordReferences(converted.ChordTimingJson, converted.Lyrics);
    }

    [Fact]
    public void Apple_line_ttml_preserves_text_milliseconds_ends_and_overlapping_lines()
    {
        const string xml = """
            <tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line" xml:lang="en">
              <head><metadata><iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal"><songwriters><songwriter>A writer</songwriter></songwriters></iTunesMetadata></metadata></head>
              <body dur="5:43.293"><div begin="00:00:18.908" end="00:00:35.209">
                <p begin="00:00:18.908" end="00:00:23.041">An original line</p>
                <p begin="00:00:19.000" end="00:00:20.100">(A backing voice)</p>
                <p begin="00:00:31.134" end="00:00:35.209">Écho &amp; light</p>
              </div></body>
            </tt>
            """;
        var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(xml));
        Assert.Empty(parsed.Errors);
        var conversion = LrcConverter.ToChordPro(parsed);
        Assert.Equal("An original line\n(A backing voice)\nÉcho & light", conversion.Lyrics);
        using var json = JsonDocument.Parse(conversion.ChordTimingJson);
        Assert.Equal(3, json.RootElement.GetArrayLength());
        Assert.Equal(18908, json.RootElement[0].GetProperty("atMs").GetInt32());
        Assert.Equal(23041, json.RootElement[0].GetProperty("endMs").GetInt32());
        Assert.False(json.RootElement[0].TryGetProperty("wordIndex", out _));
    }
}
