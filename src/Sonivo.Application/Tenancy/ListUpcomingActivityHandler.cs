using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Tenancy;

/// <summary>
/// Cross-group "next activity" for the Inicio dashboard (ADR-0053).
/// Authorization is membership-based: only the caller's groups are consulted.
/// </summary>
public sealed class ListUpcomingActivityHandler
{
    private const int MaxItems = 20;

    private readonly IEventStore _events;
    private readonly IGroupDatabaseScope? _databaseScope;

    public ListUpcomingActivityHandler(IEventStore events, IGroupDatabaseScope? databaseScope = null)
    {
        _events = events;
        _databaseScope = databaseScope;
    }

    public async Task<IReadOnlyList<UpcomingActivityItem>> HandleAsync(
        Guid userId,
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

        return await _events.ListUpcomingForUserAsync(userId, MaxItems, cancellationToken);
    }
}
