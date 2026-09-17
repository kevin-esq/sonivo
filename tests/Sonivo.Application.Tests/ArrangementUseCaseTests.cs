using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class ArrangementUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task Owner_can_create_arrangement_under_live_song()
    {
        var ctx = await SeedOwnerWithSongAsync();
        var handler = new CreateArrangementHandler(
            new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now));

        var result = await handler.HandleAsync(
            new CreateArrangementCommand(
                ctx.Owner, ctx.GroupId, ctx.SongId, "Acoustic", "G", 110, null, null, null, null),
            CancellationToken.None);

        Assert.Equal("Acoustic", result.Label);
        Assert.Equal(ctx.SongId, result.SongId);
        Assert.Equal(110, result.DefaultBpm);
        Assert.Equal(1, result.Version);
        Assert.Empty(result.Resources);
        Assert.Single(ctx.Arrangements.Items);
    }

    [Fact]
    public async Task Member_cannot_create_arrangement()
    {
        var ctx = await SeedOwnerMemberWithSongAsync();
        var handler = new CreateArrangementHandler(
            new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(
                new CreateArrangementCommand(
                    ctx.Member, ctx.GroupId, ctx.SongId, "Nope", null, null, null, null, null, null),
                CancellationToken.None));
    }

    [Fact]
    public async Task Create_requires_song_in_same_group()
    {
        var ctx = await SeedOwnerWithSongAsync();
        var handler = new CreateArrangementHandler(
            new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new CreateArrangementCommand(
                    ctx.Owner, ctx.GroupId, Guid.NewGuid(), "Orphan", null, null, null, null, null, null),
                CancellationToken.None));
    }

    [Fact]
    public async Task Member_can_list_and_get()
    {
        var ctx = await SeedOwnerMemberWithSongAsync();
        var created = await new CreateArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now))
            .HandleAsync(
                new CreateArrangementCommand(
                    ctx.Owner, ctx.GroupId, ctx.SongId, "Live", null, null, "lyrics", null, null, null),
                CancellationToken.None);

        var list = await new ListArrangementsHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements)
            .HandleAsync(ctx.Member, ctx.GroupId, ctx.SongId, CancellationToken.None);
        Assert.Single(list);

        var detail = await new GetArrangementHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements)
            .HandleAsync(ctx.Member, ctx.GroupId, created.Id, CancellationToken.None);
        Assert.Equal("lyrics", detail.Lyrics);
    }

    [Fact]
    public async Task Cross_group_get_is_not_found()
    {
        var ctx = await SeedOwnerWithSongAsync();
        var created = await new CreateArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now))
            .HandleAsync(
                new CreateArrangementCommand(
                    ctx.Owner, ctx.GroupId, ctx.SongId, "Live", null, null, null, null, null, null),
                CancellationToken.None);

        var otherOwner = Guid.NewGuid();
        var otherGroup = Group.Create("Other", Now);
        await ctx.Groups.AddAsync(otherGroup, Membership.CreateOwner(otherGroup.Id, otherOwner, Now), CancellationToken.None);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetArrangementHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements)
                .HandleAsync(otherOwner, otherGroup.Id, created.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Owner_update_increments_version()
    {
        var ctx = await SeedOwnerWithSongAsync();
        var created = await new CreateArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now))
            .HandleAsync(
                new CreateArrangementCommand(
                    ctx.Owner, ctx.GroupId, ctx.SongId, "Live", null, null, null, null, null, null),
                CancellationToken.None);

        var updated = await new UpdateArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, new FixedClock(Now.AddMinutes(1)))
            .HandleAsync(
                new UpdateArrangementCommand(
                    ctx.Owner, ctx.GroupId, created.Id, "Studio", "A", 95, null, null, null, null, 1),
                CancellationToken.None);

        Assert.Equal("Studio", updated.Label);
        Assert.Equal(2, updated.Version);
        Assert.Equal(95, updated.DefaultBpm);
    }

    [Fact]
    public async Task Member_cannot_update_or_delete()
    {
        var ctx = await SeedOwnerMemberWithSongAsync();
        var created = await new CreateArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now))
            .HandleAsync(
                new CreateArrangementCommand(
                    ctx.Owner, ctx.GroupId, ctx.SongId, "Live", null, null, null, null, null, null),
                CancellationToken.None);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new UpdateArrangementHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, new FixedClock(Now))
                .HandleAsync(
                    new UpdateArrangementCommand(
                        ctx.Member, ctx.GroupId, created.Id, "Hacked", null, null, null, null, null, null, 1),
                    CancellationToken.None));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new SoftDeleteArrangementHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteArrangementCommand(ctx.Member, ctx.GroupId, created.Id, 1),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Stale_update_and_delete_throw_conflict()
    {
        var ctx = await SeedOwnerWithSongAsync();
        var created = await new CreateArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now))
            .HandleAsync(
                new CreateArrangementCommand(
                    ctx.Owner, ctx.GroupId, ctx.SongId, "Live", null, null, null, null, null, null),
                CancellationToken.None);

        await Assert.ThrowsAsync<ConflictException>(() =>
            new UpdateArrangementHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, new FixedClock(Now))
                .HandleAsync(
                    new UpdateArrangementCommand(
                        ctx.Owner, ctx.GroupId, created.Id, "Nope", null, null, null, null, null, null, 99),
                    CancellationToken.None));

        await Assert.ThrowsAsync<ConflictException>(() =>
            new SoftDeleteArrangementHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteArrangementCommand(ctx.Owner, ctx.GroupId, created.Id, 99),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Soft_delete_hides_from_list_and_preserves_resources()
    {
        var ctx = await SeedOwnerWithSongAsync();
        var created = await new CreateArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, new FixedClock(Now))
            .HandleAsync(
                new CreateArrangementCommand(
                    ctx.Owner, ctx.GroupId, ctx.SongId, "Live", null, null, null, null, null, null),
                CancellationToken.None);

        var resource = Resource.CreateLink(
            created.Id,
            ResourcePurposes.Practice,
            "Chart",
            "https://example.com/chart",
            Now);
        ctx.Arrangements.AttachResource(created.Id, resource);

        await new SoftDeleteArrangementHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, new FixedClock(Now.AddHours(1)))
            .HandleAsync(
                new SoftDeleteArrangementCommand(ctx.Owner, ctx.GroupId, created.Id, 1),
                CancellationToken.None);

        Assert.Equal(2, ctx.Arrangements.Items.Single(a => a.Id == created.Id).Version);
        Assert.True(ctx.Arrangements.Items.Single(a => a.Id == created.Id).IsDeleted);

        var list = await new ListArrangementsHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements)
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.SongId, CancellationToken.None);
        Assert.Empty(list);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetArrangementHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements)
                .HandleAsync(ctx.Owner, ctx.GroupId, created.Id, CancellationToken.None));

        Assert.Contains(ctx.Arrangements.Resources, r => r.Id == resource.Id);
    }

    [Fact]
    public async Task List_under_missing_song_is_not_found()
    {
        var ctx = await SeedOwnerWithSongAsync();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            new ListArrangementsHandler(new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements)
                .HandleAsync(ctx.Owner, ctx.GroupId, Guid.NewGuid(), CancellationToken.None));
    }

    private static async Task<Fixture> SeedOwnerWithSongAsync()
    {
        var groups = new FakeGroupStore();
        var songs = new FakeSongStore();
        var arrangements = new FakeArrangementStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);

        var song = Song.Create(group.Id, "Amazing Grace", SongOriginKinds.Original, Now);
        await songs.AddAsync(song, CancellationToken.None);

        return new Fixture(groups, songs, arrangements, owner, Guid.Empty, group.Id, song.Id);
    }

    private static async Task<Fixture> SeedOwnerMemberWithSongAsync()
    {
        var ctx = await SeedOwnerWithSongAsync();
        var member = Guid.NewGuid();
        ctx.Groups.Memberships.Add(Membership.CreateMember(ctx.GroupId, member, Now));
        return ctx with { Member = member };
    }

    private sealed record Fixture(
        FakeGroupStore Groups,
        FakeSongStore Songs,
        FakeArrangementStore Arrangements,
        Guid Owner,
        Guid Member,
        Guid GroupId,
        Guid SongId);

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
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
            => Task.FromResult<IReadOnlyList<Song>>(Songs.Where(s => s.GroupId == groupId && !s.IsDeleted).ToList());

        public Task<Song?> GetByIdAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(Songs.FirstOrDefault(s => s.GroupId == groupId && s.Id == songId && !s.IsDeleted));

        public Task<int> CountLiveArrangementsAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(0);

        public Task UpdateAsync(Song song, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeArrangementStore : IArrangementStore
    {
        public List<Arrangement> Items { get; } = [];
        public List<Resource> Resources { get; } = [];

        public void AttachResource(Guid arrangementId, Resource resource)
        {
            Resources.Add(resource);
            var arr = Items.Single(a => a.Id == arrangementId);
            arr.Resources.Add(resource);
        }

        public Task AddAsync(Arrangement arrangement, CancellationToken cancellationToken)
        {
            Items.Add(arrangement);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Arrangement>> ListBySongAsync(
            Guid groupId,
            Guid songId,
            CancellationToken cancellationToken)
        {
            var list = Items
                .Where(a => a.GroupId == groupId && a.SongId == songId && !a.IsDeleted)
                .OrderBy(a => a.CreatedAt)
                .ThenBy(a => a.Id)
                .ToList();
            return Task.FromResult<IReadOnlyList<Arrangement>>(list);
        }

        public Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(
            Guid groupId,
            Guid songId,
            CancellationToken cancellationToken)
            => ListBySongAsync(groupId, songId, cancellationToken);

        public Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult(Items.FirstOrDefault(a => a.GroupId == groupId && a.Id == arrangementId && !a.IsDeleted));

        public Task<Arrangement?> GetByIdWithResourcesAsync(
            Guid groupId,
            Guid arrangementId,
            CancellationToken cancellationToken)
            => GetByIdAsync(groupId, arrangementId, cancellationToken);

        public Task UpdateAsync(Arrangement arrangement, CancellationToken cancellationToken) => Task.CompletedTask;
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

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        {
            Memberships.Add(membership);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
