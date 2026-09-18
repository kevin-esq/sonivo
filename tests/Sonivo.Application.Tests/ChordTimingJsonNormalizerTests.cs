using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;

namespace Sonivo.Application.Tests;

public class ChordTimingJsonNormalizerTests
{
    [Fact]
    public void Empty_and_whitespace_and_empty_array_clear_to_null()
    {
        Assert.Null(ChordTimingJsonNormalizer.Normalize(null));
        Assert.Null(ChordTimingJsonNormalizer.Normalize(""));
        Assert.Null(ChordTimingJsonNormalizer.Normalize("   "));
        Assert.Null(ChordTimingJsonNormalizer.Normalize("[]"));
    }

    [Fact]
    public void Valid_marks_sort_by_at_ms()
    {
        var result = ChordTimingJsonNormalizer.Normalize(
            """[{"lineIndex":2,"atMs":3000},{"lineIndex":0,"atMs":100},{"lineIndex":1,"atMs":1000}]""");

        Assert.Equal(
            """[{"lineIndex":0,"atMs":100},{"lineIndex":1,"atMs":1000},{"lineIndex":2,"atMs":3000}]""",
            result);
    }

    [Fact]
    public void Duplicate_line_index_is_preserved_last_in_array_wins_for_consumers()
    {
        // Storage keeps both; document that consumers should prefer last-in-array for a lineIndex.
        var result = ChordTimingJsonNormalizer.Normalize(
            """[{"lineIndex":0,"atMs":100},{"lineIndex":0,"atMs":500}]""");

        Assert.Equal(
            """[{"lineIndex":0,"atMs":100},{"lineIndex":0,"atMs":500}]""",
            result);
    }

    [Theory]
    [InlineData("""{"lineIndex":0,"atMs":1}""")]
    [InlineData("not-json")]
    [InlineData("""[{"lineIndex":"x","atMs":1}]""")]
    [InlineData("""[{"lineIndex":-1,"atMs":0}]""")]
    [InlineData("""[{"lineIndex":0,"atMs":-5}]""")]
    [InlineData("""[{"atMs":0}]""")]
    [InlineData("""[{"lineIndex":0}]""")]
    [InlineData("""[1,2,3]""")]
    public void Malformed_throws_validation(string raw)
    {
        Assert.Throws<ValidationException>(() => ChordTimingJsonNormalizer.Normalize(raw));
    }

    [Fact]
    public void Exceeding_max_marks_throws_validation()
    {
        var marks = Enumerable.Range(0, ChordTimingJsonNormalizer.MaxMarks + 1)
            .Select(i => $$"""{"lineIndex":{{i}},"atMs":{{i * 10}}}""");
        var json = "[" + string.Join(",", marks) + "]";

        var ex = Assert.Throws<ValidationException>(() => ChordTimingJsonNormalizer.Normalize(json));
        Assert.Contains(ChordTimingJsonNormalizer.MaxMarks.ToString(), ex.Message);
    }
}
