using Sonivo.Application.Abstractions;
using Sonivo.Application.Tasks;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tasks;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class TaskUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task Manager_creates_lists_updates_status_and_deletes()
    {
        var ctx = await SeedOwnerMemberAsync();
        var created = await new CreateTaskHandler(
                new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new CreateTaskCommand(ctx.Owner, ctx.GroupId, "Comprar cuerdas", null, null, null), CancellationToken.None);
        Assert.Equal("open", created.Status);
        Assert.Equal(1, created.Version);

        var list = await new ListTasksHandler(new GroupAccessService(ctx.Groups), ctx.Tasks)
            .HandleAsync(new ListTasksQuery(ctx.Member, ctx.GroupId), CancellationToken.None);
        Assert.Single(list);

        var done = await new SetTaskStatusHandler(
                new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new SetTaskStatusCommand(ctx.Owner, ctx.GroupId, created.Id, "done", created.Version), CancellationToken.None);
        Assert.Equal("done", done.Status);

        var updated = await new UpdateTaskHandler(
                new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new UpdateTaskCommand(ctx.Owner, ctx.GroupId, created.Id, "Comprar cuerdas y afinador", null, null, null, done.Version), CancellationToken.None);
        Assert.Equal("Comprar cuerdas y afinador", updated.Title);

        await new DeleteTaskHandler(new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new DeleteTaskCommand(ctx.Owner, ctx.GroupId, created.Id, updated.Version), CancellationToken.None);

        var after = await new ListTasksHandler(new GroupAccessService(ctx.Groups), ctx.Tasks)
            .HandleAsync(new ListTasksQuery(ctx.Member, ctx.GroupId), CancellationToken.None);
        Assert.Empty(after);
    }

    [Fact]
    public async Task Status_transitions_through_all_three_states()
    {
        var ctx = await SeedOwnerMemberAsync();
        var created = await new CreateTaskHandler(
                new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new CreateTaskCommand(ctx.Owner, ctx.GroupId, "Ensayar tema nuevo", null, null, null), CancellationToken.None);
        Assert.Equal("open", created.Status);

        var inProgress = await new SetTaskStatusHandler(
                new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new SetTaskStatusCommand(ctx.Owner, ctx.GroupId, created.Id, "in_progress", created.Version), CancellationToken.None);
        Assert.Equal("in_progress", inProgress.Status);
        Assert.Equal(2, inProgress.Version);

        var done = await new SetTaskStatusHandler(
                new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new SetTaskStatusCommand(ctx.Owner, ctx.GroupId, inProgress.Id, "done", inProgress.Version), CancellationToken.None);
        Assert.Equal("done", done.Status);
        Assert.Equal(3, done.Version);
    }

    [Fact]
    public async Task Invalid_status_is_rejected_with_clean_message()
    {
        var ctx = await SeedOwnerMemberAsync();
        var created = await new CreateTaskHandler(
                new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
            .HandleAsync(new CreateTaskCommand(ctx.Owner, ctx.GroupId, "Tarea", null, null, null), CancellationToken.None);

        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => new SetTaskStatusHandler(new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
                .HandleAsync(new SetTaskStatusCommand(ctx.Owner, ctx.GroupId, created.Id, "invalid_status", created.Version), CancellationToken.None));
        Assert.DoesNotContain("Parameter", ex.Message);
        Assert.DoesNotContain("nameof", ex.Message);
    }

    [Fact]
    public async Task Member_cannot_create()
    {
        var ctx = await SeedOwnerMemberAsync();
        await Assert.ThrowsAsync<ForbiddenException>(
            () => new CreateTaskHandler(new GroupAccessService(ctx.Groups), ctx.Tasks, new FixedClock(Now))
                .HandleAsync(new CreateTaskCommand(ctx.Member, ctx.GroupId, "Nope", null, null, null), CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_is_rejected()
    {
        var ctx = await SeedOwnerMemberAsync();
        await Assert.ThrowsAsync<NotFoundException>(
            () => new ListTasksHandler(new GroupAccessService(ctx.Groups), ctx.Tasks)
                .HandleAsync(new ListTasksQuery(Guid.NewGuid(), ctx.GroupId), CancellationToken.None));
    }

    private static async Task<Fixture> SeedOwnerMemberAsync()
    {
        var groups = new FakeGroupStore();
        var tasks = new FakeTaskStore();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        groups.Memberships.Add(Membership.CreateMember(group.Id, member, Now));
        return new Fixture(groups, tasks, owner, member, group.Id);
    }

    private sealed record Fixture(FakeGroupStore Groups, FakeTaskStore Tasks, Guid Owner, Guid Member, Guid GroupId);

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
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

    private sealed class FakeTaskStore : ITaskStore
    {
        public List<GroupTask> Items { get; } = [];

        public Task AddAsync(GroupTask task, CancellationToken cancellationToken)
        {
            Items.Add(task);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupTask>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<GroupTask>>(
                Items.Where(t => t.GroupId == groupId && !t.IsDeleted).ToList());

        public Task<GroupTask?> GetByIdAsync(Guid groupId, Guid taskId, CancellationToken cancellationToken)
            => Task.FromResult(Items.FirstOrDefault(t => t.GroupId == groupId && t.Id == taskId));

        public Task UpdateAsync(GroupTask task, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
