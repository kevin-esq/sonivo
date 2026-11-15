using Sonivo.Domain.Billing;

namespace Sonivo.Application.Billing;

public static class BillingAdminPermissions
{
    public const string AccountsRead = "accounts.read";
    public const string PaymentsRead = "payments.read";
    public const string ReferralsRead = "referrals.read";
    public const string GrantsRead = "grants.read";
    public const string GrantsWrite = "grants.write";
    public const string AccessSuspend = "access.suspend";

    public static bool IsValid(string? value) => value is AccountsRead or PaymentsRead or ReferralsRead
        or GrantsRead or GrantsWrite or AccessSuspend;
}

public sealed record BillingAdminActor(string ServiceId, string ActorId, string KeyId, string Permission,
    string Environment, Guid OperationId, string RequestFingerprint);
public sealed record BillingAdminAccountRow(Guid Id, string PlanId, string Status,
    DateTimeOffset CreatedAt, int GroupCount);
public sealed record BillingAdminGroupSummary(Guid Id, string Name, bool Archived, bool InTrash,
    int Members, int Songs, int Setlists, int EventsThisMonth, long StorageBytes);
public sealed record BillingAdminSuspensionSummary(bool IsSuspended, string? Reason,
    DateTimeOffset? ChangedAt, string? ServiceId, string? AssertedActorId);
public sealed record BillingAdminAccountDetails(Guid Id, Guid OwnerUserId, string OwnerName,
    string OwnerEmail, string Environment, string PlanId, string ProviderStatus, string AccessStatus,
    DateTimeOffset CreatedAt, DateTimeOffset? PeriodEndsAt, DateTimeOffset? TrialEndsAt,
    bool CancelAtPeriodEnd, string? CustomerId, string? SubscriptionId,
    PlanLimits Limits, PlanFeatures Features, IReadOnlyList<BillingAdminGroupSummary> Groups,
    BillingAdminSuspensionSummary Suspension);
public sealed record BillingAdminPayment(string EventId, string EventType, string? InvoiceId,
    string? SubscriptionId, string? PaymentIntentId, string? RefundId, string? DisputeId,
    long AmountMinor, string Currency, string Status, DateTimeOffset EventAt,
    DateTimeOffset? PeriodStart, DateTimeOffset? PeriodEnd);
public sealed record BillingAdminReward(Guid Id, Guid ReferredOrganizationId, string InvoiceId,
    int Days, string Status, string? PendingReason, DateTimeOffset CreatedAt,
    DateTimeOffset? AppliedAt, DateTimeOffset? FreeThrough);
public sealed record BillingAdminReferral(string? ReferralCode, Guid? ReferrerOrganizationId,
    string? QualifiedInvoiceId, string? QualifiedEventId, IReadOnlyList<BillingAdminReward> Rewards);
public sealed record BillingAdminWriteResult(Guid OperationId, string Status,
    BillingAccessGrantSummary? Grant, BillingAdminSuspensionSummary? Suspension);

public interface IBillingAdministrationService
{
    Task<IReadOnlyList<BillingAdminAccountRow>> ListAccountsAsync(BillingAdminActor actor,
        int page, int pageSize, CancellationToken cancellationToken);
    Task<BillingAdminAccountDetails> GetAccountAsync(BillingAdminActor actor, Guid organizationId,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<BillingAdminPayment>> GetPaymentsAsync(BillingAdminActor actor,
        Guid organizationId, CancellationToken cancellationToken);
    Task<BillingAdminReferral> GetReferralsAsync(BillingAdminActor actor,
        Guid organizationId, CancellationToken cancellationToken);
    Task<IReadOnlyList<BillingAccessGrantSummary>> GetGrantsAsync(BillingAdminActor actor,
        Guid organizationId, CancellationToken cancellationToken);
    Task<BillingAdminWriteResult> CreateGrantAsync(BillingAdminActor actor, Guid organizationId,
        string planId, DateTimeOffset expiresAt, string reason, CancellationToken cancellationToken);
    Task<BillingAdminWriteResult> RevokeGrantAsync(BillingAdminActor actor, Guid organizationId,
        Guid grantId, CancellationToken cancellationToken);
    Task<BillingAdminWriteResult> SetSuspensionAsync(BillingAdminActor actor, Guid organizationId,
        bool suspended, string reason, CancellationToken cancellationToken);
}
