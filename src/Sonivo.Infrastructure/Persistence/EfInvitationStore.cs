using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfInvitationStore : IInvitationStore
{
    private readonly SonivoDbContext _db;

    public EfInvitationStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task AddAsync(Invitation invitation, CancellationToken cancellationToken)
        => _db.Invitations.AddAsync(invitation, cancellationToken).AsTask();

    public Task<Invitation?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken)
        => _db.Invitations.FirstOrDefaultAsync(i => i.TokenHash == tokenHash, cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
