using System.Security.Claims;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
using Sonivo.Domain.Billing;

namespace Sonivo.Api.Billing;

internal static class BillingEndpoints
{
    internal sealed record OperationRequest(string? OperationId);
    internal sealed record PaymentMethodSetupRequest(string? OperationId);
    internal sealed record PaymentMethodConfirmRequest(string? SetupIntentId, string? OperationId);
    internal sealed record TrialRequest(string? PlanId);
    internal sealed record ChangeRequest(string? OperationId, BillingSelection? Selection, string? QuoteId, bool RecurringConsent = false);
    internal sealed record CancelRequest(string? OperationId, bool Cancel);
    internal sealed record GrantRequest(string? OperationId, string? PlanId, DateTimeOffset? ExpiresAt, string? Reason);
    internal sealed record ReferralRequest(string? Code);

    public static void MapBillingEndpoints(this WebApplication app)
    {
        if (!string.Equals(app.Configuration["Payments:Provider"], "stripe", StringComparison.OrdinalIgnoreCase)) return;
        var routes = app.MapGroup("/api/groups/{groupId:guid}/billing").RequireAuthorization().RequireRateLimiting("billing").WithTags("Billing");
        routes.MapGet("", (Guid groupId, ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
            => service.GetAsync(UserId(principal), groupId, ct));
        routes.MapPost("/portal", (Guid groupId, OperationRequest? request, ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
            => request?.OperationId is { } operationId
                ? service.PortalAsync(UserId(principal), groupId, operationId, ct)
                : throw new ValidationException("billing-operation-id-required"));
        routes.MapGet("/payment-method", (Guid groupId, ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
            => service.GetPaymentMethodAsync(UserId(principal), groupId, ct));
        routes.MapPost("/payment-method/setup", (Guid groupId, PaymentMethodSetupRequest? request, ClaimsPrincipal principal,
            IBillingService service, CancellationToken ct)
            => request?.OperationId is { } operationId
                ? service.CreatePaymentMethodSetupAsync(UserId(principal), groupId, operationId, ct)
                : throw new ValidationException("billing-operation-id-required"));
        routes.MapPost("/payment-method/confirm", (Guid groupId, PaymentMethodConfirmRequest? request, ClaimsPrincipal principal,
            IBillingService service, CancellationToken ct)
            => request?.SetupIntentId is { Length: > 0 } setupIntentId && request.OperationId is { Length: > 0 } operationId
                ? service.ConfirmPaymentMethodAsync(UserId(principal), groupId, setupIntentId, operationId, ct)
                : throw new ValidationException("billing-payment-method-confirmation-invalid"));
        routes.MapPost("/trial", async (Guid groupId, TrialRequest? request, ClaimsPrincipal principal, IBillingService service, CancellationToken ct) =>
        { if (string.IsNullOrWhiteSpace(request?.PlanId)) throw new ValidationException("billing-plan-required"); await service.TrialAsync(UserId(principal), groupId, request.PlanId, ct); return Results.NoContent(); });
        routes.MapPost("/preview", (Guid groupId, BillingSelection? request, ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
            => request is not null
                ? service.PreviewAsync(UserId(principal), groupId, request, ct)
                : throw new ValidationException("billing-selection-required"));
        routes.MapPost("/change", async (Guid groupId, ChangeRequest? request, ClaimsPrincipal principal, IBillingService service, CancellationToken ct) =>
        {
            if (request?.Selection is null || string.IsNullOrWhiteSpace(request.OperationId) || string.IsNullOrWhiteSpace(request.QuoteId))
                throw new ValidationException("billing-change-request-invalid");
            if (!request.RecurringConsent) throw new ValidationException("billing-recurring-consent-required");
            Validate(request.Selection);
            await service.ChangeAsync(UserId(principal), groupId,
                new(request.OperationId, request.Selection, request.RecurringConsent), request.QuoteId, ct);
            return Results.Accepted();
        });
        routes.MapPost("/cancellation", async (Guid groupId, CancelRequest? request, ClaimsPrincipal principal, IBillingService service, CancellationToken ct) =>
        { if (string.IsNullOrWhiteSpace(request?.OperationId)) throw new ValidationException("billing-operation-id-required"); await service.CancelAsync(UserId(principal), groupId, request.OperationId, request.Cancel, ct); return Results.Accepted(); });
        routes.MapPut("/groups/{targetGroupId:guid}", async (Guid groupId, Guid targetGroupId, ClaimsPrincipal principal, IBillingService service, CancellationToken ct) =>
        { await service.LinkGroupAsync(UserId(principal), groupId, targetGroupId, true, ct); return Results.NoContent(); });
        routes.MapDelete("/groups/{targetGroupId:guid}", async (Guid groupId, Guid targetGroupId, ClaimsPrincipal principal, IBillingService service, CancellationToken ct) =>
        { await service.LinkGroupAsync(UserId(principal), groupId, targetGroupId, false, ct); return Results.NoContent(); });

        var accounts = app.MapGroup("/api/billing/organizations").RequireAuthorization()
            .RequireRateLimiting("billing").WithTags("Billing");
        accounts.MapGet("", (ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
            => service.GetOrganizationsAsync(UserId(principal), ct));
        accounts.MapPost("/trial", async (TrialRequest? request, ClaimsPrincipal principal,
            IBillingService service, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request?.PlanId)) throw new ValidationException("billing-plan-required");
            return Results.Ok(await service.StartOrganizationTrialAsync(UserId(principal), request.PlanId, ct));
        });
        accounts.MapGet("/{organizationId:guid}/history", (Guid organizationId, ClaimsPrincipal principal,
            IBillingService service, CancellationToken ct)
            => service.GetHistoryAsync(UserId(principal), organizationId, ct));
        accounts.MapPost("/{organizationId:guid}/portal", (Guid organizationId, OperationRequest? request,
            ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
            => request?.OperationId is { } operationId
                ? service.PortalOrganizationAsync(UserId(principal), organizationId, operationId, ct)
                : throw new ValidationException("billing-operation-id-required"));
        accounts.MapPost("/{organizationId:guid}/referral-code", (Guid organizationId, ClaimsPrincipal principal,
            IBillingService service, CancellationToken ct)
            => service.GetReferralAsync(UserId(principal), organizationId, ct));
        accounts.MapPost("/{organizationId:guid}/referrals/attribute", (Guid organizationId, ReferralRequest? request,
            ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
            => request?.Code is { Length: > 0 } code
                ? service.AttributeReferralAsync(UserId(principal), organizationId, code, ct)
                : throw new ValidationException("billing-referral-code-required"));

        if (app.Configuration.GetValue<bool>("Payments:EnableAdminGrants"))
        {
            var administration = app.MapGroup("/api/admin/billing").RequireAuthorization("platform-admin")
                .RequireRateLimiting("billing").WithTags("Billing Administration");
            administration.MapGet("/organizations/{organizationId:guid}/grants", (Guid organizationId,
                ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
                => service.GetAccessGrantsAsync(UserId(principal), organizationId, ct));
            administration.MapPost("/organizations/{organizationId:guid}/grants", (Guid organizationId,
                GrantRequest? request, ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
                => request?.OperationId is { } operationId && Guid.TryParse(operationId, out var parsed)
                    && parsed != Guid.Empty && request.PlanId is { Length: > 0 } planId
                    && request.ExpiresAt is { } expiresAt && request.Reason is { Length: > 0 } reason
                        ? service.GrantAccessAsync(UserId(principal), organizationId,
                            new(parsed, planId, expiresAt, reason), ct)
                        : throw new ValidationException("billing-grant-request-invalid"));
            administration.MapPost("/organizations/{organizationId:guid}/grants/{grantId:guid}/revoke",
                (Guid organizationId, Guid grantId, ClaimsPrincipal principal, IBillingService service, CancellationToken ct)
                    => service.RevokeAccessGrantAsync(UserId(principal), organizationId, grantId, ct));
        }
    }

    private static Guid UserId(ClaimsPrincipal principal) => Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id != Guid.Empty
        ? id : throw new ForbiddenException("Authenticated user is required.");
    private static void Validate(BillingSelection selection)
    {
        if (selection.Interval != "month" || selection.ExtraGroups != 0)
            throw new ValidationException("billing-selection-not-available");
        try { BillingOrganization.ValidatePlan(selection.PlanId, selection.Interval, selection.ExtraGroups); }
        catch (ArgumentException) { throw new ValidationException("billing-invalid-selection"); }
    }
}
