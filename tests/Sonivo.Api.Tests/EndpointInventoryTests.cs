using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Sonivo.Api.Tests;

public sealed class EndpointInventoryTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public EndpointInventoryTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void Endpoint_inventory_and_fallback_authorization_match_snapshot()
    {
        var endpoints = _factory.Services
            .GetRequiredService<EndpointDataSource>()
            .Endpoints
            .OfType<RouteEndpoint>()
            .ToArray();
        var inventory = endpoints
            .Select(FormatEndpoint)
            .OrderBy(line => line, StringComparer.Ordinal)
            .ToArray();
        var snapshotPath = FindSnapshotPath();
        var expected = File.ReadAllLines(snapshotPath);

        Assert.True(
            expected.SequenceEqual(inventory, StringComparer.Ordinal),
            $"Endpoint inventory changed. Review every route and metadata change before updating {snapshotPath}.\n"
            + FormatDiff(expected, inventory)
            + "\nUpdate deliberately: review this diff, then replace the snapshot with the sorted inventory format.");

        var fallbackPolicy = _factory.Services
            .GetRequiredService<IOptions<AuthorizationOptions>>()
            .Value
            .FallbackPolicy;
        Assert.NotNull(fallbackPolicy);
        Assert.Contains(fallbackPolicy.Requirements, requirement => requirement is DenyAnonymousAuthorizationRequirement);

        Assert.Contains(endpoints, endpoint => endpoint.RoutePattern.RawText == "/api/health");
        Assert.Contains(endpoints, endpoint => endpoint.RoutePattern.RawText == "/api/health/ready");
        Assert.Contains(endpoints, endpoint => endpoint.RoutePattern.RawText == "/api/client-errors");
        Assert.Contains(endpoints, endpoint => endpoint.RoutePattern.RawText == "/hubs/practiceroom");
        Assert.Contains(endpoints, endpoint => endpoint.RoutePattern.RawText == "/hubs/group");
        Assert.Contains(endpoints, endpoint => endpoint.RoutePattern.RawText == "/hubs/notifications");
        Assert.Contains(endpoints, endpoint => endpoint.RoutePattern.RawText == "/openapi/{documentName}.json");

        using var nonDevelopmentFactory = _factory.WithWebHostBuilder(builder => builder.UseEnvironment("Staging"));
        var nonDevelopmentEndpoints = nonDevelopmentFactory.Services
            .GetRequiredService<EndpointDataSource>()
            .Endpoints
            .OfType<RouteEndpoint>()
            .ToArray();
        Assert.Contains(nonDevelopmentEndpoints, endpoint => endpoint.RoutePattern.RawText == "/api/{**path}");
        Assert.Contains(nonDevelopmentEndpoints, endpoint => endpoint.RoutePattern.RawText == "{*path:nonfile}");
    }

    // This inventory does not exercise CSRF, pipeline order, RLS, SignalR origin checks, or HTTP behavior.
    // Other tests cover CSRF, RLS, and API responses; hub-origin and pipeline-order assertions remain gaps.
    private static string FormatEndpoint(RouteEndpoint endpoint)
    {
        var methods = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods
            .OrderBy(method => method, StringComparer.Ordinal)
            .ToArray();
        var methodText = methods is { Length: > 0 } ? string.Join(",", methods) : "*";
        var name = endpoint.Metadata.GetMetadata<IEndpointNameMetadata>()?.EndpointName ?? "-";
        var allowAnonymous = endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null;
        var authorization = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Select(metadata => $"policy={metadata.Policy ?? "-"};roles={metadata.Roles ?? "-"};schemes={metadata.AuthenticationSchemes ?? "-"}")
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();
        var rateLimits = endpoint.Metadata.GetOrderedMetadata<EnableRateLimitingAttribute>()
            .Select(metadata => $"enable={metadata.PolicyName}")
            .Concat(endpoint.Metadata.GetMetadata<DisableRateLimitingAttribute>() is null
                ? []
                : ["disable=true"])
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();

        return $"{endpoint.RoutePattern.RawText ?? endpoint.RoutePattern.ToString()}"
            + $"|methods={methodText}"
            + $"|name={name}"
            + $"|allowAnonymous={allowAnonymous.ToString().ToLowerInvariant()}"
            + $"|authorize={(authorization.Length == 0 ? "-" : string.Join("&", authorization))}"
            + $"|rateLimit={(rateLimits.Length == 0 ? "-" : string.Join("&", rateLimits))}";
    }

    private static string FindSnapshotPath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "Sonivo.Api.Tests.csproj")))
            {
                return Path.Combine(directory.FullName, "Snapshots", "endpoint-inventory.txt");
            }
        }

        throw new DirectoryNotFoundException("Could not locate the Sonivo.Api.Tests project directory.");
    }

    private static string FormatDiff(IReadOnlyCollection<string> expected, IReadOnlyCollection<string> actual)
    {
        var removed = GetExcessLines(expected, actual);
        var added = GetExcessLines(actual, expected);
        return "Removed lines:\n"
            + (removed.Count == 0 ? "(none)" : string.Join("\n", removed.Select(line => $"-{line}")))
            + "\nAdded lines:\n"
            + (added.Count == 0 ? "(none)" : string.Join("\n", added.Select(line => $"+{line}")));
    }

    private static List<string> GetExcessLines(IReadOnlyCollection<string> source, IReadOnlyCollection<string> comparison)
    {
        var remaining = comparison
            .GroupBy(line => line, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var excess = new List<string>();

        foreach (var line in source.OrderBy(value => value, StringComparer.Ordinal))
        {
            if (remaining.TryGetValue(line, out var count) && count > 0)
            {
                remaining[line] = count - 1;
            }
            else
            {
                excess.Add(line);
            }
        }

        return excess;
    }
}
