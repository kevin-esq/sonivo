using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Repertoire;

public sealed record SoftDeleteArrangementCommand(
    Guid UserId,
    Guid GroupId,
    Guid ArrangementId,
    int ExpectedVersion);

public sealed class SoftDeleteArrangementHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IClock _clock;

    public SoftDeleteArrangementHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IClock clock)
    {
        _access = access;
        _arrangements = arrangements;
        _clock = clock;
    }

    public async Task HandleAsync(SoftDeleteArrangementCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var arrangement = await _arrangements.GetByIdAsync(
            command.GroupId,
            command.ArrangementId,
            cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        try
        {
            arrangement.SoftDelete(command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _arrangements.UpdateAsync(arrangement, cancellationToken);
        await _arrangements.SaveChangesAsync(cancellationToken);
    }
}
