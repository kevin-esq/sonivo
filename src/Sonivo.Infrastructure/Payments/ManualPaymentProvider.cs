using Sonivo.Application.Billing.Payments;
using Sonivo.Domain.Billing.Payments;

namespace Sonivo.Infrastructure.Payments;

/// <summary>
/// Default provider (ADR-0073 §9.13): no gateway. Plans are assigned manually by
/// the Owner; every webhook is rejected because there is nothing to verify.
/// </summary>
public sealed class ManualPaymentProvider : IPaymentProvider
{
    public PaymentProviderKind Kind => PaymentProviderKind.Manual;

    public bool IsConfigured => false;

    public CheckoutSession CreateCheckoutSession(CheckoutRequest request) =>
        throw new PaymentNotConfiguredException();

    public VerifiedWebhook? VerifyWebhook(string payload, string? signatureHeader) => null;
}
