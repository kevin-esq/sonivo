using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Tenancy;

public sealed class GetGroupHandler
{
    private readonly GroupAccessService _access;

    public GetGroupHandler(GroupAccessService access)
    {
        _access = access;
    }

    public async Task<GroupDto> HandleAsync(Guid userId, Guid groupId, CancellationToken cancellationToken)
    {
        var (group, membership) = await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        return new GroupDto(group.Id, group.Name, group.Version, membership.Role, group.CreatedAt, group.UpdatedAt);
    }
}
