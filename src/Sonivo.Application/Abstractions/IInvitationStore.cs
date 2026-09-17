using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IInvitationStore
{
    Task AddAsync(Invitation invitation, CancellationToken cancellationToken);
    Task<Invitation?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken);
    Task<IReadOnlyList<Invitation>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task<Invitation?> GetForUpdateAsync(Guid groupId, Guid invitationId, CancellationToken cancellationToken);
    Task RemoveAsync(Invitation invitation, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
