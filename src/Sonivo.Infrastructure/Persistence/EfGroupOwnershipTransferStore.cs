using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Domain.Billing;
using Sonivo.Infrastructure.Payments;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupOwnershipTransferStore(SonivoDbContext db) : IGroupOwnershipTransferStore
{
    public async Task LockGroupAsync(Guid groupId, CancellationToken cancellationToken)
    {
        if (!db.Database.IsNpgsql()) return;
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Ownership transfer requires a transaction.");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({groupId.ToString()}, 0))", cancellationToken);
    }

    public Task<GroupOwnershipTransfer?> FindPendingAsync(Guid groupId, CancellationToken cancellationToken)
        => db.GroupOwnershipTransfers.SingleOrDefaultAsync(x => x.GroupId == groupId
            && x.AcceptedAt == null && x.CancelledAt == null && x.ExpiredAt == null, cancellationToken);

    public Task<GroupOwnershipTransfer?> GetForUpdateAsync(Guid groupId, Guid transferId, CancellationToken cancellationToken)
        => db.GroupOwnershipTransfers.SingleOrDefaultAsync(x => x.GroupId == groupId && x.Id == transferId, cancellationToken);

    public async Task<bool> MoveToActiveSubscriptionAsync(Guid groupId, Guid newOwnerUserId, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var link = await db.BillingGroups.SingleOrDefaultAsync(x => x.GroupId == groupId, cancellationToken);
        if (link is null) return false;
        var source = await db.BillingOrganizations.SingleAsync(x => x.Id == link.OrganizationId, cancellationToken);
        var candidates = await db.BillingOrganizations.Where(x => x.OwnerUserId == newOwnerUserId
                && x.Environment == source.Environment && x.SubscriptionId != null
                && x.Status == "active" && x.PeriodEndsAt > now)
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(cancellationToken);
        foreach (var organization in candidates)
        {
            if (db.Database.IsNpgsql())
            {
                if (db.Database.CurrentTransaction is null)
                    throw new InvalidOperationException("Ownership transfer requires a transaction.");
                var lockIds = new[] { link.OrganizationId, organization.Id }.Distinct().Order().ToArray();
                foreach (var id in lockIds)
                    await db.Database.ExecuteSqlInterpolatedAsync(
                        $"SELECT pg_advisory_xact_lock(hashtextextended({id.ToString()}, 0))", cancellationToken);
            }

            var current = await db.BillingOrganizations.SingleAsync(x => x.Id == organization.Id, cancellationToken);
            if (current.Status != "active" || current.SubscriptionId is null || current.PeriodEndsAt <= now) continue;
            if (await db.BillingGroups.CountAsync(x => x.OrganizationId == current.Id, cancellationToken)
                >= current.GroupCapacity(now)) continue;
            link.OrganizationId = current.Id;
            link.LegacyPlanId = null;
            link.LegacyGrantedAt = null;
            return true;
        }
        return false;
    }

    public Task AddAsync(GroupOwnershipTransfer transfer, CancellationToken cancellationToken)
    {
        db.GroupOwnershipTransfers.Add(transfer);
        return Task.CompletedTask;
    }
}
