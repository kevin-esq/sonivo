using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed class GetSongHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;

    public GetSongHandler(GroupAccessService access, ISongStore songs)
    {
        _access = access;
        _songs = songs;
    }

    public async Task<SongDetailDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid songId,
        CancellationToken cancellationToken)
    {
        // ADR-0080: reading one specific song is a per-resource check, so an
        // allow row can open it to a Viewer and a deny row can close it for a
        // Manager. This is the path a direct URL takes, so it is the one that
        // must never leak.
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

        var arrangementCount = await _songs.CountLiveArrangementsAsync(groupId, songId, cancellationToken);
        return CreateSongHandler.ToDetail(song, arrangementCount);
    }
}
