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

    /// <summary>
    /// Filtered, paginated audit query (ADR-0051 advanced view). All filters are
    /// optional; `total` is the count matching the filters (ignoring paging).
    /// </summary>
    Task<(IReadOnlyList<GroupAuditEntry> Items, int Total)> QueryByGroupAsync(
        Guid groupId,
        string? action,
        Guid? actorUserId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int skip,
        int take,
        CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
