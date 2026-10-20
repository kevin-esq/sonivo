using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

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
        // The Song-level item grant may grant read access to this Song and its
        // nested Arrangements even when the member has no group-wide role grant.
        await _access.RequireResourcePermissionAsync(
            groupId,
            userId,
            GroupPermissions.SongView,
            ResourceGrant.ResourceTypes.Song,
            songId,
            cancellationToken);

        var song = await _songs.GetByIdAsync(groupId, songId, cancellationToken);
        if (song is null)
        {
            throw new NotFoundException("Song not found.");
        }

        var arrangements = await _arrangements.ListBySongAsync(groupId, songId, cancellationToken);
        var visible = new List<ArrangementListItemDto>(arrangements.Count);
        foreach (var arrangement in arrangements)
        {
            var readable = await _access.HasResourceReadPathPermissionAsync(
                groupId,
                userId,
                new[]
                {
                    (ResourceGrant.ResourceTypes.Song, songId, GroupPermissions.SongView),
                    (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, GroupPermissions.ArrangementView),
                },
                cancellationToken);
            if (!readable)
            {
                continue;
            }

            visible.Add(new ArrangementListItemDto(
                arrangement.Id,
                arrangement.SongId,
                arrangement.Label,
                arrangement.DefaultKey,
                arrangement.DefaultBpm,
                arrangement.Version,
                arrangement.CreatedAt,
                arrangement.UpdatedAt));
        }

        return visible;
    }
}
