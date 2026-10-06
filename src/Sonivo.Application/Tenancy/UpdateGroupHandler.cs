using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Common;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record UpdateGroupCommand(Guid UserId, Guid GroupId, string Name, int ExpectedVersion);

public sealed class UpdateGroupHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupStore _store;
    private readonly IClock _clock;
    private readonly ILogger<UpdateGroupHandler>? _logger;

    public UpdateGroupHandler(
        GroupAccessService access,
        IGroupStore store,
        IClock clock,
        ILogger<UpdateGroupHandler>? logger = null)
    {
        _access = access;
        _store = store;
        _clock = clock;
        _logger = logger;
    }

    public async Task<GroupDto> HandleAsync(UpdateGroupCommand command, CancellationToken cancellationToken)
    {
        var (group, membership) = await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        try
        {
            group.Rename(command.Name, command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _store.UpdateAsync(group, cancellationToken);
        await _store.SaveChangesAsync(cancellationToken);

        _logger?.LogWarning(
            "Security event: group renamed. ActorUserId: {ActorUserId}, GroupId: {GroupId}",
            command.UserId,
            command.GroupId);

        return new GroupDto(
            group.Id,
            group.Name,
            group.Version,
            membership.Role,
            group.CreatedAt,
            group.UpdatedAt,
            group.Slug,
            group.PlanId,
            PlanCatalog.BrandingCapabilitiesFor(group.PlanId));
    }
}
