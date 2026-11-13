using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Notifications;
using Sonivo.Domain.Tasks;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Payments;

/// <summary>Checks creation and shared quotas while the request transaction owns the billing lock.</summary>
public sealed class BillingWriteInterceptor(IClock clock) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        if (eventData.Context?.ChangeTracker.Entries().Any(x => x.State == EntityState.Added && GroupId(x.Entity) is not null) == true)
            throw new InvalidOperationException("Group creation writes require asynchronous billing validation.");
        return result;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
        InterceptionResult<int> result, CancellationToken ct = default)
    {
        if (eventData.Context is not SonivoDbContext db) return result;
        var changed = db.ChangeTracker.Entries().Where(x =>
            (x.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            && !BillingProjectionOnly(x)).ToArray();
        var additions = changed.Where(x => x.State == EntityState.Added).Select(x => x.Entity).ToArray();
        var newGroups = additions.OfType<Group>().ToDictionary(x => x.Id);
        var groupIds = changed.Select(x => GroupId(x.Entity)).Where(x => x is not null).Select(x => x!.Value).ToHashSet();
        var resources = changed.Select(x => x.Entity).OfType<Resource>().ToArray();
        foreach (var resource in resources)
        {
            var arrangement = db.ChangeTracker.Entries<Arrangement>().Select(x => x.Entity).FirstOrDefault(x => x.Id == resource.ArrangementId)
                ?? await db.Arrangements.SingleAsync(x => x.Id == resource.ArrangementId, ct);
            groupIds.Add(arrangement.GroupId);
        }
        foreach (var response in changed.Select(x => x.Entity).OfType<Rsvp>())
        {
            var groupId = await db.Events.Where(x => x.Id == response.EventId).Select(x => (Guid?)x.GroupId)
                .SingleOrDefaultAsync(ct);
            if (groupId is { } id) groupIds.Add(id);
        }
        foreach (var id in groupIds.Order())
        {
            if (newGroups.TryGetValue(id, out var newGroup))
            {
                var linkEntry = db.ChangeTracker.Entries<BillingGroup>()
                    .SingleOrDefault(x => x.Entity.GroupId == id);
                var link = linkEntry?.Entity ?? await db.BillingGroups.SingleOrDefaultAsync(x => x.GroupId == id, ct)
                    ?? throw new ConflictException("billing-not-initialized");
                if (db.Database.IsNpgsql())
                {
                    if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Billing writes require a transaction.");
                    await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({link.OrganizationId.ToString()}, 0))", ct);
                }
                var organization = db.ChangeTracker.Entries<BillingOrganization>()
                    .Select(x => x.Entity).SingleOrDefault(x => x.Id == link.OrganizationId)
                    ?? await db.BillingOrganizations.SingleAsync(x => x.Id == link.OrganizationId, ct);
                var ownerId = additions.OfType<Membership>().Single(x => x.GroupId == id && x.IsOwner).UserId;
                if (organization.OwnerUserId != ownerId) throw new ConflictException("billing-owner-mismatch");
                var groupCount = await db.BillingGroups.CountAsync(x => x.OrganizationId == organization.Id, ct);
                var pendingLink = linkEntry?.State == EntityState.Added ? 1 : 0;
                var grant = await BillingProjection.ActiveGrantAsync(db, organization.Id, clock.UtcNow, ct);
                if (grant is null && !organization.CanCreate(clock.UtcNow))
                    throw new ConflictException("billing-active-plan-required");
                var capacity = grant is null ? organization.GroupCapacity(clock.UtcNow)
                    : PlanCatalog.Get(grant.PlanId).Limits.Groups ?? int.MaxValue;
                if (groupCount + pendingLink > capacity) throw new ConflictException("billing-group-limit");
                newGroup.ProjectBilling(grant?.PlanId ?? organization.EffectivePlan(clock.UtcNow),
                    grant is null ? organization.Status : "temporary_grant", organization.TrialEndsAt,
                    organization.ScheduledPlanId, grant is null && !organization.CanCreate(clock.UtcNow));
                continue;
            }
            var existingLink = await db.BillingGroups.SingleOrDefaultAsync(x => x.GroupId == id, ct)
                ?? throw new ConflictException("billing-not-initialized");
            if (db.Database.IsNpgsql())
            {
                if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Billing writes require a transaction.");
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({existingLink.OrganizationId.ToString()}, 0))", ct);
            }
            var existingOrganization = await db.BillingOrganizations.SingleAsync(x => x.Id == existingLink.OrganizationId, ct);
            var group = await db.Groups.SingleAsync(x => x.Id == id, ct);
            var activeGrant = await BillingProjection.ActiveGrantAsync(db, existingOrganization.Id, clock.UtcNow, ct);
            BillingProjection.Apply(group, existingLink, existingOrganization, clock.UtcNow, activeGrant);
            if (group.BillingStatus == BillingStatuses.ReadOnly) throw new ConflictException("billing-read-only");
            if (group.CreationBlocked) throw new ConflictException("billing-creation-blocked");
            var limits = PlanCatalog.Get(group.PlanId).Limits;
            Check(limits.Songs, await db.Songs.CountAsync(x => x.GroupId == id, ct), additions.OfType<Song>().Count(x => x.GroupId == id));
            Check(limits.Setlists, await db.Setlists.CountAsync(x => x.GroupId == id, ct), additions.OfType<Setlist>().Count(x => x.GroupId == id));
            Check(limits.Members, await db.Memberships.CountAsync(x => x.GroupId == id && x.AccessDisabledAt == null, ct), additions.OfType<Membership>().Count(x => x.GroupId == id));
            var month = new DateTimeOffset(clock.UtcNow.Year, clock.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero);
            Check(limits.EventsPerMonth, await db.Events.CountAsync(x => x.GroupId == id && x.StartsAt >= month && x.StartsAt < month.AddMonths(1) && x.Status != EventStatuses.Cancelled, ct),
                additions.OfType<Event>().Count(x => x.GroupId == id && x.StartsAt >= month && x.StartsAt < month.AddMonths(1)));
            if (resources.Length > 0 && limits.StorageGb is { } storage)
            {
                var ids = group.PlanId == PlanCatalog.Studio
                    ? await db.BillingGroups.Where(x => x.OrganizationId == existingOrganization.Id).Select(x => x.GroupId).ToListAsync(ct) : [id];
                var bytes = await (from resource in db.Resources join arrangement in db.Arrangements on resource.ArrangementId equals arrangement.Id
                    where ids.Contains(arrangement.GroupId) select (long?)resource.ByteSize).SumAsync(ct) ?? 0;
                var added = resources.Sum(x => x.ByteSize ?? 0);
                if (bytes + added > storage * 1024L * 1024 * 1024) throw new ConflictException("billing-storage-limit");
            }
        }
        foreach (var entry in db.ChangeTracker.Entries<Membership>().Where(x => x.State is EntityState.Modified or EntityState.Deleted))
        {
            var member = entry.Entity;
            var organizationId = await db.BillingGroups.Where(x => x.GroupId == member.GroupId).Select(x => (Guid?)x.OrganizationId).SingleOrDefaultAsync(ct);
            if (organizationId is null) continue;
            var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == organizationId, ct);
            if (organization.OwnerUserId == member.UserId && (entry.State == EntityState.Deleted || !member.IsOwner || !member.AccessEnabled))
                throw new ConflictException("billing-owner-must-remain-owner");
            if (entry.State == EntityState.Modified && entry.Property(x => x.AccessDisabledAt).OriginalValue is not null && member.AccessEnabled)
            {
                if (db.Database.IsNpgsql())
                    await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({organization.Id.ToString()}, 0))", ct);
                var link = await db.BillingGroups.SingleAsync(x => x.GroupId == member.GroupId, ct);
                var group = await db.Groups.SingleAsync(x => x.Id == member.GroupId, ct);
                var activeGrant = await BillingProjection.ActiveGrantAsync(db, organization.Id, clock.UtcNow, ct);
                BillingProjection.Apply(group, link, organization, clock.UtcNow, activeGrant);
                if (group.CreationBlocked) throw new ConflictException("billing-creation-blocked");
                Check(PlanCatalog.Get(group.PlanId).Limits.Members,
                    await db.Memberships.CountAsync(x => x.GroupId == member.GroupId && x.AccessDisabledAt == null, ct), 1);
            }
        }
        return result;
    }

    private static Guid? GroupId(object entity) => entity switch
    {
        Group x => x.Id, Song x => x.GroupId, SongFavorite x => x.GroupId, Arrangement x => x.GroupId,
        Setlist x => x.GroupId, SetlistItem x => x.GroupId, Event x => x.GroupId,
        EventSetlistItem x => x.GroupId, GroupTask x => x.GroupId, Membership x => x.GroupId,
        Invitation x => x.GroupId, GroupBranding x => x.GroupId, GroupSlugHistory x => x.GroupId,
        GroupRole x => x.GroupId, ResourceGrant x => x.GroupId, GroupOwnershipTransfer x => x.GroupId,
        Notification x => x.Scope == Sonivo.Domain.Notifications.NotificationScope.Group ? x.GroupId : null,
        _ => null
    };
    private static bool BillingProjectionOnly(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry)
        => entry.Entity is Group && entry.State == EntityState.Modified
            && entry.Properties.Where(x => x.IsModified).All(x => x.Metadata.Name is nameof(Group.PlanId)
                or nameof(Group.BillingStatus) or nameof(Group.TrialEndsAt) or nameof(Group.ScheduledPlanId)
                or nameof(Group.CreationBlocked));
    private static void Check(int? limit, int existing, int added)
    { if (added > 0 && limit is { } maximum && existing + added > maximum) throw new ConflictException("billing-plan-limit"); }
}
