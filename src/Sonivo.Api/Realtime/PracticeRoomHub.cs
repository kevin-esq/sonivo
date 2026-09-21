using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Realtime;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Q9 conductor thin (ADR-0036 ACCEPTED): one Event room, Owner-conducted
/// position broadcast, no audio transport. Self-hosted in-process SignalR —
/// no vendor, no backplane (single-instance limitation, documented).
///
/// AuthZ: cookie session per ADR-0009/0011 + per-method Membership recheck
/// per ADR-0019 (never a client-supplied group id). CSRF (Q9-Q3): the
/// `/negotiate` POST is an unsafe method, so the global antiforgery
/// middleware (Program.cs) requires the `X-CSRF-TOKEN` header before the
/// Hub endpoint runs; GET/WebSocket traffic needs nothing beyond the cookie.
/// </summary>
[Authorize]
public sealed class PracticeRoomHub : Hub
{
    private readonly ConductorRoomAuthorizer _authorizer;
    private readonly PracticeRoomState _rooms;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IClock _clock;
    private readonly ILogger<PracticeRoomHub> _logger;

    public PracticeRoomHub(
        ConductorRoomAuthorizer authorizer,
        PracticeRoomState rooms,
        UserManager<ApplicationUser> users,
        IClock clock,
        ILogger<PracticeRoomHub> logger)
    {
        _authorizer = authorizer;
        _rooms = rooms;
        _users = users;
        _clock = clock;
        _logger = logger;
    }

    public async Task<IReadOnlyList<RoomParticipant>> JoinRoom(Guid eventId)
    {
        var user = await RequireUserAsync();
        var access = await ToHubExceptionAsync(
            () => _authorizer.RequireMemberAsync(eventId, user.Id, Context.ConnectionAborted));
        var room = PracticeRoomState.RoomKey(eventId);
        var participant = new RoomParticipant(
            Context.ConnectionId,
            user.Id,
            user.DisplayName ?? user.Email ?? "Miembro",
            access.IsOwner ? "owner" : "member");

        if (!_rooms.TryAdd(room, participant, out var error))
        {
            // Q9-Q5: over cap → clear Spanish error.
            throw new HubException(error ?? PracticeRoomState.RoomCapacityError);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room);
        var presence = _rooms.GetPresence(room);
        await Clients.Group(room).SendAsync("PresenceUpdate", presence);
        return presence;
    }

    public async Task LeaveRoom(Guid eventId)
    {
        var room = PracticeRoomState.RoomKey(eventId);
        _rooms.RemoveFromRoom(room, Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, room);
        await Clients.Group(room).SendAsync("PresenceUpdate", _rooms.GetPresence(room));
    }

    /// <summary>
    /// Owner-only conductor broadcast (Q9-Q2: any Owner present may broadcast,
    /// last-writer-wins — no election). Moves followers' playhead/highlight;
    /// never transports audio.
    /// </summary>
    public async Task BroadcastPosition(BroadcastPositionRequest request)
    {
        if (request.PositionMs < 0)
        {
            throw new HubException("Posición no válida.");
        }

        var user = await RequireUserAsync();
        await ToHubExceptionAsync(
            () => _authorizer.RequireOwnerAsync(request.EventId, user.Id, Context.ConnectionAborted));

        var now = _clock.UtcNow;
        if (!_rooms.TryRecordBroadcast(Context.ConnectionId, now))
        {
            // Q9-Q1: drop faster messages silently, debug log only.
            _logger.LogDebug(
                "Dropped throttled BroadcastPosition from {ConnectionId} in event {EventId}",
                Context.ConnectionId,
                request.EventId);
            return;
        }

        var room = PracticeRoomState.RoomKey(request.EventId);
        var position = new ConductorPosition(
            request.ArrangementId,
            request.PositionMs,
            request.Playing,
            user.Id,
            user.DisplayName ?? user.Email ?? "Director",
            now);
        _rooms.StorePosition(room, position);
        await Clients.OthersInGroup(room).SendAsync("PositionUpdate", position);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_rooms.RemoveConnection(Context.ConnectionId, out var affectedRooms))
        {
            foreach (var room in affectedRooms)
            {
                await Clients.Group(room).SendAsync("PresenceUpdate", _rooms.GetPresence(room));
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task<ApplicationUser> RequireUserAsync()
    {
        var id = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id is null)
        {
            throw new HubException("No autorizado.");
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null)
        {
            throw new HubException("No autorizado.");
        }

        return user;
    }

    private static async Task<T> ToHubExceptionAsync<T>(Func<Task<T>> call)
    {
        try
        {
            return await call();
        }
        catch (NotFoundException ex)
        {
            // 404-equivalent: unknown Event or non-member, no existence leak.
            throw new HubException(ex.Message);
        }
        catch (ForbiddenException ex)
        {
            // 403-equivalent: member non-Owner attempting to conduct.
            throw new HubException(ex.Message);
        }
    }

    private static async Task ToHubExceptionAsync(Func<Task> call)
    {
        try
        {
            await call();
        }
        catch (NotFoundException ex)
        {
            throw new HubException(ex.Message);
        }
        catch (ForbiddenException ex)
        {
            throw new HubException(ex.Message);
        }
    }
}

public sealed record BroadcastPositionRequest(
    Guid EventId,
    Guid ArrangementId,
    long PositionMs,
    bool Playing);
