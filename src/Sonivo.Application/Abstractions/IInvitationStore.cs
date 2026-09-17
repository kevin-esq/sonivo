using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IInvitationStore
{
    Task AddAsync(Invitation invitation, CancellationToken cancellationToken);
    Task<Invitation?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
