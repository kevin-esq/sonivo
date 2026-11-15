using Sonivo.Application.Billing;
using Sonivo.Application.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace Sonivo.Api.Billing;

internal static class BillingAdministrationEndpoints
{
    private sealed record GrantRequest(string? PlanId, DateTimeOffset? ExpiresAt, string? Reason);
    private sealed record ReasonRequest(string? Reason);

    public static void MapBillingAdministrationEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/admin/v1").RequireRateLimiting("admin-service")
            .WithTags("Billing Administration").AllowAnonymous();
        routes.MapGet("/accounts", async (HttpContext http, int? page, int? pageSize,
            [FromServices] IBillingAdministrationService service, CancellationToken ct) =>
        {
            var actor = Actor(http, BillingAdminPermissions.AccountsRead);
            return Results.Ok(await service.ListAccountsAsync(actor, page ?? 1, pageSize ?? 25, ct));
        });
        routes.MapGet("/accounts/{organizationId:guid}", async (HttpContext http, Guid organizationId,
            [FromServices] IBillingAdministrationService service, CancellationToken ct) =>
        {
            var actor = Actor(http, BillingAdminPermissions.AccountsRead);
            return Results.Ok(await service.GetAccountAsync(actor, organizationId, ct));
        });
        routes.MapGet("/accounts/{organizationId:guid}/payments", async (HttpContext http, Guid organizationId,
            [FromServices] IBillingAdministrationService service, CancellationToken ct) =>
        {
            var actor = Actor(http, BillingAdminPermissions.PaymentsRead);
            return Results.Ok(await service.GetPaymentsAsync(actor, organizationId, ct));
        });
        routes.MapGet("/accounts/{organizationId:guid}/referrals", async (HttpContext http, Guid organizationId,
            [FromServices] IBillingAdministrationService service, CancellationToken ct) =>
        {
            var actor = Actor(http, BillingAdminPermissions.ReferralsRead);
            return Results.Ok(await service.GetReferralsAsync(actor, organizationId, ct));
        });
        routes.MapGet("/accounts/{organizationId:guid}/grants", async (HttpContext http, Guid organizationId,
            [FromServices] IBillingAdministrationService service, CancellationToken ct) =>
        {
            var actor = Actor(http, BillingAdminPermissions.GrantsRead);
            return Results.Ok(await service.GetGrantsAsync(actor, organizationId, ct));
        });
        routes.MapPost("/accounts/{organizationId:guid}/grants", async (HttpContext http, Guid organizationId,
            GrantRequest? request, [FromServices] IBillingAdministrationService service, CancellationToken ct) =>
        {
            var actor = Actor(http, BillingAdminPermissions.GrantsWrite);
            if (string.IsNullOrWhiteSpace(request?.PlanId) || request.ExpiresAt is not { } expiresAt
                || string.IsNullOrWhiteSpace(request.Reason))
                throw new ValidationException("billing-grant-request-invalid");
            return Results.Ok(await service.CreateGrantAsync(actor, organizationId,
                request.PlanId, expiresAt, request.Reason, ct));
        });
        routes.MapPost("/accounts/{organizationId:guid}/grants/{grantId:guid}/revoke", async (
            HttpContext http, Guid organizationId, Guid grantId, [FromServices] IBillingAdministrationService service,
            CancellationToken ct) => Results.Ok(await service.RevokeGrantAsync(
                Actor(http, BillingAdminPermissions.GrantsWrite), organizationId, grantId, ct)));
        routes.MapPost("/accounts/{organizationId:guid}/suspension", async (HttpContext http,
            Guid organizationId, ReasonRequest? request, [FromServices] IBillingAdministrationService service,
            CancellationToken ct) =>
        {
            var actor = Actor(http, BillingAdminPermissions.AccessSuspend);
            if (string.IsNullOrWhiteSpace(request?.Reason)) throw new ValidationException("billing-admin-reason-required");
            return Results.Ok(await service.SetSuspensionAsync(actor, organizationId, true, request.Reason, ct));
        });
        routes.MapPost("/accounts/{organizationId:guid}/reactivation", async (HttpContext http,
            Guid organizationId, ReasonRequest? request, [FromServices] IBillingAdministrationService service,
            CancellationToken ct) =>
        {
            var actor = Actor(http, "access.suspend");
            if (string.IsNullOrWhiteSpace(request?.Reason)) throw new ValidationException("billing-admin-reason-required");
            return Results.Ok(await service.SetSuspensionAsync(actor, organizationId, false, request.Reason, ct));
        });
    }

    private static BillingAdminActor Actor(HttpContext context, string requiredScope)
    {
        if (context.Items[AdminServiceIdentity.ItemKey] is not AdminServiceIdentity identity
            || !identity.Scopes.Contains(requiredScope))
            throw new ForbiddenException("Administrative service scope is not allowed.");
        var environment = context.RequestServices.GetRequiredService<IConfiguration>()[
            "Payments:Stripe:Environment"] ?? "sandbox";
        return new BillingAdminActor(identity.ServiceId, identity.ActorId, identity.KeyId, requiredScope,
            environment, Guid.Parse(identity.OperationId), identity.Fingerprint);
    }
}
