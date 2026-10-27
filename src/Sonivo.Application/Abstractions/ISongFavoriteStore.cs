namespace Sonivo.Application.Abstractions;

public interface ISongFavoriteStore
{
    Task<bool> IsFavoriteAsync(Guid groupId, Guid songId, Guid userId, CancellationToken cancellationToken);
    Task<IReadOnlySet<Guid>> FavoriteSongIdsAsync(Guid groupId, Guid userId, CancellationToken cancellationToken);
    Task AddIfMissingAsync(Guid groupId, Guid songId, Guid userId, DateTimeOffset now, CancellationToken cancellationToken);
    Task RemoveAsync(Guid groupId, Guid songId, Guid userId, CancellationToken cancellationToken);
}
