using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

/// <summary>
/// Maps an incoming tenant identifier (today: the <c>{slug}</c> segment of
/// <c>/g/{slug}</c>) to its Group. ADR-0045 D1 ships a path-based resolver; a
/// future <c>HostTenantResolver</c> can implement this interface without
/// changing the data model.
/// </summary>
public interface ITenantResolver
{
    /// <summary>Returns the tenant, or null when the slug is unknown/invalid.</summary>
    Task<Group?> ResolveAsync(string slug, CancellationToken cancellationToken);
}

public sealed class PathTenantResolver : ITenantResolver
{
    private readonly IGroupStore _store;

    public PathTenantResolver(IGroupStore store)
    {
        _store = store;
    }

    public Task<Group?> ResolveAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = (slug ?? string.Empty).Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalized))
        {
            return Task.FromResult<Group?>(null);
        }

        return _store.GetByAnySlugAsync(normalized, cancellationToken);
    }
}
