using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed class ListArrangementsHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly IArrangementStore _arrangements;

    public ListArrangementsHandler(
        GroupAccessService access,
        ISongStore songs,
        IArrangementStore arrangements)
    {
        _access = access;
        _songs = songs;
        _arrangements = arrangements;
    }

    public async Task<IReadOnlyList<ArrangementListItemDto>> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid songId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);

        var song = await _songs.GetByIdAsync(groupId, songId, cancellationToken);
        if (song is null)
        {
            throw new NotFoundException("Song not found.");
        }

        var arrangements = await _arrangements.ListBySongAsync(groupId, songId, cancellationToken);
        return arrangements
            .Select(a => new ArrangementListItemDto(
                a.Id,
                a.SongId,
                a.Label,
                a.DefaultKey,
                a.DefaultBpm,
                a.Version,
                a.CreatedAt,
                a.UpdatedAt))
            .ToList();
    }
}
