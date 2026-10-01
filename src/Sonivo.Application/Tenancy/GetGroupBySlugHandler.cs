using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

/// <summary>
/// Resolves a Group by its path slug for the requesting user (ADR-0048 D1).
/// Unknown slugs and non-member slugs return the same 404 so the endpoint never
/// reveals whether a group exists.
/// </summary>
public sealed class GetGroupBySlugHandler
{
    private readonly ITenantResolver _resolver;
    private readonly IGroupStore _store;

    public GetGroupBySlugHandler(ITenantResolver resolver, IGroupStore store)
    {
        _resolver = resolver;
        _store = store;
    }

    public async Task<GroupBySlugResult> HandleAsync(Guid userId, string slug, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        var normalized = (slug ?? string.Empty).Trim().ToLowerInvariant();
        var group = await _resolver.ResolveAsync(normalized, cancellationToken);
        if (group is null)
        {
            throw new NotFoundException("Group not found.");
        }

        var membership = await _store.GetMembershipAsync(group.Id, userId, cancellationToken);
        if (membership is null)
        {
            // Same response as an unknown slug: no enumeration.
            throw new NotFoundException("Group not found.");
        }

        var dto = new GroupDto(
            group.Id,
            group.Name,
            group.Version,
            membership.Role,
            group.CreatedAt,
            group.UpdatedAt,
            group.Slug);

        // A historical slug resolves to the same group: the caller should redirect
        // permanently to the current slug.
        return new GroupBySlugResult(dto, !string.Equals(group.Slug, normalized, StringComparison.Ordinal));
    }
}

/// <summary>Result of resolving a path slug; <c>Moved</c> marks a permanent redirect.</summary>
public sealed record GroupBySlugResult(GroupDto Group, bool Moved);
