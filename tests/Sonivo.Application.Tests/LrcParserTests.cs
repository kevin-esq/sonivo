using System.Text;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;

namespace Sonivo.Application.Tests;

/// <summary>
/// Real unit tests for the .lrc parser/converter (ADR-0050), built from the seven SPIKE-1
/// cases plus encoding, limits and round-trip behaviour.
/// </summary>
public sealed class LrcParserTests
{
    private static byte[] Utf8(string text) => Encoding.UTF8.GetBytes(text);

    [Fact]
    public void Parses_a_valid_line_with_two_decimals()
    {
        var result = LrcParser.Parse(Utf8("[00:12.00]Hola mundo\n[00:15.50]Segunda linea"));

        Assert.Empty(result.Errors);
        Assert.Equal("utf-8", result.Encoding);
        Assert.Equal(2, result.Entries.Count);
        Assert.Equal(12_000, result.Entries[0].AtMs);
        Assert.Equal("Hola mundo", result.Entries[0].Text);
        Assert.Equal(15_500, result.Entries[1].AtMs);
    }

    [Fact]
    public void Parses_three_decimal_milliseconds()
    {
        var result = LrcParser.Parse(Utf8("[00:12.345]Tres decimales"));

        Assert.Empty(result.Errors);
        Assert.Equal(12_345, Assert.Single(result.Entries).AtMs);
    }

    [Fact]
    public void Parses_multiple_marks_on_one_line_sharing_the_same_lyric_line()
    {
        var result = LrcParser.Parse(Utf8("[00:12.00][00:15.00]Linea repetida"));

        Assert.Empty(result.Errors);
        Assert.Equal(2, result.Entries.Count);
        Assert.Equal([12_000, 15_000], result.Entries.Select(e => e.AtMs));
        Assert.All(result.Entries, e => Assert.Equal("Linea repetida", e.Text));
        Assert.Single(result.Entries.Select(e => e.LineIndex).Distinct());
    }

    [Fact]
    public void Detects_unordered_marks_and_sorts_them()
    {
        var result = LrcParser.Parse(Utf8("[00:20.00]Tercera\n[00:10.00]Primera\n[00:15.00]Segunda"));

        Assert.Empty(result.Errors);
        Assert.Contains(result.Warnings, w => w.Contains("ascending", StringComparison.OrdinalIgnoreCase));
        Assert.Equal([10_000, 15_000, 20_000], result.Entries.Select(e => e.AtMs));
    }

    [Fact]
    public void Strips_a_utf8_bom()
    {
        var bytes = Encoding.UTF8.GetPreamble().Concat(Utf8("[00:01.00]Con BOM")).ToArray();

        var result = LrcParser.Parse(bytes);

        Assert.Empty(result.Errors);
        Assert.Equal("utf-8-bom", result.Encoding);
        Assert.Equal("Con BOM", Assert.Single(result.Entries).Text);
    }

    [Fact]
    public void Decodes_a_utf16_le_bom()
    {
        var bytes = Encoding.Unicode.GetPreamble()
            .Concat(Encoding.Unicode.GetBytes("[00:02.00]Dieciseis bits"))
            .ToArray();

        var result = LrcParser.Parse(bytes);

        Assert.Empty(result.Errors);
        Assert.Equal("utf-16le-bom", result.Encoding);
        Assert.Equal("Dieciseis bits", Assert.Single(result.Entries).Text);
    }

    [Fact]
    public void Falls_back_to_windows_1252_with_a_warning_when_not_valid_utf8()
    {
        // "[00:01.00]Café" with é encoded as the single Windows-1252 byte 0xE9 (invalid UTF-8).
        var bytes = Utf8("[00:01.00]Caf").Concat(new byte[] { 0xE9 }).ToArray();

        var result = LrcParser.Parse(bytes);

        Assert.Empty(result.Errors);
        Assert.Equal("windows-1252", result.Encoding);
        Assert.Contains(result.Warnings, w => w.Contains("Windows-1252"));
        Assert.Equal("Café", Assert.Single(result.Entries).Text);
    }

    [Fact]
    public void Reports_corrupt_lines_with_line_number_and_reason()
    {
        var result = LrcParser.Parse(Utf8("[00:12.00Sin corchete\n[aa:bb]No numerico\nbasura"));

        Assert.Empty(result.Entries);
        Assert.Equal(3, result.Errors.Count);
        Assert.Equal([1, 2, 3], result.Errors.Select(e => e.Line));
        Assert.All(result.Errors, e => Assert.Equal("no time mark", e.Reason));
    }

    [Fact]
    public void Reads_metadata_tags_and_offset()
    {
        var result = LrcParser.Parse(Utf8("[ti:Cancion]\n[ar:Banda]\n[offset:-250]\n[00:01.00]Hola"));

        Assert.Equal("Cancion", result.Metadata.Title);
        Assert.Equal("Banda", result.Metadata.Artist);
        Assert.Equal(-250, result.Metadata.OffsetMs);
    }

    [Fact]
    public void Rejects_files_over_the_size_limit()
    {
        var bytes = new byte[LrcParser.MaxBytes + 1];

        var result = LrcParser.Parse(bytes);

        Assert.Single(result.Errors);
        Assert.Equal(0, result.Errors[0].Line);
        Assert.Contains("KiB", result.Errors[0].Reason);
    }

