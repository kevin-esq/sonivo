using Sonivo.Api.Realtime;

namespace Sonivo.Api.Tests;

public sealed class GroupRealtimeConnectionRegistryTests
{
    [Fact]
    public void RemoveMember_returns_all_connections_and_keeps_other_memberships()
    {
        var registry = new GroupRealtimeConnectionRegistry();
        var groupId = Guid.NewGuid();
        var otherGroupId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        AddActive(registry, groupId, userId, "connection-a");
        AddActive(registry, groupId, userId, "connection-b");
        AddActive(registry, groupId, otherUserId, "connection-c");
        AddActive(registry, otherGroupId, userId, "connection-d");

        var removed = registry.RemoveMember(groupId, userId);

        Assert.Equal(2, removed.Count);
        Assert.Contains("connection-a", removed);
        Assert.Contains("connection-b", removed);
        Assert.Empty(registry.RemoveMember(groupId, userId));
        Assert.Equal(["connection-c"], registry.RemoveMember(groupId, otherUserId));
        Assert.Equal(["connection-d"], registry.RemoveMember(otherGroupId, userId));
    }

    [Fact]
    public void RemoveConnection_clears_all_group_associations_for_that_connection()
    {
        var registry = new GroupRealtimeConnectionRegistry();
        var userId = Guid.NewGuid();
        var groupA = Guid.NewGuid();
        var groupB = Guid.NewGuid();

        AddActive(registry, groupA, userId, "connection-a");
        AddActive(registry, groupB, userId, "connection-a");
        AddActive(registry, groupB, userId, "connection-b");

        registry.RemoveConnection("connection-a");

        Assert.Empty(registry.RemoveMember(groupA, userId));
        Assert.Equal(["connection-b"], registry.RemoveMember(groupB, userId));
    }

    [Fact]
    public void Pending_connection_is_not_a_fanout_recipient_and_revocation_wins_join_race()
    {
        var registry = new GroupRealtimeConnectionRegistry();
        var groupId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        registry.AddPending(groupId, userId, "connection-a");
        Assert.Empty(registry.GetActiveGroupConnections(groupId));

        registry.MarkMemberRevoked(groupId, userId);
        Assert.False(registry.TryActivate(groupId, userId, "connection-a"));
        Assert.Empty(registry.GetActiveGroupConnections(groupId));
    }

    private static void AddActive(
        GroupRealtimeConnectionRegistry registry,
        Guid groupId,
        Guid userId,
        string connectionId)
    {
        registry.AddPending(groupId, userId, connectionId);
        Assert.True(registry.TryActivate(groupId, userId, connectionId));
    }
}
