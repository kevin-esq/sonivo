using System.Collections.Concurrent;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Tracks GroupHub connections that completed server-side authorization.
/// Outgoing group notifications target only active registry entries; SignalR
/// group membership is not used as an authorization boundary.
/// </summary>
public sealed class GroupRealtimeConnectionRegistry
{
    private readonly ConcurrentDictionary<(Guid GroupId, Guid UserId), ConcurrentDictionary<string, ConnectionState>>
        _connections = new();

    public void AddPending(Guid groupId, Guid userId, string connectionId)
        => _connections.GetOrAdd(
                (groupId, userId),
                static _ => new ConcurrentDictionary<string, ConnectionState>())
            .TryAdd(connectionId, new ConnectionState());

    public bool TryActivate(Guid groupId, Guid userId, string connectionId)
        => _connections.TryGetValue((groupId, userId), out var connections)
            && connections.TryGetValue(connectionId, out var state)
            && state.TryActivate();

    public void Remove(Guid groupId, Guid userId, string connectionId)
    {
        if (!_connections.TryGetValue((groupId, userId), out var connections))
        {
            return;
        }

        connections.TryRemove(connectionId, out _);
        if (connections.IsEmpty)
        {
            _connections.TryRemove(new KeyValuePair<(Guid GroupId, Guid UserId), ConcurrentDictionary<string, ConnectionState>>(
                (groupId, userId), connections));
        }
    }

    public IReadOnlyList<string> MarkMemberRevoked(Guid groupId, Guid userId)
    {
        if (!_connections.TryGetValue((groupId, userId), out var connections))
        {
            return [];
        }

        foreach (var connection in connections.Values)
        {
            connection.MarkRevoked();
        }

        return connections.Keys.ToArray();
    }

    public IReadOnlyList<string> RemoveMember(Guid groupId, Guid userId)
    {
        if (!_connections.TryRemove((groupId, userId), out var connections))
        {
            return [];
        }

        return connections.Keys.ToArray();
    }

    public void RemoveConnection(string connectionId)
    {
        foreach (var (key, connections) in _connections)
        {
            connections.TryRemove(connectionId, out _);
            if (connections.IsEmpty)
            {
                _connections.TryRemove(new KeyValuePair<(Guid GroupId, Guid UserId), ConcurrentDictionary<string, ConnectionState>>(
                    key, connections));
            }
        }
    }

    public IReadOnlyList<string> GetActiveGroupConnections(Guid groupId)
        => _connections
            .Where(pair => pair.Key.GroupId == groupId)
            .SelectMany(pair => pair.Value
                .Where(connection => connection.Value.IsActive)
                .Select(connection => connection.Key))
            .ToArray();

    private sealed class ConnectionState
    {
        private int _state; // 0 = pending authorization, 1 = active, 2 = revoked

        public bool IsActive => Volatile.Read(ref _state) == 1;

        public bool TryActivate()
        {
            while (true)
            {
                var state = Volatile.Read(ref _state);
                if (state == 1)
                {
                    return true;
                }

                if (state != 0)
                {
                    return false;
                }

                if (Interlocked.CompareExchange(ref _state, 1, 0) == 0)
                {
                    return true;
                }
            }
        }

        public void MarkRevoked() => Interlocked.Exchange(ref _state, 2);
    }
}
