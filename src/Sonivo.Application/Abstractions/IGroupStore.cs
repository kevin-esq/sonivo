using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IGroupStore
{
    Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken);
    Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken);
    Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken);
    Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken);
    Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken);
    Task UpdateAsync(Group group, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public sealed record GroupListItem(
    Guid Id,
    string Name,
    string Role,
    int Version,
    DateTimeOffset CreatedAt);
