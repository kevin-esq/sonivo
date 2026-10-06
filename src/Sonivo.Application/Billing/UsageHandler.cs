using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Billing;

namespace Sonivo.Application.Billing;

/// <summary>One usage metric: how much is used and the plan's limit (null = unlimited).</summary>
public sealed record UsageMetric(long Used, long? Limit);

/// <summary>Group usage vs the effective plan limits (ADR-0071, PHASE-PLANS-SPEC §4.1/§7).</summary>
public sealed record GroupUsageDto(
    string PlanId,
    UsageMetric Members,
    UsageMetric Songs,
    UsageMetric Setlists,
    UsageMetric EventsThisMonth,
    UsageMetric StorageBytes);

/// <summary>
/// Read-only usage counters for the group's current plan. Members-only; the
/// server remains authoritative for enforcement (this only informs the UI).
/// </summary>
public sealed class GetGroupUsageHandler
{
    private const long BytesPerGb = 1024L * 1024L * 1024L;

    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly ISongStore _songs;
    private readonly ISetlistStore _setlists;
    private readonly IEventStore _events;
    private readonly IResourceStore _resources;
    private readonly IClock _clock;

    public GetGroupUsageHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        ISongStore songs,
        ISetlistStore setlists,
        IEventStore events,
        IResourceStore resources,
        IClock clock)
    {
        _access = access;
        _memberships = memberships;
        _songs = songs;
        _setlists = setlists;
        _events = events;
        _resources = resources;
        _clock = clock;
    }

    public async Task<GroupUsageDto> HandleAsync(Guid userId, Guid groupId, CancellationToken cancellationToken)
    {
        var (group, _) = await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var plan = PlanCatalog.Get(group.PlanId);
        var now = _clock.UtcNow;

        var members = (await _memberships.ListByGroupAsync(groupId, cancellationToken)).Count;
        var songs = (await _songs.ListByGroupAsync(groupId, cancellationToken)).Count;
        var setlists = (await _setlists.ListByGroupAsync(groupId, cancellationToken)).Count;
        var eventsThisMonth = (await _events.ListActiveByGroupAsync(groupId, cancellationToken))
            .Count(e => e.StartsAt.Year == now.Year && e.StartsAt.Month == now.Month);
        var storageBytes = (await _resources.ListByGroupAsync(groupId, cancellationToken))
            .Sum(r => r.ByteSize ?? 0);

        var storageLimit = plan.Limits.StorageGb is int gb ? gb * BytesPerGb : (long?)null;

        return new GroupUsageDto(
            group.PlanId,
            new UsageMetric(members, plan.Limits.Members),
            new UsageMetric(songs, plan.Limits.Songs),
            new UsageMetric(setlists, plan.Limits.Setlists),
            new UsageMetric(eventsThisMonth, plan.Limits.EventsPerMonth),
            new UsageMetric(storageBytes, storageLimit));
    }
}
