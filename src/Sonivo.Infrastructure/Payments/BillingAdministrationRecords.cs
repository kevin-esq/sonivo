namespace Sonivo.Infrastructure.Payments;

public sealed class BillingAdminRequestNonce
{
    public string Environment { get; set; } = "sandbox";
    public string KeyId { get; set; } = "";
    public string Nonce { get; set; } = "";
    public Guid? OrganizationId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class BillingAdminOperation
{
    public string Environment { get; set; } = "sandbox";
    public Guid OperationId { get; set; }
    public Guid? OrganizationId { get; set; }
    public string RequestFingerprint { get; set; } = "";
    public string ServiceId { get; set; } = "";
    public string AssertedActorId { get; set; } = "";
    public string ResultJson { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BillingAdminSuspension
{
    public Guid OrganizationId { get; set; }
    public string Environment { get; set; } = "sandbox";
    public bool IsSuspended { get; set; }
    public string Reason { get; set; } = "";
    public string ServiceId { get; set; } = "";
    public string AssertedActorId { get; set; } = "";
    public DateTimeOffset ChangedAt { get; set; }
}

public sealed class BillingAdminRequestAudit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Environment { get; set; } = "sandbox";
    public string KeyId { get; set; } = "";
    public string ServiceId { get; set; } = "";
    public string AssertedActorId { get; set; } = "";
    public Guid OperationId { get; set; }
    public Guid? OrganizationId { get; set; }
    public string Method { get; set; } = "";
    public string Path { get; set; } = "";
    public int OutcomeStatus { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
