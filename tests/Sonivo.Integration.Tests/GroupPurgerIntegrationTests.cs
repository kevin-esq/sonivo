using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Blobs;
using Sonivo.Infrastructure.Payments;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

public sealed class GroupPurgerIntegrationTests
{
    [Fact]
    public void Production_filesystem_configuration_disables_purge_retention_and_replay()
    {
        var purger = new GroupPurger(null!, null!, null!, new TestClock(DateTimeOffset.UtcNow),
            new ConfigurationBuilder().Build(), Options.Create(new PurgeSafetyOptions()),
            new TestHostEnvironment { EnvironmentName = Environments.Production }, null!);

        Assert.False(purger.IsEnabled);
        Assert.False(purger.IsRetentionEnabled);
        Assert.False(purger.IsReplayEnabled);
    }

    [Fact]
    public void Development_r2_configuration_disables_purge_retention_and_replay()
    {
        var options = new R2Options { AccountId = "test", AccessKey = "test", Secret = "test", BucketName = "test" };
        using var client = R2BlobStore.CreateClient(options);
        var purger = new GroupPurger(null!, new R2BlobStore(client, Options.Create(options)), null!,
            new TestClock(DateTimeOffset.UtcNow), new ConfigurationBuilder().Build(),
            Options.Create(new PurgeSafetyOptions
            {
                Enabled = true,
                BackupRestoreVerified = true,
                TombstoneReplayVerified = true,
                BlobDeletionVerified = true
            }), new TestHostEnvironment(), null!);

        Assert.False(purger.IsEnabled);
        Assert.False(purger.IsRetentionEnabled);
        Assert.False(purger.IsReplayEnabled);
    }

    [Fact]
    public async Task Postgres_purger_rejects_cross_group_key_and_retention_skips_active_subscription()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG")
            ?? "Host=localhost;Port=5433;Database=sonivo_plans_integration_test;Username=sonivo;Password=sonivo";
        var parsed = new NpgsqlConnectionStringBuilder(connectionString);
        Assert.StartsWith("sonivo_plans_", parsed.Database, StringComparison.Ordinal);

        var options = new DbContextOptionsBuilder<SonivoDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new SonivoDbContext(options);
        await db.Database.MigrateAsync();
        var now = DateTimeOffset.UtcNow;
        var ownerId = Guid.NewGuid();
        var email = $"{ownerId:N}@test.local";
        await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO ""AspNetUsers"" (""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"", ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"", ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"", ""DisplayName"")
VALUES ({ownerId}, {email}, {email.ToUpperInvariant()}, {email}, {email.ToUpperInvariant()}, TRUE, 'x', 'stamp', 'conc', FALSE, FALSE, FALSE, 0, 'Test')
ON CONFLICT (""Id"") DO NOTHING;");
        var group = Group.Create($"Purge test {Guid.NewGuid():N}", now);
        group.SoftDelete(group.Version, now);
        var oldBillingStart = now.AddDays(-200);
        var organization = BillingOrganization.Create(ownerId, group.Id, oldBillingStart);
        organization.StartTrial(PlanCatalog.Pro, oldBillingStart.AddDays(14), oldBillingStart);
        organization.ApplySubscription($"sub_active_{organization.Id:N}", PlanCatalog.Pro, "month", "active", now.AddDays(30),
            oldBillingStart.AddDays(14), false, 0, now.AddDays(-1));
        var staleGrant = BillingAccessGrant.Create(Guid.NewGuid(), new string('a', 64), organization.Id,
            PlanCatalog.Pro, oldBillingStart, now.AddDays(-120), "synthetic historical grant", ownerId, oldBillingStart);
        var song = Song.Create(group.Id, "Synthetic song", SongOriginKinds.Original, now);
        var arrangement = Arrangement.Create(group.Id, song.Id, "Original", now);
        var setlist = Setlist.Create(group.Id, "Synthetic setlist", now);
        var path = Path.Combine(Path.GetTempPath(), "sonivo-purge-test", Guid.NewGuid().ToString("N"));
        var blobs = new FileSystemBlobStore(Options.Create(new BlobsOptions { FileSystemDirectory = path }));
        var resourceId = Guid.NewGuid();
        var resourceKey = $"resources/{resourceId:D}";
        var fileBytes = "synthetic purge test"u8.ToArray();
        var ledger = new BlobPurgeLedger(blobs, blobs);
        await using (var content = new MemoryStream(fileBytes))
            await blobs.PutAsync(resourceKey, content, "text/plain", fileBytes.Length, CancellationToken.None);
        db.Resources.Add(Resource.CreateFile(arrangement.Id, ResourcePurposes.Reference, "Synthetic file",
            "synthetic.txt", "text/plain", fileBytes.Length, resourceKey, now, id: resourceId));
        db.Groups.Add(group);
        db.Memberships.Add(Membership.CreateOwner(group.Id, ownerId, now));
        var branding = GroupBranding.Create(group.Id, now);
        var otherGroupId = Guid.NewGuid();
        var otherGroupBlobKey = $"group-branding/{otherGroupId}/logo-{Guid.NewGuid():N}";
        branding.SetLogo(otherGroupBlobKey, "image/png", now);
        var protectedBytes = "other group's branding"u8.ToArray();
        await using (var protectedContent = new MemoryStream(protectedBytes))
            await blobs.PutAsync(otherGroupBlobKey, protectedContent, "image/png", protectedBytes.Length,
                CancellationToken.None);
        db.GroupBrandings.Add(branding);
        db.Songs.Add(song);
        db.Arrangements.Add(arrangement);
        db.Setlists.Add(setlist);
        db.BillingOrganizations.Add(organization);
        db.BillingGroups.Add(new BillingGroup { GroupId = group.Id, OrganizationId = organization.Id });
        db.BillingAccessGrants.Add(staleGrant);
        await db.SaveChangesAsync();

