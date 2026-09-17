using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Scheduling;

public sealed record UpsertEventRsvpCommand(Guid UserId, Guid GroupId, Guid EventId, string? Response);

public sealed record EventRsvpDto(Guid UserId, string Response, DateTimeOffset UpdatedAt);

public sealed class UpsertEventRsvpHandler
{
    private readonly GroupAccessService _access;
    private readonly IEventStore _events;
    private readonly IClock _clock;

    public UpsertEventRsvpHandler(GroupAccessService access, IEventStore events, IClock clock)
    {
        _access = access;
        _events = events;
        _clock = clock;
    }

    public async Task<EventRsvpDto> HandleAsync(
        UpsertEventRsvpCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(command.GroupId, command.UserId, cancellationToken);

        var musicalEvent = await RequireLiveEventAsync(command.GroupId, command.EventId, cancellationToken);

        try
        {
            var isInsert = musicalEvent.Rsvps.All(r => r.UserId != command.UserId);
            var rsvp = musicalEvent.SetRsvp(command.UserId, command.Response ?? string.Empty, _clock.UtcNow);
            if (isInsert)
            {
                await _events.AddRsvpAsync(rsvp, cancellationToken);
            }

            await _events.SaveChangesAsync(cancellationToken);
            return new EventRsvpDto(rsvp.UserId, rsvp.Response, rsvp.UpdatedAt);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    internal static async Task<Event> RequireLiveEventAsync(
        IEventStore events,
        Guid groupId,
        Guid eventId,
        CancellationToken cancellationToken)
    {
        var musicalEvent = await events.GetByIdWithRsvpsAsync(groupId, eventId, cancellationToken);
        if (musicalEvent is null
            || musicalEvent.Status == EventStatuses.Cancelled
            || musicalEvent.IsHidden)
        {
            throw new NotFoundException("Event not found.");
        }

        return musicalEvent;
    }

    private Task<Event> RequireLiveEventAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken)
        => RequireLiveEventAsync(_events, groupId, eventId, cancellationToken);
}

public sealed record EventRsvpListItemDto(
    Guid UserId,
    string DisplayName,
    string Response,
    DateTimeOffset UpdatedAt);

public sealed record EventRsvpListDto(IReadOnlyList<EventRsvpListItemDto> Items);

public sealed class ListEventRsvpsHandler
{
    private readonly GroupAccessService _access;
    private readonly IEventStore _events;
    private readonly IUserDirectory _users;

    public ListEventRsvpsHandler(GroupAccessService access, IEventStore events, IUserDirectory users)
    {
        _access = access;
        _events = events;
        _users = users;
    }

    public async Task<EventRsvpListDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid eventId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);

        var musicalEvent = await UpsertEventRsvpHandler.RequireLiveEventAsync(
            _events,
            groupId,
            eventId,
            cancellationToken);

        var rsvps = musicalEvent.Rsvps.ToList();
        if (rsvps.Count == 0)
        {
            return new EventRsvpListDto([]);
        }

        var directory = await _users.GetByIdsAsync(
            rsvps.Select(r => r.UserId).Distinct().ToList(),
            cancellationToken);
        var names = directory.ToDictionary(e => e.UserId, e => e.DisplayName);

        var items = rsvps
            .Select(r => new EventRsvpListItemDto(
                r.UserId,
                names.TryGetValue(r.UserId, out var name) ? name : string.Empty,
                r.Response,
                r.UpdatedAt))
            .OrderBy(i => i.DisplayName, StringComparer.Ordinal)
            .ThenBy(i => i.UserId)
            .ToList();

        return new EventRsvpListDto(items);
    }
}
