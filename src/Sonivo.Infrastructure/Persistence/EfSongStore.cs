using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Repertoire;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfSongStore : ISongStore
{
    private readonly SonivoDbContext _db;

    public EfSongStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task AddAsync(Song song, CancellationToken cancellationToken)
        => _db.Songs.AddAsync(song, cancellationToken).AsTask();

    public async Task<IReadOnlyList<Song>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
    {
        return await _db.Songs
            .AsNoTracking()
            .Where(s => s.GroupId == groupId)
            .OrderBy(s => s.Title)
            .ThenBy(s => s.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Song?> GetByIdAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
        => _db.Songs.FirstOrDefaultAsync(s => s.GroupId == groupId && s.Id == songId, cancellationToken);

    public Task<int> CountLiveArrangementsAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
        => _db.Arrangements.CountAsync(
            a => a.GroupId == groupId && a.SongId == songId,
            cancellationToken);

    public Task UpdateAsync(Song song, CancellationToken cancellationToken)
    {
        _db.Songs.Update(song);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
