namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Read-side seam for tenant branding. Kept deliberately narrow (one lookup) so
/// the in-memory sandbox store can be swapped for an EF Core implementation
/// without touching the endpoint.
/// </summary>
public interface IBrandingReader
{
    /// <summary>
    /// Finds the branding for a tenant slug. Slugs are case-insensitive; the
    /// caller is responsible for syntactic validation.
    /// </summary>
    ValueTask<TenantBranding?> FindBySlugAsync(string slug, CancellationToken cancellationToken);
}
