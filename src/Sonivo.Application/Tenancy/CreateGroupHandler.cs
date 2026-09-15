using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record CreateGroupCommand(Guid UserId, string Name);
public sealed record GroupDto(Guid Id, string Name, int Version, string? Role, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed class CreateGroupHandler
{
    private readonly IGroupStore _store;
    private readonly IClock _clock;

    public CreateGroupHandler(IGroupStore store, IClock clock)
    {
        _store = store;
        _clock = clock;
    }

    public async Task<GroupDto> HandleAsync(CreateGroupCommand command, CancellationToken cancellationToken)
    {
        if (command.UserId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        try
        {
            var now = _clock.UtcNow;
            var group = Group.Create(command.Name, now);
            var ownership = Membership.CreateOwner(group.Id, command.UserId, now);
            await _store.AddAsync(group, ownership, cancellationToken);
            await _store.SaveChangesAsync(cancellationToken);

            return new GroupDto(group.Id, group.Name, group.Version, MembershipRoles.Owner, group.CreatedAt, group.UpdatedAt);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }
}
