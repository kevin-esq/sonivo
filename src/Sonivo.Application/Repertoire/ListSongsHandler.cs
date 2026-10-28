using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed class ListSongsHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly ISongFavoriteStore? _favorites;

    public ListSongsHandler(GroupAccessService access, ISongStore songs, ISongFavoriteStore? favorites = null)
    {
        _access = access;
        _songs = songs;
        _favorites = favorites;
    }

    public async Task<IReadOnlyList<SongListItemDto>> HandleAsync(
        Guid userId,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        // ADR-0082: a group-wide read profile sees every song except explicit
        // denies. A member without it sees only explicitly allowed songs.
        var hasGroupRead = await _access.HasPermissionAsync(
            groupId, userId, GroupPermissions.SongView, cancellationToken);
        var denied = await _access.DeniedResourceIdsAsync(
            groupId,
            userId,
            ResourceGrant.ResourceTypes.Song,
            cancellationToken);
        var allowed = hasGroupRead
            ? null
            : await _access.GrantedResourceIdsAsync(
                groupId, userId, ResourceGrant.ResourceTypes.Song, cancellationToken);
        var songs = await _songs.ListByGroupAsync(groupId, cancellationToken);
        var favoriteIds = _favorites is null
            ? new HashSet<Guid>()
            : await _favorites.FavoriteSongIdsAsync(groupId, userId, cancellationToken);
        return songs
            .Where(s => hasGroupRead ? !denied.Contains(s.Id) : allowed!.Contains(s.Id))
            .Select(s => new SongListItemDto(
                s.Id,
                s.Title,
                s.Attribution,
                s.OriginKind,
                s.Version,
                s.CreatedAt,
                s.UpdatedAt,
                s.TagList,
                favoriteIds.Contains(s.Id),
                s.Genre))
            .ToList();
    }
}
