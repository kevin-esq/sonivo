namespace Sonivo.Domain.Tenancy;

public sealed class Invitation
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string TokenHash { get; private set; } = string.Empty;
    public Guid CreatedByUserId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset? AcceptedAt { get; private set; }
    public Guid? AcceptedByUserId { get; private set; }

    private Invitation()
    {
    }

    public static Invitation Create(
        Guid groupId,
        string tokenHash,
        Guid createdByUserId,
        DateTimeOffset now,
        DateTimeOffset expiresAt,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        if (string.IsNullOrWhiteSpace(tokenHash))
        {
            throw new ArgumentException("Token hash is required.", nameof(tokenHash));
        }

        if (createdByUserId == Guid.Empty)
        {
            throw new ArgumentException("Creator is required.", nameof(createdByUserId));
        }

        return new Invitation
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            TokenHash = tokenHash.Trim(),
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            ExpiresAt = expiresAt
        };
    }

    public bool IsAccepted => AcceptedAt is not null;

    public bool IsExpired(DateTimeOffset now) => now >= ExpiresAt;

    public void Accept(Guid userId, DateTimeOffset now)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("User id is required.", nameof(userId));
        }

        if (IsAccepted)
        {
            throw new InvalidOperationException("Invitation already accepted.");
        }

        if (IsExpired(now))
        {
            throw new InvalidOperationException("Invitation has expired.");
        }

        AcceptedAt = now;
        AcceptedByUserId = userId;
    }
}
