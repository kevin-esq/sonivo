using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Repertoire;

public sealed record SoftDeleteSongCommand(
    Guid UserId,
    Guid GroupId,
    Guid SongId,
    int ExpectedVersion);

/// <summary>
/// ADR-0025 §8a: Song soft-delete + cascade soft-delete of currently-live Arrangements
/// in one unit-of-work transaction. Client supplies Song expectedVersion only.
/// </summary>
public sealed class SoftDeleteSongHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly IArrangementStore _arrangements;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public SoftDeleteSongHandler(
        GroupAccessService access,
        ISongStore songs,
        IArrangementStore arrangements,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _access = access;
        _songs = songs;
        _arrangements = arrangements;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task HandleAsync(SoftDeleteSongCommand command, CancellationToken cancellationToken)
    {
        if (command.ExpectedVersion < 1)
        {
            throw new ValidationException("expectedVersion is required.");
        }

        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var song = await _songs.GetByIdAsync(command.GroupId, command.SongId, cancellationToken);
        if (song is null)
        {
            throw new NotFoundException("Song not found.");
        }

        var now = _clock.UtcNow;

        try
        {
            song.SoftDelete(command.ExpectedVersion, now);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        // Query filter returns live Arrangements only — already-deleted remain untouched.
        var liveArrangements = await _arrangements.ListLiveTrackedBySongAsync(
            command.GroupId,
            command.SongId,
            cancellationToken);

        foreach (var arrangement in liveArrangements)
        {
            try
            {
                arrangement.SoftDelete(arrangement.Version, now);
            }
            catch (ConcurrencyConflictException ex)
            {
                throw new ConflictException(ex.Message);
            }
        }

        await _songs.UpdateAsync(song, cancellationToken);
        foreach (var arrangement in liveArrangements)
        {
            await _arrangements.UpdateAsync(arrangement, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
