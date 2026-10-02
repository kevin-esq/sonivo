using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IGroupBrandingStore
{
    Task<GroupBranding?> GetAsync(Guid groupId, CancellationToken cancellationToken);
    Task AddAsync(GroupBranding branding, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
