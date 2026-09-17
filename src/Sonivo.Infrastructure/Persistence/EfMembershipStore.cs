using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfMembershipStore : IMembershipStore
{
    private readonly SonivoDbContext _db;

    public EfMembershipStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<Membership>> ListByGroupAsync(
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return await _db.Memberships
            .AsNoTracking()
            .Where(m => m.GroupId == groupId)
            .ToListAsync(cancellationToken);
    }

    public Task<Membership?> GetForUpdateAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
        => _db.Memberships.FirstOrDefaultAsync(
            m => m.GroupId == groupId && m.UserId == userId,
            cancellationToken);

    public Task RemoveAsync(Membership membership, CancellationToken cancellationToken)
    {
        _db.Memberships.Remove(membership);
        return Task.CompletedTask;
    }

    public Task<int> CountOwnersAsync(Guid groupId, CancellationToken cancellationToken)
        => _db.Memberships.CountAsync(
            m => m.GroupId == groupId && m.Role == MembershipRoles.Owner,
            cancellationToken);
}
