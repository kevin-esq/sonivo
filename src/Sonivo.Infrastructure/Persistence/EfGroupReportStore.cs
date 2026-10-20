using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tasks;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupReportStore : IGroupReportStore
{
    private readonly SonivoDbContext _db;

    public EfGroupReportStore(SonivoDbContext db) => _db = db;

    public async Task<GroupRepertoireReportData> GetRepertoireAsync(
        Guid groupId,
        CancellationToken cancellationToken)
    {
        var songs = await _db.Songs.AsNoTracking()
            .Where(song => song.GroupId == groupId && song.DeletedAt == null)
            .LongCountAsync(cancellationToken);
        var arrangements = await _db.Arrangements.AsNoTracking()
            .Where(arrangement => arrangement.GroupId == groupId && arrangement.DeletedAt == null)
            .LongCountAsync(cancellationToken);

        var resources = _db.Resources.AsNoTracking()
            .Join(
                _db.Arrangements.AsNoTracking().Where(arrangement =>
                    arrangement.GroupId == groupId && arrangement.DeletedAt == null),
                resource => resource.ArrangementId,
                arrangement => arrangement.Id,
                (resource, _) => resource);

        var files = await resources.LongCountAsync(
            resource => resource.Kind == ResourceKinds.File,
            cancellationToken);
        var links = await resources.LongCountAsync(
            resource => resource.Kind == ResourceKinds.Link,
            cancellationToken);
        var byPurpose = await resources
            .GroupBy(resource => resource.Purpose)
            .Select(group => new { Purpose = group.Key, Count = group.Count() })
            .OrderBy(row => row.Purpose)
            .ToListAsync(cancellationToken);

        return new GroupRepertoireReportData(
            songs,
            arrangements,
            files,
            links,
            byPurpose.Select(row => new ResourcePurposeReportCount(row.Purpose, row.Count)).ToArray());
    }

    public async Task<GroupEventResponseReportData> GetEventResponsesAsync(
        Guid groupId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken)
    {
        var members = await _db.Memberships.AsNoTracking()
            .LongCountAsync(
                membership => membership.GroupId == groupId
                              && membership.UserId != null
                              && membership.AccessDisabledAt == null,
                cancellationToken);
        var events = await _db.Events.AsNoTracking()
            .Where(musicalEvent =>
                musicalEvent.GroupId == groupId
                && musicalEvent.Status == EventStatuses.Scheduled
                && !musicalEvent.IsHidden
                && musicalEvent.StartsAt >= from
                && musicalEvent.StartsAt < to)
            .OrderBy(musicalEvent => musicalEvent.StartsAt)
            .ThenBy(musicalEvent => musicalEvent.Id)
            .Select(musicalEvent => new
            {
                musicalEvent.Id,
                musicalEvent.Title,
                musicalEvent.Type,
                musicalEvent.StartsAt
            })
            .ToListAsync(cancellationToken);

        if (events.Count == 0)
        {
            return new GroupEventResponseReportData(members, Array.Empty<EventResponseReportRow>());
        }

        var eventIds = events.Select(musicalEvent => musicalEvent.Id).ToArray();
        var responses = await _db.Rsvps.AsNoTracking()
            .Where(rsvp =>
                eventIds.Contains(rsvp.EventId)
                && _db.Memberships.Any(membership =>
                    membership.GroupId == groupId && membership.UserId == rsvp.UserId))
            .GroupBy(rsvp => new { rsvp.EventId, rsvp.Response })
            .Select(group => new
            {
                group.Key.EventId,
                group.Key.Response,
                Count = group.LongCount()
            })
            .ToListAsync(cancellationToken);
        var counts = responses
            .GroupBy(row => row.EventId)
            .ToDictionary(group => group.Key, group => group.ToDictionary(row => row.Response, row => row.Count));

        var reportEvents = events.Select(musicalEvent =>
        {
            counts.TryGetValue(musicalEvent.Id, out var byResponse);
            var yes = byResponse?.GetValueOrDefault(RsvpResponses.Yes) ?? 0;
            var no = byResponse?.GetValueOrDefault(RsvpResponses.No) ?? 0;
            var maybe = byResponse?.GetValueOrDefault(RsvpResponses.Maybe) ?? 0;
            var total = yes + no + maybe;
            return new EventResponseReportRow(
                musicalEvent.Id,
                musicalEvent.Title,
                musicalEvent.Type,
                musicalEvent.StartsAt,
                yes,
                no,
                maybe,
                total,
                Math.Max(0, members - total));
        }).ToArray();

        return new GroupEventResponseReportData(members, reportEvents);
    }

    public async Task<GroupTaskReportData> GetTasksAsync(
        Guid groupId,
        DateTimeOffset from,
        DateTimeOffset to,
        DateTimeOffset asOf,
        CancellationToken cancellationToken)
    {
        var tasks = _db.Tasks.AsNoTracking()
            .Where(task => task.GroupId == groupId
                           && task.DeletedAt == null
                           && task.CreatedAt >= from
                           && task.CreatedAt < to);

        var total = await tasks.LongCountAsync(cancellationToken);
        var open = await tasks.LongCountAsync(task => task.Status == TaskStatuses.Open, cancellationToken);
        var inProgress = await tasks.LongCountAsync(task => task.Status == TaskStatuses.InProgress, cancellationToken);
        var done = await tasks.LongCountAsync(task => task.Status == TaskStatuses.Done, cancellationToken);
        var unassigned = await tasks.LongCountAsync(task => task.AssigneeUserId == null, cancellationToken);
        var overdue = await tasks.LongCountAsync(
            task => task.DueAt != null && task.DueAt < asOf && task.Status != TaskStatuses.Done,
            cancellationToken);
        var assignments = await tasks
            .Where(task => task.AssigneeUserId != null)
            .GroupBy(task => task.AssigneeUserId!.Value)
            .Select(group => new { UserId = group.Key, Count = group.LongCount() })
            .OrderByDescending(row => row.Count)
            .ThenBy(row => row.UserId)
            .ToListAsync(cancellationToken);
        var userIds = assignments.Select(row => row.UserId).ToArray();
        Dictionary<Guid, string> members;
        if (userIds.Length == 0)
        {
            members = [];
        }
        else
        {
            members = await _db.Memberships.AsNoTracking()
                .Where(membership => membership.GroupId == groupId
                                     && membership.UserId != null
                                     && userIds.Contains(membership.UserId.Value))
                .Select(membership => new
                {
                    UserId = membership.UserId!.Value,
                    membership.DisplayName
                })
                .Join(_db.Users.AsNoTracking(),
                    membership => membership.UserId,
                    user => user.Id,
                    (membership, user) => new
                    {
                        UserId = user.Id,
                        DisplayName = membership.DisplayName ?? user.DisplayName ?? string.Empty
                    })
                .ToDictionaryAsync(row => row.UserId, row => row.DisplayName, cancellationToken);
        }

        return new GroupTaskReportData(
            from,
            to,
            asOf,
            total,
            open,
            inProgress,
            done,
            unassigned,
            overdue,
            assignments.Select(row => new TaskAssigneeReportRow(
                row.UserId,
                members.GetValueOrDefault(row.UserId) ?? string.Empty,
                row.Count)).ToArray());
    }

    public async Task<GroupSetlistUsageReportData> GetSetlistUsageAsync(
        Guid groupId,
        DateTimeOffset asOf,
        CancellationToken cancellationToken)
    {
        var setlists = _db.Setlists.AsNoTracking().Where(setlist => setlist.GroupId == groupId);
        var count = await setlists.LongCountAsync(cancellationToken);
        var setlistIds = setlists.Select(setlist => setlist.Id);
        var arrangementReferences = await _db.SetlistItems.AsNoTracking()
            .Where(item => item.GroupId == groupId && setlistIds.Contains(item.SetlistId))
            .LongCountAsync(cancellationToken);
        return new GroupSetlistUsageReportData(asOf, count, arrangementReferences);
    }
}
