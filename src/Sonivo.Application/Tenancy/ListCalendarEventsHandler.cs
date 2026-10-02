using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Tenancy;

/// <summary>
/// General calendar feed: events across the caller's groups within a date range
/// (ADR-0053 addendum). Authorization is membership-based; the range is validated
/// and capped by the endpoint.
/// </summary>
public sealed class ListCalendarEventsHandler
{
    private readonly IEventStore _events;

    public ListCalendarEventsHandler(IEventStore events)
    {
        _events = events;
    }

    public async Task<IReadOnlyList<UpcomingActivityItem>> HandleAsync(
        Guid userId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        return await _events.ListForUserInRangeAsync(userId, from, to, cancellationToken);
    }
}
