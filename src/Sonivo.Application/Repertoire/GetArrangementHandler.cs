using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Repertoire;

public sealed class GetArrangementHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;

    public GetArrangementHandler(GroupAccessService access, IArrangementStore arrangements)
    {
        _access = access;
        _arrangements = arrangements;
    }

    public async Task<ArrangementDetailDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid arrangementId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);

        var arrangement = await _arrangements.GetByIdWithResourcesAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var resources = arrangement.Resources
            .OrderBy(r => r.CreatedAt)
            .ThenBy(r => r.Id)
            .Select(CreateArrangementHandler.ToResourceSummary)
            .ToList();

        return CreateArrangementHandler.ToDetail(arrangement, resources);
    }
}
