using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed class ListSongsHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;

    public ListSongsHandler(GroupAccessService access, ISongStore songs)
    {
        _access = access;
        _songs = songs;
    }

    public async Task<IReadOnlyList<SongListItemDto>> HandleAsync(
        Guid userId,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var songs = await _songs.ListByGroupAsync(groupId, cancellationToken);
        return songs
            .Select(s => new SongListItemDto(
                s.Id,
                s.Title,
                s.Attribution,
                s.OriginKind,
                s.Version,
                s.CreatedAt,
                s.UpdatedAt))
            .ToList();
    }
}
