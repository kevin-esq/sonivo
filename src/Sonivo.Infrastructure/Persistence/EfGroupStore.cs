using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupStore : IGroupStore
{
    private readonly SonivoDbContext _db;

    public EfGroupStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
    {
        await _db.Groups.AddAsync(group, cancellationToken);
        await _db.Memberships.AddAsync(ownerMembership, cancellationToken);
    }

    public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        => _db.Memberships.AddAsync(membership, cancellationToken).AsTask();

    public async Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await _db.Memberships
            .AsNoTracking()
            .Where(m => m.UserId == userId)
            .Join(
                _db.Groups.AsNoTracking(),
                m => m.GroupId,
                g => g.Id,
                (m, g) => new { Membership = m, Group = g })
            .OrderBy(x => x.Group.Name)
            .Select(x => new GroupListItem(
                x.Group.Id,
                x.Group.Name,
                x.Membership.Role,
                x.Group.Version,
                x.Group.CreatedAt))
            .ToListAsync(cancellationToken);
    }

    public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
        => _db.Groups.FirstOrDefaultAsync(g => g.Id == groupId, cancellationToken);

    public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
        => _db.Memberships.AsNoTracking()
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId, cancellationToken);

    public Task UpdateAsync(Group group, CancellationToken cancellationToken)
    {
        _db.Groups.Update(group);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
