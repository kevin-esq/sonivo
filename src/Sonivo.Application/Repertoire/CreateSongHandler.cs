using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Repertoire;

public sealed record CreateSongCommand(
    Guid UserId,
    Guid GroupId,
    string Title,
    string? Attribution,
    string OriginKind,
    string? RightsNotes);

public sealed record SongListItemDto(
    Guid Id,
    string Title,
    string? Attribution,
    string OriginKind,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record SongDetailDto(
    Guid Id,
    string Title,
    string? Attribution,
    string OriginKind,
    string? RightsNotes,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int ArrangementCount);

public sealed class CreateSongHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly IClock _clock;

    public CreateSongHandler(GroupAccessService access, ISongStore songs, IClock clock)
    {
        _access = access;
        _songs = songs;
        _clock = clock;
    }

    public async Task<SongDetailDto> HandleAsync(CreateSongCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        try
        {
            var song = Song.Create(
                command.GroupId,
                command.Title,
                command.OriginKind,
                _clock.UtcNow,
                command.Attribution,
                command.RightsNotes);

            await _songs.AddAsync(song, cancellationToken);
            await _songs.SaveChangesAsync(cancellationToken);

            return ToDetail(song, arrangementCount: 0);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    internal static SongDetailDto ToDetail(Song song, int arrangementCount) => new(
        song.Id,
        song.Title,
        song.Attribution,
        song.OriginKind,
        song.RightsNotes,
        song.Version,
        song.CreatedAt,
        song.UpdatedAt,
        arrangementCount);
}
