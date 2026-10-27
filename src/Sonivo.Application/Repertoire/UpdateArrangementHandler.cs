using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// PATCH semantics: null Label/DefaultKey/Lyrics/Chords/Structure/Notes/DefaultBpm/ChordTimingJson
/// keep current values. Non-null optional strings are applied (whitespace-only → null in the domain).
/// ChordTimingJson: null omits; "" / "[]" / whitespace clears marks; valid JSON array replaces;
/// malformed → <see cref="ValidationException"/>. DefaultBpm: null means omit (cannot clear an
/// existing BPM via null with this MVP contract).
/// </summary>
public sealed record UpdateArrangementCommand(
    Guid UserId,
    Guid GroupId,
    Guid ArrangementId,
    string? Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes,
    string? ChordTimingJson,
    int ExpectedVersion);

public sealed class UpdateArrangementHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IClock _clock;
    private readonly IGroupAuditStore? _audit;

    public UpdateArrangementHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IClock clock,
        IGroupAuditStore? audit = null)
    {
        _access = access;
        _arrangements = arrangements;
        _clock = clock;
        _audit = audit;
    }

    public async Task<ArrangementDetailDto> HandleAsync(
        UpdateArrangementCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequirePermissionAsync(command.GroupId, command.UserId, GroupPermissions.ArrangementEdit, cancellationToken);

        var arrangement = await _arrangements.GetByIdWithResourcesAsync(
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
            GroupPermissions.ArrangementEdit,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
            },
            cancellationToken);

        var label = command.Label ?? arrangement.Label;
        var defaultKey = command.DefaultKey ?? arrangement.DefaultKey;
        var defaultBpm = command.DefaultBpm ?? arrangement.DefaultBpm;
        var lyrics = command.Lyrics ?? arrangement.Lyrics;
        var chords = command.Chords ?? arrangement.Chords;
        var structure = command.Structure ?? arrangement.Structure;
        var notes = command.Notes ?? arrangement.Notes;
        string? chordTimingJson = command.ChordTimingJson is null
            ? arrangement.ChordTimingJson
            : ChordTimingJsonNormalizer.Normalize(command.ChordTimingJson);
        var importedTtml = RawTtmlLyrics.ConvertIfPresent(command.Chords) ?? RawTtmlLyrics.ConvertIfPresent(command.Lyrics);
        if (importedTtml is not null)
        {
            lyrics = importedTtml.Lyrics;
            chords = importedTtml.Lyrics;
            chordTimingJson = importedTtml.ChordTimingJson;
        }
        ChordTimingJsonNormalizer.ValidateWordReferences(
            chordTimingJson,
            string.IsNullOrWhiteSpace(chords) ? lyrics : chords);

        try
        {
            arrangement.Update(
                label,
                defaultKey,
                defaultBpm,
                lyrics,
                chords,
                structure,
                notes,
                chordTimingJson,
                command.ExpectedVersion,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _arrangements.UpdateAsync(arrangement, cancellationToken);
        if (_audit is not null)
        {
            await _audit.AddAsync(GroupAuditEntry.Create(
                command.GroupId, GroupAuditEntry.ActionArrangementUpdated, arrangement.UpdatedAt, actorUserId: command.UserId), cancellationToken);
        }
        await _arrangements.SaveChangesAsync(cancellationToken);

        var resources = new List<ResourceSummaryDto>();
        foreach (var resource in arrangement.Resources.OrderBy(r => r.CreatedAt).ThenBy(r => r.Id))
        {
            var canRead = await _access.HasResourceReadPathPermissionAsync(
                command.GroupId,
                command.UserId,
                new[]
                {
                    (ResourceGrant.ResourceTypes.Song, arrangement.SongId, GroupPermissions.SongView),
                    (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, GroupPermissions.ArrangementView),
                    (ResourceGrant.ResourceTypes.Resource, resource.Id, GroupPermissions.ResourceView),
                },
                cancellationToken);
            if (canRead)
            {
                resources.Add(CreateArrangementHandler.ToResourceSummary(resource));
            }
        }

        return CreateArrangementHandler.ToDetail(arrangement, resources);
    }
}
