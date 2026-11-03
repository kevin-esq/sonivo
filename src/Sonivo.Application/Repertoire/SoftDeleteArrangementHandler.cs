using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
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
    private readonly IGroupAuditStore? _audit;
    private readonly ISongStore? _songs;
    private readonly IUnitOfWork? _unitOfWork;

    public SoftDeleteArrangementHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IClock clock,
        IGroupAuditStore? audit = null,
        ISongStore? songs = null,
        IUnitOfWork? unitOfWork = null)
    {
        _access = access;
        _arrangements = arrangements;
        _songs = songs;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _audit = audit;
    }

    public async Task HandleAsync(SoftDeleteArrangementCommand command, CancellationToken cancellationToken)
    {
        await _access.RequirePermissionAsync(command.GroupId, command.UserId, GroupPermissions.ArrangementDelete, cancellationToken);

        var arrangement = await _arrangements.GetByIdAsync(
            command.GroupId,
            command.ArrangementId,
            cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        await _access.RequireResourcePathPermissionAsync(
            command.GroupId,
            command.UserId,
            GroupPermissions.ArrangementDelete,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
            },
            cancellationToken);

        var now = _clock.UtcNow;
        var song = _songs is null ? null : await _songs.GetByIdAsync(command.GroupId, arrangement.SongId, cancellationToken);
        try
        {
            arrangement.SoftDelete(command.ExpectedVersion, now);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _arrangements.UpdateAsync(arrangement, cancellationToken);
        if (song is not null && song.DefaultArrangementId == arrangement.Id)
        {
            var replacement = (await _arrangements.ListLiveTrackedBySongAsync(
                command.GroupId, arrangement.SongId, cancellationToken))
                .Where(item => item.Id != arrangement.Id)
                .OrderBy(item => item.CreatedAt)
                .ThenBy(item => item.Id)
                .FirstOrDefault();
            song.SetDefaultArrangement(replacement?.Id, song.Version, now);
            await _songs.UpdateAsync(song, cancellationToken);
        }
        if (_audit is not null)
        {
            await _audit.AddAsync(GroupAuditEntry.Create(
                command.GroupId, GroupAuditEntry.ActionArrangementDeleted, now, actorUserId: command.UserId), cancellationToken);
        }
        if (_unitOfWork is not null) await _unitOfWork.SaveChangesAsync(cancellationToken);
        else await _arrangements.SaveChangesAsync(cancellationToken);
    }
}
