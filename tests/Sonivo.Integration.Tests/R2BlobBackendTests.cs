using System.Net;
using System.Net.Http.Headers;
using Amazon.Runtime;
using Amazon.S3;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Blobs;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

// T-R2-01 (ADR-0035): R2 backend selection + key mapping. No network: the S3
// client is intercepted at the HttpClient level; live R2 lives in T-R2-02 tests.
public sealed class R2BlobBackendTests
{
    [Theory]
    [InlineData("", "", "", "")]
    [InlineData("acct", "", "", "")]
    [InlineData("acct", "key", "", "")]
    [InlineData("acct", "key", "secret", "")]
    [InlineData("  ", "key", "secret", "sonivo-blobs")]
    [InlineData("acct", "key", "secret", "  ")]
    public void R2Options_requires_all_four_values(
        string accountId, string accessKey, string secret, string bucketName)
    {
        var options = new R2Options
        {
            AccountId = accountId,
            AccessKey = accessKey,
            Secret = secret,
            BucketName = bucketName
        };

        Assert.False(options.IsComplete);
    }

    [Fact]
    public void R2Options_complete_when_all_four_present()
    {
        var options = new R2Options
        {
            AccountId = "acct",
            AccessKey = "key",
            Secret = "secret",
            BucketName = "sonivo-blobs"
        };

        Assert.True(options.IsComplete);
    }

    [Fact]
    public void AddInfrastructure_without_R2_registers_Postgres_default()
    {
        using var provider = BuildProvider(r2: false);
        using var scope = provider.CreateScope();

        Assert.IsType<PostgresBlobStore>(scope.ServiceProvider.GetRequiredService<IBlobStore>());
    }

    [Fact]
    public void AddInfrastructure_with_full_R2_registers_dualread_over_R2()
    {
        using var provider = BuildProvider(r2: true);

        IBlobStore first;
        IBlobStore second;
        using (var scope = provider.CreateScope())
        {
            first = scope.ServiceProvider.GetRequiredService<IBlobStore>();
        }

        using (var scope = provider.CreateScope())
        {
            second = scope.ServiceProvider.GetRequiredService<IBlobStore>();
        }

        // T-R2-02: the composed store is scoped (Postgres fallback is scoped);
        // the R2 primary underneath stays a singleton.
        Assert.IsType<DualReadBlobStore>(first);
        Assert.IsType<DualReadBlobStore>(second);
        Assert.NotSame(first, second);

        R2BlobStore primary;
        using (var scope = provider.CreateScope())
        {
            primary = scope.ServiceProvider.GetRequiredService<R2BlobStore>();
        }

        using (var scope = provider.CreateScope())
        {
            Assert.Same(primary, scope.ServiceProvider.GetRequiredService<R2BlobStore>());
        }

        Assert.Equal("sonivo-blobs", primary.BucketName);
    }

    [Fact]
    public void AddInfrastructure_with_partial_R2_falls_back_to_Postgres()
    {
        // Only three of four values: missing Secret must NOT select R2.
        using var provider = BuildProvider(r2: true, omitSecret: true);
        using var scope = provider.CreateScope();

        Assert.IsType<PostgresBlobStore>(scope.ServiceProvider.GetRequiredService<IBlobStore>());
    }

    [Fact]
    public async Task R2BlobStore_put_uses_existing_object_key_unchanged()
    {
        var capture = new CaptureHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var options = TestOptions();
        using var client = R2BlobStore.CreateClient(options, new CaptureFactory(capture));
        var store = new R2BlobStore(client, Options.Create(options));

        const string objectKey = "resources/3fa85f64-5717-4562-b3fc-2c963f66afa6";
        var payload = "chart bytes"u8.ToArray();
        await store.PutAsync(
            objectKey, new MemoryStream(payload), "text/plain", payload.Length, CancellationToken.None);

        Assert.NotNull(capture.LastRequest);
        var uri = capture.LastRequest!.RequestUri!.ToString();
        Assert.Contains("sonivo-blobs", uri, StringComparison.Ordinal);
        Assert.Contains(objectKey, uri, StringComparison.Ordinal);
    }

