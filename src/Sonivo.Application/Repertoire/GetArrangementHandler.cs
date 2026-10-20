using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

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
        var arrangement = await _arrangements.GetByIdWithResourcesAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        await _access.RequireResourceReadPathPermissionAsync(
            groupId,
            userId,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId, GroupPermissions.SongView),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, GroupPermissions.ArrangementView),
            },
            cancellationToken);

        var resources = new List<ResourceSummaryDto>();
        foreach (var resource in arrangement.Resources.OrderBy(r => r.CreatedAt).ThenBy(r => r.Id))
        {
            var canRead = await _access.HasResourceReadPathPermissionAsync(
                groupId,
                userId,
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
