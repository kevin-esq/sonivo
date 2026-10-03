using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Identity;

public sealed class EfUserDirectory : IUserDirectory
{
    private readonly SonivoDbContext _db;

    public EfUserDirectory(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<UserDirectoryEntry>> GetByIdsAsync(
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken)
    {
        if (userIds.Count == 0)
        {
            return [];
        }

        var users = await _db.Users
            .AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.LastSeenAt })
            .ToListAsync(cancellationToken);

        return users
            .Select(u => new UserDirectoryEntry(
                u.Id,
                string.IsNullOrWhiteSpace(u.DisplayName)
                    ? u.Email ?? string.Empty
                    : u.DisplayName.Trim(),
                u.LastSeenAt,
                u.Email))
            .ToList();
    }

    public async Task TouchLastSeenAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            return;
        }

        // Throttle: at most one write per minute per user.
        if (user.LastSeenAt is null || user.LastSeenAt.Value < now.AddSeconds(-60))
        {
            user.LastSeenAt = now;
            await _db.SaveChangesAsync(cancellationToken);
        }
    }
}
