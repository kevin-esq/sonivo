using Sonivo.Application.Realtime;

namespace Sonivo.Application.Tests;

public class PracticeRoomStateTests
{
    [Fact]
    public void RoomKey_prefixes_event_id()
    {
        var id = Guid.NewGuid();
        Assert.Equal($"event-{id}", PracticeRoomState.RoomKey(id));
    }

    [Fact]
    public void Join_up_to_cap_then_rejects_with_spanish_error()
    {
        var state = new PracticeRoomState();
        var room = PracticeRoomState.RoomKey(Guid.NewGuid());

        for (var i = 0; i < PracticeRoomState.MaxConnectionsPerRoom; i++)
        {
            var ok = state.TryAdd(room, Participant($"c-{i}"), out var error);
            Assert.True(ok);
            Assert.Null(error);
        }

        var rejected = state.TryAdd(room, Participant("c-over"), out var rejectError);
        Assert.False(rejected);
        Assert.NotNull(rejectError);
        Assert.Contains("llena", rejectError);
    }

    [Fact]
    public void Presence_is_capped_and_reflects_leaves()
    {
        var state = new PracticeRoomState();
        var room = PracticeRoomState.RoomKey(Guid.NewGuid());

        for (var i = 0; i < PracticeRoomState.MaxConnectionsPerRoom; i++)
        {
            state.TryAdd(room, Participant($"c-{i}"), out _);
        }

        Assert.Equal(PracticeRoomState.MaxConnectionsPerRoom, state.GetPresence(room).Count);

        state.RemoveConnection("c-0", out var affected);
        Assert.Contains(room, affected);
        Assert.Equal(PracticeRoomState.MaxConnectionsPerRoom - 1, state.GetPresence(room).Count);
    }

    [Fact]
    public void Broadcast_throttle_drops_fast_messages_then_allows_after_gap()
    {
        var state = new PracticeRoomState();
        var now = DateTimeOffset.UtcNow;

        Assert.True(state.TryRecordBroadcast("c-1", now));
        Assert.False(state.TryRecordBroadcast("c-1", now.AddMilliseconds(100)));
        Assert.False(state.TryRecordBroadcast("c-1", now.AddMilliseconds(899)));
        Assert.True(state.TryRecordBroadcast("c-1", now.AddMilliseconds(900)));
    }

    [Fact]
    public void Broadcast_throttle_is_per_connection()
    {
        var state = new PracticeRoomState();
        var now = DateTimeOffset.UtcNow;

        Assert.True(state.TryRecordBroadcast("c-a", now));
        Assert.True(state.TryRecordBroadcast("c-b", now));
    }

    [Fact]
    public void Last_position_is_last_writer_wins()
    {
        var state = new PracticeRoomState();
        var room = PracticeRoomState.RoomKey(Guid.NewGuid());
        var now = DateTimeOffset.UtcNow;

        // Q9-Q2: any Owner present may broadcast — the latest write wins, no election.
        state.StorePosition(room, new ConductorPosition(
            Guid.NewGuid(), 1000, true, Guid.NewGuid(), "Owner A", now));
        var second = new ConductorPosition(
            Guid.NewGuid(), 2500, false, Guid.NewGuid(), "Owner B", now.AddSeconds(1));
        state.StorePosition(room, second);

        Assert.Equal(second, state.LastPosition(room));
    }

    [Fact]
    public void RemoveConnection_reports_all_affected_rooms()
    {
        var state = new PracticeRoomState();
        var roomA = PracticeRoomState.RoomKey(Guid.NewGuid());
        var roomB = PracticeRoomState.RoomKey(Guid.NewGuid());

        state.TryAdd(roomA, Participant("c-x"), out _);
        state.TryAdd(roomB, Participant("c-x"), out _);

        var removed = state.RemoveConnection("c-x", out var affected);
        Assert.True(removed);
        Assert.Equal(2, affected.Count);
        Assert.Empty(state.GetPresence(roomA));
        Assert.Empty(state.GetPresence(roomB));
    }

    [Fact]
    public void RemoveGroupMember_reports_rooms_and_connections_for_only_that_member()
    {
        var state = new PracticeRoomState();
        var groupId = Guid.NewGuid();
        var otherGroupId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var roomA = PracticeRoomState.RoomKey(Guid.NewGuid());
        var roomB = PracticeRoomState.RoomKey(Guid.NewGuid());
        var otherRoom = PracticeRoomState.RoomKey(Guid.NewGuid());

        state.TryAdd(roomA, Participant("c-a", userId, groupId), out _);
        state.TryAdd(roomB, Participant("c-b", userId, groupId), out _);
        state.TryAdd(otherRoom, Participant("c-other", userId, otherGroupId), out _);

        var removed = state.RemoveGroupMember(groupId, userId);

        Assert.Equal(2, removed.Count);
        Assert.Contains((roomA, "c-a"), removed);
        Assert.Contains((roomB, "c-b"), removed);
        Assert.Empty(state.GetPresence(roomA));
        Assert.Empty(state.GetPresence(roomB));
        Assert.Single(state.GetPresence(otherRoom));
    }

    [Fact]
    public void Removing_the_last_participant_clears_ephemeral_room_position()
    {
        var state = new PracticeRoomState();
        var room = PracticeRoomState.RoomKey(Guid.NewGuid());
        var participant = Participant("c-a");
        state.TryAdd(room, participant, out _);
        state.StorePosition(room, new ConductorPosition(
            Guid.NewGuid(), 1_000, true, participant.UserId, participant.DisplayName, DateTimeOffset.UtcNow));

        Assert.True(state.RemoveFromRoom(room, participant.ConnectionId));
        Assert.Null(state.LastPosition(room));
        Assert.Empty(state.GetPresence(room));
    }

    [Fact]
    public void Pending_and_revoked_participants_are_not_active()
    {
        var state = new PracticeRoomState();
        var room = PracticeRoomState.RoomKey(Guid.NewGuid());
        var participant = Participant("c-a", Guid.NewGuid(), Guid.NewGuid()) with { IsActive = false };
        state.TryAdd(room, participant, out _);

        Assert.False(state.IsActiveParticipant(room, participant.ConnectionId));
        Assert.True(state.TryActivate(room, participant.ConnectionId));
        Assert.True(state.IsActiveParticipant(room, participant.ConnectionId));
        state.RemoveGroupMember(participant.GroupId, participant.UserId);
        Assert.False(state.IsActiveParticipant(room, participant.ConnectionId));
    }

    private static RoomParticipant Participant(string connectionId)
        => Participant(connectionId, Guid.NewGuid(), Guid.NewGuid());

    private static RoomParticipant Participant(string connectionId, Guid userId, Guid groupId)
        => new(connectionId, userId, groupId, "Miembro", "member", IsActive: true);
}
