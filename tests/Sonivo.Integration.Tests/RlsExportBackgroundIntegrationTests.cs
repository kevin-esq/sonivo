using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Reports;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

[Collection(PostgresMigrationCollection.Name)]
public sealed class RlsExportBackgroundIntegrationTests
{
    [Fact]
    public async Task Group_repertoire_report_returns_only_owned_group_counts_and_hides_unrelated_group()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var unrelatedOwnerId = Guid.NewGuid();
        var ownedGroup = Group.Create($"RLS report owned {Guid.NewGuid():N}", now);
        var unrelatedGroup = Group.Create($"RLS report unrelated {Guid.NewGuid():N}", now);
        var ownedSong = Song.Create(ownedGroup.Id, "Owned song", SongOriginKinds.Original, now);
        var unrelatedSong = Song.Create(unrelatedGroup.Id, "Unrelated song", SongOriginKinds.Original, now);
        var ownedArrangement = Arrangement.Create(ownedGroup.Id, ownedSong.Id, "Owned arrangement", now);
        var unrelatedArrangement = Arrangement.Create(unrelatedGroup.Id, unrelatedSong.Id, "Unrelated arrangement", now);
        var ownedFile = Resource.CreateFile(
            ownedArrangement.Id, ResourcePurposes.Audio, "Owned audio", "owned.mp3", "audio/mpeg", 128,
            $"rls-report/{Guid.NewGuid():N}/owned.mp3", now);
        var ownedLink = Resource.CreateLink(
            ownedArrangement.Id, ResourcePurposes.Chart, "Owned chart", "https://example.test/owned-chart", now);
        var unrelatedFile = Resource.CreateFile(
            unrelatedArrangement.Id, ResourcePurposes.Audio, "Unrelated audio", "unrelated.mp3", "audio/mpeg", 128,
            $"rls-report/{Guid.NewGuid():N}/unrelated.mp3", now);
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;

