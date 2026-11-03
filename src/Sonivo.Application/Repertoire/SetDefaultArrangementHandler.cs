using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed record SetDefaultArrangementCommand(Guid UserId, Guid GroupId, Guid SongId, Guid ArrangementId, int ExpectedVersion);

public sealed class SetDefaultArrangementHandler(
    GroupAccessService access,
    ISongStore songs,
    IArrangementStore arrangements,
    IClock clock,
    IGroupAuditStore? audit = null)
{
    public async Task<SongDetailDto> HandleAsync(SetDefaultArrangementCommand command, CancellationToken cancellationToken)
    {
        if (command.ExpectedVersion < 1 || command.ArrangementId == Guid.Empty)
            throw new ValidationException("A valid arrangement and expectedVersion are required.");

        await access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        var song = await songs.GetByIdAsync(command.GroupId, command.SongId, cancellationToken)
            ?? throw new NotFoundException("Song not found.");
        await access.RequireResourcePermissionAsync(command.GroupId, command.UserId, GroupPermissions.SongEdit,
            ResourceGrant.ResourceTypes.Song, song.Id, cancellationToken);

        var arrangement = await arrangements.GetByIdAsync(command.GroupId, command.ArrangementId, cancellationToken);
        if (arrangement is null || arrangement.SongId != song.Id)
            throw new ValidationException("Default arrangement must belong to the song.");

        try { song.SetDefaultArrangement(arrangement.Id, command.ExpectedVersion, clock.UtcNow); }
        catch (ConcurrencyConflictException ex) { throw new ConflictException(ex.Message); }

        await songs.UpdateAsync(song, cancellationToken);
        if (audit is not null)
            await audit.AddAsync(GroupAuditEntry.Create(command.GroupId, GroupAuditEntry.ActionSongUpdated, song.UpdatedAt, actorUserId: command.UserId), cancellationToken);
        await songs.SaveChangesAsync(cancellationToken);
        var count = await songs.CountLiveArrangementsAsync(command.GroupId, song.Id, cancellationToken);
        return CreateSongHandler.ToDetail(song, count);
    }
}
