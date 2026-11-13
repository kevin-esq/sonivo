namespace Sonivo.Domain.Tenancy;

public sealed class GroupOwnershipTransfer
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid FromUserId { get; private set; }
    public Guid ToUserId { get; private set; }
    public DateTimeOffset RequestedAt { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset? AcceptedAt { get; private set; }
    public DateTimeOffset? CancelledAt { get; private set; }
    public DateTimeOffset? ExpiredAt { get; private set; }

    private GroupOwnershipTransfer() { }

    public static GroupOwnershipTransfer Create(Guid groupId, Guid fromUserId, Guid toUserId,
        DateTimeOffset now, Guid? id = null)
    {
        if (groupId == Guid.Empty || fromUserId == Guid.Empty || toUserId == Guid.Empty || fromUserId == toUserId)
            throw new ArgumentException("A Group and two different member accounts are required.");
        return new() { Id = id ?? Guid.NewGuid(), GroupId = groupId, FromUserId = fromUserId,
            ToUserId = toUserId, RequestedAt = now, ExpiresAt = now.AddDays(7) };
    }

    public bool ExpireIfDue(DateTimeOffset now)
    {
        if (!IsPending || now < ExpiresAt) return false;
        ExpiredAt = ExpiresAt;
        return true;
    }

    public void Accept(Guid userId, DateTimeOffset now)
    {
        if (userId != ToUserId || !IsPending || now >= ExpiresAt)
            throw new InvalidOperationException("Ownership transfer is not available to this member.");
        AcceptedAt = now;
    }

    public void Cancel(Guid ownerUserId, DateTimeOffset now)
    {
        if (ownerUserId != FromUserId || !IsPending)
            throw new InvalidOperationException("Ownership transfer cannot be cancelled.");
        CancelledAt = now;
    }

    public bool IsPending => AcceptedAt is null && CancelledAt is null && ExpiredAt is null;
}
