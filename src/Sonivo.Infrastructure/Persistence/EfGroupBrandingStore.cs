using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupBrandingStore : IGroupBrandingStore
{
    private readonly SonivoDbContext _db;

    public EfGroupBrandingStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task<GroupBranding?> GetAsync(Guid groupId, CancellationToken cancellationToken)
        => _db.GroupBrandings.FirstOrDefaultAsync(b => b.GroupId == groupId, cancellationToken);

    public async Task AddAsync(GroupBranding branding, CancellationToken cancellationToken)
        => await _db.GroupBrandings.AddAsync(branding, cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
