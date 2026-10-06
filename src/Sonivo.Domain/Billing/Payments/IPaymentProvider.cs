namespace Sonivo.Domain.Billing.Payments;

/// <summary>
/// Which payment provider implementation is active (ADR-0073 §9.13). `Manual`
/// keeps today's invoice/manual assignment; `Sandbox` is a deterministic,
/// signed test gateway used to exercise the subscription lifecycle end to end.
/// Real providers (Stripe/Mercado Pago/Conekta) plug in as new values + adapters.
/// </summary>
public enum PaymentProviderKind
{
    Manual = 0,
    Sandbox = 1
}

/// <summary>Inputs to open a hosted checkout for a plan change.</summary>
public sealed record CheckoutRequest(
    Guid GroupId,
    string PlanId,
    string? CustomerEmail,
    string SuccessUrl,
    string CancelUrl);

/// <summary>A hosted checkout session the client redirects to.</summary>
public sealed record CheckoutSession(string ProviderSessionId, string CheckoutUrl);

/// <summary>
/// A webhook after signature verification, normalized into the fields billing
/// cares about. The provider is responsible for parsing its own payload shape;
/// callers never read the raw body (ADR-0073 firewall).
/// </summary>
public sealed record VerifiedWebhook(
    string EventId,
    string EventType,
    Guid? GroupId,
    string? PlanId,
    string? Status,
    DateTimeOffset? CurrentPeriodEndsAt,
    bool CancelAtPeriodEnd);

/// <summary>
/// Provider-agnostic payment gateway boundary (ADR-0073 §9.13). Implementations
/// MUST verify webhook signatures with a secret from configuration (never git)
/// and MUST NOT be anonymously writable without that verification.
/// </summary>
public interface IPaymentProvider
{
    PaymentProviderKind Kind { get; }

    /// <summary>
    /// True when the provider is wired with credentials. A provider that is not
    /// configured must refuse checkouts and reject every webhook.
    /// </summary>
    bool IsConfigured { get; }

    /// <summary>Opens a hosted checkout session. Throws when not configured.</summary>
    CheckoutSession CreateCheckoutSession(CheckoutRequest request);

    /// <summary>
    /// Verifies the signature header over the raw payload and returns the
    /// normalized event, or <c>null</c> when the signature is missing/invalid.
    /// </summary>
    VerifiedWebhook? VerifyWebhook(string payload, string? signatureHeader);
}
