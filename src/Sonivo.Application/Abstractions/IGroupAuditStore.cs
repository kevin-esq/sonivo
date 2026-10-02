using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IGroupAuditStore
{
    Task AddAsync(GroupAuditEntry entry, CancellationToken cancellationToken);
    /// <summary>Most recent entries for a group (newest first).</summary>
    Task<IReadOnlyList<GroupAuditEntry>> ListByGroupAsync(
        Guid groupId,
        int limit,
        CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