    [Fact]
    public void Rejects_more_marks_than_the_shared_cap()
    {
        var builder = new StringBuilder();
        for (var i = 0; i <= LrcParser.MaxMarks; i++)
        {
            builder.Append("[00:00.00]x\n");
        }

        var result = LrcParser.Parse(Utf8(builder.ToString()));

        Assert.Contains(result.Errors, e => e.Reason.Contains("time marks"));
    }

    [Fact]
    public void Converts_lrc_to_chord_pro_lyrics_plus_adr0031_marks()
    {
        var parsed = LrcParser.Parse(Utf8("[00:12.00]Uno\n[00:15.50]Dos"));

        var conversion = LrcConverter.ToChordPro(parsed);

        Assert.Equal("Uno\nDos", conversion.Lyrics);
        Assert.Equal(2, conversion.MarkCount);

        // The produced JSON must satisfy the stored contract (ChordTimingJsonNormalizer).
        var normalized = ChordTimingJsonNormalizer.Normalize(conversion.ChordTimingJson);
        Assert.NotNull(normalized);
        Assert.Contains("\"lineIndex\":0", normalized);
        Assert.Contains("\"atMs\":12000", normalized);
        Assert.Contains("\"lineIndex\":1", normalized);
        Assert.Contains("\"atMs\":15500", normalized);
    }

    [Fact]
    public void Subtracts_a_positive_offset_from_the_marks()
    {
        // [offset:+500] => 1000 - 500 = 500 ms (the LRC convention subtracts).
        var parsed = LrcParser.Parse(Utf8("[offset:+500]\n[00:01.00]Hola"));

        var conversion = LrcConverter.ToChordPro(parsed);

        Assert.Contains("\"atMs\":500", conversion.ChordTimingJson);
    }

    [Fact]
    public void Subtracts_a_negative_offset_from_the_marks()
    {
        // [offset:-500] => 1000 - (-500) = 1500 ms.
        var parsed = LrcParser.Parse(Utf8("[offset:-500]\n[00:01.00]Hola"));

        var conversion = LrcConverter.ToChordPro(parsed);

        Assert.Contains("\"atMs\":1500", conversion.ChordTimingJson);
    }

    [Fact]
    public void Never_goes_negative_when_the_offset_exceeds_the_mark()
    {
        var parsed = LrcParser.Parse(Utf8("[offset:+9000]\n[00:01.00]Temprano"));

        var conversion = LrcConverter.ToChordPro(parsed);

        Assert.Contains("\"atMs\":0", conversion.ChordTimingJson);
    }

    [Fact]
    public void Keeps_chords_metadata_and_marks_on_the_same_line()
    {
        var parsed = LrcParser.Parse(Utf8("[ti:Titulo]\n[00:12.00][Am]Primera estrofa"));

        Assert.Empty(parsed.Errors);
        Assert.Equal("Titulo", parsed.Metadata.Title);
        Assert.Equal("[Am]Primera estrofa", Assert.Single(parsed.Entries).Text);

        var conversion = LrcConverter.ToChordPro(parsed);
        Assert.Equal("[Am]Primera estrofa", conversion.Lyrics);
    }

    [Fact]
    public void Keeps_every_mark_when_a_line_has_several()
    {
        var parsed = LrcParser.Parse(Utf8("[00:01.00][00:02.00][00:03.00]Repetida"));

        Assert.Empty(parsed.Errors);
        Assert.Equal(3, parsed.Entries.Count);
        Assert.Equal([1_000, 2_000, 3_000], parsed.Entries.Select(e => e.AtMs));
        Assert.Single(parsed.Entries.Select(e => e.LineIndex).Distinct());
    }

    [Fact]
    public void Validates_the_size_before_decoding_utf16()
    {
        // Over the cap AND carrying a UTF-16 BOM: the size check must win before decoding.
        var bytes = new byte[LrcParser.MaxBytes + 2];
        bytes[0] = 0xFF;
        bytes[1] = 0xFE;

        var result = LrcParser.Parse(bytes);

        Assert.Single(result.Errors);
        Assert.Equal(0, result.Errors[0].Line);
        Assert.Equal("unknown", result.Encoding);
    }

    [Fact]
    public void Produces_plain_text_lyrics()
    {
        var parsed = LrcParser.Parse(Utf8("[00:12.00]Uno\n[00:15.00]Dos"));

        var conversion = LrcConverter.ToChordPro(parsed);

        Assert.DoesNotContain("\r", conversion.Lyrics);
        Assert.DoesNotContain("[00:", conversion.Lyrics);
        Assert.Equal("Uno\nDos", conversion.Lyrics);
    }

    [Fact]
    public void Round_trips_lrc_through_chord_pro_and_back()
    {
        var parsed = LrcParser.Parse(Utf8("[00:12.00]Uno\n[00:15.50]Dos"));
        var conversion = LrcConverter.ToChordPro(parsed);

        var lrc = LrcConverter.ToLrc(conversion.Lyrics, conversion.ChordTimingJson);

        Assert.Contains("[00:12.00]Uno", lrc);
        Assert.Contains("[00:15.50]Dos", lrc);
    }

    [Fact]
    public void Export_requires_marks()
    {
        Assert.Throws<ValidationException>(() => LrcConverter.ToLrc("Solo letra", null));
    }
}
