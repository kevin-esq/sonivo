using Sonivo.Domain.Common;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Domain.Tests;

public class ArrangementDomainTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");
    private static readonly Guid GroupId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid SongId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public void Create_sets_lineage_and_trims_label()
    {
        var arr = Arrangement.Create(GroupId, SongId, "  Acoustic  ", Now,
            defaultKey: "  G  ", defaultBpm: 120, lyrics: "  la  ", notes: "  soft  ");

        Assert.NotEqual(Guid.Empty, arr.Id);
        Assert.Equal(GroupId, arr.GroupId);
        Assert.Equal(SongId, arr.SongId);
        Assert.Equal("Acoustic", arr.Label);
        Assert.Equal("G", arr.DefaultKey);
        Assert.Equal(120, arr.DefaultBpm);
        Assert.Equal("la", arr.Lyrics);
        Assert.Equal("soft", arr.Notes);
        Assert.Equal(1, arr.Version);
        Assert.False(arr.IsDeleted);
    }

    [Fact]
    public void Create_rejects_blank_label()
    {
        Assert.Throws<ArgumentException>(() =>
            Arrangement.Create(GroupId, SongId, "   ", Now));
    }

    [Fact]
    public void Create_allows_null_bpm()
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now, defaultBpm: null);
        Assert.Null(arr.DefaultBpm);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(400)]
    public void Create_allows_bpm_bounds(int bpm)
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now, defaultBpm: bpm);
        Assert.Equal(bpm, arr.DefaultBpm);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(401)]
    public void Create_rejects_bpm_out_of_range(int bpm)
    {
        Assert.Throws<ArgumentException>(() =>
            Arrangement.Create(GroupId, SongId, "Live", Now, defaultBpm: bpm));
    }

    [Fact]
    public void Create_stores_optional_blank_fields_as_null()
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now,
            defaultKey: "  ", lyrics: "", chords: " ", structure: null, notes: "");

        Assert.Null(arr.DefaultKey);
        Assert.Null(arr.Lyrics);
        Assert.Null(arr.Chords);
        Assert.Null(arr.Structure);
        Assert.Null(arr.Notes);
    }

    [Fact]
    public void Update_does_not_change_group_or_song_ids()
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now);
        arr.Update("Studio", "A", 90, null, null, null, null, null, expectedVersion: 1, Now.AddMinutes(1));

        Assert.Equal(GroupId, arr.GroupId);
        Assert.Equal(SongId, arr.SongId);
        Assert.Equal("Studio", arr.Label);
        Assert.Equal(2, arr.Version);
    }

    [Fact]
    public void Update_rejects_stale_version()
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now);
        Assert.Throws<ConcurrencyConflictException>(() =>
            arr.Update("Other", null, null, null, null, null, null, null, expectedVersion: 99, Now));
    }

    [Fact]
    public void Update_sets_and_clears_chord_timing_json()
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now);
        arr.Update(
            "Live", null, null, null, null, null, null,
            """[{"lineIndex":0,"atMs":1000}]""",
            expectedVersion: 1,
            Now.AddMinutes(1));

        Assert.Equal("""[{"lineIndex":0,"atMs":1000}]""", arr.ChordTimingJson);
        Assert.Equal(2, arr.Version);

        arr.Update("Live", null, null, null, null, null, null, "  ", expectedVersion: 2, Now.AddMinutes(2));
        Assert.Null(arr.ChordTimingJson);
        Assert.Equal(3, arr.Version);
    }

    [Fact]
    public void SoftDelete_sets_deleted_at_and_increments_version()
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now);
        arr.SoftDelete(expectedVersion: 1, Now.AddHours(1));

        Assert.True(arr.IsDeleted);
        Assert.Equal(2, arr.Version);
        Assert.Equal(Now.AddHours(1), arr.DeletedAt);
    }

    [Fact]
    public void SoftDelete_rejects_stale_version()
    {
        var arr = Arrangement.Create(GroupId, SongId, "Live", Now);
        Assert.Throws<ConcurrencyConflictException>(() =>
            arr.SoftDelete(expectedVersion: 99, Now));
    }
}
