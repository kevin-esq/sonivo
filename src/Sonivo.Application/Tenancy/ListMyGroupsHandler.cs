using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Tenancy;

public sealed class ListMyGroupsHandler
{
    private readonly IGroupStore _store;
    private readonly IGroupDatabaseScope? _databaseScope;

    public ListMyGroupsHandler(IGroupStore store, IGroupDatabaseScope? databaseScope = null)
    {
        _store = store;
        _databaseScope = databaseScope;
    }

    public async Task<IReadOnlyList<GroupListItem>> HandleAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        if (_databaseScope is not null)
        {
            await _databaseScope.SetMultiGroupReadAsync(userId, cancellationToken);
        }

        return await _store.ListForUserAsync(userId, cancellationToken);
    }
}
