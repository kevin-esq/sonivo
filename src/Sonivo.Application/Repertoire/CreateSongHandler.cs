using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
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
    string? Tags = null,
    string? Genre = null,
    string? Album = null,
    int? ReleaseYear = null);

public sealed record SongListItemDto(
    Guid Id,
    string Title,
    string? Attribution,
    string OriginKind,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<string> Tags,
    bool IsFavorite = false,
    string? Genre = null,
    string? Album = null,
    int? ReleaseYear = null,
    bool HasCoverImage = false);

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
    bool IsFavorite = false,
    string? Genre = null,
    string? Album = null,
    int? ReleaseYear = null,
    bool HasCoverImage = false);

public sealed class CreateSongHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly IClock _clock;
    private readonly IGroupAuditStore? _audit;

    public CreateSongHandler(GroupAccessService access, ISongStore songs, IClock clock, IGroupAuditStore? audit = null)
    {
        _access = access;
        _songs = songs;
        _clock = clock;
        _audit = audit;
    }

    public async Task<SongDetailDto> HandleAsync(CreateSongCommand command, CancellationToken cancellationToken)
    {
        var (group, _) = await _access.RequirePermissionAsync(command.GroupId, command.UserId, GroupPermissions.SongCreate, cancellationToken);
        EnsureDefinedTags(command.Tags, group.SongTagList);
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
                command.Tags,
                genre: command.Genre,
                album: command.Album,
                releaseYear: command.ReleaseYear);

            await _songs.AddAsync(song, cancellationToken);
            if (_audit is not null)
            {
                await _audit.AddAsync(GroupAuditEntry.Create(
                    command.GroupId, GroupAuditEntry.ActionSongCreated, song.CreatedAt, actorUserId: command.UserId), cancellationToken);
            }
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
        isFavorite,
        song.Genre,
        song.Album,
        song.ReleaseYear,
        song.CoverImageObjectKey is not null);

    internal static void EnsureDefinedTags(string? tags, IReadOnlyList<string> definitions)
    {
        if (string.IsNullOrWhiteSpace(tags)) return;
        var allowed = definitions.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(tag => !allowed.Contains(tag)))
            throw new ValidationException("Song tags must be selected from the group's defined tags.");
    }
}
