using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Billing;

public sealed record BillingSelection(string PlanId, string Interval, int ExtraGroups = 0);
public sealed record BillingCommand(string OperationId, BillingSelection Selection, bool RecurringConsent = false);
public sealed record BillingSummary(Guid OrganizationId, bool CanManage, string PlanId, string Status,
    string Interval, DateTimeOffset? PeriodEndsAt, DateTimeOffset? TrialEndsAt, bool CancelAtPeriodEnd,
    bool CanCreate, bool LegacyAccess, int ExtraGroups, string? ScheduledPlanId, IReadOnlyList<Guid> GroupIds,
    bool HasSubscription = false, bool CanStartTrial = false, DateTimeOffset? TemporaryAccessEndsAt = null);
public sealed record BillingLink(string Url);
public sealed record PaymentMethodSetup(string ClientSecret, string PublishableKey);
public sealed record BillingPaymentMethod(string Brand, string Last4, long ExpMonth, long ExpYear);
public sealed record BillingHistoryEntry(string Id, string? InvoiceId, string Status, long AmountMinor,
    string Currency, DateTimeOffset EventAt, DateTimeOffset? PeriodStart, DateTimeOffset? PeriodEnd);
public sealed record BillingQuote(long AmountDue, string Currency, string QuoteId);
public sealed record BillingAccessGrantSummary(Guid Id, Guid OrganizationId, string PlanId,
    DateTimeOffset StartsAt, DateTimeOffset ExpiresAt, string Reason, Guid GrantedByUserId,
    DateTimeOffset? RevokedAt, Guid? RevokedByUserId);
public sealed record BillingAccessGrantCommand(Guid OperationId, string PlanId,
    DateTimeOffset ExpiresAt, string Reason);
public sealed record BillingReferralSummary(string ReferralCode, string? AttributedToCode,
    int ReferredOrganizations, int RewardedDays, int PendingDays);

/// <summary>Authorized financial operations; Group identity is always checked server-side.</summary>
public interface IBillingService
{
    Task<BillingSummary> GetAsync(Guid userId, Guid groupId, CancellationToken cancellationToken);
    Task<IReadOnlyList<BillingSummary>> GetOrganizationsAsync(Guid userId, CancellationToken cancellationToken);
    Task<IReadOnlyList<BillingHistoryEntry>> GetHistoryAsync(Guid userId, Guid organizationId, CancellationToken cancellationToken);
    Task<BillingLink> PortalOrganizationAsync(Guid userId, Guid organizationId, string operationId, CancellationToken cancellationToken);
    Task<BillingLink> CheckoutAsync(Guid userId, Guid groupId, BillingCommand command, CancellationToken cancellationToken);
    Task<BillingLink> PortalAsync(Guid userId, Guid groupId, string operationId, CancellationToken cancellationToken);
    Task<PaymentMethodSetup> CreatePaymentMethodSetupAsync(Guid userId, Guid groupId, string operationId, CancellationToken cancellationToken);
    Task<BillingPaymentMethod?> GetPaymentMethodAsync(Guid userId, Guid groupId, CancellationToken cancellationToken);
    Task<BillingPaymentMethod> ConfirmPaymentMethodAsync(Guid userId, Guid groupId, string setupIntentId, string operationId, CancellationToken cancellationToken);
    Task TrialAsync(Guid userId, Guid groupId, string planId, CancellationToken cancellationToken);
    Task<BillingSummary> StartOrganizationTrialAsync(Guid userId, string planId, CancellationToken cancellationToken);
    Task<BillingQuote> PreviewAsync(Guid userId, Guid groupId, BillingSelection selection, CancellationToken cancellationToken);
    Task ChangeAsync(Guid userId, Guid groupId, BillingCommand command, string quoteId, CancellationToken cancellationToken);
    Task CancelAsync(Guid userId, Guid groupId, string operationId, bool cancel, CancellationToken cancellationToken);
    Task LinkGroupAsync(Guid userId, Guid groupId, Guid targetGroupId, bool link, CancellationToken cancellationToken);
    Task<bool> ReceiveAsync(string body, string signature, CancellationToken cancellationToken);
    Task<IReadOnlyList<BillingAccessGrantSummary>> GetAccessGrantsAsync(Guid administratorId,
        Guid organizationId, CancellationToken cancellationToken);
    Task<BillingAccessGrantSummary> GrantAccessAsync(Guid administratorId, Guid organizationId,
        BillingAccessGrantCommand command, CancellationToken cancellationToken);
    Task RevokeAccessGrantAsync(Guid administratorId, Guid organizationId, Guid grantId,
        CancellationToken cancellationToken);
    Task<BillingReferralSummary> GetReferralAsync(Guid userId, Guid organizationId, CancellationToken cancellationToken);
    Task<BillingReferralSummary> AttributeReferralAsync(Guid userId, Guid organizationId, string referralCode,
        CancellationToken cancellationToken);
}

public interface IBillingPolicy
{
    Task ProjectAsync(Group group, CancellationToken cancellationToken);
    Task InitializeAsync(Group group, Guid ownerUserId, CancellationToken cancellationToken);
}
