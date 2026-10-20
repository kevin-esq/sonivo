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
    private readonly IGroupDatabaseScope? _databaseScope;

    public ListCalendarEventsHandler(IEventStore events, IGroupDatabaseScope? databaseScope = null)
    {
        _events = events;
        _databaseScope = databaseScope;
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

        if (_databaseScope is not null)
        {
            await _databaseScope.SetMultiGroupReadAsync(userId, cancellationToken);
        }

        return await _events.ListForUserInRangeAsync(userId, from, to, cancellationToken);
    }
}
