using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Tenancy;

public sealed class ListMyGroupsHandler
{
    private readonly IGroupStore _store;

    public ListMyGroupsHandler(IGroupStore store)
    {
        _store = store;
    }

    public async Task<IReadOnlyList<GroupListItem>> HandleAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        return await _store.ListForUserAsync(userId, cancellationToken);
    }
}
