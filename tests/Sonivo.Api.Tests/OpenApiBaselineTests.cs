using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Sonivo.Api.Tests;

public sealed class OpenApiBaselineTests : IClassFixture<SonivoApiFactory>
{
    private const string SnapshotUpdateVariable = "SONIVO_UPDATE_OPENAPI_BASELINE";
    private readonly SonivoApiFactory _factory;

    public OpenApiBaselineTests(SonivoApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Development_openapi_document_matches_reviewed_baseline()
    {
        using var client = await CreateAuthenticatedClientAsync();
        using var response = await client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var actual = Normalize(await response.Content.ReadAsStringAsync());
        using var document = JsonDocument.Parse(actual);
        var root = document.RootElement;
        Assert.Equal("3.1.1", root.GetProperty("openapi").GetString());

        var paths = root.GetProperty("paths");
        Assert.Contains("/api/health", paths.EnumerateObject().Select(path => path.Name));
        Assert.Contains("/api/health/ready", paths.EnumerateObject().Select(path => path.Name));
        Assert.Contains("/api/client-errors", paths.EnumerateObject().Select(path => path.Name));
        Assert.Contains("/api/admin/v1/accounts", paths.EnumerateObject().Select(path => path.Name));
        Assert.DoesNotContain(paths.EnumerateObject(), path => path.Name.StartsWith("/hubs/", StringComparison.Ordinal));
        Assert.DoesNotContain(paths.EnumerateObject(), path => path.Name.StartsWith("/openapi/", StringComparison.Ordinal));
        Assert.DoesNotContain(paths.EnumerateObject(), path => path.Name is "/api/{**path}" or "{*path:nonfile}");

        var fallbackPolicy = _factory.Services
            .GetRequiredService<IOptions<AuthorizationOptions>>()
            .Value
            .FallbackPolicy;
        Assert.NotNull(fallbackPolicy);
        Assert.Contains(fallbackPolicy.Requirements, requirement => requirement is DenyAnonymousAuthorizationRequirement);

        var routeEndpoints = _factory.Services
            .GetRequiredService<EndpointDataSource>()
            .Endpoints
            .OfType<RouteEndpoint>()
            .ToArray();
        Assert.Contains(routeEndpoints, endpoint => endpoint.RoutePattern.RawText == "/openapi/{documentName}.json"
            && endpoint.Metadata.GetMetadata<IAllowAnonymous>() is null);

        var snapshotPath = FindSnapshotPath();
        if (Environment.GetEnvironmentVariable(SnapshotUpdateVariable) == "1")
        {
            await File.WriteAllTextAsync(snapshotPath, actual);
            return;
        }

        Assert.True(File.Exists(snapshotPath),
            $"OpenAPI baseline is missing at {snapshotPath}. Review the Development document, then update deliberately with "
            + $"{SnapshotUpdateVariable}=1 dotnet test tests/Sonivo.Api.Tests/Sonivo.Api.Tests.csproj --filter FullyQualifiedName~OpenApiBaselineTests.");

        var expected = Normalize(await File.ReadAllTextAsync(snapshotPath));
        Assert.True(expected == actual,
            $"Development OpenAPI changed. Review every route/schema/security-contract change before updating {snapshotPath}.\n"
            + FormatDiff(expected, actual)
            + $"\nUpdate deliberately after review: set {SnapshotUpdateVariable}=1 and run the focused test.");
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        var email = $"openapi-{Guid.NewGuid():N}@example.com";
        await EnsureCsrfAsync(client);

        using var registration = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1",
            displayName = "OpenAPI Test"
        });
        Assert.Equal(HttpStatusCode.Created, registration.StatusCode);
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);

        await EnsureCsrfAsync(client);
        using var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1",
            rememberMe = false
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        using var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        var token = body!.RootElement.GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private static string Normalize(string json)
    {
        var node = JsonNode.Parse(json) ?? throw new InvalidDataException("OpenAPI response was empty.");
        return Canonicalize(node).ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n";
    }

    private static JsonNode Canonicalize(JsonNode node)
    {
        if (node is JsonObject obj)
        {
            var sorted = new JsonObject();
            foreach (var property in obj.OrderBy(property => property.Key, StringComparer.Ordinal))
            {
                sorted.Add(property.Key, property.Value is null ? null : Canonicalize(property.Value));
            }

            return sorted;
        }

        if (node is JsonArray array)
        {
            var copy = new JsonArray();
            foreach (var item in array)
            {
                copy.Add(item is null ? null : Canonicalize(item));
            }

            return copy;
        }

        return node.DeepClone();
    }

    private static string FindSnapshotPath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "Sonivo.Api.Tests.csproj")))
            {
                return Path.Combine(directory.FullName, "Snapshots", "openapi-v1.json");
            }
        }

        throw new DirectoryNotFoundException("Could not locate the Sonivo.Api.Tests project directory.");
    }

    private static string FormatDiff(string expected, string actual)
    {
        var expectedLines = expected.Split('\n');
        var actualLines = actual.Split('\n');
        var max = Math.Max(expectedLines.Length, actualLines.Length);
        var differences = new List<string>();
        for (var index = 0; index < max && differences.Count < 40; index++)
        {
            var oldLine = index < expectedLines.Length ? expectedLines[index] : "<end>";
            var newLine = index < actualLines.Length ? actualLines[index] : "<end>";
            if (!string.Equals(oldLine, newLine, StringComparison.Ordinal))
            {
                differences.Add($"Line {index + 1}:\n-{oldLine}\n+{newLine}");
            }
        }

        return differences.Count == 0 ? "No line differences." : string.Join("\n", differences);
    }
}
