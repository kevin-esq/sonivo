using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
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

public sealed record ReplaceEventPlanFromSetlistCommand(
    Guid UserId,
    Guid GroupId,
    Guid EventId,
    Guid SetlistId,
    int ExpectedVersion,
    bool ConfirmReplace);

/// <summary>
/// ADR-0021 — Replace Event Plan from Setlist (one-shot import/copy; not sync).
/// </summary>
public sealed class ReplaceEventPlanFromSetlistHandler
{
    private readonly GroupAccessService _access;
    private readonly IEventStore _events;
    private readonly ISetlistStore _setlists;
    private readonly IArrangementStore _arrangements;
    private readonly ISongStore _songs;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public ReplaceEventPlanFromSetlistHandler(
        GroupAccessService access,
        IEventStore events,
        ISetlistStore setlists,
        IArrangementStore arrangements,
        ISongStore songs,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _access = access;
        _events = events;
        _setlists = setlists;
        _arrangements = arrangements;
        _songs = songs;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<EventDetailDto> HandleAsync(
        ReplaceEventPlanFromSetlistCommand command,
        CancellationToken cancellationToken)
    {
        if (command.ExpectedVersion < 1)
        {
            throw new ValidationException("expectedVersion is required.");
        }

        if (command.SetlistId == Guid.Empty)
        {
            throw new ValidationException("Setlist id is required.");
        }

        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var musicalEvent = await _events.GetByIdWithItemsAsync(
            command.GroupId,
            command.EventId,
            cancellationToken);
        if (musicalEvent is null)
        {
            throw new NotFoundException("Event not found.");
        }

        if (musicalEvent.Status == EventStatuses.Cancelled)
        {
            throw new ValidationException("Cannot replace the plan of a cancelled Event.");
        }

        if (musicalEvent.Items.Count >= 1 && !command.ConfirmReplace)
        {
            throw new ConflictException(
                "Event already has a plan. Set confirmReplace to true to replace it.");
        }

        var setlist = await _setlists.GetByIdWithItemsAsync(
            command.GroupId,
            command.SetlistId,
            cancellationToken);
        if (setlist is null)
        {
            throw new NotFoundException("Setlist not found.");
        }

        var templateItems = setlist.Items
            .OrderBy(i => i.SortOrder)
            .ThenBy(i => i.Id)
            .ToList();
        if (templateItems.Count == 0)
        {
            throw new ValidationException("Cannot apply an empty Setlist.");
        }

        var copies = new List<(SetlistItem Template, string SongTitle, string ArrangementLabel)>(
            templateItems.Count);
        foreach (var template in templateItems)
        {
            var arrangement = await _arrangements.GetByIdAsync(
                command.GroupId,
                template.ArrangementId,
                cancellationToken);
            if (arrangement is null)
            {
                throw new ValidationException(
                    "Arrangement not found, is soft-deleted, or does not belong to this group.");
            }

            var song = await _songs.GetByIdAsync(command.GroupId, arrangement.SongId, cancellationToken);
            if (song is null)
            {
                throw new ValidationException(
                    "Song not found, is soft-deleted, or does not belong to this group.");
            }

            copies.Add((template, song.Title, arrangement.Label));
        }

        var now = _clock.UtcNow;
        try
        {
            musicalEvent.BeginReplacePlan(command.ExpectedVersion, command.SetlistId, now);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            throw new ValidationException(ex.Message);
        }

        var existing = musicalEvent.Items.ToList();
        await _events.RemoveItemsAsync(existing, cancellationToken);
        musicalEvent.Items.Clear();

        var created = new List<EventSetlistItem>(copies.Count);
        foreach (var (template, songTitle, arrangementLabel) in copies)
        {
            var item = EventSetlistItem.Create(
                musicalEvent.Id,
                musicalEvent.GroupId,
                template.ArrangementId,
                songTitle,
                arrangementLabel,
                template.SortOrder,
                now);
            created.Add(item);
            musicalEvent.Items.Add(item);
        }

        await _events.AddItemsAsync(created, cancellationToken);
        await _events.UpdateAsync(musicalEvent, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return CreateEventHandler.ToDetail(musicalEvent);
    }
}
