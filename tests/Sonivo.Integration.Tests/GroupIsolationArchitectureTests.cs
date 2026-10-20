using System.Reflection;
using Sonivo.Application.Abstractions;

namespace Sonivo.Integration.Tests;

/// <summary>
/// Build-time enforcement of ADR-0019 / ADR-0079 tenancy: Group is the only
/// tenant, resolved server-side per request. Fails if a tenant store exposes an
/// unscoped entity lookup, or if an ambient tenant accessor reappears.
/// </summary>
public class GroupIsolationArchitectureTests
{
    private static readonly Assembly ApplicationAssembly = typeof(IGroupStore).Assembly;

    /// <summary>
    /// Single-Guid <c>GetById*</c> lookups that are legitimately not tenant-scoped,
    /// keyed by "Interface.Method". <c>IGroupStore.GetByIdAsync(Guid)</c> is allowed
    /// because the GroupId <em>is</em> the aggregate identity, not a scope beside it.
    /// Adding an entry requires justification in the PR.
    /// </summary>
    private static readonly HashSet<string> AllowedUnscoped = new(StringComparer.Ordinal)
    {
        "IGroupStore.GetByIdAsync"
    };

    [Fact]
    public void Tenant_stores_do_not_expose_unscoped_GetById()
    {
        var offenders = new List<string>();

        foreach (var store in StoreInterfaces())
        {
            foreach (var method in store.GetMethods())
            {
                if (!method.Name.StartsWith("GetById", StringComparison.Ordinal))
                {
                    continue;
                }

                // Tenant isolation needs a scope id beside the entity id. A
                // collection (e.g. GetByIds(IEnumerable<Guid>)) has zero single
                // Guid parameters and is excluded.
                var guidParameters = method.GetParameters()
                    .Where(p => p.ParameterType == typeof(Guid))
                    .ToArray();

                if (guidParameters.Length != 1)
                {
                    continue;
                }

                if (AllowedUnscoped.Contains($"{store.Name}.{method.Name}"))
                {
                    continue;
                }

                offenders.Add($"{store.Name}.{method.Name}({guidParameters[0].Name})");
            }
        }

        Assert.True(
            offenders.Count == 0,
            "Unscoped tenant lookups are forbidden (ADR-0019 §4 / ADR-0079 §5). "
            + "Use (GroupId, EntityId):\n  " + string.Join("\n  ", offenders));
    }

    [Fact]
    public void Allowed_unscoped_lookup_is_the_group_identity_lookup()
    {
        // Guard the exception itself: the only allowed unscoped lookup must be the
        // single-Guid Group lookup, so the allowlist cannot silently hide a real gap.
        var groupStore = typeof(IGroupStore);
        var method = groupStore.GetMethod("GetByIdAsync");
        Assert.NotNull(method);

        var guidParameters = method!.GetParameters()
            .Where(p => p.ParameterType == typeof(Guid))
            .ToArray();
        Assert.Single(guidParameters);
        Assert.Equal("groupId", guidParameters[0].Name);

        Assert.Single(AllowedUnscoped);
        Assert.Contains($"{groupStore.Name}.{method.Name}", AllowedUnscoped);
    }

    [Fact]
    public void No_ambient_tenant_context_exists()
    {
        var forbiddenNames = new[]
        {
            "ITenantContext", "IGroupContext", "ICurrentGroup", "CurrentGroupId",
            "CurrentTenantId", "ITenantEntity"
        };

        var offenders = new List<string>();
        var assemblies = new[] { ApplicationAssembly, typeof(Domain.Tenancy.Group).Assembly };

        foreach (var assembly in assemblies)
        {
            foreach (var type in assembly.GetTypes())
            {
                if (MatchesAny(type.Name, forbiddenNames))
                {
                    offenders.Add(type.FullName!);
                }

                foreach (var member in type.GetMembers(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
                {
                    if (MatchesAny(member.Name, forbiddenNames))
                    {
                        offenders.Add($"{type.FullName}.{member.Name}");
                    }
                }
            }
        }

        Assert.True(
            offenders.Count == 0,
            "Ambient tenant context is prohibited (ADR-0079 §3–4). Tenant identity must be "
            + "passed per request and verified via GroupAccessService:\n  "
            + string.Join("\n  ", offenders));
    }

    private static IEnumerable<Type> StoreInterfaces()
        => ApplicationAssembly.GetTypes().Where(t =>
            t.IsInterface
            && t.Namespace == typeof(IGroupStore).Namespace
            && t.Name.EndsWith("Store", StringComparison.Ordinal));

    private static bool MatchesAny(string name, IEnumerable<string> candidates)
        => candidates.Any(c => string.Equals(name, c, StringComparison.Ordinal));
}