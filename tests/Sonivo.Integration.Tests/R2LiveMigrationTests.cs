using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Blobs;
using Sonivo.Infrastructure.Persistence;
using Xunit.Abstractions;

namespace Sonivo.Integration.Tests;

// T-R2-02 (ADR-0035): live Cloudflare R2 exercises. These run ONLY when the
// R2 user env (R2__AccountId / R2__AccessKey / R2__Secret / R2__BucketName) is
// present — local runs exercise real R2; CI has no creds and skips (Postgres
// path stays covered by the API suite). Keys are unique per run under test/
// and always cleaned up; orphans stay out of the shared namespace.
public sealed class R2LiveMigrationTests
{
    private readonly ITestOutputHelper _output;

    public R2LiveMigrationTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task Live_R2_put_get_delete_roundtrip()
    {
        if (!TryGetOptions(out var options, out var skip))
        {
            _output.WriteLine($"SKIPPED: {skip}");
            return;
        }

        using var client = R2BlobStore.CreateClient(options);
        var store = new R2BlobStore(client, Options.Create(options));
        var key = $"test/r2-roundtrip-{Guid.NewGuid():N}";
        var payload = "live r2 bytes"u8.ToArray();

        try
        {
            await store.PutAsync(key, new MemoryStream(payload), "text/plain", payload.Length, CancellationToken.None);

            var blob = await store.GetAsync(key, CancellationToken.None);
            Assert.NotNull(blob);
            Assert.Equal(payload, await ReadAllAsync(blob!.Content));
            Assert.Equal(payload.Length, blob.ByteSize);

            await store.DeleteAsync(key, CancellationToken.None);
            Assert.Null(await store.GetAsync(key, CancellationToken.None));
            _output.WriteLine("Live R2 roundtrip executed successfully.");
        }
        finally
        {
            try
            {
                await store.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _output.WriteLine($"Cleanup delete failed: {ex.Message}");
            }
        }
    }

    [Fact]
    public async Task Live_R2_dualread_backfill_keeps_postgres_row()
    {
        if (!TryGetOptions(out var options, out var skip))
        {
            _output.WriteLine($"SKIPPED: {skip}");
            return;
        }

        using var client = R2BlobStore.CreateClient(options);
        var primary = new R2BlobStore(client, Options.Create(options));
        await using var db = CreateBlobDb();
        var fallback = new PostgresBlobStore(db, new SystemClock());
        var store = new DualReadBlobStore(
            primary, fallback, NullLogger<DualReadBlobStore>.Instance);

        var key = $"test/r2-backfill-{Guid.NewGuid():N}";
        var payload = "legacy pg bytes"u8.ToArray();
        await fallback.PutAsync(key, new MemoryStream(payload), "text/plain", payload.Length, CancellationToken.None);

        try
        {
            var blob = await store.GetAsync(key, CancellationToken.None);
            Assert.NotNull(blob);
            Assert.Equal(payload, await ReadAllAsync(blob!.Content));

            // Lazy backfill landed in R2…
            var direct = await primary.GetAsync(key, CancellationToken.None);
            Assert.NotNull(direct);
            Assert.Equal(payload, await ReadAllAsync(direct!.Content));

            // …and the Postgres row is kept (ResourceBlobs NEVER dropped in this slice).
            Assert.NotNull(await fallback.GetAsync(key, CancellationToken.None));
            _output.WriteLine("Live R2 dual-read backfill executed successfully.");
        }
        finally
        {
            try
            {
                await primary.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _output.WriteLine($"Cleanup R2 delete failed: {ex.Message}");
            }

            try
            {
                await fallback.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _output.WriteLine($"Cleanup Postgres delete failed: {ex.Message}");
            }
        }
    }

    private static bool TryGetOptions(out R2Options options, out string? skipReason)
    {
        options = new R2Options
        {
            AccountId = Environment.GetEnvironmentVariable("R2__AccountId") ?? string.Empty,
            AccessKey = Environment.GetEnvironmentVariable("R2__AccessKey") ?? string.Empty,
            Secret = Environment.GetEnvironmentVariable("R2__Secret") ?? string.Empty,
            BucketName = Environment.GetEnvironmentVariable("R2__BucketName") ?? string.Empty
        };

        if (!options.IsComplete)
        {
            skipReason = "R2 user env (R2__AccountId/R2__AccessKey/R2__Secret/R2__BucketName) not configured.";
            return false;
        }

        skipReason = null;
        return true;
    }

    private static SonivoDbContext CreateBlobDb()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-r2live-{Guid.NewGuid():N}")
            .Options;
        return new SonivoDbContext(options);
    }

    private static async Task<byte[]> ReadAllAsync(Stream stream)
    {
        await using var owned = stream;
        await using var buffer = new MemoryStream();
        await owned.CopyToAsync(buffer);
        return buffer.ToArray();
    }
}
