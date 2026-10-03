using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class GroupResourcesUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task Member_lists_group_resources_with_song_and_arrangement_labels()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var song = Song.Create(ctx.GroupId, "Grande es Él", "cover", Now, id: ctx.SongId);
        await ctx.Songs.AddAsync(song, CancellationToken.None);
        var resource = Resource.CreateLink(
            ctx.ArrangementId, ResourcePurposes.Chart, "Partitura", "https://example.com/chart", Now);
        await ctx.Resources.AddAsync(resource, CancellationToken.None);

        var items = await new ListGroupResourcesHandler(
                new GroupAccessService(ctx.Groups), ctx.Resources, ctx.Arrangements, ctx.Songs)
            .HandleAsync(new ListGroupResourcesQuery(ctx.Member, ctx.GroupId), CancellationToken.None);

        var single = Assert.Single(items);
        Assert.Equal(resource.Id, single.Id);
        Assert.Equal("Grande es Él", single.SongTitle);
        Assert.Equal("Acoustic", single.ArrangementLabel);
        Assert.Equal(ResourcePurposes.Chart, single.Purpose);
    }

    [Fact]
    public async Task Non_member_is_rejected()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var stranger = Guid.NewGuid();

        await Assert.ThrowsAsync<NotFoundException>(
            () => new ListGroupResourcesHandler(
                    new GroupAccessService(ctx.Groups), ctx.Resources, ctx.Arrangements, ctx.Songs)
                .HandleAsync(new ListGroupResourcesQuery(stranger, ctx.GroupId), CancellationToken.None));
    }

    [Fact]
    public async Task Group_without_resources_returns_empty()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();

        var items = await new ListGroupResourcesHandler(
                new GroupAccessService(ctx.Groups), ctx.Resources, ctx.Arrangements, ctx.Songs)
            .HandleAsync(new ListGroupResourcesQuery(ctx.Member, ctx.GroupId), CancellationToken.None);

        Assert.Empty(items);
    }

    private static async Task<Fixture> SeedOwnerMemberWithArrangementAsync()
    {
        var groups = new FakeGroupStore();
        var arrangements = new FakeArrangementStore();
        var resources = new FakeResourceStore();
        var songs = new FakeSongStore();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        groups.Memberships.Add(Membership.CreateMember(group.Id, member, Now));
        var songId = Guid.NewGuid();
        var arrangement = Arrangement.Create(group.Id, songId, "Acoustic", Now);
        await arrangements.AddAsync(arrangement, CancellationToken.None);
        return new Fixture(groups, arrangements, resources, songs, owner, member, group.Id, songId, arrangement.Id);
    }

    private sealed record Fixture(
        FakeGroupStore Groups,
        FakeArrangementStore Arrangements,
        FakeResourceStore Resources,
        FakeSongStore Songs,
        Guid Owner,
        Guid Member,
        Guid GroupId,
        Guid SongId,
        Guid ArrangementId);

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

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        {
            Memberships.Add(membership);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<GroupListItem>>(
                Memberships.Where(m => m.UserId == userId).Select(m => new GroupListItem(
                    m.GroupId, "Band", null, m.Role, 1, Now, 1, null, null)).ToList());

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Groups.FirstOrDefault(g => g.Id == groupId && !g.IsDeleted));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Memberships.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeArrangementStore : IArrangementStore
    {
        public List<Arrangement> Items { get; } = [];

        public Task AddAsync(Arrangement arrangement, CancellationToken cancellationToken)
        {
            Items.Add(arrangement);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Arrangement>> ListBySongAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Arrangement>>(Items.Where(a => a.GroupId == groupId).ToList());

        public Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => ListBySongAsync(groupId, songId, cancellationToken);

        public Task<IReadOnlyList<Arrangement>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Arrangement>>(Items.Where(a => a.GroupId == groupId).ToList());

        public Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult(Items.FirstOrDefault(a => a.GroupId == groupId && a.Id == arrangementId && !a.IsDeleted));

        public Task<Arrangement?> GetByIdWithResourcesAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => GetByIdAsync(groupId, arrangementId, cancellationToken);

        public Task UpdateAsync(Arrangement arrangement, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeResourceStore : IResourceStore
    {
        private readonly List<Resource> _items = [];

        public Task AddAsync(Resource resource, CancellationToken cancellationToken)
        {
            _items.Add(resource);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Resource>> ListByArrangementAsync(Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Resource>>(_items.Where(r => r.ArrangementId == arrangementId).ToList());

        public Task<IReadOnlyList<Resource>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Resource>>(_items.ToList());

        public Task<Resource?> GetByIdAsync(Guid arrangementId, Guid resourceId, CancellationToken cancellationToken)
            => Task.FromResult(_items.FirstOrDefault(r => r.ArrangementId == arrangementId && r.Id == resourceId));

        public Task UpdateAsync(Resource resource, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task RemoveAsync(Resource resource, CancellationToken cancellationToken) => Task.CompletedTask;
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
            => Task.FromResult<IReadOnlyList<Song>>(
                Songs.Where(s => s.GroupId == groupId && !s.IsDeleted).OrderBy(s => s.Title).ToList());

        public Task<Song?> GetByIdAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(Songs.FirstOrDefault(s => s.GroupId == groupId && s.Id == songId && !s.IsDeleted));

        public Task<int> CountLiveArrangementsAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(0);

        public Task UpdateAsync(Song song, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
