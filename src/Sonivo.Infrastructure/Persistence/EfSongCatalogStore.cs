using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfSongCatalogStore : ISongCatalogStore
{
    private readonly SonivoDbContext _db;

    public EfSongCatalogStore(SonivoDbContext db) => _db = db;

    public async Task<SongCatalogPage> SearchPageAsync(SongCatalogQuery query, CancellationToken cancellationToken)
    {
        IQueryable<Song> visibleSongs = _db.Songs.AsNoTracking().Where(song => song.GroupId == query.GroupId);

        if (query.HasGroupRead)
        {
            if (query.DeniedSongIds.Count > 0)
                visibleSongs = visibleSongs.Where(song => !query.DeniedSongIds.Contains(song.Id));
        }
        else
        {
            if (query.AllowedSongIds.Count == 0)
                return new SongCatalogPage([], 0, 1, []);
            visibleSongs = visibleSongs.Where(song => query.AllowedSongIds.Contains(song.Id));
        }

        var tagColumns = await visibleSongs
            .Where(song => song.Tags != null)
            .Select(song => song.Tags!)
            .ToListAsync(cancellationToken);
        var availableTags = tagColumns
            .SelectMany(tags => tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();

        var songs = visibleSongs;

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLowerInvariant();
            songs = songs.Where(song =>
                song.Title.ToLower().Contains(term)
                || (song.Attribution != null && song.Attribution.ToLower().Contains(term))
                || (song.Genre != null && song.Genre.ToLower().Contains(term))
                || (song.Tags != null && song.Tags.ToLower().Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(query.Tag))
        {
            var tag = query.Tag.Trim().ToLowerInvariant();
            songs = songs.Where(song => song.Tags != null && ("," + song.Tags + ",").Contains("," + tag + ","));
        }

        var favorites = _db.SongFavorites.AsNoTracking()
            .Where(favorite => favorite.GroupId == query.GroupId && favorite.UserId == query.UserId);
        if (query.FavoritesOnly)
            songs = songs.Where(song => favorites.Any(favorite => favorite.SongId == song.Id));

        var descending = query.SortDirection == "desc";
        songs = (query.Sort, descending) switch
        {
            ("artist", false) => songs.OrderBy(song => song.Attribution).ThenBy(song => song.Title).ThenBy(song => song.Id),
            ("artist", true) => songs.OrderByDescending(song => song.Attribution).ThenByDescending(song => song.Title).ThenBy(song => song.Id),
            ("recent", false) => songs.OrderBy(song => song.CreatedAt).ThenBy(song => song.Id),
            ("recent", true) => songs.OrderByDescending(song => song.CreatedAt).ThenBy(song => song.Id),
            ("updated", false) => songs.OrderBy(song => song.UpdatedAt).ThenBy(song => song.Id),
            ("updated", true) => songs.OrderByDescending(song => song.UpdatedAt).ThenBy(song => song.Id),
            ("theme", false) => songs.OrderBy(song => song.Tags).ThenBy(song => song.Title).ThenBy(song => song.Id),
            ("theme", true) => songs.OrderByDescending(song => song.Tags).ThenByDescending(song => song.Title).ThenBy(song => song.Id),
            (_, true) => songs.OrderByDescending(song => song.Title).ThenBy(song => song.Id),
            _ => songs.OrderBy(song => song.Title).ThenBy(song => song.Id),
        };

        var totalCount = await songs.CountAsync(cancellationToken);
        var totalPages = (int)Math.Ceiling(totalCount / (double)query.PageSize);
        var currentPage = totalPages == 0 ? 1 : Math.Min(query.Page, totalPages);
        var rows = await songs
            .Skip((currentPage - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(song => new SongCatalogRow(
                song,
                favorites.Any(favorite => favorite.SongId == song.Id),
                _db.Arrangements.Count(arrangement =>
                    arrangement.GroupId == query.GroupId
                    && arrangement.SongId == song.Id
                    && arrangement.DeletedAt == null)))
            .ToListAsync(cancellationToken);

        return new SongCatalogPage(rows, totalCount, currentPage, availableTags);
    }
}
