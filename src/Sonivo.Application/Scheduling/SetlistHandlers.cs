using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Scheduling;

public sealed record CreateSetlistCommand(Guid UserId, Guid GroupId, string Name);

public sealed record SetlistListItemDto(
    Guid Id,
    string Name,
    int Version,
    int ItemCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record SetlistItemDto(
    Guid Id,
    Guid ArrangementId,
    int SortOrder,
    string? SongTitle,
    string? ArrangementLabel);

public sealed record SetlistDetailDto(
    Guid Id,
    string Name,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<SetlistItemDto> Items);

public sealed class CreateSetlistHandler
{
    private readonly GroupAccessService _access;
    private readonly ISetlistStore _setlists;
    private readonly IClock _clock;

    public CreateSetlistHandler(GroupAccessService access, ISetlistStore setlists, IClock clock)
    {
        _access = access;
        _setlists = setlists;
        _clock = clock;
    }

    public async Task<SetlistDetailDto> HandleAsync(CreateSetlistCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        try
        {
            var setlist = Setlist.Create(command.GroupId, command.Name, _clock.UtcNow);
            await _setlists.AddAsync(setlist, cancellationToken);
            await _setlists.SaveChangesAsync(cancellationToken);
            return ToDetail(setlist, Array.Empty<SetlistItemDto>());
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    internal static SetlistDetailDto ToDetail(Setlist setlist, IReadOnlyList<SetlistItemDto> items) => new(
        setlist.Id,
        setlist.Name,
        setlist.Version,
        setlist.CreatedAt,
        setlist.UpdatedAt,
        items);

    internal static SetlistListItemDto ToListItem(Setlist setlist, int itemCount) => new(
        setlist.Id,
        setlist.Name,
        setlist.Version,
        itemCount,
        setlist.CreatedAt,
        setlist.UpdatedAt);
}

public sealed class ListSetlistsHandler
{
    private readonly GroupAccessService _access;
    private readonly ISetlistStore _setlists;

    public ListSetlistsHandler(GroupAccessService access, ISetlistStore setlists)
    {
        _access = access;
        _setlists = setlists;
    }

    public async Task<IReadOnlyList<SetlistListItemDto>> HandleAsync(
        Guid userId,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var setlists = await _setlists.ListByGroupAsync(groupId, cancellationToken);
        return setlists
            .Select(s => CreateSetlistHandler.ToListItem(s, s.Items.Count))
            .ToList();
    }
}

public sealed class GetSetlistHandler
{
    private readonly GroupAccessService _access;
    private readonly ISetlistStore _setlists;
    private readonly IArrangementStore _arrangements;
    private readonly ISongStore _songs;

    public GetSetlistHandler(
        GroupAccessService access,
        ISetlistStore setlists,
        IArrangementStore arrangements,
        ISongStore songs)
    {
        _access = access;
        _setlists = setlists;
        _arrangements = arrangements;
        _songs = songs;
    }

    public async Task<SetlistDetailDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid setlistId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);

        var setlist = await _setlists.GetByIdWithItemsAsync(groupId, setlistId, cancellationToken);
        if (setlist is null)
        {
            throw new NotFoundException("Setlist not found.");
        }

        var items = await SetlistItemMapper.MapAsync(
            groupId,
            setlist,
            _arrangements,
            _songs,
            cancellationToken);
        return CreateSetlistHandler.ToDetail(setlist, items);
    }
}

internal static class SetlistItemMapper
{
    public static async Task<IReadOnlyList<SetlistItemDto>> MapAsync(
        Guid groupId,
        Setlist setlist,
        IArrangementStore arrangements,
        ISongStore songs,
        CancellationToken cancellationToken)
    {
        var ordered = setlist.Items
            .OrderBy(i => i.SortOrder)
            .ThenBy(i => i.Id)
            .ToList();

        var result = new List<SetlistItemDto>(ordered.Count);
        foreach (var item in ordered)
        {
            string? songTitle = null;
            string? arrangementLabel = null;
            var arrangement = await arrangements.GetByIdAsync(groupId, item.ArrangementId, cancellationToken);
            if (arrangement is not null)
            {
                arrangementLabel = arrangement.Label;
                var song = await songs.GetByIdAsync(groupId, arrangement.SongId, cancellationToken);
                songTitle = song?.Title;
            }

            result.Add(new SetlistItemDto(
                item.Id,
                item.ArrangementId,
                item.SortOrder,
                songTitle,
                arrangementLabel));
        }

        return result;
    }
}

public sealed record UpdateSetlistCommand(
    Guid UserId,
    Guid GroupId,
    Guid SetlistId,
    string Name,
    int ExpectedVersion);

public sealed class UpdateSetlistHandler
{
    private readonly GroupAccessService _access;
    private readonly ISetlistStore _setlists;
    private readonly IArrangementStore _arrangements;
    private readonly ISongStore _songs;
    private readonly IClock _clock;

    public UpdateSetlistHandler(
        GroupAccessService access,
        ISetlistStore setlists,
        IArrangementStore arrangements,
        ISongStore songs,
        IClock clock)
    {
        _access = access;
        _setlists = setlists;
        _arrangements = arrangements;
        _songs = songs;
        _clock = clock;
    }

    public async Task<SetlistDetailDto> HandleAsync(UpdateSetlistCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var setlist = await _setlists.GetByIdWithItemsAsync(command.GroupId, command.SetlistId, cancellationToken);
        if (setlist is null)
        {
            throw new NotFoundException("Setlist not found.");
        }

        try
        {
            setlist.Rename(command.Name, command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _setlists.UpdateAsync(setlist, cancellationToken);
        await _setlists.SaveChangesAsync(cancellationToken);

        var items = await SetlistItemMapper.MapAsync(
            command.GroupId,
            setlist,
            _arrangements,
            _songs,
            cancellationToken);
        return CreateSetlistHandler.ToDetail(setlist, items);
    }
}

public sealed record SetlistItemReplaceDto(Guid ArrangementId, int SortOrder);

public sealed record ReplaceSetlistItemsCommand(
    Guid UserId,
    Guid GroupId,
    Guid SetlistId,
    int ExpectedVersion,
    IReadOnlyList<SetlistItemReplaceDto> Items);

public sealed class ReplaceSetlistItemsHandler
{
    private readonly GroupAccessService _access;
    private readonly ISetlistStore _setlists;
    private readonly IArrangementStore _arrangements;
    private readonly ISongStore _songs;
    private readonly IClock _clock;

    public ReplaceSetlistItemsHandler(
        GroupAccessService access,
        ISetlistStore setlists,
        IArrangementStore arrangements,
        ISongStore songs,
        IClock clock)
    {
        _access = access;
        _setlists = setlists;
        _arrangements = arrangements;
        _songs = songs;
        _clock = clock;
    }

    public async Task<SetlistDetailDto> HandleAsync(
        ReplaceSetlistItemsCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var setlist = await _setlists.GetByIdWithItemsAsync(command.GroupId, command.SetlistId, cancellationToken);
        if (setlist is null)
        {
            throw new NotFoundException("Setlist not found.");
        }

        var incoming = command.Items ?? Array.Empty<SetlistItemReplaceDto>();
        foreach (var row in incoming)
        {
            if (row.ArrangementId == Guid.Empty)
            {
                throw new ValidationException("Arrangement id is required.");
            }

            var arrangement = await _arrangements.GetByIdAsync(
                command.GroupId,
                row.ArrangementId,
                cancellationToken);
            if (arrangement is null)
            {
                throw new ValidationException(
                    "Arrangement not found, is soft-deleted, or does not belong to this group.");
            }
        }

        try
        {
            setlist.BeginReplaceItems(command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        var existing = setlist.Items.ToList();
        await _setlists.RemoveItemsAsync(existing, cancellationToken);
        setlist.Items.Clear();

        var created = new List<SetlistItem>(incoming.Count);
        foreach (var row in incoming.OrderBy(i => i.SortOrder).ThenBy(i => i.ArrangementId))
        {
            var item = SetlistItem.Create(
                setlist.Id,
                setlist.GroupId,
                row.ArrangementId,
                row.SortOrder);
            created.Add(item);
            setlist.Items.Add(item);
        }

        await _setlists.AddItemsAsync(created, cancellationToken);
        await _setlists.UpdateAsync(setlist, cancellationToken);
        await _setlists.SaveChangesAsync(cancellationToken);

        var mapped = await SetlistItemMapper.MapAsync(
            command.GroupId,
            setlist,
            _arrangements,
            _songs,
            cancellationToken);
        return CreateSetlistHandler.ToDetail(setlist, mapped);
    }
}
