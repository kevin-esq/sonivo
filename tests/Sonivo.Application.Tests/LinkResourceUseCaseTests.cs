using Microsoft.Extensions.Logging.Abstractions;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class LinkResourceUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task Owner_can_create_list_get_update_and_hard_delete()
    {
        var ctx = await SeedWithArrangementAsync();
        var create = new CreateLinkResourceHandler(
            new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FixedClock(Now));

        var created = await create.HandleAsync(
            new CreateLinkResourceCommand(
                ctx.Owner, ctx.GroupId, ctx.ArrangementId, ResourceKinds.Link,
                ResourcePurposes.Practice, "Chart", "Guitar", "note", "https://example.com/a"),
            CancellationToken.None);

        Assert.Equal(ResourceKinds.Link, created.Kind);
        Assert.Equal("https://example.com/a", created.Url);
        Assert.Null(ctx.Resources.Items.Single().ObjectKey);

        var list = await new ListResourcesHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources)
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.ArrangementId, CancellationToken.None);
        Assert.Single(list);

        var updated = await new UpdateLinkResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources)
            .HandleAsync(
                new UpdateLinkResourceCommand(
                    ctx.Owner, ctx.GroupId, ctx.ArrangementId, created.Id,
                    ResourcePurposes.Chart, "Updated", null, null),
                CancellationToken.None);
        Assert.Equal("Updated", updated.Label);
        Assert.Equal(ResourcePurposes.Chart, updated.Purpose);

        var arrangementVersionBefore = ctx.Arrangements.Items.Single().Version;
        await new DeleteResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources,
                new FakeBlobStore(), NullLogger<DeleteResourceHandler>.Instance)
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.ArrangementId, created.Id, CancellationToken.None);

        Assert.Empty(ctx.Resources.Items);
        Assert.Equal(arrangementVersionBefore, ctx.Arrangements.Items.Single().Version);
        Assert.False(ctx.Arrangements.Items.Single().IsDeleted);
    }

    [Fact]
    public async Task Member_can_read_but_not_mutate()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var created = await new CreateLinkResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FixedClock(Now))
            .HandleAsync(
                new CreateLinkResourceCommand(
                    ctx.Owner, ctx.GroupId, ctx.ArrangementId, ResourceKinds.Link,
                    ResourcePurposes.Other, "Label", null, null, "https://example.com"),
                CancellationToken.None);

        var list = await new ListResourcesHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources)
            .HandleAsync(ctx.Member, ctx.GroupId, ctx.ArrangementId, CancellationToken.None);
        Assert.Single(list);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new CreateLinkResourceHandler(
                    new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FixedClock(Now))
                .HandleAsync(
                    new CreateLinkResourceCommand(
                        ctx.Member, ctx.GroupId, ctx.ArrangementId, ResourceKinds.Link,
                        ResourcePurposes.Other, "Nope", null, null, "https://example.com"),
                    CancellationToken.None));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new DeleteResourceHandler(
                    new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources,
                    new FakeBlobStore(), NullLogger<DeleteResourceHandler>.Instance)
                .HandleAsync(ctx.Member, ctx.GroupId, ctx.ArrangementId, created.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Owner_can_create_get_content_and_delete_file_resource()
    {
        var ctx = await SeedWithArrangementAsync();
        var blobs = new FakeBlobStore();
        var bytes = "hello chart"u8.ToArray();
        await using var stream = new MemoryStream(bytes);

        var created = await new CreateFileResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, blobs, new FixedClock(Now))
            .HandleAsync(
                new CreateFileResourceCommand(
                    ctx.Owner, ctx.GroupId, ctx.ArrangementId,
                    ResourcePurposes.Chart, "Chart file", null, null,
                    "chart.txt", "text/plain", bytes.Length, stream),
                CancellationToken.None);

        Assert.Equal(ResourceKinds.File, created.Kind);
        Assert.Null(created.Url);
        Assert.Equal("chart.txt", created.OriginalFileName);
        Assert.Equal("text/plain", created.ContentType);
        Assert.Equal(bytes.Length, created.ByteSize);
        Assert.Single(blobs.Items);

        var content = await new GetResourceContentHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, blobs)
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.ArrangementId, created.Id, CancellationToken.None);
        Assert.Equal("text/plain", content.ContentType);
        Assert.Equal("chart.txt", content.DownloadFileName);
        using var reader = new StreamReader(content.Content);
        Assert.Equal("hello chart", await reader.ReadToEndAsync());

        await new DeleteResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources,
                blobs, NullLogger<DeleteResourceHandler>.Instance)
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.ArrangementId, created.Id, CancellationToken.None);

        Assert.Empty(ctx.Resources.Items);
        Assert.Empty(blobs.Items);
    }

    [Fact]
    public async Task Member_can_download_file_content_but_not_create()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var blobs = new FakeBlobStore();
        var bytes = "member ok"u8.ToArray();
        await using var stream = new MemoryStream(bytes);

        var created = await new CreateFileResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, blobs, new FixedClock(Now))
            .HandleAsync(
                new CreateFileResourceCommand(
                    ctx.Owner, ctx.GroupId, ctx.ArrangementId,
                    ResourcePurposes.Practice, "Notes", null, null,
                    "notes.txt", "text/plain", bytes.Length, stream),
                CancellationToken.None);

        var content = await new GetResourceContentHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, blobs)
            .HandleAsync(ctx.Member, ctx.GroupId, ctx.ArrangementId, created.Id, CancellationToken.None);
        Assert.Equal(bytes.Length, content.ByteSize);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new CreateFileResourceHandler(
                    new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, blobs, new FixedClock(Now))
                .HandleAsync(
                    new CreateFileResourceCommand(
                        ctx.Member, ctx.GroupId, ctx.ArrangementId,
                        ResourcePurposes.Other, "Nope", null, null,
                        "x.txt", "text/plain", 1, new MemoryStream("x"u8.ToArray())),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Content_for_link_resource_is_validation_error()
    {
        var ctx = await SeedWithArrangementAsync();
        var created = await new CreateLinkResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FixedClock(Now))
            .HandleAsync(
                new CreateLinkResourceCommand(
                    ctx.Owner, ctx.GroupId, ctx.ArrangementId, ResourceKinds.Link,
                    ResourcePurposes.Other, "Label", null, null, "https://example.com"),
                CancellationToken.None);

        await Assert.ThrowsAsync<ValidationException>(() =>
            new GetResourceContentHandler(
                    new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FakeBlobStore())
                .HandleAsync(ctx.Owner, ctx.GroupId, ctx.ArrangementId, created.Id, CancellationToken.None));
    }

    [Fact]
    public async Task File_kind_is_rejected()
    {
        var ctx = await SeedWithArrangementAsync();
        await Assert.ThrowsAsync<ValidationException>(() =>
            new CreateLinkResourceHandler(
                    new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FixedClock(Now))
                .HandleAsync(
                    new CreateLinkResourceCommand(
                        ctx.Owner, ctx.GroupId, ctx.ArrangementId, ResourceKinds.File,
                        ResourcePurposes.Other, "Label", null, null, "https://example.com"),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Soft_deleted_arrangement_is_not_found_for_resource_ops()
    {
        var ctx = await SeedWithArrangementAsync();
        ctx.Arrangements.Items.Single().SoftDelete(1, Now.AddMinutes(1));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new ListResourcesHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources)
                .HandleAsync(ctx.Owner, ctx.GroupId, ctx.ArrangementId, CancellationToken.None));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new CreateLinkResourceHandler(
                    new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FixedClock(Now))
                .HandleAsync(
                    new CreateLinkResourceCommand(
                        ctx.Owner, ctx.GroupId, ctx.ArrangementId, ResourceKinds.Link,
                        ResourcePurposes.Other, "Label", null, null, "https://example.com"),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Cross_group_and_cross_arrangement_are_not_found()
    {
        var ctx = await SeedWithArrangementAsync();
        var created = await new CreateLinkResourceHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, new FixedClock(Now))
            .HandleAsync(
                new CreateLinkResourceCommand(
                    ctx.Owner, ctx.GroupId, ctx.ArrangementId, ResourceKinds.Link,
                    ResourcePurposes.Other, "Label", null, null, "https://example.com"),
                CancellationToken.None);

        var otherOwner = Guid.NewGuid();
        var otherGroup = Group.Create("Other", Now);
        await ctx.Groups.AddAsync(otherGroup, Membership.CreateOwner(otherGroup.Id, otherOwner, Now), CancellationToken.None);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetResourceHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources)
                .HandleAsync(otherOwner, otherGroup.Id, ctx.ArrangementId, created.Id, CancellationToken.None));

        var otherArr = Arrangement.Create(ctx.GroupId, ctx.SongId, "Other Arr", Now);
        await ctx.Arrangements.AddAsync(otherArr, CancellationToken.None);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetResourceHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources)
                .HandleAsync(ctx.Owner, ctx.GroupId, otherArr.Id, created.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_is_not_found()
    {
        var ctx = await SeedWithArrangementAsync();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            new ListResourcesHandler(new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources)
                .HandleAsync(Guid.NewGuid(), ctx.GroupId, ctx.ArrangementId, CancellationToken.None));
    }

    private static async Task<Fixture> SeedWithArrangementAsync()
    {
        var groups = new FakeGroupStore();
        var arrangements = new FakeArrangementStore();
        var resources = new FakeResourceStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        var songId = Guid.NewGuid();
        var arrangement = Arrangement.Create(group.Id, songId, "Acoustic", Now);
        await arrangements.AddAsync(arrangement, CancellationToken.None);
        return new Fixture(groups, arrangements, resources, owner, Guid.Empty, group.Id, songId, arrangement.Id);
    }

    private static async Task<Fixture> SeedOwnerMemberWithArrangementAsync()
    {
        var ctx = await SeedWithArrangementAsync();
        var member = Guid.NewGuid();
        ctx.Groups.Memberships.Add(Membership.CreateMember(ctx.GroupId, member, Now));
        return ctx with { Member = member };
    }

    private sealed record Fixture(
        FakeGroupStore Groups,
        FakeArrangementStore Arrangements,
        FakeResourceStore Resources,
        Guid Owner,
        Guid Member,
        Guid GroupId,
        Guid SongId,
        Guid ArrangementId);

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeBlobStore : IBlobStore
    {
        public Dictionary<string, (byte[] Bytes, string ContentType)> Items { get; } = new();

        public async Task PutAsync(
            string objectKey,
            Stream content,
            string contentType,
            long byteSize,
            CancellationToken cancellationToken)
        {
            using var ms = new MemoryStream();
            await content.CopyToAsync(ms, cancellationToken);
            Items[objectKey] = (ms.ToArray(), contentType);
        }

        public Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken)
        {
            if (!Items.TryGetValue(objectKey, out var item))
            {
                return Task.FromResult<BlobContent?>(null);
            }

            return Task.FromResult<BlobContent?>(
                new BlobContent(new MemoryStream(item.Bytes), item.ContentType, item.Bytes.Length));
        }

        public Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
        {
            Items.Remove(objectKey);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeResourceStore : IResourceStore
    {
        public List<Resource> Items { get; } = [];

        public Task AddAsync(Resource resource, CancellationToken cancellationToken)
        {
            Items.Add(resource);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Resource>> ListByArrangementAsync(Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Resource>>(
                Items.Where(r => r.ArrangementId == arrangementId).OrderBy(r => r.CreatedAt).ThenBy(r => r.Id).ToList());

        public Task<Resource?> GetByIdAsync(Guid arrangementId, Guid resourceId, CancellationToken cancellationToken)
            => Task.FromResult(Items.FirstOrDefault(r => r.ArrangementId == arrangementId && r.Id == resourceId));

        public Task UpdateAsync(Resource resource, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task RemoveAsync(Resource resource, CancellationToken cancellationToken)
        {
            Items.Remove(resource);
            return Task.CompletedTask;
        }

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
            => Task.FromResult<IReadOnlyList<Arrangement>>(
                Items.Where(a => a.GroupId == groupId && a.SongId == songId && !a.IsDeleted).ToList());

        public Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(
            Guid groupId, Guid songId, CancellationToken cancellationToken)
            => ListBySongAsync(groupId, songId, cancellationToken);

        public Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult(Items.FirstOrDefault(a => a.GroupId == groupId && a.Id == arrangementId && !a.IsDeleted));

        public Task<Arrangement?> GetByIdWithResourcesAsync(
            Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
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
