using System.Text;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed class ConvertChordSheetHandler
{
    public const int MaxInputBytes = 128 * 1024;

    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;

    public ConvertChordSheetHandler(GroupAccessService access, IArrangementStore arrangements)
    {
        _access = access;
        _arrangements = arrangements;
    }

    public async Task<string> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid arrangementId,
        string text,
        CancellationToken cancellationToken)
    {
        if (text is null) throw new ValidationException("Chord sheet text is required.");
        if (Encoding.UTF8.GetByteCount(text) > MaxInputBytes)
        {
            throw new ValidationException("Chord sheet exceeds the maximum size.");
        }

        await _access.RequirePermissionAsync(groupId, userId, GroupPermissions.ArrangementEdit, cancellationToken);
        var arrangement = await _arrangements.GetByIdWithResourcesAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null) throw new NotFoundException("Arrangement not found.");

        await _access.RequireResourcePathPermissionAsync(
            groupId,
            userId,
            GroupPermissions.ArrangementEdit,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
            },
            cancellationToken);

        return ChordSheetConverter.ToChordPro(text);
    }
}
