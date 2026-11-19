using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Reports;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Reports;

internal static class ReportEndpoints
{
    public static void MapReportEndpoints(this WebApplication endpoints)
    {
        // ADR-0083 / Phase 4.0: aggregate reports use current Group data and are Owner-only.
        endpoints.MapGet("/api/groups/{groupId:guid}/reports/repertoire", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupReportsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await handler.GetRepertoireAsync(userId.Value, groupId, cancellationToken));
        })
        .WithName("GetGroupRepertoireReport")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/reports/event-responses", async (
            Guid groupId,
            DateTimeOffset? from,
            DateTimeOffset? to,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupReportsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (from is not { } start || to is not { } end
                || start >= end || end - start > TimeSpan.FromDays(366))
            {
                return Results.Problem(
                    detail: "A valid report range of up to 366 days is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid report range");
            }

            return Results.Ok(await handler.GetEventResponsesAsync(
                userId.Value, groupId, start, end, cancellationToken));
        })
        .WithName("GetGroupEventResponseReport")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/reports/tasks", async (
            Guid groupId,
            DateTimeOffset? from,
            DateTimeOffset? to,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupReportsHandler handler,
            IClock clock,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (from is not { } start || to is not { } end
                || start >= end || end - start > TimeSpan.FromDays(366))
            {
                return Results.Problem(
                    detail: "A valid UTC report range of up to 366 days is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid report range");
            }

            return Results.Ok(await handler.GetTasksAsync(
                userId.Value, groupId, start, end, clock.UtcNow, cancellationToken));
        })
        .WithName("GetGroupTasksReport")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/reports/setlist-usage", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupReportsHandler handler,
            IClock clock,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await handler.GetSetlistUsageAsync(
                userId.Value, groupId, clock.UtcNow, cancellationToken));
        })
        .WithName("GetGroupSetlistUsageReport")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/reports/event-responses.csv", async (
            Guid groupId,
            DateTimeOffset? from,
            DateTimeOffset? to,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupReportsHandler handler,
            SonivoDbContext db,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (from is not { } start || to is not { } end
                || start >= end || end - start > TimeSpan.FromDays(366))
            {
                return Results.Problem(
                    detail: "A valid report range of up to 366 days is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid report range");
            }

            var report = await handler.GetEventResponsesAsync(
                userId.Value, groupId, start, end, cancellationToken);
            db.GroupAuditLog.Add(GroupAuditEntry.Create(
                groupId,
                GroupAuditEntry.ActionGroupReportExported,
                clock.GetUtcNow(),
                actorUserId: userId.Value,
                metadata: $"report=event_responses;fromUtc={start.UtcDateTime:O};toUtc={end.UtcDateTime:O}"));
            await db.SaveChangesAsync(cancellationToken);

            var csv = new StringBuilder();
            csv.AppendLine("event_id,title,event_type,starts_at_utc,yes,no,maybe,no_response,current_member_count");
            foreach (var row in report.Events)
            {
                csv.Append(row.EventId.ToString("D")).Append(',')
                    .Append(CsvExportCell.Escape(row.Title)).Append(',')
                    .Append(CsvExportCell.Escape(row.Type)).Append(',')
                    .Append(row.StartsAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture)).Append(',')
                    .Append(row.Yes.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(row.No.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(row.Maybe.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(row.NoResponse.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(report.Members.ToString(CultureInfo.InvariantCulture)).AppendLine();
            }

            var content = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true).GetBytes(csv.ToString());
            return Results.File(content, "text/csv; charset=utf-8", $"sonivo-event-responses-{groupId:N}.csv");
        })
        .WithName("ExportGroupEventResponseReport")
        .RequireAuthorization();
    }
}

/// <summary>
/// Best-effort client error report (observability). All fields are untrusted
/// client input; only Source and Message are normalized and logged. Legacy
/// Stack and Url fields remain accepted and are discarded.
/// </summary>
internal static class CsvExportCell
{
    public static string Escape(string value)
    {
        var trimmed = value.TrimStart();
        var safe = trimmed.Length > 0 && trimmed[0] is '=' or '+' or '-' or '@'
            ? $"'{value}"
            : value;
        return $"\"{safe.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
    }
}
