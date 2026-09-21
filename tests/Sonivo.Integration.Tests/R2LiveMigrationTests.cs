using Microsoft.Extensions.Options;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Blobs;
using Xunit.Abstractions;

namespace Sonivo.Integration.Tests;

// T-R2-04 (ADR-0035): live Cloudflare R2 exercises. These run ONLY when the
// R2 user env (R2__AccountId / R2__AccessKey / R2__Secret / R2__BucketName) is
// present — local runs exercise real R2; CI has no creds and skips (filesystem
// fallback path stays covered by unit tests + API suite). Keys are unique per
// run under test/ and always cleaned up; orphans stay out of the shared namespace.
public sealed class R2LiveMigrationTests
{
    private readonly ITestOutputHelper _output;

    public R2LiveMigrationTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task Live_R2_roundtrip_still_passes_after_postgres_drop()
    {
        // T-R2-04 regression guard: the table drop must not affect the R2 path.
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

    private static async Task<byte[]> ReadAllAsync(Stream stream)
    {
        await using var owned = stream;
        await using var buffer = new MemoryStream();
        await owned.CopyToAsync(buffer);
        return buffer.ToArray();
    }
}
