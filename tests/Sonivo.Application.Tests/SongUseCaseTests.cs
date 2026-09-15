using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class SongUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task Owner_can_create_song_with_zero_arrangements()
    {
        var (store, songs, owner, groupId) = await SeedOwnerAsync();
        var handler = new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now));

        var result = await handler.HandleAsync(
            new CreateSongCommand(owner, groupId, "Amazing Grace", null, SongOriginKinds.Original, null),
            CancellationToken.None);

        Assert.Equal("Amazing Grace", result.Title);
        Assert.Equal(SongOriginKinds.Original, result.OriginKind);
        Assert.Equal(1, result.Version);
        Assert.Equal(0, result.ArrangementCount);
        Assert.Single(songs.Songs);
    }

    [Fact]
    public async Task Create_allows_duplicate_titles_in_same_group()
    {
        var (store, songs, owner, groupId) = await SeedOwnerAsync();
        var handler = new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now));

        await handler.HandleAsync(
            new CreateSongCommand(owner, groupId, "Same", null, SongOriginKinds.Original, null),
            CancellationToken.None);
        await handler.HandleAsync(
            new CreateSongCommand(owner, groupId, "Same", null, SongOriginKinds.Cover, null),
            CancellationToken.None);

        Assert.Equal(2, songs.Songs.Count);
        Assert.All(songs.Songs, s => Assert.Equal("Same", s.Title));
    }

    [Fact]
    public async Task Member_cannot_create_song()
    {
        var (store, songs, _, groupId, member) = await SeedOwnerAndMemberAsync();
        var handler = new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(
                new CreateSongCommand(member, groupId, "Nope", null, SongOriginKinds.Original, null),
                CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_create_throws_not_found()
    {
        var (store, songs, _, groupId) = await SeedOwnerAsync();
        var stranger = Guid.NewGuid();
        var handler = new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new CreateSongCommand(stranger, groupId, "Nope", null, SongOriginKinds.Original, null),
                CancellationToken.None));
    }

    [Fact]
    public async Task Member_can_list_and_get_songs()
    {
        var (store, songs, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        await new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
            .HandleAsync(
                new CreateSongCommand(owner, groupId, "Listed", "Attrib", SongOriginKinds.Cover, "notes"),
                CancellationToken.None);

        var list = await new ListSongsHandler(new GroupAccessService(store), songs)
            .HandleAsync(member, groupId, CancellationToken.None);
        Assert.Single(list);
        Assert.Equal("Listed", list[0].Title);

        var detail = await new GetSongHandler(new GroupAccessService(store), songs)
            .HandleAsync(member, groupId, list[0].Id, CancellationToken.None);
        Assert.Equal("notes", detail.RightsNotes);
        Assert.Equal(0, detail.ArrangementCount);
    }

    [Fact]
    public async Task Non_member_get_throws_not_found()
    {
        var (store, songs, owner, groupId) = await SeedOwnerAsync();
        var created = await new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
            .HandleAsync(
                new CreateSongCommand(owner, groupId, "Private", null, SongOriginKinds.Original, null),
                CancellationToken.None);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetSongHandler(new GroupAccessService(store), songs)
                .HandleAsync(Guid.NewGuid(), groupId, created.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Missing_song_throws_not_found()
    {
        var (store, songs, owner, groupId) = await SeedOwnerAsync();

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetSongHandler(new GroupAccessService(store), songs)
                .HandleAsync(owner, groupId, Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task Group_isolation_hides_other_group_songs()
    {
        var (store, songs, ownerA, groupA) = await SeedOwnerAsync();
        var ownerB = Guid.NewGuid();
        var groupB = Group.Create("Other", Now);
        await store.AddAsync(groupB, Membership.CreateOwner(groupB.Id, ownerB, Now), CancellationToken.None);
        await store.SaveChangesAsync(CancellationToken.None);

        var created = await new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
            .HandleAsync(
                new CreateSongCommand(ownerA, groupA, "Only A", null, SongOriginKinds.Original, null),
                CancellationToken.None);

        var listB = await new ListSongsHandler(new GroupAccessService(store), songs)
            .HandleAsync(ownerB, groupB.Id, CancellationToken.None);
        Assert.Empty(listB);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetSongHandler(new GroupAccessService(store), songs)
                .HandleAsync(ownerB, groupB.Id, created.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Owner_update_increments_version()
    {
        var (store, songs, owner, groupId) = await SeedOwnerAsync();
        var created = await new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
            .HandleAsync(
                new CreateSongCommand(owner, groupId, "Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);

        var updated = await new UpdateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now.AddMinutes(1)))
            .HandleAsync(
                new UpdateSongCommand(owner, groupId, created.Id, "Renamed", "A", SongOriginKinds.Other, "R", 1),
                CancellationToken.None);

        Assert.Equal("Renamed", updated.Title);
        Assert.Equal(2, updated.Version);
        Assert.Equal(SongOriginKinds.Other, updated.OriginKind);
    }

    [Fact]
    public async Task Member_cannot_update_song()
    {
        var (store, songs, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        var created = await new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
            .HandleAsync(
                new CreateSongCommand(owner, groupId, "Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new UpdateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
                .HandleAsync(
                    new UpdateSongCommand(member, groupId, created.Id, "Hacked", null, null, null, 1),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Stale_expected_version_throws_conflict()
    {
        var (store, songs, owner, groupId) = await SeedOwnerAsync();
        var created = await new CreateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
            .HandleAsync(
                new CreateSongCommand(owner, groupId, "Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);

        await Assert.ThrowsAsync<ConflictException>(() =>
            new UpdateSongHandler(new GroupAccessService(store), songs, new FixedClock(Now))
                .HandleAsync(
                    new UpdateSongCommand(owner, groupId, created.Id, "Nope", null, null, null, 99),
                    CancellationToken.None));
    }

    private static async Task<(FakeGroupStore Store, FakeSongStore Songs, Guid Owner, Guid GroupId)> SeedOwnerAsync()
    {
        var store = new FakeGroupStore();
        var songs = new FakeSongStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await store.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await store.SaveChangesAsync(CancellationToken.None);
        return (store, songs, owner, group.Id);
    }

    private static async Task<(FakeGroupStore Store, FakeSongStore Songs, Guid Owner, Guid GroupId, Guid Member)> SeedOwnerAndMemberAsync()
    {
        var (store, songs, owner, groupId) = await SeedOwnerAsync();
        var member = Guid.NewGuid();
        store.Memberships.Add(Membership.CreateMember(groupId, member, Now));
        return (store, songs, owner, groupId, member);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeSongStore : ISongStore
    {
        public List<Song> Songs { get; } = [];
        public int LiveArrangementCount { get; set; }

        public Task AddAsync(Song song, CancellationToken cancellationToken)
        {
            Songs.Add(song);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Song>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
        {
            var list = Songs
                .Where(s => s.GroupId == groupId && !s.IsDeleted)
                .OrderBy(s => s.Title)
                .ThenBy(s => s.Id)
                .ToList();
            return Task.FromResult<IReadOnlyList<Song>>(list);
        }

        public Task<Song?> GetByIdAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(Songs.FirstOrDefault(s => s.GroupId == groupId && s.Id == songId && !s.IsDeleted));

        public Task<int> CountLiveArrangementsAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(LiveArrangementCount);

        public Task UpdateAsync(Song song, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeGroupStore : IGroupStore
    {
        public List<Group> Groups { get; } = [];
        public List<Membership> Memberships { get; } = [];

        public Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
        {
            Groups.Add(group);
            Memberships.Add(ownerMembership);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<GroupListItem>>([]);

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Groups.FirstOrDefault(g => g.Id == groupId && !g.IsDeleted));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Memberships.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