    [Fact]
    public async Task R2BlobStore_get_returns_bytes_and_byte_size()
    {
        var payload = "hello r2"u8.ToArray();
        var capture = new CaptureHandler(_ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(payload)
            };
            response.Content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
            return response;
        });
        var options = TestOptions();
        using var client = R2BlobStore.CreateClient(options, new CaptureFactory(capture));
        var store = new R2BlobStore(client, Options.Create(options));

        var blob = await store.GetAsync("resources/abc", CancellationToken.None);

        Assert.NotNull(blob);
        await using var content = blob!.Content;
        using var reader = new StreamReader(content);
        Assert.Equal("hello r2", await reader.ReadToEndAsync());
        Assert.Equal(payload.Length, blob.ByteSize);
    }

    [Fact]
    public async Task R2BlobStore_get_miss_returns_null()
    {
        var capture = new CaptureHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        var options = TestOptions();
        using var client = R2BlobStore.CreateClient(options, new CaptureFactory(capture));
        var store = new R2BlobStore(client, Options.Create(options));

        Assert.Null(await store.GetAsync("resources/missing", CancellationToken.None));
    }

    [Fact]
    public async Task R2BlobStore_delete_targets_object_key()
    {
        var capture = new CaptureHandler(_ => new HttpResponseMessage(HttpStatusCode.NoContent));
        var options = TestOptions();
        using var client = R2BlobStore.CreateClient(options, new CaptureFactory(capture));
        var store = new R2BlobStore(client, Options.Create(options));

        await store.DeleteAsync("resources/gone", CancellationToken.None);

        Assert.NotNull(capture.LastRequest);
        Assert.Contains("resources/gone", capture.LastRequest!.RequestUri!.ToString(), StringComparison.Ordinal);
    }

    private static R2Options TestOptions() => new()
    {
        AccountId = "test-account",
        AccessKey = "test-key",
        Secret = "test-secret",
        BucketName = "sonivo-blobs"
    };

    // ---- T-R2-02: dual-read R2-first + lazy backfill (no network; intercepted S3) ----

    [Fact]
    public async Task DualRead_prefers_R2_over_Postgres()
    {
        var payload = "from r2"u8.ToArray();
        var script = new ScriptedHandler(_ =>
            HttpResponseMessageFor(HttpStatusCode.OK, payload, "text/plain"));
        await using var db = CreateBlobDb();
        var fallback = new PostgresBlobStore(db, TestClock());
        await fallback.PutAsync("resources/k", new MemoryStream("from pg"u8.ToArray()), "text/plain", 7, CancellationToken.None);
        var store = CreateDualRead(script, fallback);

        var blob = await store.GetAsync("resources/k", CancellationToken.None);

        Assert.NotNull(blob);
        Assert.Equal("from r2", await ReadTextAsync(blob!.Content));
        Assert.DoesNotContain(script.Requests, r => r.Method == HttpMethod.Put);
    }

    [Fact]
    public async Task DualRead_falls_back_to_Postgres_and_backfills_R2_keeping_postgres_row()
    {
        var payload = "legacy bytes"u8.ToArray();
        var script = new ScriptedHandler(request =>
            request.Method == HttpMethod.Put
                ? new HttpResponseMessage(HttpStatusCode.OK)
                : new HttpResponseMessage(HttpStatusCode.NotFound));
        await using var db = CreateBlobDb();
        var fallback = new PostgresBlobStore(db, TestClock());
        await fallback.PutAsync("resources/legacy", new MemoryStream(payload), "text/plain", payload.Length, CancellationToken.None);
        var store = CreateDualRead(script, fallback);

        var blob = await store.GetAsync("resources/legacy", CancellationToken.None);

        Assert.NotNull(blob);
        Assert.Equal("legacy bytes", await ReadTextAsync(blob!.Content));
        Assert.Equal(payload.Length, blob.ByteSize);
        // Lazy backfill: exactly one PUT to R2 for the missed key.
        var puts = script.Requests.Where(r => r.Method == HttpMethod.Put).ToList();
        Assert.Single(puts);
        Assert.Contains("resources/legacy", puts[0].RequestUri!.ToString(), StringComparison.Ordinal);
        // Postgres row is kept (ResourceBlobs NEVER dropped in this slice).
        Assert.NotNull(await fallback.GetAsync("resources/legacy", CancellationToken.None));
    }

    [Fact]
    public async Task DualRead_R2_error_falls_back_to_Postgres()
    {
        // 403: an R2-side failure that the SDK does NOT retry (transport blips
        // are retried inside the SDK before surfacing — same fallback outcome).
        var script = new ScriptedHandler(_ => new HttpResponseMessage(HttpStatusCode.Forbidden));
        await using var db = CreateBlobDb();
        var fallback = new PostgresBlobStore(db, TestClock());
        var payload = "pg bytes"u8.ToArray();
        await fallback.PutAsync("resources/e", new MemoryStream(payload), "text/plain", payload.Length, CancellationToken.None);
        var store = CreateDualRead(script, fallback);

        var blob = await store.GetAsync("resources/e", CancellationToken.None);

        Assert.NotNull(blob);
        Assert.Equal("pg bytes", await ReadTextAsync(blob!.Content));
    }

    [Fact]
    public async Task DualRead_returns_null_when_both_backends_miss()
    {
        var script = new ScriptedHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        await using var db = CreateBlobDb();
        var store = CreateDualRead(script, new PostgresBlobStore(db, TestClock()));

        Assert.Null(await store.GetAsync("resources/nowhere", CancellationToken.None));
    }

    [Fact]
    public async Task DualRead_put_goes_to_R2_only()
    {
        var script = new ScriptedHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        await using var db = CreateBlobDb();
        var fallback = new PostgresBlobStore(db, TestClock());
        var store = CreateDualRead(script, fallback);

        var payload = "new bytes"u8.ToArray();
        await store.PutAsync("resources/new", new MemoryStream(payload), "text/plain", payload.Length, CancellationToken.None);

        Assert.Contains(script.Requests, r => r.Method == HttpMethod.Put);
        Assert.Null(await fallback.GetAsync("resources/new", CancellationToken.None));
    }

    [Fact]
    public async Task DualRead_delete_removes_from_both_backends()
    {
        var script = new ScriptedHandler(_ => new HttpResponseMessage(HttpStatusCode.NoContent));
        await using var db = CreateBlobDb();
        var fallback = new PostgresBlobStore(db, TestClock());
        var payload = "gone"u8.ToArray();
        await fallback.PutAsync("resources/gone", new MemoryStream(payload), "text/plain", payload.Length, CancellationToken.None);
        var store = CreateDualRead(script, fallback);

        await store.DeleteAsync("resources/gone", CancellationToken.None);

        Assert.Contains(script.Requests, r => r.Method == HttpMethod.Delete);
        Assert.Null(await fallback.GetAsync("resources/gone", CancellationToken.None));
    }

    private static DualReadBlobStore CreateDualRead(ScriptedHandler script, PostgresBlobStore fallback)
    {
        var options = TestOptions();
        var client = R2BlobStore.CreateClient(options, new CaptureFactory(script));
        var primary = new R2BlobStore(client, Options.Create(options));
        return new DualReadBlobStore(primary, fallback, NullDualReadLogger());
    }

    private static ServiceProvider BuildProvider(bool r2, bool omitSecret = false)
    {
        // All settings flow through real env-var configuration, restored afterwards
        // (avoids the in-memory provider package; R2__* is the documented local shape).
        var prior = new Dictionary<string, string?>();
        try
        {
            SetEnv(prior, "ConnectionStrings__Default", "Host=unused;Database=unused;Username=unused;Password=unused");
            SetEnv(prior, "UseInMemoryDatabase", "true");
            SetEnv(prior, "InMemoryDatabaseName", $"r2-test-{Guid.NewGuid():N}");
            SetEnv(prior, "R2__AccountId", r2 ? "acct" : null);
            SetEnv(prior, "R2__AccessKey", r2 ? "key" : null);
            SetEnv(prior, "R2__Secret", r2 && !omitSecret ? "secret" : null);
            SetEnv(prior, "R2__BucketName", r2 ? "sonivo-blobs" : null);

            var configuration = new ConfigurationBuilder()
                .AddEnvironmentVariables()
                .Build();

            var services = new ServiceCollection();
            services.AddInfrastructure(configuration);
            return services.BuildServiceProvider();
        }
        finally
        {
            foreach (var (name, value) in prior)
            {
                Environment.SetEnvironmentVariable(name, value);
            }
        }
    }

    private static void SetEnv(Dictionary<string, string?> prior, string name, string? value)
    {
        prior[name] = Environment.GetEnvironmentVariable(name);
        Environment.SetEnvironmentVariable(name, value);
    }

    private sealed class CaptureHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
        : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            return Task.FromResult(respond(request));
        }
    }

    private sealed class CaptureFactory(HttpMessageHandler handler) : HttpClientFactory
    {
        public override HttpClient CreateHttpClient(IClientConfig clientConfig)
            => new(handler, disposeHandler: false);
    }

    private sealed class ScriptedHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
        : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(respond(request));
        }
    }

    private static HttpResponseMessage HttpResponseMessageFor(
        HttpStatusCode status, byte[] body, string contentType)
    {
        var response = new HttpResponseMessage(status)
        {
            Content = new ByteArrayContent(body)
        };
        response.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return response;
    }

    private static SonivoDbContext CreateBlobDb()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-r2-{Guid.NewGuid():N}")
            .Options;
        return new SonivoDbContext(options);
    }

    private static IClock TestClock() => new SystemClock();

    private static NullLogger<DualReadBlobStore> NullDualReadLogger() => NullLogger<DualReadBlobStore>.Instance;

    private static async Task<string> ReadTextAsync(Stream stream)
    {
        await using var owned = stream;
        using var reader = new StreamReader(owned);
        return await reader.ReadToEndAsync();
    }
}
