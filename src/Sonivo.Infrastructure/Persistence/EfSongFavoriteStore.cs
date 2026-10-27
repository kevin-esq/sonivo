using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfSongFavoriteStore : ISongFavoriteStore
{
    private readonly SonivoDbContext _db;

    public EfSongFavoriteStore(SonivoDbContext db) => _db = db;

    public Task<bool> IsFavoriteAsync(Guid groupId, Guid songId, Guid userId, CancellationToken cancellationToken)
        => _db.SongFavorites.AsNoTracking().AnyAsync(
            favorite => favorite.GroupId == groupId && favorite.SongId == songId && favorite.UserId == userId,
            cancellationToken);

    public async Task<IReadOnlySet<Guid>> FavoriteSongIdsAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
        => (await _db.SongFavorites.AsNoTracking()
                .Where(favorite => favorite.GroupId == groupId && favorite.UserId == userId)
                .Select(favorite => favorite.SongId)
                .ToListAsync(cancellationToken))
            .ToHashSet();

    public async Task AddIfMissingAsync(Guid groupId, Guid songId, Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var exists = await _db.SongFavorites.AnyAsync(
            favorite => favorite.GroupId == groupId && favorite.SongId == songId && favorite.UserId == userId,
            cancellationToken);
        if (exists) return;

        var favorite = SongFavorite.Create(groupId, songId, userId, now);
        _db.SongFavorites.Add(favorite);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "IX_SongFavorites_GroupId_SongId_UserId"
            })
        {
            // A concurrent idempotent PUT may win the insert after our existence check.
            _db.Entry(favorite).State = EntityState.Detached;
        }
    }

    public async Task RemoveAsync(Guid groupId, Guid songId, Guid userId, CancellationToken cancellationToken)
    {
        var favorite = await _db.SongFavorites
            .Where(favorite => favorite.GroupId == groupId && favorite.SongId == songId && favorite.UserId == userId)
            .SingleOrDefaultAsync(cancellationToken);
        if (favorite is null) return;

        _db.SongFavorites.Remove(favorite);
        await _db.SaveChangesAsync(cancellationToken);
    }
}
