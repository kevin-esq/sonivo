using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IAccountAuditStore
{
    Task AddAsync(AccountAudit entry, CancellationToken cancellationToken);
    /// <summary>Most recent audit entries whose target is this user (own-data export).</summary>
    Task<IReadOnlyList<AccountAudit>> ListByTargetAsync(
        Guid targetUserId,
        int limit,
        CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<AccountAudit>>([]);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
