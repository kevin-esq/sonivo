using Sonivo.Application.Abstractions;
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
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var song = await _songs.GetByIdAsync(groupId, songId, cancellationToken);
        if (song is null)
        {
            throw new NotFoundException("Song not found.");
        }

        var arrangementCount = await _songs.CountLiveArrangementsAsync(groupId, songId, cancellationToken);
        return CreateSongHandler.ToDetail(song, arrangementCount);
    }
}
