using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IAccountAuditStore
{
    Task AddAsync(AccountAudit entry, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
