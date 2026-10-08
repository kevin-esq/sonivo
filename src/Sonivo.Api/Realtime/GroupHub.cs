using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Cross-user real time for a group's data (ADR-0074 §3/§6): a member joins the
/// SignalR group for their group and receives <c>GroupChanged</c> messages when
/// songs/setlists/events/tasks/resources/members change anywhere else.
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

    public GroupHub(GroupAccessService access, UserManager<ApplicationUser> users)
    {
        _access = access;
        _users = users;
    }

    /// <summary>SignalR group name for a tenant group (namespaced to avoid clashes).</summary>
    public static string GroupName(Guid groupId) => $"group:{groupId}";

    public async Task JoinGroup(Guid groupId)
    {
        var user = await RequireUserAsync();
        try
        {
            // Server-side authorization: only members may join the group's channel.
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

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(groupId));
    }

    public async Task LeaveGroup(Guid groupId)
    {
        await RequireUserAsync();
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(groupId));
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
