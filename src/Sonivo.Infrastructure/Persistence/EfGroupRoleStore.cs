using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupRoleStore : IGroupRoleStore
{
    private readonly SonivoDbContext _db;

    public EfGroupRoleStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(GroupRole role, CancellationToken cancellationToken)
        => await _db.GroupRoles.AddAsync(role, cancellationToken);

    public async Task<IReadOnlyList<GroupRole>> ListByGroupAsync(
        Guid groupId,
        CancellationToken cancellationToken)
        => await _db.GroupRoles
            .AsNoTracking()
            .Where(r => r.GroupId == groupId)
            .OrderBy(r => r.IsSystem)
            .ThenBy(r => r.Name)
            .ToListAsync(cancellationToken);

    public Task<GroupRole?> GetAsync(
        Guid groupId,
        Guid roleId,
        CancellationToken cancellationToken)
        => _db.GroupRoles.FirstOrDefaultAsync(
            r => r.GroupId == groupId && r.Id == roleId,
            cancellationToken);

    public Task<GroupRole?> FindByNameAsync(
        Guid groupId,
        string name,
        CancellationToken cancellationToken)
        => _db.GroupRoles.FirstOrDefaultAsync(
            r => r.GroupId == groupId && r.Name == name,
            cancellationToken);

    public void Remove(GroupRole role) => _db.GroupRoles.Remove(role);

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
