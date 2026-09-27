namespace Sonivo.Application.Payments;

public record CheckoutSessionRequest(
    string UserId,
    string GroupId,
    string PlanId,
    string SuccessUrl,
    string CancelUrl
);

public record CheckoutSessionResult(
    string SessionId,
    string RedirectUrl
);

public interface IPaymentGateway
{
    string ProviderName { get; }

    Task<CheckoutSessionResult> CreateCheckoutSessionAsync(
        CheckoutSessionRequest request,
        CancellationToken cancellationToken = default);

    Task CancelSubscriptionAsync(
        string externalSubscriptionId,
        CancellationToken cancellationToken = default);
}
