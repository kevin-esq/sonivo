using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IGroupStore
{
    Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken);
    Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken);
    Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken);
    Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken);
    Task<Group?> GetBySlugAsync(string slug, CancellationToken cancellationToken) =>
        Task.FromResult<Group?>(null);
    Task<bool> SlugExistsAsync(string slug, CancellationToken cancellationToken) =>
        Task.FromResult(false);
    Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken);
    Task UpdateAsync(Group group, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public sealed record GroupListItem(
    Guid Id,
    string Name,
    /// <summary>Immutable path slug (ADR-0048 D1); null only while backfill is pending.</summary>
    string? Slug,
    string Role,
    int Version,
    DateTimeOffset CreatedAt,
    /// <summary>Live membership count, including the requesting user.</summary>
    int MemberCount,
    /// <summary>Earliest upcoming, non-hidden event, or null when the group has none.</summary>
    DateTimeOffset? NextEventAt,
    /// <summary>
    /// Most recent activity: the group row itself or its live repertoire (songs) and agenda (events).
    /// Used only for the "recent activity" ordering on the groups list.
    /// </summary>
    DateTimeOffset? LastActivityAt);
