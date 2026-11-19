using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tasks;
using Sonivo.Domain.Notifications;
using Sonivo.Infrastructure.Identity;

internal static class TaskEndpoints
{
    internal static void MapTaskEndpoints(this WebApplication endpoints)
    {
        // ADR-0055 W-G: group tasks (Manager/Owner write, Member read, non-member 404).
        endpoints.MapGet("/api/groups/{groupId:guid}/tasks", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListTasksHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var items = await handler.HandleAsync(new ListTasksQuery(userId.Value, groupId), cancellationToken);
            return Results.Ok(items);
        })
        .WithName("ListGroupTasks")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/tasks", async (
            Guid groupId,
            CreateTaskRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            CreateTaskHandler handler,
            INotificationStore notifications,
            INotificationPublisher publisher,
            IMembershipStore memberships,
            IClock clock,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var created = await handler.HandleAsync(
                new CreateTaskCommand(userId.Value, groupId, request.Title ?? string.Empty, request.Notes, request.DueAt, request.AssigneeUserId),
                cancellationToken);

            // ADR-0062: notify a different assignee after the assignment is saved.
            if (request.AssigneeUserId is { } assignee && assignee != userId.Value)
            {
                var recipient = await memberships.GetForUpdateAsync(groupId, assignee, cancellationToken);
                if (recipient?.NotifyTaskAssignments == true)
                {
                    await notifications.AddAsync(
                        Notification.Create(
                            assignee,
                            NotificationScope.Group,
                            Notification.KindTaskAssigned,
                            clock.UtcNow,
                            groupId: groupId,
                            actorUserId: userId.Value),
                        cancellationToken);
                    await notifications.SaveChangesAsync(cancellationToken);
                    await publisher.PublishAsync(assignee, Notification.KindTaskAssigned, groupId, cancellationToken);
                }
            }

            return Results.Created($"/api/groups/{groupId}/tasks/{created.Id}", ToTaskResponse(created));
        })
        .WithName("CreateGroupTask")
        .RequireAuthorization();

        endpoints.MapPatch("/api/groups/{groupId:guid}/tasks/{taskId:guid}", async (
            Guid groupId,
            Guid taskId,
            UpdateTaskRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            UpdateTaskHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var updated = await handler.HandleAsync(
                new UpdateTaskCommand(userId.Value, groupId, taskId, request.Title ?? string.Empty, request.Notes, request.DueAt, request.AssigneeUserId, request.ExpectedVersion),
                cancellationToken);
            return Results.Ok(ToTaskResponse(updated));
        })
        .WithName("UpdateGroupTask")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/tasks/{taskId:guid}/status", async (
            Guid groupId,
            Guid taskId,
            SetTaskStatusRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            SetTaskStatusHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var updated = await handler.HandleAsync(
                new SetTaskStatusCommand(userId.Value, groupId, taskId, request.Status ?? string.Empty, request.ExpectedVersion),
                cancellationToken);
            return Results.Ok(ToTaskResponse(updated));
        })
        .WithName("SetGroupTaskStatus")
        .RequireAuthorization();

        endpoints.MapDelete("/api/groups/{groupId:guid}/tasks/{taskId:guid}", async (
            Guid groupId,
            Guid taskId,
            [FromBody] DeleteTaskRequest? request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            DeleteTaskHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await handler.HandleAsync(
                new DeleteTaskCommand(userId.Value, groupId, taskId, request?.ExpectedVersion ?? 0),
                cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteGroupTask")
        .RequireAuthorization();
    }

    private static object ToTaskResponse(TaskItemDto task) => new
    {
        id = task.Id,
        title = task.Title,
        notes = task.Notes,
        status = task.Status,
        dueAt = task.DueAt,
        assigneeUserId = task.AssigneeUserId,
        createdByUserId = task.CreatedByUserId,
        createdAt = task.CreatedAt,
        updatedAt = task.UpdatedAt,
        version = task.Version
    };
}