        var retentionCandidates = await GroupPurger.RetentionCandidates(db, "sandbox", now)
            .Select(x => x.Id).ToListAsync();
        Assert.DoesNotContain(organization.Id, retentionCandidates);

        var postCommitActions = new TestPostCommitActionQueue();
        var purger = new GroupPurger(db, blobs, ledger, new TestClock(now),
            new ConfigurationBuilder().Build(), Options.Create(new PurgeSafetyOptions()), new TestHostEnvironment(),
            new EfGroupOperationLock(db), postCommitActions);
        await Assert.ThrowsAsync<InvalidDataException>(() =>
            purger.PurgeAsync(group.Id, ownerId, group.Version, CancellationToken.None));
        Assert.True(await db.Groups.IgnoreQueryFilters().AnyAsync(x => x.Id == group.Id));
        var protectedBlob = await blobs.GetAsync(resourceKey, CancellationToken.None);
        Assert.NotNull(protectedBlob);
        await protectedBlob.Content.DisposeAsync();
        var foreignBlob = await blobs.GetAsync(otherGroupBlobKey, CancellationToken.None);
        Assert.NotNull(foreignBlob);
        await foreignBlob.Content.DisposeAsync();

        branding.RemoveLogo(now);
        await db.SaveChangesAsync();

        var rollbackActions = new TestPostCommitActionQueue();
        var rollbackPurger = new GroupPurger(db, blobs, ledger, new TestClock(now),
            new ConfigurationBuilder().Build(), Options.Create(new PurgeSafetyOptions()), new TestHostEnvironment(),
            new EfGroupOperationLock(db), rollbackActions);
        await using (var rollbackTransaction = await db.Database.BeginTransactionAsync())
        {
            await rollbackPurger.PurgeAsync(group.Id, ownerId, group.Version, CancellationToken.None);
            await rollbackTransaction.RollbackAsync();
        }
        await rollbackPurger.ReplayAsync(CancellationToken.None);
        Assert.True(await db.Groups.IgnoreQueryFilters().AnyAsync(x => x.Id == group.Id));
        var rollbackBlob = await blobs.GetAsync(resourceKey, CancellationToken.None);
        Assert.NotNull(rollbackBlob);
        await rollbackBlob.Content.DisposeAsync();

        await using var requestTransaction = await db.Database.BeginTransactionAsync();
        await purger.PurgeAsync(group.Id, ownerId, group.Version, CancellationToken.None);
        var pendingBlob = await blobs.GetAsync(resourceKey, CancellationToken.None);
        Assert.NotNull(pendingBlob);
        await pendingBlob.Content.DisposeAsync();
        await requestTransaction.CommitAsync();
        await postCommitActions.ExecuteAsync();

        Assert.False(await db.Groups.IgnoreQueryFilters().AnyAsync(x => x.Id == group.Id));
        Assert.False(await db.Songs.IgnoreQueryFilters().AnyAsync(x => x.GroupId == group.Id));
        Assert.False(await db.Arrangements.IgnoreQueryFilters().AnyAsync(x => x.GroupId == group.Id));
        Assert.False(await db.Memberships.AnyAsync(x => x.GroupId == group.Id));
        Assert.False(await db.BillingGroups.AnyAsync(x => x.GroupId == group.Id));
        Assert.NotNull(await db.BillingOrganizations.SingleOrDefaultAsync(x => x.Id == organization.Id));
        Assert.Null(await blobs.GetAsync(resourceKey, CancellationToken.None));
        await blobs.DeleteAsync(otherGroupBlobKey, CancellationToken.None);
        var committedTombstone = Assert.Single(await ledger.ListAsync(CancellationToken.None));
        Assert.True(committedTombstone.Committed);
        Assert.Equal(resourceKey, Assert.Single(committedTombstone.ObjectKeys));

        var replayKey = $"resources/{Guid.NewGuid():D}";
        await using (var content = new MemoryStream(fileBytes))
            await blobs.PutAsync(replayKey, content, "text/plain", fileBytes.Length, CancellationToken.None);
        await ledger.WriteAsync(new GroupPurgeTombstone(Guid.NewGuid(), now, null, "backup-replay", [replayKey]), CancellationToken.None);
        await purger.ReplayAsync(CancellationToken.None);
        Assert.Null(await blobs.GetAsync(replayKey, CancellationToken.None));

        await db.BillingAudit.Where(x => x.OrganizationId == organization.Id).ExecuteDeleteAsync();
        await db.BillingAccessGrants.Where(x => x.OrganizationId == organization.Id).ExecuteDeleteAsync();
        await db.BillingOrganizations.Where(x => x.Id == organization.Id).ExecuteDeleteAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"AspNetUsers\" WHERE \"Id\" = {ownerId}");
        Directory.Delete(path, recursive: true);
    }

    private sealed class TestClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class TestPostCommitActionQueue : IPostCommitActionQueue
    {
        private readonly List<Func<Task>> _actions = [];

        public void Enqueue(Func<Task> action) => _actions.Add(action);

        public async Task ExecuteAsync()
        {
            foreach (var action in _actions) await action();
            _actions.Clear();
        }
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Sonivo.Tests";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
