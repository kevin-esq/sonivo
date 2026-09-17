using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// PATCH semantics: null Label/DefaultKey/Lyrics/Chords/Structure/Notes/DefaultBpm keep current values.
/// Non-null optional strings are applied (whitespace-only → null in the domain).
/// DefaultBpm: null means omit (cannot clear an existing BPM via null with this MVP contract).
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
    int ExpectedVersion);

public sealed class UpdateArrangementHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IClock _clock;

    public UpdateArrangementHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IClock clock)
    {
        _access = access;
        _arrangements = arrangements;
        _clock = clock;
    }

    public async Task<ArrangementDetailDto> HandleAsync(
        UpdateArrangementCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var arrangement = await _arrangements.GetByIdWithResourcesAsync(
            command.GroupId,
            command.ArrangementId,
            cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var label = command.Label ?? arrangement.Label;
        var defaultKey = command.DefaultKey ?? arrangement.DefaultKey;
        var defaultBpm = command.DefaultBpm ?? arrangement.DefaultBpm;
        var lyrics = command.Lyrics ?? arrangement.Lyrics;
        var chords = command.Chords ?? arrangement.Chords;
        var structure = command.Structure ?? arrangement.Structure;
        var notes = command.Notes ?? arrangement.Notes;

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
        await _arrangements.SaveChangesAsync(cancellationToken);

        var resources = arrangement.Resources
            .OrderBy(r => r.CreatedAt)
            .ThenBy(r => r.Id)
            .Select(CreateArrangementHandler.ToResourceSummary)
            .ToList();

        return CreateArrangementHandler.ToDetail(arrangement, resources);
    }
}
