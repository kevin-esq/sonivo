using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
using Sonivo.Domain.Billing;

namespace Sonivo.Infrastructure.Payments;

public sealed partial class StripeBillingService
{
    public Task<IReadOnlyList<BillingAccessGrantSummary>> GetAccessGrantsAsync(Guid administratorId,
        Guid organizationId, CancellationToken ct) => data.ExecuteAsUserAsync(administratorId, async token =>
    {
        var organization = await RequireAdminOrganizationAsync(organizationId, token);
        var grants = await db.BillingAccessGrants.AsNoTracking().Where(x => x.OrganizationId == organization.Id)
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(token);
        return (IReadOnlyList<BillingAccessGrantSummary>)grants.Select(Summary).ToArray();
    }, ct);

    public Task<BillingAccessGrantSummary> GrantAccessAsync(Guid administratorId, Guid organizationId,
        BillingAccessGrantCommand command, CancellationToken ct) => data.ExecuteAsUserAsync(administratorId, async token =>
    {
        if (command.OperationId == Guid.Empty) throw new ValidationException("billing-operation-id-required");
        if (!PlanCatalog.IsKnown(command.PlanId)) throw new ValidationException("billing-invalid-selection");
        var fingerprint = Hash(JsonSerializer.Serialize(command));
        await LockAsync(organizationId, token);
        var organization = await RequireAdminOrganizationAsync(organizationId, token);
        var existing = await db.BillingAccessGrants.SingleOrDefaultAsync(x => x.OperationId == command.OperationId, token);
        if (existing is not null)
        {
            if (existing.OrganizationId != organizationId || existing.RequestFingerprint != fingerprint)
                throw new ConflictException("billing-operation-reused");
            return Summary(existing);
        }

        var now = clock.UtcNow;
        if (command.ExpiresAt <= now) throw new ValidationException("billing-grant-expiry-invalid");
        if (await BillingProjection.ActiveGrantAsync(db, organizationId, now, token) is not null)
            throw new ConflictException("billing-grant-already-active");
        var linkedGroups = await db.BillingGroups.CountAsync(x => x.OrganizationId == organizationId, token);
        var groupLimit = PlanCatalog.Get(command.PlanId).Limits.Groups;
        if (groupLimit is { } capacity && linkedGroups > capacity)
            throw new ConflictException("billing-grant-group-capacity-exceeded");

        var grant = BillingAccessGrant.Create(command.OperationId, fingerprint, organizationId,
            command.PlanId, now, command.ExpiresAt, command.Reason, administratorId, now);
        db.BillingAccessGrants.Add(grant);
        Audit(organizationId, administratorId, "access-grant-created");
        await db.SaveChangesAsync(token);
        return Summary(grant);
    }, ct);

    public async Task RevokeAccessGrantAsync(Guid administratorId, Guid organizationId, Guid grantId,
        CancellationToken ct)
    {
        await data.ExecuteAsUserAsync(administratorId, async token =>
        {
            await LockAsync(organizationId, token);
            await RequireAdminOrganizationAsync(organizationId, token);
            var grant = await db.BillingAccessGrants.SingleOrDefaultAsync(x => x.Id == grantId
                && x.OrganizationId == organizationId, token) ?? throw new NotFoundException("Billing grant not found.");
            if (grant.RevokedAt is null)
            {
                grant.Revoke(administratorId, clock.UtcNow);
                Audit(organizationId, administratorId, "access-grant-revoked");
                await db.SaveChangesAsync(token);
            }
            return true;
        }, ct);
    }

    private async Task<BillingOrganization> RequireAdminOrganizationAsync(Guid organizationId, CancellationToken ct)
        => await db.BillingOrganizations.SingleOrDefaultAsync(x => x.Id == organizationId
            && x.Environment == gateway.Environment, ct)
            ?? throw new NotFoundException("Billing account not found.");

    private static BillingAccessGrantSummary Summary(BillingAccessGrant grant)
        => new(grant.Id, grant.OrganizationId, grant.PlanId, grant.StartsAt, grant.ExpiresAt,
            grant.Reason, grant.GrantedByUserId, grant.RevokedAt, grant.RevokedByUserId);
}
