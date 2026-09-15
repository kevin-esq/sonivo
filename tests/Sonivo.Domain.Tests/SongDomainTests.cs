using Sonivo.Domain.Common;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Domain.Tests;

public class SongDomainTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");
    private static readonly Guid GroupId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public void Create_sets_valid_initial_state_and_trims_title()
    {
        var song = Song.Create(GroupId, "  Amazing Grace  ", SongOriginKinds.Cover, Now,
            attribution: "  Newton  ", rightsNotes: "  public domain  ");

        Assert.NotEqual(Guid.Empty, song.Id);
        Assert.Equal(GroupId, song.GroupId);
        Assert.Equal("Amazing Grace", song.Title);
        Assert.Equal("Newton", song.Attribution);
        Assert.Equal(SongOriginKinds.Cover, song.OriginKind);
        Assert.Equal("public domain", song.RightsNotes);
        Assert.Equal(1, song.Version);
        Assert.Equal(Now, song.CreatedAt);
        Assert.False(song.IsDeleted);
    }

    [Fact]
    public void Create_allows_all_accepted_origin_kinds()
    {
        Assert.Equal(SongOriginKinds.Original,
            Song.Create(GroupId, "A", SongOriginKinds.Original, Now).OriginKind);
        Assert.Equal(SongOriginKinds.Cover,
            Song.Create(GroupId, "B", SongOriginKinds.Cover, Now).OriginKind);
        Assert.Equal(SongOriginKinds.Other,
            Song.Create(GroupId, "C", SongOriginKinds.Other, Now).OriginKind);
    }

    [Fact]
    public void Create_rejects_blank_title()
    {
        Assert.Throws<ArgumentException>(() =>
            Song.Create(GroupId, "   ", SongOriginKinds.Original, Now));
    }

    [Fact]
    public void Create_rejects_invalid_origin_kind()
    {
        Assert.Throws<ArgumentException>(() =>
            Song.Create(GroupId, "Song", "remix", Now));
    }

    [Fact]
    public void Create_stores_optional_blank_fields_as_null()
    {
        var song = Song.Create(GroupId, "Song", SongOriginKinds.Original, Now,
            attribution: "  ", rightsNotes: "");

        Assert.Null(song.Attribution);
        Assert.Null(song.RightsNotes);
    }

    [Fact]
    public void Domain_does_not_reject_duplicate_titles()
    {
        var a = Song.Create(GroupId, "Same Title", SongOriginKinds.Original, Now);
        var b = Song.Create(GroupId, "Same Title", SongOriginKinds.Cover, Now);

        Assert.Equal(a.Title, b.Title);
        Assert.NotEqual(a.Id, b.Id);
    }

    [Fact]
    public void Update_increments_version_when_expected_matches()
    {
        var song = Song.Create(GroupId, "Song", SongOriginKinds.Original, Now);
        song.Update("Renamed", "Attrib", SongOriginKinds.Other, "notes", expectedVersion: 1, Now.AddMinutes(1));

        Assert.Equal("Renamed", song.Title);
        Assert.Equal("Attrib", song.Attribution);
        Assert.Equal(SongOriginKinds.Other, song.OriginKind);
        Assert.Equal("notes", song.RightsNotes);
        Assert.Equal(2, song.Version);
    }

    [Fact]
    public void Update_rejects_stale_version()
    {
        var song = Song.Create(GroupId, "Song", SongOriginKinds.Original, Now);
        Assert.Throws<ConcurrencyConflictException>(() =>
            song.Update("Other", null, SongOriginKinds.Original, null, expectedVersion: 99, Now));
    }

    [Fact]
    public void SoftDelete_sets_deleted_at_and_increments_version()
    {
        var song = Song.Create(GroupId, "Song", SongOriginKinds.Original, Now);
        song.SoftDelete(expectedVersion: 1, Now.AddHours(1));

        Assert.True(song.IsDeleted);
        Assert.Equal(2, song.Version);
        Assert.Equal(Now.AddHours(1), song.DeletedAt);
    }

    [Fact]
    public void SoftDelete_rejects_stale_version()
    {
        var song = Song.Create(GroupId, "Song", SongOriginKinds.Original, Now);
        Assert.Throws<ConcurrencyConflictException>(() =>
            song.SoftDelete(expectedVersion: 99, Now));
    }

    [Fact]
    public void SoftDelete_rejects_already_deleted_song()
    {
        var song = Song.Create(GroupId, "Song", SongOriginKinds.Original, Now);
        song.SoftDelete(expectedVersion: 1, Now.AddMinutes(1));
        Assert.Throws<InvalidOperationException>(() =>
            song.SoftDelete(expectedVersion: 2, Now.AddMinutes(2)));
    }
}
