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

    public async Task<IReadOnlyList<Invitation>> ListByGroupAsync(
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return await _db.Invitations
            .AsNoTracking()
            .Where(i => i.GroupId == groupId)
            .ToListAsync(cancellationToken);
    }

    public Task<Invitation?> GetForUpdateAsync(
        Guid groupId,
        Guid invitationId,
        CancellationToken cancellationToken)
        => _db.Invitations.FirstOrDefaultAsync(
            i => i.GroupId == groupId && i.Id == invitationId,
            cancellationToken);

    public Task RemoveAsync(Invitation invitation, CancellationToken cancellationToken)
    {
        _db.Invitations.Remove(invitation);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
