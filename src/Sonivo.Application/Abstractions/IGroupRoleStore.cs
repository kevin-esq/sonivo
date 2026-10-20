using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

/// <summary>Group-defined roles (ADR-0080), always scoped to one group.</summary>
public interface IGroupRoleStore
{
    Task AddAsync(GroupRole role, CancellationToken cancellationToken);

    Task<IReadOnlyList<GroupRole>> ListByGroupAsync(
        Guid groupId,
        CancellationToken cancellationToken);

    Task<GroupRole?> GetAsync(
        Guid groupId,
        Guid roleId,
        CancellationToken cancellationToken);

    Task<GroupRole?> FindByNameAsync(
        Guid groupId,
        string name,
        CancellationToken cancellationToken);

    void Remove(GroupRole role);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
