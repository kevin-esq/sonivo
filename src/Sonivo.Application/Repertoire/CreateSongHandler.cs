using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
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
    string? RightsNotes,
    string? Tags = null);

public sealed record SongListItemDto(
    Guid Id,
    string Title,
    string? Attribution,
    string OriginKind,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<string> Tags,
    bool IsFavorite = false);

public sealed record SongDetailDto(
    Guid Id,
    string Title,
    string? Attribution,
    string OriginKind,
    string? RightsNotes,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int ArrangementCount,
    IReadOnlyList<string> Tags,
    bool IsFavorite = false);

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
        var (group, _) = await _access.RequireManagerAsync(command.GroupId, command.UserId, cancellationToken);
        PlanLimitGuard.EnsureWithinLimit(
            group.PlanId,
            PlanMetric.Songs,
            (await _songs.ListByGroupAsync(command.GroupId, cancellationToken)).Count);

        try
        {
            var song = Song.Create(
                command.GroupId,
                command.Title,
                command.OriginKind,
                _clock.UtcNow,
                command.Attribution,
                command.RightsNotes,
                command.Tags);

            await _songs.AddAsync(song, cancellationToken);
            await _songs.SaveChangesAsync(cancellationToken);

            return ToDetail(song, arrangementCount: 0);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    internal static SongDetailDto ToDetail(Song song, int arrangementCount, bool isFavorite = false) => new(
        song.Id,
        song.Title,
        song.Attribution,
        song.OriginKind,
        song.RightsNotes,
        song.Version,
        song.CreatedAt,
        song.UpdatedAt,
        arrangementCount,
        song.TagList,
        isFavorite);
}
