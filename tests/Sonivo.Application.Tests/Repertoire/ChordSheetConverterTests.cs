using Sonivo.Application.Repertoire;

namespace Sonivo.Application.Tests.Repertoire;

public sealed class ChordSheetConverterTests
{
    [Fact]
    public void ConvertsChordOverLyricsToChordPro()
    {
        const string source = "[Verse 1]\nC       G\nHello   world";

        var result = ChordSheetConverter.ToChordPro(source);

        Assert.Contains("{start_of_verse: Verse 1}", result);
        Assert.Contains("[C]", result);
        Assert.Contains("[G]", result);
        Assert.Contains("Hello", result);
        Assert.Contains("world", result);
        Assert.Contains("{end_of_verse}", result);
    }

    [Fact]
    public void KeepsEmptyInputEmpty()
    {
        Assert.Equal(string.Empty, ChordSheetConverter.ToChordPro(" \r\n "));
    }
}
