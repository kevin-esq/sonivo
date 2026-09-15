using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// PATCH semantics: null Title/OriginKind/Attribution/RightsNotes keep current values.
/// Non-null optional strings are applied (whitespace-only → null in the domain).
/// </summary>
public sealed record UpdateSongCommand(
    Guid UserId,
    Guid GroupId,
    Guid SongId,
    string? Title,
    string? Attribution,
    string? OriginKind,
    string? RightsNotes,
    int ExpectedVersion);

public sealed class UpdateSongHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly IClock _clock;

    public UpdateSongHandler(GroupAccessService access, ISongStore songs, IClock clock)
    {
        _access = access;
        _songs = songs;
        _clock = clock;
    }

    public async Task<SongDetailDto> HandleAsync(UpdateSongCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var song = await _songs.GetByIdAsync(command.GroupId, command.SongId, cancellationToken);
        if (song is null)
        {
            throw new NotFoundException("Song not found.");
        }

        var title = command.Title ?? song.Title;
        var originKind = command.OriginKind ?? song.OriginKind;
        var attribution = command.Attribution ?? song.Attribution;
        var rightsNotes = command.RightsNotes ?? song.RightsNotes;

        try
        {
            song.Update(title, attribution, originKind, rightsNotes, command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _songs.UpdateAsync(song, cancellationToken);
        await _songs.SaveChangesAsync(cancellationToken);

        var arrangementCount = await _songs.CountLiveArrangementsAsync(command.GroupId, command.SongId, cancellationToken);
        return CreateSongHandler.ToDetail(song, arrangementCount);
    }
}
