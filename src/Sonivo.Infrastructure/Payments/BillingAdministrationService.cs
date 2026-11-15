using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
using Sonivo.Domain.Billing;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Payments;

public sealed class BillingAdministrationService(SonivoDbContext db, IGroupDataOperation data,
    IGroupDatabaseScope databaseScope, IClock clock, StripeBillingGateway gateway)
    : IBillingAdministrationService
{
    public Task<IReadOnlyList<BillingAdminAccountRow>> ListAccountsAsync(BillingAdminActor actor,
        int page, int pageSize, CancellationToken ct)
    {
        ValidateActor(actor);
        if (page < 1 || pageSize is < 1 or > 100 || page > int.MaxValue / pageSize)
            throw new ValidationException("admin-pagination-invalid");
        return data.ExecuteInTransactionAsync(async token =>
        {
            await databaseScope.SetBillingServiceOrganizationAsync(actor.ServiceId, actor.Permission, null, token);
            var accounts = await db.BillingOrganizations.AsNoTracking()
                .Where(x => x.Environment == actor.Environment)
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new { x.Id, x.PlanId, x.Status, x.CreatedAt,
                    Groups = db.BillingGroups.Count(g => g.OrganizationId == x.Id) })
                .ToListAsync(token);
            return (IReadOnlyList<BillingAdminAccountRow>)accounts.Select(x =>
                new BillingAdminAccountRow(x.Id, x.PlanId, x.Status, x.CreatedAt, x.Groups)).ToArray();
        }, ct);
    }

    public Task<BillingAdminAccountDetails> GetAccountAsync(BillingAdminActor actor, Guid organizationId,
        CancellationToken ct)
    {
        ValidateActor(actor);
        return data.ExecuteInTransactionAsync(async token =>
        {
            await SetOrganizationScope(actor, organizationId, token);
            var org = await RequireOrganization(organizationId, actor.Environment, token);
            var owner = await db.Users.AsNoTracking().Where(x => x.Id == org.OwnerUserId)
                .Select(x => new { x.DisplayName, x.Email }).SingleOrDefaultAsync(token);
            var grant = await BillingProjection.ActiveGrantAsync(db, org.Id, clock.UtcNow, token);
            var suspended = await db.BillingAdminSuspensions.AsNoTracking().SingleOrDefaultAsync(
                x => x.OrganizationId == org.Id && x.Environment == actor.Environment && x.IsSuspended, token);
            var planId = grant?.PlanId ?? org.EffectivePlan(clock.UtcNow);
            var links = await db.BillingGroups.AsNoTracking().Where(x => x.OrganizationId == org.Id)
                .Select(x => x.GroupId).ToListAsync(token);
            var groups = await db.Groups.IgnoreQueryFilters().AsNoTracking().Where(x => links.Contains(x.Id))
                .OrderBy(x => x.CreatedAt).Select(x => new
                {
                    x.Id, x.Name, x.ArchivedAt, x.DeletedAt,
                    Members = db.Memberships.Count(m => m.GroupId == x.Id && m.AccessDisabledAt == null),
                    Songs = db.Songs.Count(s => s.GroupId == x.Id),
                    Setlists = db.Setlists.Count(s => s.GroupId == x.Id),
                    Events = db.Events.Count(e => e.GroupId == x.Id && e.StartsAt >= new DateTimeOffset(clock.UtcNow.Year, clock.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero)
                        && e.StartsAt < new DateTimeOffset(clock.UtcNow.Year, clock.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero).AddMonths(1)),
                    Bytes = (from resource in db.Resources join arrangement in db.Arrangements on resource.ArrangementId equals arrangement.Id
                        where arrangement.GroupId == x.Id select (long?)resource.ByteSize).Sum() ?? 0
                }).ToListAsync(token);
            var status = suspended is not null ? BillingStatuses.AdminSuspended
                : grant is not null ? "temporary_grant" : org.Status;
            return new BillingAdminAccountDetails(org.Id, org.OwnerUserId,
                owner?.DisplayName ?? "", owner?.Email ?? "", org.Environment, planId, org.Status,
                status, org.CreatedAt, org.PeriodEndsAt, org.TrialEndsAt, org.CancelAtPeriodEnd,
                org.CustomerId, org.SubscriptionId, PlanCatalog.Get(planId).Limits,
                PlanCatalog.Get(planId).Features, groups.Select(x => new BillingAdminGroupSummary(
                    x.Id, x.Name, x.ArchivedAt is not null, x.DeletedAt is not null, x.Members,
                    x.Songs, x.Setlists, x.Events, x.Bytes)).ToArray(),
                new(suspended is not null, suspended?.Reason, suspended?.ChangedAt,
                    suspended?.ServiceId, suspended?.AssertedActorId));
        }, ct);
    }

    public Task<IReadOnlyList<BillingAdminPayment>> GetPaymentsAsync(BillingAdminActor actor,
        Guid organizationId, CancellationToken ct)
    {
        ValidateActor(actor);
        return data.ExecuteInTransactionAsync(async token =>
        {
            await SetOrganizationScope(actor, organizationId, token);
            await RequireOrganization(organizationId, actor.Environment, token);
            return (IReadOnlyList<BillingAdminPayment>)await db.BillingFinancialEvents.AsNoTracking()
                .Where(x => x.OrganizationId == organizationId && x.Environment == actor.Environment)
                .OrderByDescending(x => x.EventAt).ThenByDescending(x => x.EventId).Take(500)
                .Select(x => new BillingAdminPayment(x.EventId, x.EventType, x.InvoiceId,
                    x.SubscriptionId, x.PaymentIntentId, x.RefundId, x.DisputeId, x.AmountMinor,
                    x.Currency, x.Status, x.EventAt, x.PeriodStart, x.PeriodEnd)).ToListAsync(token);
        }, ct);
    }

    public Task<BillingAdminReferral> GetReferralsAsync(BillingAdminActor actor,
        Guid organizationId, CancellationToken ct)
    {
        ValidateActor(actor);
        return data.ExecuteInTransactionAsync(async token =>
        {
            await SetOrganizationScope(actor, organizationId, token);
            await RequireOrganization(organizationId, actor.Environment, token);
            var code = await db.BillingReferralCodes.AsNoTracking().Where(x => x.OrganizationId == organizationId
                && x.Environment == actor.Environment).Select(x => x.Code).SingleOrDefaultAsync(token);
            var attribution = await db.BillingReferralAttributions.AsNoTracking()
                .Where(x => x.ReferredOrganizationId == organizationId).Select(x => new
                { x.ReferrerOrganizationId, x.QualifiedInvoiceId, x.QualifiedEventId }).SingleOrDefaultAsync(token);
            var rewards = await db.BillingReferralRewards.AsNoTracking()
                .Where(x => x.Environment == actor.Environment
                    && (x.ReferrerOrganizationId == organizationId || x.ReferredOrganizationId == organizationId))
                .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new BillingAdminReward(x.Id, x.ReferredOrganizationId, x.InvoiceId,
                    x.Days, x.Status, x.PendingReason, x.CreatedAt, x.AppliedAt, x.FreeThrough)).ToArrayAsync(token);
            return new BillingAdminReferral(code, attribution?.ReferrerOrganizationId,
                attribution?.QualifiedInvoiceId, attribution?.QualifiedEventId, rewards);
        }, ct);
    }

    public Task<IReadOnlyList<BillingAccessGrantSummary>> GetGrantsAsync(BillingAdminActor actor,
        Guid organizationId, CancellationToken ct)
    {
        ValidateActor(actor);
        return data.ExecuteInTransactionAsync(async token =>
        {
            await SetOrganizationScope(actor, organizationId, token);
            await RequireOrganization(organizationId, actor.Environment, token);
            var grants = await db.BillingAccessGrants.AsNoTracking().Where(x => x.OrganizationId == organizationId)
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(token);
            return (IReadOnlyList<BillingAccessGrantSummary>)grants.Select(Summary).ToArray();
        }, ct);
    }

    public Task<BillingAdminWriteResult> CreateGrantAsync(BillingAdminActor actor, Guid organizationId,
        string planId, DateTimeOffset expiresAt, string reason, CancellationToken ct)
        => WriteAsync(actor, organizationId, async token =>
        {
            if (!PlanCatalog.IsKnown(planId)) throw new ValidationException("billing-invalid-selection");
            var now = clock.UtcNow;
            if (expiresAt <= now || expiresAt > now.AddDays(90))
                throw new ValidationException("billing-grant-expiry-invalid");
            if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 500)
                throw new ValidationException("billing-grant-reason-required");
            await SetOrganizationScope(actor, organizationId, token);
            await RequireOrganization(organizationId, actor.Environment, token);
            if (await BillingProjection.ActiveGrantAsync(db, organizationId, now, token) is not null)
                throw new ConflictException("billing-grant-already-active");
            var count = await db.BillingGroups.CountAsync(x => x.OrganizationId == organizationId, token);
            var capacity = PlanCatalog.Get(planId).Limits.Groups;
            if (capacity is { } maximum && count > maximum)
                throw new ConflictException("billing-grant-group-capacity-exceeded");
            var grant = BillingAccessGrant.CreateForService(actor.OperationId, actor.RequestFingerprint,
                organizationId, planId, now, expiresAt, reason, actor.ServiceId, actor.ActorId, now);
            db.BillingAccessGrants.Add(grant);
            AddAudit(actor, organizationId, "access-grant-created");
            var result = new BillingAdminWriteResult(actor.OperationId, "created", Summary(grant), null);
            AddOperation(actor, organizationId, result);
            await db.SaveChangesAsync(token);
            return result;
        }, ct);

    public Task<BillingAdminWriteResult> RevokeGrantAsync(BillingAdminActor actor, Guid organizationId,
        Guid grantId, CancellationToken ct) => WriteAsync(actor, organizationId, async token =>
        {
            await SetOrganizationScope(actor, organizationId, token);
            await RequireOrganization(organizationId, actor.Environment, token);
            var grant = await db.BillingAccessGrants.SingleOrDefaultAsync(x => x.Id == grantId
                && x.OrganizationId == organizationId, token) ?? throw new NotFoundException("Billing grant not found.");
            if (grant.RevokedAt is null)
            {
                grant.RevokeByService(actor.ServiceId, actor.ActorId, clock.UtcNow);
                AddAudit(actor, organizationId, "access-grant-revoked");
            }
            var result = new BillingAdminWriteResult(actor.OperationId, "revoked", Summary(grant), null);
            AddOperation(actor, organizationId, result);
            await db.SaveChangesAsync(token);
            return result;
        }, ct);

    public Task<BillingAdminWriteResult> SetSuspensionAsync(BillingAdminActor actor, Guid organizationId,
        bool suspended, string reason, CancellationToken ct) => WriteAsync(actor, organizationId, async token =>
        {
            if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 500)
                throw new ValidationException("billing-admin-reason-required");
            await SetOrganizationScope(actor, organizationId, token);
            var org = await RequireOrganization(organizationId, actor.Environment, token);
            var state = await db.BillingAdminSuspensions.SingleOrDefaultAsync(x =>
                x.OrganizationId == organizationId && x.Environment == actor.Environment, token);
            if (state is null)
            {
                state = new BillingAdminSuspension { OrganizationId = organizationId,
                    Environment = actor.Environment };
                db.BillingAdminSuspensions.Add(state);
            }
            state.IsSuspended = suspended;
            state.Reason = reason.Trim();
            state.ServiceId = actor.ServiceId;
            state.AssertedActorId = actor.ActorId;
            state.ChangedAt = clock.UtcNow;
            foreach (var link in await db.BillingGroups.Where(x => x.OrganizationId == org.Id).ToListAsync(token))
            {
                var group = await db.Groups.IgnoreQueryFilters().SingleAsync(x => x.Id == link.GroupId, token);
                var grant = await BillingProjection.ActiveGrantAsync(db, org.Id, clock.UtcNow, token);
                BillingProjection.Apply(group, link, org, clock.UtcNow, grant, suspended);
            }
            AddAudit(actor, organizationId, suspended ? "access-suspended" : "access-reactivated");
            var summary = new BillingAdminSuspensionSummary(suspended, state.Reason, state.ChangedAt,
                state.ServiceId, state.AssertedActorId);
            var result = new BillingAdminWriteResult(actor.OperationId,
                suspended ? "suspended-read-only" : "reactivated", null, summary);
            AddOperation(actor, organizationId, result);
            await db.SaveChangesAsync(token);
            return result;
        }, ct);

    private async Task<BillingAdminWriteResult> WriteAsync(BillingAdminActor actor, Guid organizationId,
        Func<CancellationToken, Task<BillingAdminWriteResult>> command, CancellationToken ct)
    {
        ValidateActor(actor);
        if (actor.OperationId == Guid.Empty || actor.RequestFingerprint.Length != 64)
            throw new ValidationException("admin-operation-invalid");
        return await data.ExecuteInTransactionAsync(async token =>
        {
            await SetOrganizationScope(actor, organizationId, token);
            await LockOperationAsync(actor, token);
            await LockAsync(organizationId, token);
            var existing = await db.BillingAdminOperations.SingleOrDefaultAsync(x =>
                x.Environment == actor.Environment && x.OperationId == actor.OperationId, token);
            if (existing is not null)
            {
                if (existing.RequestFingerprint != actor.RequestFingerprint)
                    throw new ConflictException("admin-operation-reused");
                return JsonSerializer.Deserialize<BillingAdminWriteResult>(existing.ResultJson)!;
            }
            return await command(token);
        }, ct);
    }

    private void AddOperation(BillingAdminActor actor, Guid organizationId, BillingAdminWriteResult result)
        => db.BillingAdminOperations.Add(new BillingAdminOperation
        {
            Environment = actor.Environment, OperationId = actor.OperationId,
            OrganizationId = organizationId,
            RequestFingerprint = actor.RequestFingerprint, ServiceId = actor.ServiceId,
            AssertedActorId = actor.ActorId, ResultJson = JsonSerializer.Serialize(result),
            CreatedAt = clock.UtcNow
        });

    private void AddAudit(BillingAdminActor actor, Guid organizationId, string action)
        => db.BillingAudit.Add(new BillingAudit
        {
            OrganizationId = organizationId, ActorServiceId = actor.ServiceId,
            AssertedActorId = actor.ActorId, OperationId = actor.OperationId,
            Action = action, CreatedAt = clock.UtcNow
        });

    private async Task SetOrganizationScope(BillingAdminActor actor, Guid organizationId, CancellationToken ct)
    {
        await databaseScope.SetBillingServiceOrganizationAsync(actor.ServiceId, actor.Permission, organizationId, ct);
    }

    private async Task<BillingOrganization> RequireOrganization(Guid id, string environment, CancellationToken ct)
        => await db.BillingOrganizations.SingleOrDefaultAsync(x => x.Id == id && x.Environment == environment, ct)
            ?? throw new NotFoundException("Billing account not found.");

    private async Task LockAsync(Guid organizationId, CancellationToken ct)
    {
        if (!db.Database.IsNpgsql()) return;
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Billing writes require a transaction.");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({organizationId.ToString()}, 0))", ct);
    }

    private async Task LockOperationAsync(BillingAdminActor actor, CancellationToken ct)
    {
        if (!db.Database.IsNpgsql()) return;
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Billing writes require a transaction.");
        var operationKey = $"{actor.Environment}:{actor.OperationId:D}";
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({operationKey}, 1))", ct);
    }

    private void ValidateActor(BillingAdminActor actor)
    {
        if (actor.OperationId == Guid.Empty || actor.ServiceId.Length is < 1 or > 100
            || actor.ActorId.Length is < 1 or > 200 || !BillingAdminPermissions.IsValid(actor.Permission)
            || actor.Environment != gateway.Environment)
            throw new ForbiddenException("Administrative service scope is invalid.");
    }

    private static BillingAccessGrantSummary Summary(BillingAccessGrant grant)
        => new(grant.Id, grant.OrganizationId, grant.PlanId, grant.StartsAt, grant.ExpiresAt,
            grant.Reason, grant.GrantedByUserId, grant.RevokedAt, grant.RevokedByUserId,
            grant.GrantedByServiceId, grant.GrantedByActorId, grant.RevokedByServiceId, grant.RevokedByActorId);
}
