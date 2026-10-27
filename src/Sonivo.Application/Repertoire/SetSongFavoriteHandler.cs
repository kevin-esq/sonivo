using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed record SongFavoriteDto(Guid SongId, bool IsFavorite);

public sealed class SetSongFavoriteHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly ISongFavoriteStore _favorites;
    private readonly IClock _clock;

    public SetSongFavoriteHandler(
        GroupAccessService access,
        ISongStore songs,
        ISongFavoriteStore favorites,
        IClock clock)
    {
        _access = access;
        _songs = songs;
        _favorites = favorites;
        _clock = clock;
    }

    public async Task<SongFavoriteDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid songId,
        bool isFavorite,
        CancellationToken cancellationToken)
    {
        await _access.RequireResourcePermissionAsync(
            groupId,
            userId,
            GroupPermissions.SongView,
            ResourceGrant.ResourceTypes.Song,
            songId,
            cancellationToken);

        if (await _songs.GetByIdAsync(groupId, songId, cancellationToken) is null)
            throw new NotFoundException("Song not found.");

        if (isFavorite)
            await _favorites.AddIfMissingAsync(groupId, songId, userId, _clock.UtcNow, cancellationToken);
        else
            await _favorites.RemoveAsync(groupId, songId, userId, cancellationToken);

        return new SongFavoriteDto(songId, isFavorite);
    }
}
