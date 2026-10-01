using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record RosterItemDto(
    Guid MemberId,
    Guid? UserId,
    string DisplayName,
    string Role,
    bool HasAccess,
    DateTimeOffset CreatedAt);

public sealed record RosterDto(IReadOnlyList<RosterItemDto> Items);

public sealed record ListRosterQuery(Guid UserId, Guid GroupId);

/// <summary>
/// Owner/member roster: every person in the group, whether or not they have an
/// account (<c>HasAccess</c>). A roster row without an account is never an
/// authenticated member (ADR-0046).
/// </summary>
public sealed class ListRosterHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUserDirectory _directory;

    public ListRosterHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUserDirectory directory)
    {
        _access = access;
        _memberships = memberships;
        _directory = directory;
    }

    public async Task<RosterDto> HandleAsync(ListRosterQuery query, CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(query.GroupId, query.UserId, cancellationToken);

        var rows = await _memberships.ListByGroupAsync(query.GroupId, cancellationToken);
        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).ToList();
        var names = userIds.Count == 0
            ? []
            : (await _directory.GetByIdsAsync(userIds, cancellationToken))
                .ToDictionary(e => e.UserId, e => e.DisplayName);

        var items = rows
            .Select(m =>
            {
                var userId = m.UserId;
                var name = m.DisplayName;
                if (string.IsNullOrWhiteSpace(name) && userId is { } id)
                {
                    names.TryGetValue(id, out var directoryName);
                    name = directoryName;
                }

                return new RosterItemDto(
                    m.Id,
                    userId,
                    string.IsNullOrWhiteSpace(name) ? (userId?.ToString("D") ?? "—") : name!,
                    m.Role,
                    m.HasAccess,
                    m.CreatedAt);
            })
            .OrderByDescending(i => i.Role == MembershipRoles.Owner)
            .ThenBy(i => i.DisplayName, StringComparer.Ordinal)
            .ToList();

        return new RosterDto(items);
    }
}
