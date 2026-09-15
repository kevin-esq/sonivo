using Sonivo.Application.Abstractions;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Tenancy;

public sealed record SoftDeleteGroupCommand(Guid UserId, Guid GroupId, int ExpectedVersion);

public sealed class SoftDeleteGroupHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupStore _store;
    private readonly IClock _clock;

    public SoftDeleteGroupHandler(GroupAccessService access, IGroupStore store, IClock clock)
    {
        _access = access;
        _store = store;
        _clock = clock;
    }

    public async Task HandleAsync(SoftDeleteGroupCommand command, CancellationToken cancellationToken)
    {
        var (group, _) = await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        try
        {
            group.SoftDelete(command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _store.UpdateAsync(group, cancellationToken);
        await _store.SaveChangesAsync(cancellationToken);
    }
}
