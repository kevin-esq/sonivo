using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Blobs;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

[Collection(PostgresMigrationCollection.Name)]
public sealed class FileResourceCancellationIntegrationTests
{
    [Fact]
    public async Task Canceled_upload_cleans_partial_blob_and_rolls_back_group_operation()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG")
            ?? "Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo_app;Password=sonivo-app-dev-only";
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var db = new SonivoDbContext(options);
        if (!await db.Database.CanConnectAsync())
        {
            if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG")))
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            return;
        }

        var root = Path.Combine(Path.GetTempPath(), "sonivo-rls-blob-cancellation", Guid.NewGuid().ToString("N"));
        var userId = Guid.NewGuid();
        var group = Group.Create($"RLS upload cancellation {Guid.NewGuid():N}", DateTimeOffset.UtcNow);
        var song = Song.Create(group.Id, "Cancellation test", SongOriginKinds.Original, DateTimeOffset.UtcNow);
        var arrangement = Arrangement.Create(group.Id, song.Id, "Default", DateTimeOffset.UtcNow);
        using var cancellation = new CancellationTokenSource();

        try
        {
            await db.Database.OpenConnectionAsync();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var scope = new EfGroupDatabaseScope(db);
            await scope.SetAuthenticatedUserAsync(userId, CancellationToken.None);
            db.Users.Add(new ApplicationUser
            {
                Id = userId,
                UserName = $"rls-upload-{userId:N}@example.test",
                NormalizedUserName = $"RLS-UPLOAD-{userId:N}@EXAMPLE.TEST",
                Email = $"rls-upload-{userId:N}@example.test",
                NormalizedEmail = $"RLS-UPLOAD-{userId:N}@EXAMPLE.TEST",
                EmailConfirmed = true,
                DisplayName = "RLS upload test",
            });
            db.Groups.Add(group);
            db.Memberships.Add(Membership.CreateOwner(group.Id, userId, DateTimeOffset.UtcNow));
            db.Songs.Add(song);
            db.Arrangements.Add(arrangement);
            await db.SaveChangesAsync();

            var handler = new CreateFileResourceHandler(
                new GroupAccessService(new EfGroupStore(db), databaseScope: scope),
                new EfArrangementStore(db),
                new EfResourceStore(db),
                new FileSystemBlobStore(Options.Create(new BlobsOptions { FileSystemDirectory = root })),
                new FixedClock());
            var content = new CancelAfterFirstChunkStream(cancellation);

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => handler.HandleAsync(
                new CreateFileResourceCommand(
                    userId,
                    group.Id,
                    arrangement.Id,
                    "chart",
                    "Chart",
                    null,
                    null,
                    "chart.pdf",
                    "application/pdf",
                    4096,
                    content),
                cancellation.Token));

            Assert.NotNull(db.Database.CurrentTransaction);
            Assert.False(await db.Resources.AnyAsync(resource => resource.ArrangementId == arrangement.Id));
            Assert.Empty(Directory.Exists(root)
                ? Directory.GetFiles(root, "*", SearchOption.AllDirectories)
                : []);

            await transaction.RollbackAsync();
            Assert.False(await db.Groups.AnyAsync(candidate => candidate.Id == group.Id));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    }

    private sealed class CancelAfterFirstChunkStream(CancellationTokenSource cancellation) : Stream
    {
        private bool _firstChunkReturned;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => 4096;
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (!_firstChunkReturned)
            {
                _firstChunkReturned = true;
                buffer.Span[..Math.Min(buffer.Length, 1024)].Fill(0x5A);
                return ValueTask.FromResult(Math.Min(buffer.Length, 1024));
            }

            cancellation.Cancel();
            cancellationToken.ThrowIfCancellationRequested();
            return ValueTask.FromResult(0);
        }

        public override int Read(byte[] buffer, int offset, int count)
            => throw new NotSupportedException();

        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
