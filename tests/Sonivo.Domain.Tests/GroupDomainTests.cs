using Sonivo.Domain.Common;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class GroupDomainTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public void Create_sets_valid_initial_state()
    {
        var group = Group.Create("  Night Owls  ", Now);

        Assert.NotEqual(Guid.Empty, group.Id);
        Assert.Equal("Night Owls", group.Name);
        Assert.Equal(1, group.Version);
        Assert.Equal(Now, group.CreatedAt);
        Assert.Equal(Now, group.UpdatedAt);
        Assert.False(group.IsDeleted);
    }

    [Fact]
    public void Create_rejects_blank_name()
    {
        Assert.Throws<ArgumentException>(() => Group.Create("   ", Now));
    }

    [Fact]
    public void Rename_increments_version_when_expected_matches()
    {
        var group = Group.Create("Band", Now);
        group.Rename("Band Two", expectedVersion: 1, Now.AddMinutes(1));

        Assert.Equal("Band Two", group.Name);
        Assert.Equal(2, group.Version);
    }

    [Fact]
    public void Rename_rejects_stale_version()
    {
        var group = Group.Create("Band", Now);
        Assert.Throws<ConcurrencyConflictException>(() =>
            group.Rename("Other", expectedVersion: 99, Now));
    }

    [Fact]
    public void SoftDelete_sets_deleted_at_and_increments_version()
    {
        var group = Group.Create("Band", Now);
        group.SoftDelete(expectedVersion: 1, Now.AddHours(1));

        Assert.True(group.IsDeleted);
        Assert.Equal(2, group.Version);
        Assert.Equal(Now.AddHours(1), group.DeletedAt);
    }

    [Fact]
    public void CreateOwner_membership_uses_owner_role()
    {
        var groupId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var membership = Membership.CreateOwner(groupId, userId, Now);

        Assert.Equal(MembershipRoles.Owner, membership.Role);
        Assert.True(membership.IsOwner);
        Assert.Equal(groupId, membership.GroupId);
        Assert.Equal(userId, membership.UserId);
    }

    [Fact]
    public void ChangeSlug_is_allowed_once_and_then_confirmed()
    {
        var group = Group.Create("Band", Now);
        Assert.True(group.CanChangeSlug);

        var previous = group.ChangeSlug("band-nueva", Now.AddMinutes(1));

        Assert.Equal("band", previous);
        Assert.Equal("band-nueva", group.Slug);
        Assert.False(group.CanChangeSlug);
        Assert.Equal(Now.AddMinutes(1), group.SlugConfirmedAt);
        Assert.Throws<InvalidOperationException>(() => group.ChangeSlug("otra", Now.AddMinutes(2)));
    }

    [Fact]
    public void ChangeSlug_rejects_reserved_and_unchanged_slugs()
    {
        var group = Group.Create("Band", Now);

        Assert.Throws<ArgumentException>(() => group.ChangeSlug("admin", Now));
        Assert.Throws<ArgumentException>(() => group.ChangeSlug("band", Now));
        Assert.True(group.CanChangeSlug);
    }

    [Fact]
    public void GroupSlugHistory_create_validates_input()
    {
        Assert.Throws<ArgumentException>(() => GroupSlugHistory.Create(Guid.Empty, "band", Now));
        Assert.Throws<ArgumentException>(() => GroupSlugHistory.Create(Guid.NewGuid(), "admin", Now));

        var groupId = Guid.NewGuid();
        var history = GroupSlugHistory.Create(groupId, "band", Now);
        Assert.Equal(groupId, history.GroupId);
        Assert.Equal("band", history.Slug);
        Assert.Equal(Now, history.CreatedAt);
    }
}
