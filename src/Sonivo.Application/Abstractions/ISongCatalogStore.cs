using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Abstractions;

public sealed record SongCatalogQuery(
    Guid GroupId,
    Guid UserId,
    string? Search,
    string? Tag,
    string Sort,
    string SortDirection,
    int Page,
    int PageSize,
    bool FavoritesOnly,
    bool HasGroupRead,
    IReadOnlySet<Guid> AllowedSongIds,
    IReadOnlySet<Guid> DeniedSongIds);

public sealed record SongCatalogRow(Song Song, bool IsFavorite, int ArrangementCount);

public sealed record SongCatalogPage(IReadOnlyList<SongCatalogRow> Items, int TotalCount, int Page, IReadOnlyList<string> AvailableTags);

public interface ISongCatalogStore
{
    Task<SongCatalogPage> SearchPageAsync(SongCatalogQuery query, CancellationToken cancellationToken);
}
