namespace Sonivo.Domain.Billing;

/// <summary>A time-limited, staff-issued entitlement overlay for one Billing Organization.</summary>
public sealed class BillingAccessGrant
{
    public Guid Id { get; private set; }
    public Guid OperationId { get; private set; }
    public string RequestFingerprint { get; private set; } = "";
    public Guid OrganizationId { get; private set; }
    public string PlanId { get; private set; } = PlanCatalog.Starter;
    public DateTimeOffset StartsAt { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public string Reason { get; private set; } = "";
    public Guid? GrantedByUserId { get; private set; }
    public string? GrantedByServiceId { get; private set; }
    public string? GrantedByActorId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? RevokedAt { get; private set; }
    public Guid? RevokedByUserId { get; private set; }
    public string? RevokedByServiceId { get; private set; }
    public string? RevokedByActorId { get; private set; }

    private BillingAccessGrant() { }

    public static BillingAccessGrant Create(Guid operationId, string requestFingerprint, Guid organizationId, string planId, DateTimeOffset startsAt,
        DateTimeOffset expiresAt, string reason, Guid grantedByUserId, DateTimeOffset now)
    {
        if (operationId == Guid.Empty || requestFingerprint.Length != 64 || organizationId == Guid.Empty || grantedByUserId == Guid.Empty)
            throw new ArgumentException("A Billing Organization and an administrator are required.");
        if (!PlanCatalog.IsKnown(planId)) throw new ArgumentException("Unknown plan.", nameof(planId));
        if (startsAt < now || expiresAt <= startsAt || expiresAt > startsAt.AddDays(90)) throw new ArgumentException("Grant dates are invalid.");
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 500)
            throw new ArgumentException("A reason of 1 to 500 characters is required.", nameof(reason));

        return new BillingAccessGrant
        {
            Id = Guid.NewGuid(), OperationId = operationId, RequestFingerprint = requestFingerprint,
            OrganizationId = organizationId, PlanId = planId,
            StartsAt = startsAt, ExpiresAt = expiresAt, Reason = reason.Trim(),
            GrantedByUserId = grantedByUserId, CreatedAt = now
        };
    }

    public static BillingAccessGrant CreateForService(Guid operationId, string requestFingerprint,
        Guid organizationId, string planId, DateTimeOffset startsAt, DateTimeOffset expiresAt,
        string reason, string serviceId, string actorId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(serviceId) || serviceId.Length > 100
            || string.IsNullOrWhiteSpace(actorId) || actorId.Length > 200)
            throw new ArgumentException("A service and asserted actor are required.");
        if (operationId == Guid.Empty || requestFingerprint.Length != 64 || organizationId == Guid.Empty
            || !PlanCatalog.IsKnown(planId) || startsAt < now || expiresAt <= startsAt
            || expiresAt > startsAt.AddDays(90) || string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 500)
            throw new ArgumentException("Grant details are invalid.");
        return new BillingAccessGrant
        {
            Id = Guid.NewGuid(), OperationId = operationId, RequestFingerprint = requestFingerprint,
            OrganizationId = organizationId, PlanId = planId, StartsAt = startsAt, ExpiresAt = expiresAt,
            Reason = reason.Trim(), GrantedByServiceId = serviceId, GrantedByActorId = actorId, CreatedAt = now
        };
    }

    public void Revoke(Guid administratorId, DateTimeOffset now)
    {
        if (administratorId == Guid.Empty) throw new ArgumentException("An administrator is required.", nameof(administratorId));
        if (RevokedAt is not null) return;
        RevokedAt = now;
        RevokedByUserId = administratorId;
    }

    public void RevokeByService(string serviceId, string actorId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(serviceId) || string.IsNullOrWhiteSpace(actorId))
            throw new ArgumentException("A service and asserted actor are required.");
        if (RevokedAt is not null) return;
        RevokedAt = now;
        RevokedByServiceId = serviceId;
        RevokedByActorId = actorId;
    }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && StartsAt <= now && now < ExpiresAt;
}
