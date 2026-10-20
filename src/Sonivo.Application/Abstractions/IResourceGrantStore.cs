using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

/// <summary>
/// Per-song permission overrides (ADR-0080). Lookups are ALWAYS scoped by
/// (GroupId, UserId): an unscoped read would let one group's grants leak into
/// another, which is exactly the tenancy rule ADR-0079/0083 exist to prevent.
/// </summary>
public interface IResourceGrantStore
{
    /// <summary>All grants for one member in one group.</summary>
    Task<IReadOnlyList<ResourceGrant>> ListForUserAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken);

    /// <summary>
    /// The grant for one specific item, or null when nothing was overridden
    /// (null means "the role capability governs").
    /// </summary>
    Task<ResourceGrant?> FindAsync(
        Guid groupId,
        Guid userId,
        string resourceType,
        Guid resourceId,
        CancellationToken cancellationToken);

    Task AddAsync(ResourceGrant grant, CancellationToken cancellationToken);

    void Remove(ResourceGrant grant);

    Task RemoveAsync(
        Guid groupId,
        Guid userId,
        string resourceType,
        Guid resourceId,
        CancellationToken cancellationToken);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
