using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Cross-user real time for a group's data (ADR-0074 §3/§6): authorized members
/// receive <c>GroupChanged</c> messages when songs/setlists/events/tasks/
/// resources/members change anywhere else.
///
/// Self-hosted in-process SignalR (no vendor/backplane — same single-instance
/// limitation as ADR-0036). AuthZ: cookie session + per-call Membership recheck
/// (never a client-supplied group id). CSRF: the <c>/negotiate</c> POST is an
/// unsafe method, so the client sends <c>X-CSRF-TOKEN</c> (see useGroupLive).
/// </summary>
[Authorize]
public sealed class GroupHub : Hub
{
    private readonly GroupAccessService _access;
    private readonly UserManager<ApplicationUser> _users;
    private readonly GroupRealtimeConnectionRegistry _connections;

    public GroupHub(
        GroupAccessService access,
        UserManager<ApplicationUser> users,
        GroupRealtimeConnectionRegistry connections)
    {
        _access = access;
        _users = users;
        _connections = connections;
    }

    public async Task JoinGroup(Guid groupId)
    {
        var user = await RequireUserAsync();
        try
        {
            // Server-side authorization: only members may join the Group realtime feed.
            await _access.RequireMemberAsync(groupId, user.Id, Context.ConnectionAborted);
        }
        catch (NotFoundException ex)
        {
            throw new HubException(ex.Message);
        }
        catch (ForbiddenException ex)
        {
            throw new HubException(ex.Message);
        }

        _connections.AddPending(groupId, user.Id, Context.ConnectionId);
        try
        {
            // Recheck after registration so a concurrent committed removal
            // either fails this join or sees the connection to evict.
            await _access.RequireMemberAsync(groupId, user.Id, Context.ConnectionAborted);
            if (!_connections.TryActivate(groupId, user.Id, Context.ConnectionId))
            {
                throw new HubException("No autorizado.");
            }
        }
        catch (Exception ex)
        {
            _connections.Remove(groupId, user.Id, Context.ConnectionId);
            if (ex is NotFoundException or ForbiddenException)
            {
                throw new HubException(ex.Message);
            }

            throw;
        }
    }

    public async Task LeaveGroup(Guid groupId)
    {
        var user = await RequireUserAsync();
        _connections.Remove(groupId, user.Id, Context.ConnectionId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _connections.RemoveConnection(Context.ConnectionId);
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
}
