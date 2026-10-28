using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed record SongPageDto(
    IReadOnlyList<SongCatalogItemDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages,
    IReadOnlyList<string> AvailableTags);

public sealed record SongCatalogItemDto(
    Guid Id,
    string Title,
    string? Attribution,
    string OriginKind,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<string> Tags,
    bool IsFavorite,
    int ArrangementCount,
    string? Genre = null);

public sealed class SearchSongsHandler
{
    private const int MaximumPageSize = 100;
    private const int MaximumSearchLength = 200;
    private static readonly HashSet<string> SupportedSorts = ["title", "artist", "recent", "updated", "theme"];
    private readonly GroupAccessService _access;
    private readonly ISongCatalogStore _catalog;

    public SearchSongsHandler(GroupAccessService access, ISongCatalogStore catalog)
    {
        _access = access;
        _catalog = catalog;
    }

    public async Task<SongPageDto> HandleAsync(
        Guid userId,
        Guid groupId,
        string? search,
        string? tag,
        bool favoritesOnly,
        string? sort,
        string? sortDirection,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var normalizedSearch = search?.Trim();
        if (normalizedSearch?.Length > MaximumSearchLength)
            throw new ValidationException($"Search must be {MaximumSearchLength} characters or fewer.");
        var normalizedTag = string.IsNullOrWhiteSpace(tag) ? null : tag.Trim().ToLowerInvariant();
        if (normalizedTag?.Length > Song.MaxTagLength || normalizedTag?.Contains(',') == true)
            throw new ValidationException($"Tag must be a single tag of {Song.MaxTagLength} characters or fewer.");
        if (page < 1)
            throw new ValidationException("Page must be at least 1.");
        if (pageSize is < 1 or > MaximumPageSize)
            throw new ValidationException($"Page size must be between 1 and {MaximumPageSize}.");

        var normalizedSort = string.IsNullOrWhiteSpace(sort) ? "title" : sort.Trim().ToLowerInvariant();
        if (!SupportedSorts.Contains(normalizedSort))
            throw new ValidationException("Sort must be title, artist, recent, updated, or theme.");
        var normalizedDirection = string.IsNullOrWhiteSpace(sortDirection)
            ? normalizedSort is "recent" or "updated" ? "desc" : "asc"
            : sortDirection.Trim().ToLowerInvariant();
        if (normalizedDirection is not ("asc" or "desc"))
            throw new ValidationException("Sort direction must be asc or desc.");

        var hasGroupRead = await _access.HasPermissionAsync(
            groupId, userId, GroupPermissions.SongView, cancellationToken);
        var denied = await _access.DeniedResourceIdsAsync(
            groupId, userId, ResourceGrant.ResourceTypes.Song, cancellationToken);
        var allowed = hasGroupRead
            ? (IReadOnlySet<Guid>)new HashSet<Guid>()
            : await _access.GrantedResourceIdsAsync(
                groupId, userId, ResourceGrant.ResourceTypes.Song, cancellationToken);

        var result = await _catalog.SearchPageAsync(new SongCatalogQuery(
            groupId,
            userId,
            normalizedSearch,
            normalizedTag,
            normalizedSort,
            normalizedDirection,
            page,
            pageSize,
            favoritesOnly,
            hasGroupRead,
            allowed,
            denied), cancellationToken);

        return new SongPageDto(
            result.Items.Select(row => new SongCatalogItemDto(
                row.Song.Id,
                row.Song.Title,
                row.Song.Attribution,
                row.Song.OriginKind,
                row.Song.Version,
                row.Song.CreatedAt,
                row.Song.UpdatedAt,
                row.Song.TagList,
                row.IsFavorite,
                row.ArrangementCount,
                row.Song.Genre)).ToArray(),
            result.TotalCount,
            result.Page,
            pageSize,
            (int)Math.Ceiling(result.TotalCount / (double)pageSize),
            result.AvailableTags);
    }
}
