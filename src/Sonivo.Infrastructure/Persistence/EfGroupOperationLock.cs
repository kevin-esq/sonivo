using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupOperationLock(SonivoDbContext db) : IGroupOperationLock
{
    public async Task LockAsync(Guid groupId, CancellationToken cancellationToken)
    {
        if (!db.Database.IsNpgsql()) return;
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Group lifecycle changes require a transaction.");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({groupId.ToString()}, 0))", cancellationToken);
    }
}
