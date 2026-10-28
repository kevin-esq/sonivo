using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// PATCH semantics: null Title/OriginKind/Attribution/Genre/RightsNotes keep current values.
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
    int ExpectedVersion,
    string? Tags = null,
    string? Genre = null);

public sealed class UpdateSongHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly IClock _clock;
    private readonly IGroupAuditStore? _audit;
    private readonly ISongFavoriteStore? _favorites;

    public UpdateSongHandler(GroupAccessService access, ISongStore songs, IClock clock, IGroupAuditStore? audit = null, ISongFavoriteStore? favorites = null)
    {
        _access = access;
        _songs = songs;
        _clock = clock;
        _audit = audit;
        _favorites = favorites;
    }

    public async Task<SongDetailDto> HandleAsync(UpdateSongCommand command, CancellationToken cancellationToken)
    {
        await _access.RequirePermissionAsync(command.GroupId, command.UserId, GroupPermissions.SongEdit, cancellationToken);

        var song = await _songs.GetByIdAsync(command.GroupId, command.SongId, cancellationToken);
        if (song is null)
        {
            throw new NotFoundException("Song not found.");
        }

        await _access.RequireResourcePermissionAsync(
            command.GroupId,
            command.UserId,
            GroupPermissions.SongEdit,
            ResourceGrant.ResourceTypes.Song,
            song.Id,
            cancellationToken);

        var title = command.Title ?? song.Title;
        var originKind = command.OriginKind ?? song.OriginKind;
        var attribution = command.Attribution ?? song.Attribution;
        var rightsNotes = command.RightsNotes ?? song.RightsNotes;
        var tags = command.Tags ?? song.Tags;
        var genre = command.Genre ?? song.Genre;

        try
        {
            song.Update(title, attribution, originKind, rightsNotes, tags, command.ExpectedVersion, _clock.UtcNow, genre);
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
        if (_audit is not null)
        {
            await _audit.AddAsync(GroupAuditEntry.Create(
                command.GroupId, GroupAuditEntry.ActionSongUpdated, song.UpdatedAt, actorUserId: command.UserId), cancellationToken);
        }
        await _songs.SaveChangesAsync(cancellationToken);

        var arrangementCount = await _songs.CountLiveArrangementsAsync(command.GroupId, command.SongId, cancellationToken);
        var isFavorite = _favorites is not null
            && await _favorites.IsFavoriteAsync(command.GroupId, command.SongId, command.UserId, cancellationToken);
        return CreateSongHandler.ToDetail(song, arrangementCount, isFavorite);
    }
}
