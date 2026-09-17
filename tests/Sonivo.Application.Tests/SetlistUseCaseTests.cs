using Sonivo.Application.Abstractions;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class SetlistUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-16T12:00:00Z");

    [Fact]
    public async Task Owner_can_create_setlist()
    {
        var (groups, setlists, arrangements, songs, owner, groupId) = await SeedOwnerAsync();
        var handler = new CreateSetlistHandler(new GroupAccessService(groups), setlists, new FixedClock(Now));

        var created = await handler.HandleAsync(
            new CreateSetlistCommand(owner, groupId, "Sunday"),
            CancellationToken.None);

        Assert.Equal("Sunday", created.Name);
        Assert.Equal(1, created.Version);
        Assert.Empty(created.Items);
        Assert.Single(setlists.Setlists);
    }

    [Fact]
    public async Task Member_cannot_create_setlist()
    {
        var (groups, setlists, _, _, _, groupId, member) = await SeedOwnerAndMemberAsync();
        var handler = new CreateSetlistHandler(new GroupAccessService(groups), setlists, new FixedClock(Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(new CreateSetlistCommand(member, groupId, "Nope"), CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_create_throws_not_found()
    {
        var (groups, setlists, _, _, _, groupId) = await SeedOwnerAsync();
        var handler = new CreateSetlistHandler(new GroupAccessService(groups), setlists, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new CreateSetlistCommand(Guid.NewGuid(), groupId, "Nope"),
                CancellationToken.None));
    }

    [Fact]
    public async Task Member_can_list_and_get_setlist_with_ordered_labels()
    {
        var (groups, setlists, arrangements, songs, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        var access = new GroupAccessService(groups);
        var (arrA, arrB) = SeedTwoArrangements(arrangements, songs, groupId);

        var created = await new CreateSetlistHandler(access, setlists, new FixedClock(Now))
            .HandleAsync(new CreateSetlistCommand(owner, groupId, "Set"), CancellationToken.None);

        await new ReplaceSetlistItemsHandler(access, setlists, arrangements, songs, new FixedClock(Now.AddMinutes(1)))
            .HandleAsync(
                new ReplaceSetlistItemsCommand(
                    owner,
                    groupId,
                    created.Id,
                    1,
                    [
                        new SetlistItemReplaceDto(arrB.Id, 20),
                        new SetlistItemReplaceDto(arrA.Id, 10)
                    ]),
                CancellationToken.None);

        var list = await new ListSetlistsHandler(access, setlists)
            .HandleAsync(member, groupId, CancellationToken.None);
        Assert.Single(list);
        Assert.Equal(2, list[0].ItemCount);

        var detail = await new GetSetlistHandler(access, setlists, arrangements, songs)
            .HandleAsync(member, groupId, created.Id, CancellationToken.None);
        Assert.Equal(2, detail.Items.Count);
        Assert.Equal(arrA.Id, detail.Items[0].ArrangementId);
        Assert.Equal("Song A", detail.Items[0].SongTitle);
        Assert.Equal("Arr A", detail.Items[0].ArrangementLabel);
        Assert.Equal(arrB.Id, detail.Items[1].ArrangementId);
        Assert.Equal(2, detail.Version);
    }

    [Fact]
    public async Task Replace_allows_duplicate_arrangements()
    {
        var (groups, setlists, arrangements, songs, owner, groupId) = await SeedOwnerAsync();
        var access = new GroupAccessService(groups);
        var (arrA, _) = SeedTwoArrangements(arrangements, songs, groupId);
        var created = await new CreateSetlistHandler(access, setlists, new FixedClock(Now))
            .HandleAsync(new CreateSetlistCommand(owner, groupId, "Dup"), CancellationToken.None);

        var updated = await new ReplaceSetlistItemsHandler(
                access, setlists, arrangements, songs, new FixedClock(Now.AddMinutes(1)))
            .HandleAsync(
                new ReplaceSetlistItemsCommand(
                    owner,
                    groupId,
                    created.Id,
                    1,
                    [
                        new SetlistItemReplaceDto(arrA.Id, 1),
                        new SetlistItemReplaceDto(arrA.Id, 2)
                    ]),
                CancellationToken.None);

        Assert.Equal(2, updated.Items.Count);
        Assert.All(updated.Items, i => Assert.Equal(arrA.Id, i.ArrangementId));
    }

    [Fact]
    public async Task Replace_rejects_soft_deleted_or_cross_group_arrangement()
    {
        var (groups, setlists, arrangements, songs, owner, groupId) = await SeedOwnerAsync();
        var access = new GroupAccessService(groups);
        var (arrA, _) = SeedTwoArrangements(arrangements, songs, groupId);
        arrangements.SoftDeletedIds.Add(arrA.Id);

        var created = await new CreateSetlistHandler(access, setlists, new FixedClock(Now))
            .HandleAsync(new CreateSetlistCommand(owner, groupId, "Bad"), CancellationToken.None);

        await Assert.ThrowsAsync<ValidationException>(() =>
            new ReplaceSetlistItemsHandler(access, setlists, arrangements, songs, new FixedClock(Now))
                .HandleAsync(
                    new ReplaceSetlistItemsCommand(
                        owner,
                        groupId,
                        created.Id,
                        1,
                        [new SetlistItemReplaceDto(arrA.Id, 1)]),
                    CancellationToken.None));

        await Assert.ThrowsAsync<ValidationException>(() =>
            new ReplaceSetlistItemsHandler(access, setlists, arrangements, songs, new FixedClock(Now))
                .HandleAsync(
                    new ReplaceSetlistItemsCommand(
                        owner,
                        groupId,
                        created.Id,
                        1,
                        [new SetlistItemReplaceDto(Guid.NewGuid(), 1)]),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Member_cannot_replace_items()
    {
        var (groups, setlists, arrangements, songs, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        var access = new GroupAccessService(groups);
        var (arrA, _) = SeedTwoArrangements(arrangements, songs, groupId);
        var created = await new CreateSetlistHandler(access, setlists, new FixedClock(Now))
            .HandleAsync(new CreateSetlistCommand(owner, groupId, "Set"), CancellationToken.None);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new ReplaceSetlistItemsHandler(access, setlists, arrangements, songs, new FixedClock(Now))
                .HandleAsync(
                    new ReplaceSetlistItemsCommand(
                        member,
                        groupId,
                        created.Id,
                        1,
                        [new SetlistItemReplaceDto(arrA.Id, 1)]),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Rename_increments_version_and_stale_conflicts()
    {
        var (groups, setlists, arrangements, songs, owner, groupId) = await SeedOwnerAsync();
        var access = new GroupAccessService(groups);
        var created = await new CreateSetlistHandler(access, setlists, new FixedClock(Now))
            .HandleAsync(new CreateSetlistCommand(owner, groupId, "Old"), CancellationToken.None);

        var renamed = await new UpdateSetlistHandler(
                access, setlists, arrangements, songs, new FixedClock(Now.AddMinutes(1)))
            .HandleAsync(
                new UpdateSetlistCommand(owner, groupId, created.Id, "New", 1),
                CancellationToken.None);
        Assert.Equal("New", renamed.Name);
        Assert.Equal(2, renamed.Version);

        await Assert.ThrowsAsync<ConflictException>(() =>
            new UpdateSetlistHandler(access, setlists, arrangements, songs, new FixedClock(Now))
                .HandleAsync(
                    new UpdateSetlistCommand(owner, groupId, created.Id, "Nope", 1),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Group_isolation_hides_other_group_setlists()
    {
        var (groups, setlists, arrangements, songs, ownerA, groupA) = await SeedOwnerAsync();
        var ownerB = Guid.NewGuid();
        var groupB = Group.Create("Other", Now);
        await groups.AddAsync(groupB, Membership.CreateOwner(groupB.Id, ownerB, Now), CancellationToken.None);
        await groups.SaveChangesAsync(CancellationToken.None);

        var created = await new CreateSetlistHandler(new GroupAccessService(groups), setlists, new FixedClock(Now))
            .HandleAsync(new CreateSetlistCommand(ownerA, groupA, "Only A"), CancellationToken.None);

        var listB = await new ListSetlistsHandler(new GroupAccessService(groups), setlists)
            .HandleAsync(ownerB, groupB.Id, CancellationToken.None);
        Assert.Empty(listB);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetSetlistHandler(new GroupAccessService(groups), setlists, arrangements, songs)
                .HandleAsync(ownerB, groupB.Id, created.Id, CancellationToken.None));
    }

    private static (Arrangement ArrA, Arrangement ArrB) SeedTwoArrangements(
        FakeArrangementStore arrangements,
        FakeSongStore songs,
        Guid groupId)
    {
        var songA = Song.Create(groupId, "Song A", SongOriginKinds.Original, Now);
        var songB = Song.Create(groupId, "Song B", SongOriginKinds.Original, Now);
        songs.Songs.Add(songA);
        songs.Songs.Add(songB);
        var arrA = Arrangement.Create(groupId, songA.Id, "Arr A", Now);
        var arrB = Arrangement.Create(groupId, songB.Id, "Arr B", Now);
        arrangements.Arrangements.Add(arrA);
        arrangements.Arrangements.Add(arrB);
        return (arrA, arrB);
    }

    private static async Task<(
        FakeGroupStore Groups,
        FakeSetlistStore Setlists,
        FakeArrangementStore Arrangements,
        FakeSongStore Songs,
        Guid Owner,
        Guid GroupId)> SeedOwnerAsync()
    {
        var groups = new FakeGroupStore();
        var setlists = new FakeSetlistStore();
        var arrangements = new FakeArrangementStore();
        var songs = new FakeSongStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await groups.SaveChangesAsync(CancellationToken.None);
        return (groups, setlists, arrangements, songs, owner, group.Id);
    }

    private static async Task<(
        FakeGroupStore Groups,
        FakeSetlistStore Setlists,
        FakeArrangementStore Arrangements,
        FakeSongStore Songs,
        Guid Owner,
        Guid GroupId,
        Guid Member)> SeedOwnerAndMemberAsync()
    {
        var seed = await SeedOwnerAsync();
        var member = Guid.NewGuid();
        seed.Groups.Memberships.Add(Membership.CreateMember(seed.GroupId, member, Now));
        return (seed.Groups, seed.Setlists, seed.Arrangements, seed.Songs, seed.Owner, seed.GroupId, member);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeSetlistStore : ISetlistStore
    {
        public List<Setlist> Setlists { get; } = [];

        public Task AddAsync(Setlist setlist, CancellationToken cancellationToken)
        {
            Setlists.Add(setlist);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Setlist>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
        {
            var list = Setlists
                .Where(s => s.GroupId == groupId)
                .OrderBy(s => s.Name)
                .ThenBy(s => s.Id)
                .ToList();
            return Task.FromResult<IReadOnlyList<Setlist>>(list);
        }

        public Task<Setlist?> GetByIdAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken)
            => Task.FromResult(Setlists.FirstOrDefault(s => s.GroupId == groupId && s.Id == setlistId));

        public Task<Setlist?> GetByIdWithItemsAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken)
            => GetByIdAsync(groupId, setlistId, cancellationToken);

        public Task RemoveItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task AddItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task UpdateAsync(Setlist setlist, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeArrangementStore : IArrangementStore
    {
        public List<Arrangement> Arrangements { get; } = [];
        public HashSet<Guid> SoftDeletedIds { get; } = [];

        public Task AddAsync(Arrangement arrangement, CancellationToken cancellationToken)
        {
            Arrangements.Add(arrangement);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Arrangement>> ListBySongAsync(
            Guid groupId,
            Guid songId,
            CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Arrangement>>(
                Arrangements.Where(a => a.GroupId == groupId && a.SongId == songId && !SoftDeletedIds.Contains(a.Id)).ToList());

        public Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(
            Guid groupId,
            Guid songId,
            CancellationToken cancellationToken)
            => ListBySongAsync(groupId, songId, cancellationToken);

        public Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult(
                Arrangements.FirstOrDefault(a =>
                    a.GroupId == groupId && a.Id == arrangementId && !SoftDeletedIds.Contains(a.Id)));

        public Task<Arrangement?> GetByIdWithResourcesAsync(
            Guid groupId,
            Guid arrangementId,
            CancellationToken cancellationToken)
            => GetByIdAsync(groupId, arrangementId, cancellationToken);

        public Task UpdateAsync(Arrangement arrangement, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeSongStore : ISongStore
    {
        public List<Song> Songs { get; } = [];

        public Task AddAsync(Song song, CancellationToken cancellationToken)
        {
            Songs.Add(song);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Song>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Song>>(Songs.Where(s => s.GroupId == groupId).ToList());

        public Task<Song?> GetByIdAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(Songs.FirstOrDefault(s => s.GroupId == groupId && s.Id == songId));

        public Task<int> CountLiveArrangementsAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(0);

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
