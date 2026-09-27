using Sonivo.Application.Payments;

namespace Sonivo.Infrastructure.Payments;

public class StripePaymentGateway : IPaymentGateway
{
    public string ProviderName => "Stripe";

    public Task<CheckoutSessionResult> CreateCheckoutSessionAsync(
        CheckoutSessionRequest request,
        CancellationToken cancellationToken = default)
    {
        // Stub / Mock integration for Stripe Checkout Session URL
        var mockSessionId = $"cs_stripe_{Guid.NewGuid():N}";
        var redirectUrl = $"{request.SuccessUrl}?session_id={mockSessionId}&provider=stripe";

        return Task.FromResult(new CheckoutSessionResult(mockSessionId, redirectUrl));
    }

    public Task CancelSubscriptionAsync(
        string externalSubscriptionId,
        CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }
}

public class MercadoPagoPaymentGateway : IPaymentGateway
{
    public string ProviderName => "MercadoPago";

    public Task<CheckoutSessionResult> CreateCheckoutSessionAsync(
        CheckoutSessionRequest request,
        CancellationToken cancellationToken = default)
    {
        // Stub / Mock integration for Mercado Pago Preference / Checkout URL
        var mockPreferenceId = $"pref_mp_{Guid.NewGuid():N}";
        var redirectUrl = $"{request.SuccessUrl}?preference_id={mockPreferenceId}&provider=mercadopago";

        return Task.FromResult(new CheckoutSessionResult(mockPreferenceId, redirectUrl));
    }

    public Task CancelSubscriptionAsync(
        string externalSubscriptionId,
        CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }
}
