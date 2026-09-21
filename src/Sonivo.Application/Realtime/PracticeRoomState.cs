namespace Sonivo.Application.Realtime;

public sealed record RoomParticipant(
    string ConnectionId,
    Guid UserId,
    string DisplayName,
    string Role);

public sealed record ConductorPosition(
    Guid ArrangementId,
    long PositionMs,
    bool Playing,
    Guid ConductorUserId,
    string ConductorName,
    DateTimeOffset At);

/// <summary>
/// In-memory per-room state for the Q9 conductor thin (ADR-0036).
/// Single-instance only: no backplane, no sticky-session design — a
/// documented limitation. Rooms are ephemeral; no persistence.
/// </summary>
public sealed class PracticeRoomState
{
    /// <summary>Q9-Q5: max connections per event-room.</summary>
    public const int MaxConnectionsPerRoom = 50;

    /// <summary>
    /// Q9-Q1: server enforces a minimum 900 ms gap per connection; faster
    /// messages are dropped silently (with a debug log at the Hub).
    /// </summary>
    public static readonly TimeSpan MinBroadcastGap = TimeSpan.FromMilliseconds(900);

    public const string RoomCapacityError =
        "La sala está llena (máximo 50 participantes). Inténtalo más tarde.";

    private readonly object _lock = new();
    private readonly Dictionary<string, Dictionary<string, RoomParticipant>> _rooms = new();
    private readonly Dictionary<string, DateTimeOffset> _lastBroadcastByConnection = new();
    private readonly Dictionary<string, ConductorPosition> _lastPositionByRoom = new();

    public static string RoomKey(Guid eventId) => $"event-{eventId}";

    public bool TryAdd(string room, RoomParticipant participant, out string? error)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(room, out var members))
            {
                members = new Dictionary<string, RoomParticipant>();
                _rooms[room] = members;
            }

            members[participant.ConnectionId] = participant;
            if (members.Count > MaxConnectionsPerRoom)
            {
                members.Remove(participant.ConnectionId);
                error = RoomCapacityError;
                return false;
            }

            error = null;
            return true;
        }
    }

    /// <summary>Presence list, capped at <see cref="MaxConnectionsPerRoom"/> (Q9-Q5).</summary>
    public IReadOnlyList<RoomParticipant> GetPresence(string room)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(room, out var members))
            {
                return [];
            }

            return members.Values.Take(MaxConnectionsPerRoom).ToList();
        }
    }

    /// <summary>
    /// Removes a connection from every room it joined (disconnect path).
    /// Returns true when the connection was present in at least one room.
    /// </summary>
    public bool RemoveConnection(string connectionId, out List<string> affectedRooms)
    {
        lock (_lock)
        {
            affectedRooms = [];
            foreach (var (room, members) in _rooms)
            {
                if (members.Remove(connectionId))
                {
                    affectedRooms.Add(room);
                }
            }

            _lastBroadcastByConnection.Remove(connectionId);
            return affectedRooms.Count > 0;
        }
    }

    public bool RemoveFromRoom(string room, string connectionId)
    {
        lock (_lock)
        {
            return _rooms.TryGetValue(room, out var members)
                && members.Remove(connectionId);
        }
    }

    /// <summary>
    /// Q9-Q1 throttle: true when the connection may broadcast now (and the
    /// timestamp is recorded); false when the message must be dropped.
    /// </summary>
    public bool TryRecordBroadcast(string connectionId, DateTimeOffset now)
    {
        lock (_lock)
        {
            if (_lastBroadcastByConnection.TryGetValue(connectionId, out var last)
                && now - last < MinBroadcastGap)
            {
                return false;
            }

            _lastBroadcastByConnection[connectionId] = now;
            return true;
        }
    }

    /// <summary>
    /// Q9-Q2: any Owner present may broadcast — last-writer-wins, no election.
    /// </summary>
    public void StorePosition(string room, ConductorPosition position)
    {
        lock (_lock)
        {
            _lastPositionByRoom[room] = position;
        }
    }

    public ConductorPosition? LastPosition(string room)
    {
        lock (_lock)
        {
            return _lastPositionByRoom.TryGetValue(room, out var position)
                ? position
                : null;
        }
    }
}
