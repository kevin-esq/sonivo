using System.Net;
using System.Net.Http.Headers;
using Amazon.Runtime;
using Amazon.S3;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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
    public void AddInfrastructure_with_full_R2_registers_R2_singleton()
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

        var r2 = Assert.IsType<R2BlobStore>(first);
        Assert.Same(first, second);
        Assert.Equal("sonivo-blobs", r2.BucketName);
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

    private sealed class CaptureFactory(CaptureHandler handler) : HttpClientFactory
    {
        public override HttpClient CreateHttpClient(IClientConfig clientConfig)
            => new(handler, disposeHandler: false);
    }
}
