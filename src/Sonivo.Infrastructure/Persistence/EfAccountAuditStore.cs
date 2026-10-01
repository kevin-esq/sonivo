using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfAccountAuditStore : IAccountAuditStore
{
    private readonly SonivoDbContext _db;

    public EfAccountAuditStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(AccountAudit entry, CancellationToken cancellationToken)
        => await _db.AccountAudits.AddAsync(entry, cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
