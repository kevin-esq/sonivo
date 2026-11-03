using Sonivo.Domain.Repertoire;

namespace Sonivo.Domain.Tests;

public sealed class ChordTransposerTests
{
    [Theory]
    [InlineData("C", 2, false, "D")]
    [InlineData("F#m7/C#", 2, true, "Abm7/Eb")]
    [InlineData("H7", 1, false, "C7")]
    [InlineData("Am G/B", 2, false, "Bm A/C#")]
    public void Transpose_handles_roots_basses_and_chord_suffixes(string input, int semitones, bool flats, string expected)
    {
        Assert.Equal(expected, ChordTransposer.Transpose(input, semitones, flats));
    }

    [Fact]
    public void Transpose_leaves_plain_lyrics_unchanged()
    {
        Assert.Equal("Amazing grace", ChordTransposer.Transpose("Amazing grace", 2));
    }
}
