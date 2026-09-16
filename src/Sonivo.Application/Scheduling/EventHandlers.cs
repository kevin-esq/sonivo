using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Scheduling;

public sealed record CreateEventCommand(
    Guid UserId,
    Guid GroupId,
    string Title,
    string Type,
    DateTimeOffset StartsAt);

public sealed record EventPlanItemDto(
    Guid Id,
    Guid ArrangementId,
    int SortOrder,
    string DisplaySongTitle,
    string DisplayArrangementLabel);

public sealed record EventListItemDto(
    Guid Id,
    string Title,
    string Type,
    DateTimeOffset StartsAt,
    string Status,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record EventDetailDto(
    Guid Id,
    string Title,
    string Type,
    DateTimeOffset StartsAt,
    string Status,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    Guid? SourceSetlistId,
    IReadOnlyList<EventPlanItemDto> Items);

public sealed class CreateEventHandler
{
    private readonly GroupAccessService _access;
    private readonly IEventStore _events;
    private readonly IClock _clock;

    public CreateEventHandler(GroupAccessService access, IEventStore events, IClock clock)
    {
        _access = access;
        _events = events;
        _clock = clock;
    }

    public async Task<EventDetailDto> HandleAsync(CreateEventCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        try
        {
            var musicalEvent = Event.Create(
                command.GroupId,
                command.Title,
                command.Type,
                command.StartsAt,
                _clock.UtcNow);

            await _events.AddAsync(musicalEvent, cancellationToken);
            await _events.SaveChangesAsync(cancellationToken);
            return ToDetail(musicalEvent);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    internal static EventDetailDto ToDetail(Event musicalEvent)
    {
        var items = musicalEvent.Items
            .OrderBy(i => i.SortOrder)
            .ThenBy(i => i.Id)
            .Select(i => new EventPlanItemDto(
                i.Id,
                i.ArrangementId,
                i.SortOrder,
                i.DisplaySongTitle,
                i.DisplayArrangementLabel))
            .ToList();

        return new EventDetailDto(
            musicalEvent.Id,
            musicalEvent.Title,
            musicalEvent.Type,
            musicalEvent.StartsAt,
            musicalEvent.Status,
            musicalEvent.Version,
            musicalEvent.CreatedAt,
            musicalEvent.UpdatedAt,
            musicalEvent.SourceSetlistId,
            items);
    }

    internal static EventListItemDto ToListItem(Event musicalEvent) => new(
        musicalEvent.Id,
        musicalEvent.Title,
        musicalEvent.Type,
        musicalEvent.StartsAt,
        musicalEvent.Status,
        musicalEvent.Version,
        musicalEvent.CreatedAt,
        musicalEvent.UpdatedAt);
}

public sealed class ListEventsHandler
{
    private readonly GroupAccessService _access;
    private readonly IEventStore _events;

    public ListEventsHandler(GroupAccessService access, IEventStore events)
    {
        _access = access;
        _events = events;
    }

    public async Task<IReadOnlyList<EventListItemDto>> HandleAsync(
        Guid userId,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var events = await _events.ListActiveByGroupAsync(groupId, cancellationToken);
        return events.Select(CreateEventHandler.ToListItem).ToList();
    }
}

public sealed class GetEventHandler
{
    private readonly GroupAccessService _access;
    private readonly IEventStore _events;

    public GetEventHandler(GroupAccessService access, IEventStore events)
    {
        _access = access;
        _events = events;
    }

    public async Task<EventDetailDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid eventId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);

        var musicalEvent = await _events.GetByIdWithItemsAsync(groupId, eventId, cancellationToken);
        if (musicalEvent is null)
        {
            throw new NotFoundException("Event not found.");
        }

        return CreateEventHandler.ToDetail(musicalEvent);
    }
}
