using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Repertoire;

public sealed record CreateArrangementCommand(
    Guid UserId,
    Guid GroupId,
    Guid SongId,
    string Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes);

public sealed record ArrangementListItemDto(
    Guid Id,
    Guid SongId,
    string Label,
    string? DefaultKey,
    int? DefaultBpm,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record ResourceSummaryDto(
    Guid Id,
    Guid ArrangementId,
    string Kind,
    string Purpose,
    string Label,
    string? Part,
    string? Note,
    string? Url,
    string? OriginalFileName,
    string? ContentType,
    long? ByteSize,
    DateTimeOffset CreatedAt);

public sealed record ArrangementDetailDto(
    Guid Id,
    Guid SongId,
    string Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes,
    string? ChordTimingJson,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<ResourceSummaryDto> Resources);

public sealed class CreateArrangementHandler
{
    private readonly GroupAccessService _access;
    private readonly ISongStore _songs;
    private readonly IArrangementStore _arrangements;
    private readonly IClock _clock;

    public CreateArrangementHandler(
        GroupAccessService access,
        ISongStore songs,
        IArrangementStore arrangements,
        IClock clock)
    {
        _access = access;
        _songs = songs;
        _arrangements = arrangements;
        _clock = clock;
    }

    public async Task<ArrangementDetailDto> HandleAsync(
        CreateArrangementCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var song = await _songs.GetByIdAsync(command.GroupId, command.SongId, cancellationToken);
        if (song is null)
        {
            throw new NotFoundException("Song not found.");
        }

        try
        {
            var arrangement = Arrangement.Create(
                song.GroupId,
                song.Id,
                command.Label,
                _clock.UtcNow,
                command.DefaultKey,
                command.DefaultBpm,
                command.Lyrics,
                command.Chords,
                command.Structure,
                command.Notes);

            await _arrangements.AddAsync(arrangement, cancellationToken);
            await _arrangements.SaveChangesAsync(cancellationToken);

            return ToDetail(arrangement, []);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    internal static ArrangementDetailDto ToDetail(
        Arrangement arrangement,
        IReadOnlyList<ResourceSummaryDto> resources) => new(
        arrangement.Id,
        arrangement.SongId,
        arrangement.Label,
        arrangement.DefaultKey,
        arrangement.DefaultBpm,
        arrangement.Lyrics,
        arrangement.Chords,
        arrangement.Structure,
        arrangement.Notes,
        arrangement.ChordTimingJson,
        arrangement.Version,
        arrangement.CreatedAt,
        arrangement.UpdatedAt,
        resources);

    internal static ResourceSummaryDto ToResourceSummary(Resource resource) => new(
        resource.Id,
        resource.ArrangementId,
        resource.Kind,
        resource.Purpose,
        resource.Label,
        resource.Part,
        resource.Note,
        resource.Url,
        resource.OriginalFileName,
        resource.ContentType,
        resource.ByteSize,
        resource.CreatedAt);
}
