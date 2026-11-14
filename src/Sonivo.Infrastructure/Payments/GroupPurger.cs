using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Blobs;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Payments;

public sealed class PurgeSafetyOptions
{
    public const string SectionName = "PurgeSafety";
    public bool Enabled { get; set; }
    public bool BackupRestoreVerified { get; set; }
    public bool TombstoneReplayVerified { get; set; }
    public bool BlobDeletionVerified { get; set; }
    public bool LegacyGroupCleanupEnabled { get; set; }
    public DateTimeOffset? LegacyGroupCreatedBeforeUtc { get; set; }
    public bool IsReady => Enabled && BackupRestoreVerified && TombstoneReplayVerified && BlobDeletionVerified;
}

public sealed class GroupPurger(
    SonivoDbContext db,
    IBlobStore blobs,
    IPurgeLedger ledger,
    IClock clock,
    IConfiguration configuration,
    IOptions<PurgeSafetyOptions> safety,
    IHostEnvironment environment,
    IGroupOperationLock groupLock,
    IPostCommitActionQueue? postCommitActions = null) : IGroupPurger
{
    public bool IsEnabled => environment.IsDevelopment()
        ? blobs is FileSystemBlobStore
        : safety.Value.IsReady && blobs is R2BlobStore;
    public bool IsRetentionEnabled => !environment.IsDevelopment() && safety.Value.IsReady && blobs is R2BlobStore;
    public bool IsReplayEnabled => environment.IsDevelopment()
        ? blobs is FileSystemBlobStore
        : IsRetentionEnabled;

    public async Task PurgeAsync(Guid groupId, Guid? actorUserId, int? expectedVersion, CancellationToken cancellationToken)
    {
        if (!IsEnabled)
            throw new ConflictException("Permanent purge is not enabled until operational safety checks pass.");

        var ownsTransaction = db.Database.CurrentTransaction is null;
        if (!ownsTransaction && postCommitActions is null)
            throw new InvalidOperationException("Purging inside a request transaction requires a post-commit action queue.");
        await using var transaction = ownsTransaction
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        await groupLock.LockAsync(groupId, cancellationToken);
        var group = await LoadForUpdateAsync(groupId, cancellationToken);
        if (group is null) return;
        if (expectedVersion is { } version && (group.Version != version || !group.IsDeleted))
            throw new ConflictException("Group state changed; refresh before deleting.");
        if (actorUserId is null && !await IsRetentionEligibleAsync(group, cancellationToken))
        {
            if (ownsTransaction) await transaction!.CommitAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return;
        }

        var objectKeys = await GetObjectKeysAsync(groupId, cancellationToken);
        var tombstone = new GroupPurgeTombstone(groupId, clock.UtcNow, actorUserId,
            actorUserId is null ? "retention-expired" : "owner-confirmed", objectKeys);
        await ledger.WriteAsync(tombstone, cancellationToken);
        await DeleteRowsAsync(tombstone, cancellationToken);
        if (ownsTransaction) await transaction!.CommitAsync(cancellationToken);
        db.ChangeTracker.Clear();
        if (ownsTransaction)
        {
            await ledger.MarkCommittedAsync(groupId, cancellationToken);
            await DeleteBlobsAsync(tombstone, cancellationToken);
        }
        else
            postCommitActions!.Enqueue(async () =>
            {
                await ledger.MarkCommittedAsync(groupId, CancellationToken.None);
                await DeleteBlobsAsync(tombstone, CancellationToken.None);
            });
    }

    public async Task ReplayAsync(CancellationToken cancellationToken)
    {
        foreach (var tombstone in await ledger.ListAsync(cancellationToken))
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await groupLock.LockAsync(tombstone.GroupId, cancellationToken);
            var groupExists = await LoadForUpdateAsync(tombstone.GroupId, cancellationToken) is not null;
            if (tombstone.Committed && groupExists)
                await DeleteRowsAsync(tombstone, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            db.ChangeTracker.Clear();
            if (!tombstone.Committed && groupExists) continue;
            if (!tombstone.Committed)
                await ledger.MarkCommittedAsync(tombstone.GroupId, cancellationToken);
            await DeleteBlobsAsync(tombstone, cancellationToken);
        }
    }

    public async Task RunRetentionAsync(CancellationToken cancellationToken)
    {
        if (!IsRetentionEnabled) return;
        var now = clock.UtcNow;
        var expiredTrash = await db.Groups.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.DeletedAt != null && x.TrashExpiresAt <= now)
            .Select(x => x.Id).Take(100).ToListAsync(cancellationToken);
        foreach (var groupId in expiredTrash)
            await PurgeAsync(groupId, null, null, cancellationToken);

        if (!string.Equals(configuration["Payments:Provider"], "stripe", StringComparison.OrdinalIgnoreCase)) return;
        var environmentName = configuration["Payments:Stripe:Environment"] ?? "sandbox";
        var candidates = await RetentionCandidates(db, environmentName, now)
            .Take(500).ToListAsync(cancellationToken);
        foreach (var organization in candidates)
        {
            var grantEnd = await BillingProjection.LatestAccessGrantExpiryAsync(db, organization.Id, cancellationToken);
            var deadline = organization.RetentionEndsAt(now, grantEnd);
            if (deadline is null || deadline > now) continue;
            var groups = await db.BillingGroups.AsNoTracking().Where(x => x.OrganizationId == organization.Id)
                .Select(x => x.GroupId).ToListAsync(cancellationToken);
            foreach (var groupId in groups)
                await PurgeAsync(groupId, null, null, cancellationToken);
        }
    }

    public static IQueryable<BillingOrganization> RetentionCandidates(SonivoDbContext db,
        string environmentName, DateTimeOffset now)
    {
        var retentionCutoff = now.AddDays(-90);
        var pastDueRetentionCutoff = retentionCutoff.AddDays(-7);
        return db.BillingOrganizations.AsNoTracking()
            .Where(x => x.Environment == environmentName
                && !(x.Status == "trialing" && (x.TrialEndsAt == null || x.TrialEndsAt > retentionCutoff))
                && !(x.Status == "active" && (x.PeriodEndsAt == null || x.PeriodEndsAt > retentionCutoff))
                && !(x.Status == "past_due" && (x.PastDueSince == null || x.PastDueSince > pastDueRetentionCutoff))
                && !(x.SubscriptionId != null
                    && (x.Status == "canceled" || x.Status == "unpaid" || x.Status == "incomplete_expired" || x.Status == "paused")
                    && (x.PeriodEndsAt == null ? x.UpdatedAt > retentionCutoff : x.PeriodEndsAt > retentionCutoff))
                && !db.BillingAccessGrants.Any(g => g.OrganizationId == x.Id
                    && g.RevokedAt == null && g.ExpiresAt > retentionCutoff)
                && ((x.Status == "trialing" && x.TrialEndsAt <= retentionCutoff)
                    || (x.Status == "active" && x.PeriodEndsAt <= retentionCutoff)
                    || (x.Status == "past_due" && x.PastDueSince <= pastDueRetentionCutoff)
                    || (x.SubscriptionId != null
                        && (x.Status == "canceled" || x.Status == "unpaid" || x.Status == "incomplete_expired" || x.Status == "paused")
                        && (x.PeriodEndsAt == null ? x.UpdatedAt <= retentionCutoff : x.PeriodEndsAt <= retentionCutoff))
                    || db.BillingAccessGrants.Any(g => g.OrganizationId == x.Id
                        && g.RevokedAt == null && g.ExpiresAt <= retentionCutoff)));
    }

    private async Task<Group?> LoadForUpdateAsync(Guid groupId, CancellationToken cancellationToken)
    {
        return await db.Groups
            .FromSqlInterpolated($"SELECT * FROM \"Groups\" WHERE \"Id\" = {groupId} FOR UPDATE")
            .IgnoreQueryFilters()
            .SingleOrDefaultAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<string>> GetObjectKeysAsync(Guid groupId, CancellationToken cancellationToken)
    {
        var resources = await db.Resources.IgnoreQueryFilters().AsNoTracking()
            .Where(x => db.Arrangements.IgnoreQueryFilters().Any(a => a.Id == x.ArrangementId && a.GroupId == groupId)
                && x.ObjectKey != null)
            .Select(x => new { x.Id, x.ObjectKey }).ToListAsync(cancellationToken);
        var keys = new List<string>(resources.Count);
        foreach (var resource in resources)
        {
            var expectedKey = $"resources/{resource.Id:D}";
            if (!string.Equals(resource.ObjectKey, expectedKey, StringComparison.Ordinal))
                throw new InvalidDataException("Group Resource has a non-canonical object key; purge stopped.");
            keys.Add(expectedKey);
        }
        var covers = await db.Songs.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.GroupId == groupId && x.CoverImageObjectKey != null)
            .Select(x => new { x.Id, x.CoverImageObjectKey }).ToListAsync(cancellationToken);
        foreach (var cover in covers)
        {
            var prefix = $"groups/{groupId:N}/songs/{cover.Id:N}/covers/";
            if (cover.CoverImageObjectKey is not { } key || !key.StartsWith(prefix, StringComparison.Ordinal)
                || !Guid.TryParseExact(key[prefix.Length..], "N", out _))
                throw new InvalidDataException("Group Song has a non-canonical cover key; purge stopped.");
            keys.Add(key);
        }
        var branding = await db.GroupBrandings.AsNoTracking().Where(x => x.GroupId == groupId)
            .Select(x => new { x.LogoBlobKey, x.BannerBlobKey, x.FaviconBlobKey })
            .SingleOrDefaultAsync(cancellationToken);
        if (branding is not null)
        {
            AddBrandingKey(keys, branding.LogoBlobKey, groupId, "logo-");
            AddBrandingKey(keys, branding.BannerBlobKey, groupId, "banner-");
            AddBrandingKey(keys, branding.FaviconBlobKey, groupId, "favicon-");
        }
        return keys.Distinct(StringComparer.Ordinal).ToArray();
    }

    private static void AddBrandingKey(List<string> keys, string? key, Guid groupId, string assetPrefix)
    {
        if (key is null) return;
        var prefix = $"group-branding/{groupId}/{assetPrefix}";
        if (!key.StartsWith(prefix, StringComparison.Ordinal)
            || !Guid.TryParseExact(key[prefix.Length..], "N", out _))
            throw new InvalidDataException("Group branding has a non-canonical object key; purge stopped.");
        keys.Add(key);
    }

    private async Task DeleteBlobsAsync(GroupPurgeTombstone tombstone, CancellationToken cancellationToken)
    {
        foreach (var key in tombstone.ObjectKeys)
            await blobs.DeleteAsync(key, cancellationToken);
    }

    private async Task DeleteRowsAsync(GroupPurgeTombstone tombstone, CancellationToken cancellationToken)
    {
        var groupId = tombstone.GroupId;
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Rsvps\" WHERE \"EventId\" IN (SELECT \"Id\" FROM \"Events\" WHERE \"GroupId\" = {groupId})", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"EventSetlistItems\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"SetlistItems\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"SongFavorites\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Resources\" WHERE \"ArrangementId\" IN (SELECT \"Id\" FROM \"Arrangements\" WHERE \"GroupId\" = {groupId})", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE \"Songs\" SET \"DefaultArrangementId\" = NULL WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Arrangements\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Songs\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Events\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Setlists\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Tasks\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Invitations\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Memberships\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"ResourceGrants\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"GroupOwnershipTransfers\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"GroupRoles\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"GroupBranding\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"GroupSlugHistory\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"GroupAuditLog\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"AccountAudit\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Notifications\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE \"BillingOrganizations\" SET \"PrimaryGroupId\" = (SELECT \"GroupId\" FROM \"BillingGroups\" WHERE \"OrganizationId\" = \"BillingOrganizations\".\"Id\" AND \"GroupId\" <> {groupId} ORDER BY \"GroupId\" LIMIT 1), \"UpdatedAt\" = {tombstone.CreatedAt}, \"Version\" = \"Version\" + 1 WHERE \"PrimaryGroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"BillingGroups\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"BillingLegacyGroupNotices\" WHERE \"GroupId\" = {groupId}", cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"Groups\" WHERE \"Id\" = {groupId}", cancellationToken);
    }

    private async Task<bool> IsRetentionEligibleAsync(Group group, CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        if (group.IsDeleted && group.TrashExpiresAt <= now) return true;

        var organizationId = await db.BillingGroups.Where(x => x.GroupId == group.Id)
            .Select(x => (Guid?)x.OrganizationId).SingleOrDefaultAsync(cancellationToken);
        BillingOrganization? organization = null;
        if (organizationId is { } id)
        {
            organization = await db.BillingOrganizations
                .FromSqlInterpolated($"SELECT * FROM \"BillingOrganizations\" WHERE \"Id\" = {id} FOR UPDATE")
                .SingleOrDefaultAsync(cancellationToken);
            if (organization is not null)
            {
                var grantEnd = await BillingProjection.LatestAccessGrantExpiryAsync(db, id, cancellationToken);
                var deadline = organization.RetentionEndsAt(now, grantEnd);
                if (deadline is { } retentionEnd && retentionEnd <= now) return true;
            }
        }

        var notice = await db.BillingLegacyGroupNotices
            .FromSqlInterpolated($"SELECT * FROM \"BillingLegacyGroupNotices\" WHERE \"GroupId\" = {group.Id} FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken);
        if (notice is null || notice.SentAt is null || notice.ExemptedAt is not null
            || notice.PurgeAt is not { } purgeAt || purgeAt > now)
            return false;
        if (organization is not null && (organization.CanCreate(now)
            || await BillingProjection.ActiveGrantAsync(db, organization.Id, now, cancellationToken) is not null))
        {
            notice.ExemptedAt = now;
            await db.SaveChangesAsync(cancellationToken);
            return false;
        }
        return true;
    }

}
