using Sonivo.Application.Tenancy;
using Sonivo.Domain.Billing.Payments;

namespace Sonivo.Application.Billing.Payments;

public sealed record StartCheckoutCommand(
    Guid UserId,
    Guid GroupId,
    string PlanId,
    string SuccessUrl,
    string CancelUrl);

public sealed record StartCheckoutResult(string CheckoutUrl);

/// <summary>Raised when the active provider has no credentials (e.g. Manual).</summary>
public sealed class PaymentNotConfiguredException : Exception
{
    public PaymentNotConfiguredException()
        : base("No hay una pasarela de pago configurada.")
    {
    }
}

/// <summary>
/// Starts a hosted checkout for the group's owner (ADR-0073 §9.13). Owner-only;
/// the provider must be configured, otherwise the caller falls back to manual
/// plan assignment. Nothing is charged here — the provider owns that.
/// </summary>
public sealed class StartCheckoutHandler
{
    private readonly GroupAccessService _access;
    private readonly IPaymentProvider _provider;

    public StartCheckoutHandler(GroupAccessService access, IPaymentProvider provider)
    {
        _access = access;
        _provider = provider;
    }

    public async Task<StartCheckoutResult> HandleAsync(StartCheckoutCommand command, CancellationToken cancellationToken)
    {
        var (group, _) = await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        if (!_provider.IsConfigured)
        {
            throw new PaymentNotConfiguredException();
        }

        var session = _provider.CreateCheckoutSession(new CheckoutRequest(
            group.Id,
            command.PlanId,
            CustomerEmail: null,
            SuccessUrl: command.SuccessUrl,
            CancelUrl: command.CancelUrl));

        return new StartCheckoutResult(session.CheckoutUrl);
    }
}
