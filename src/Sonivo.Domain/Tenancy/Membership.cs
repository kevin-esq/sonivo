namespace Sonivo.Domain.Tenancy;

public sealed class Membership
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid UserId { get; private set; }
    public string Role { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }

    public Group? Group { get; private set; }

    private Membership()
    {
    }

    public static Membership CreateOwner(Guid groupId, Guid userId, DateTimeOffset now, Guid? id = null)
        => Create(groupId, userId, MembershipRoles.Owner, now, id);

    public static Membership CreateMember(Guid groupId, Guid userId, DateTimeOffset now, Guid? id = null)
        => Create(groupId, userId, MembershipRoles.Member, now, id);

    public bool IsOwner => Role == MembershipRoles.Owner;

    public void AssignRole(string role)
    {
        if (role is not (MembershipRoles.Owner or MembershipRoles.Member))
        {
            throw new ArgumentException("Role must be Owner or Member.", nameof(role));
        }

        Role = role;
    }

    private static Membership Create(
        Guid groupId,
        Guid userId,
        string role,
        DateTimeOffset now,
        Guid? id)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("GroupId is required.", nameof(groupId));
        }

        if (userId == Guid.Empty)
        {
            throw new ArgumentException("UserId is required.", nameof(userId));
        }

        if (role is not (MembershipRoles.Owner or MembershipRoles.Member))
        {
            throw new ArgumentException("Role must be Owner or Member.", nameof(role));
        }

        return new Membership
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            UserId = userId,
            Role = role,
            CreatedAt = now
        };
    }
}