        try
        {
            await using (var ownerDb = new SonivoDbContext(ownerOptions))
            {
                await ownerDb.Database.MigrateAsync();
                ownerDb.Users.AddRange(User(userId), User(unrelatedOwnerId));
                ownerDb.Groups.AddRange(ownedGroup, unrelatedGroup);
                ownerDb.Memberships.AddRange(
                    Membership.CreateOwner(ownedGroup.Id, userId, now),
                    Membership.CreateOwner(unrelatedGroup.Id, unrelatedOwnerId, now));
                ownerDb.Songs.AddRange(ownedSong, unrelatedSong);
                ownerDb.Arrangements.AddRange(ownedArrangement, unrelatedArrangement);
                ownerDb.Resources.AddRange(ownedFile, ownedLink, unrelatedFile);
                await ownerDb.SaveChangesAsync();
            }

            var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
                .UseNpgsql(runtimeConnectionString)
                .Options;
            await using var runtimeDb = new SonivoDbContext(runtimeOptions);
            await runtimeDb.Database.OpenConnectionAsync();
            await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
            var scope = new EfGroupDatabaseScope(runtimeDb);
            await scope.SetAuthenticatedUserAsync(userId, CancellationToken.None);
            var handler = new GroupReportsHandler(
                new GroupAccessService(new EfGroupStore(runtimeDb), databaseScope: scope),
                new EfGroupReportStore(runtimeDb));

            var report = await handler.GetRepertoireAsync(userId, ownedGroup.Id, CancellationToken.None);

            Assert.Equal(1, report.Songs);
            Assert.Equal(1, report.Arrangements);
            Assert.Equal(1, report.Files);
            Assert.Equal(1, report.Links);
            Assert.Equal(
                new[] { new ResourcePurposeReportCount(ResourcePurposes.Audio, 1), new ResourcePurposeReportCount(ResourcePurposes.Chart, 1) },
                report.ResourcesByPurpose);
            await Assert.ThrowsAsync<NotFoundException>(
                () => handler.GetRepertoireAsync(userId, unrelatedGroup.Id, CancellationToken.None));
            await transaction.RollbackAsync();
        }
        finally
        {
            await using var cleanupDb = new SonivoDbContext(ownerOptions);
            var arrangementIds = new[] { ownedArrangement.Id, unrelatedArrangement.Id };
            cleanupDb.Resources.RemoveRange(await cleanupDb.Resources
                .Where(resource => arrangementIds.Contains(resource.ArrangementId))
                .ToListAsync());
            cleanupDb.Arrangements.RemoveRange(await cleanupDb.Arrangements
                .Where(arrangement => arrangementIds.Contains(arrangement.Id))
                .ToListAsync());
            cleanupDb.Songs.RemoveRange(await cleanupDb.Songs
                .Where(song => song.Id == ownedSong.Id || song.Id == unrelatedSong.Id)
                .ToListAsync());
            cleanupDb.Memberships.RemoveRange(await cleanupDb.Memberships
                .Where(membership => membership.UserId == userId || membership.UserId == unrelatedOwnerId)
                .ToListAsync());
            cleanupDb.Groups.RemoveRange(await cleanupDb.Groups
                .Where(group => group.Id == ownedGroup.Id || group.Id == unrelatedGroup.Id)
                .ToListAsync());
            cleanupDb.Users.RemoveRange(await cleanupDb.Users
                .Where(user => user.Id == userId || user.Id == unrelatedOwnerId)
                .ToListAsync());
            await cleanupDb.SaveChangesAsync();
        }
    }

    [Fact]
    public async Task Digitize_runner_processes_owned_group_resource_but_rejects_foreign_resource_before_blob_access()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var firstGroup = Group.Create($"RLS digitize first {Guid.NewGuid():N}", now);
        var foreignGroup = Group.Create($"RLS digitize foreign {Guid.NewGuid():N}", now);
        var firstSong = Song.Create(firstGroup.Id, "First song", SongOriginKinds.Original, now);
        var foreignSong = Song.Create(foreignGroup.Id, "Foreign song", SongOriginKinds.Original, now);
        var firstArrangement = Arrangement.Create(firstGroup.Id, firstSong.Id, "First arrangement", now);
        var foreignArrangement = Arrangement.Create(foreignGroup.Id, foreignSong.Id, "Foreign arrangement", now);
        var firstResource = Resource.CreateFile(
            firstArrangement.Id, ResourcePurposes.Audio, "First audio", "first.wav", "audio/wav", 128,
            $"rls-digitize/{Guid.NewGuid():N}/first.wav", now);
        var foreignResource = Resource.CreateFile(
            foreignArrangement.Id, ResourcePurposes.Audio, "Foreign audio", "foreign.wav", "audio/wav", 128,
            $"rls-digitize/{Guid.NewGuid():N}/foreign.wav", now);
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;

        try
        {
            await using (var ownerDb = new SonivoDbContext(ownerOptions))
            {
                await ownerDb.Database.MigrateAsync();
                ownerDb.Users.Add(User(userId));
                ownerDb.Groups.AddRange(firstGroup, foreignGroup);
                ownerDb.Memberships.AddRange(
                    Membership.CreateOwner(firstGroup.Id, userId, now),
                    Membership.CreateOwner(foreignGroup.Id, userId, now));
                ownerDb.Songs.AddRange(firstSong, foreignSong);
                ownerDb.Arrangements.AddRange(firstArrangement, foreignArrangement);
                ownerDb.Resources.AddRange(firstResource, foreignResource);
                await ownerDb.SaveChangesAsync();
            }

            var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
                .UseNpgsql(runtimeConnectionString)
                .Options;
            await using var runtimeDb = new SonivoDbContext(runtimeOptions);
            await runtimeDb.Database.OpenConnectionAsync();
            await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
            var scope = new EfGroupDatabaseScope(runtimeDb);
            var groups = new EfGroupStore(runtimeDb);
            var access = new GroupAccessService(groups, databaseScope: scope);
            var jobs = new InMemoryDigitizeJobStore(new FixedClock(now.AddMinutes(1)));
            var blobStore = new CountingBlobStore();
            var transcriber = new CountingTranscriber();
            var runner = new DigitizeJobRunner(
                jobs,
                access,
                new EfGroupDataOperation(runtimeDb, scope),
                new EfArrangementStore(runtimeDb),
                new EfResourceStore(runtimeDb),
                blobStore,
                transcriber,
                Options.Create(new DigitizeOptions { MaxAudioSeconds = 120 }),
                new FixedClock(now.AddMinutes(1)),
                NullLogger<DigitizeJobRunner>.Instance);

            var ownJob = jobs.Create(userId, firstGroup.Id, firstArrangement.Id, firstResource.Id, now.AddMinutes(1));
            await runner.ProcessAsync(ownJob.Id, CancellationToken.None);

            Assert.Equal(DigitizeJobStatus.Done, ownJob.Status);
            var segment = Assert.Single(ownJob.Segments);
            Assert.Equal(new DigitizeJobSegment(100, 250, "recognized words"), segment);
            Assert.Equal(1, blobStore.GetCalls);
            Assert.Equal(1, transcriber.Calls);

            var foreignJob = jobs.Create(userId, firstGroup.Id, firstArrangement.Id, foreignResource.Id, now.AddMinutes(1));
            await runner.ProcessAsync(foreignJob.Id, CancellationToken.None);

            Assert.Equal(DigitizeJobStatus.Failed, foreignJob.Status);
            Assert.Equal(DigitizeJobErrorCodes.ResourceUnavailable, foreignJob.ErrorCode);
            Assert.Equal(1, blobStore.GetCalls);
            Assert.Equal(1, transcriber.Calls);
            await transaction.RollbackAsync();
        }
        finally
        {
            await using var cleanupDb = new SonivoDbContext(ownerOptions);
            var arrangementIds = new[] { firstArrangement.Id, foreignArrangement.Id };
            cleanupDb.Resources.RemoveRange(await cleanupDb.Resources
                .Where(resource => arrangementIds.Contains(resource.ArrangementId))
                .ToListAsync());
            cleanupDb.Arrangements.RemoveRange(await cleanupDb.Arrangements
                .Where(arrangement => arrangementIds.Contains(arrangement.Id))
                .ToListAsync());
            cleanupDb.Songs.RemoveRange(await cleanupDb.Songs
                .Where(song => song.Id == firstSong.Id || song.Id == foreignSong.Id)
                .ToListAsync());
            cleanupDb.Memberships.RemoveRange(await cleanupDb.Memberships
                .Where(membership => membership.UserId == userId
                    && (membership.GroupId == firstGroup.Id || membership.GroupId == foreignGroup.Id))
                .ToListAsync());
            cleanupDb.Groups.RemoveRange(
                await cleanupDb.Groups.Where(group => group.Id == firstGroup.Id || group.Id == foreignGroup.Id).ToListAsync());
            cleanupDb.Users.RemoveRange(await cleanupDb.Users.Where(user => user.Id == userId).ToListAsync());
            await cleanupDb.SaveChangesAsync();
        }
    }

    [Fact]
    public async Task Own_data_export_reads_only_the_authenticated_users_groups_and_audit()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var firstGroup = Group.Create($"RLS export first {Guid.NewGuid():N}", now);
        var secondGroup = Group.Create($"RLS export second {Guid.NewGuid():N}", now);
        var otherGroup = Group.Create($"RLS export foreign {Guid.NewGuid():N}", now);
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;

        try
        {
            await using (var ownerDb = new SonivoDbContext(ownerOptions))
            {
                await ownerDb.Database.MigrateAsync();
                ownerDb.Users.AddRange(User(userId), User(otherUserId));
                ownerDb.Groups.AddRange(firstGroup, secondGroup, otherGroup);
                ownerDb.Memberships.AddRange(
                    Membership.CreateOwner(firstGroup.Id, userId, now),
                    Membership.CreateMember(secondGroup.Id, userId, now),
                    Membership.CreateOwner(otherGroup.Id, otherUserId, now));
                ownerDb.AccountAudits.AddRange(
                    AccountAudit.Create(AccountAudit.ActionAccessCreated, now, actorUserId: userId, targetUserId: userId, groupId: firstGroup.Id),
                    AccountAudit.Create(AccountAudit.ActionAccessCreated, now, actorUserId: otherUserId, targetUserId: otherUserId, groupId: otherGroup.Id));
                await ownerDb.SaveChangesAsync();
            }

            var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
                .UseNpgsql(runtimeConnectionString)
                .Options;
            await using var runtimeDb = new SonivoDbContext(runtimeOptions);
            await runtimeDb.Database.OpenConnectionAsync();
            await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
            var scope = new EfGroupDatabaseScope(runtimeDb);
            await scope.SetAuthenticatedUserAsync(userId, CancellationToken.None);
            var handler = new ExportOwnDataHandler(
                new EfGroupStore(runtimeDb),
                new EfAccountAuditStore(runtimeDb),
                new FixedClock(now.AddMinutes(1)),
                scope);

            var export = await handler.HandleAsync(
                new ExportOwnDataQuery(userId, "member@example.test", "Member", true, false, null),
                CancellationToken.None);

            Assert.Equal(userId, export.UserId);
            Assert.Equal(new[] { firstGroup.Id, secondGroup.Id }.Order(), export.Memberships.Select(m => m.GroupId).Order());
            Assert.DoesNotContain(export.Memberships, membership => membership.GroupId == otherGroup.Id);
            Assert.Single(export.AccountAudit);
            Assert.Equal(AccountAudit.ActionAccessCreated, export.AccountAudit[0].Action);
            await transaction.RollbackAsync();
        }
        finally
        {
            await using var cleanupDb = new SonivoDbContext(ownerOptions);
            cleanupDb.AccountAudits.RemoveRange(await cleanupDb.AccountAudits
                .Where(audit => audit.ActorUserId == userId || audit.ActorUserId == otherUserId
                    || audit.TargetUserId == userId || audit.TargetUserId == otherUserId)
                .ToListAsync());
            cleanupDb.Memberships.RemoveRange(await cleanupDb.Memberships
                .Where(membership => membership.UserId == userId || membership.UserId == otherUserId)
                .ToListAsync());
            cleanupDb.Groups.RemoveRange(await cleanupDb.Groups
                .Where(group => group.Id == firstGroup.Id || group.Id == secondGroup.Id || group.Id == otherGroup.Id)
                .ToListAsync());
            cleanupDb.Users.RemoveRange(await cleanupDb.Users
                .Where(user => user.Id == userId || user.Id == otherUserId)
                .ToListAsync());
            await cleanupDb.SaveChangesAsync();
        }
    }

    private static ApplicationUser User(Guid id)
        => new()
        {
            Id = id,
            UserName = $"{id:N}@example.test",
            NormalizedUserName = $"{id:N}@EXAMPLE.TEST",
            Email = $"{id:N}@example.test",
            NormalizedEmail = $"{id:N}@EXAMPLE.TEST",
            DisplayName = "RLS export integration test"
        };

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow => now;
    }

    private sealed class CountingBlobStore : IBlobStore
    {
        public int GetCalls { get; private set; }

        public Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken)
        {
            GetCalls++;
            return Task.FromResult<BlobContent?>(new BlobContent(new MemoryStream([1, 2, 3]), "audio/mpeg", 3));
        }

        public Task PutAsync(string objectKey, Stream content, string contentType, long byteSize, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
            => throw new NotSupportedException();
    }

    private sealed class CountingTranscriber : IAudioTranscriber
    {
        public int Calls { get; private set; }

        public Task<IReadOnlyList<TranscribedSegment>> TranscribeAsync(
            Stream audio,
            string contentType,
            CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult<IReadOnlyList<TranscribedSegment>>([new TranscribedSegment(100, 250, "recognized words")]);
        }
    }
}
