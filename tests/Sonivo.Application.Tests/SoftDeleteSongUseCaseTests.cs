using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class SoftDeleteSongUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task Owner_delete_cascades_live_arrangements_and_preserves_resources()
    {
        var ctx = await SeedAsync();
        var liveA = await CreateArrangementAsync(ctx, "Live A");
        var liveB = await CreateArrangementAsync(ctx, "Live B");
        var alreadyDeleted = await CreateArrangementAsync(ctx, "Already Gone");
        alreadyDeleted.SoftDelete(1, Now.AddMinutes(1));
        var alreadyDeletedVersion = alreadyDeleted.Version;
        var alreadyDeletedAt = alreadyDeleted.DeletedAt;

        var resource = Resource.CreateLink(
            liveA.Id,
            ResourcePurposes.Practice,
            "Chart",
            "https://example.com/c",
            Now);
        ctx.Arrangements.AttachResource(liveA.Id, resource);

        await new SoftDeleteSongHandler(
                new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, ctx.UnitOfWork, new FixedClock(Now.AddHours(1)))
            .HandleAsync(
                new SoftDeleteSongCommand(ctx.Owner, ctx.GroupId, ctx.SongId, 1),
                CancellationToken.None);

        var song = ctx.Songs.Songs.Single(s => s.Id == ctx.SongId);
        Assert.True(song.IsDeleted);
        Assert.Equal(2, song.Version);

        Assert.True(ctx.Arrangements.Items.Single(a => a.Id == liveA.Id).IsDeleted);
        Assert.True(ctx.Arrangements.Items.Single(a => a.Id == liveB.Id).IsDeleted);
        Assert.Equal(2, ctx.Arrangements.Items.Single(a => a.Id == liveA.Id).Version);
        Assert.Equal(2, ctx.Arrangements.Items.Single(a => a.Id == liveB.Id).Version);

        var untouched = ctx.Arrangements.Items.Single(a => a.Id == alreadyDeleted.Id);
        Assert.Equal(alreadyDeletedVersion, untouched.Version);
        Assert.Equal(alreadyDeletedAt, untouched.DeletedAt);

        Assert.Contains(ctx.Arrangements.Resources, r => r.Id == resource.Id);
        Assert.Equal(1, ctx.UnitOfWork.SaveCount);
    }

    [Fact]
    public async Task Member_cannot_delete()
    {
        var ctx = await SeedWithMemberAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new SoftDeleteSongHandler(
                    new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, ctx.UnitOfWork, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteSongCommand(ctx.Member, ctx.GroupId, ctx.SongId, 1),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_is_not_found()
    {
        var ctx = await SeedAsync();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            new SoftDeleteSongHandler(
                    new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, ctx.UnitOfWork, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteSongCommand(Guid.NewGuid(), ctx.GroupId, ctx.SongId, 1),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Stale_song_version_throws_conflict_with_zero_writes()
    {
        var ctx = await SeedAsync();
        var live = await CreateArrangementAsync(ctx, "Live");

        await Assert.ThrowsAsync<ConflictException>(() =>
            new SoftDeleteSongHandler(
                    new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, ctx.UnitOfWork, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteSongCommand(ctx.Owner, ctx.GroupId, ctx.SongId, 99),
                    CancellationToken.None));

        Assert.False(ctx.Songs.Songs.Single().IsDeleted);
        Assert.False(live.IsDeleted);
        Assert.Equal(0, ctx.UnitOfWork.SaveCount);
    }

    [Fact]
    public async Task Missing_expected_version_is_validation_error()
    {
        var ctx = await SeedAsync();
        await Assert.ThrowsAsync<ValidationException>(() =>
            new SoftDeleteSongHandler(
                    new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, ctx.UnitOfWork, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteSongCommand(ctx.Owner, ctx.GroupId, ctx.SongId, 0),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Cross_group_song_id_is_not_found()
    {
        var ctx = await SeedAsync();
        var otherOwner = Guid.NewGuid();
        var otherGroup = Group.Create("Other", Now);
        await ctx.Groups.AddAsync(otherGroup, Membership.CreateOwner(otherGroup.Id, otherOwner, Now), CancellationToken.None);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new SoftDeleteSongHandler(
                    new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, ctx.UnitOfWork, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteSongCommand(otherOwner, otherGroup.Id, ctx.SongId, 1),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Save_failure_does_not_call_save_twice()
    {
        var ctx = await SeedAsync();
        await CreateArrangementAsync(ctx, "Live");
        ctx.UnitOfWork.ThrowOnSave = new ConflictException("simulated concurrency");

        await Assert.ThrowsAsync<ConflictException>(() =>
            new SoftDeleteSongHandler(
                    new GroupAccessService(ctx.Groups), ctx.Songs, ctx.Arrangements, ctx.UnitOfWork, new FixedClock(Now))
                .HandleAsync(
                    new SoftDeleteSongCommand(ctx.Owner, ctx.GroupId, ctx.SongId, 1),
                    CancellationToken.None));

        Assert.Equal(1, ctx.UnitOfWork.SaveCount);
    }

    private static async Task<Fixture> SeedAsync()
    {
        var groups = new FakeGroupStore();
        var songs = new FakeSongStore();
        var arrangements = new FakeArrangementStore();
        var unitOfWork = new FakeUnitOfWork();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        var song = Song.Create(group.Id, "Amazing Grace", SongOriginKinds.Original, Now);
        await songs.AddAsync(song, CancellationToken.None);
        return new Fixture(groups, songs, arrangements, unitOfWork, owner, Guid.Empty, group.Id, song.Id);
    }

    private static async Task<Fixture> SeedWithMemberAsync()
    {
        var ctx = await SeedAsync();
        var member = Guid.NewGuid();
        ctx.Groups.Memberships.Add(Membership.CreateMember(ctx.GroupId, member, Now));
        return ctx with { Member = member };
    }

    private static async Task<Arrangement> CreateArrangementAsync(Fixture ctx, string label)
    {
        var arr = Arrangement.Create(ctx.GroupId, ctx.SongId, label, Now);
        await ctx.Arrangements.AddAsync(arr, CancellationToken.None);
        return arr;
    }

    private sealed record Fixture(
        FakeGroupStore Groups,
        FakeSongStore Songs,
        FakeArrangementStore Arrangements,
        FakeUnitOfWork UnitOfWork,
        Guid Owner,
        Guid Member,
        Guid GroupId,
        Guid SongId);

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCount { get; private set; }
        public Exception? ThrowOnSave { get; set; }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveCount++;
            if (ThrowOnSave is not null)
            {
                throw ThrowOnSave;
            }

            return Task.CompletedTask;
        }
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
            Items.Single(a => a.Id == arrangementId).Resources.Add(resource);
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
            => Task.FromResult<IReadOnlyList<Arrangement>>(
                Items.Where(a => a.GroupId == groupId && a.SongId == songId && !a.IsDeleted).ToList());

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

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
