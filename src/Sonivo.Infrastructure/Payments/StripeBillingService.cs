using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Billing;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Payments;

/// <summary>Owns financial commands, persisted correlation and provider reconciliation.</summary>
public sealed partial class StripeBillingService(
    SonivoDbContext db, GroupAccessService access, IGroupDataOperation data,
    IGroupDatabaseScope scope, IClock clock, StripeBillingGateway gateway) : IBillingService
{
    public Task<IReadOnlyList<BillingSummary>> GetOrganizationsAsync(Guid userId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            var organizations = await db.BillingOrganizations.AsNoTracking()
                .Where(x => x.OwnerUserId == userId && x.Environment == gateway.Environment)
                .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(token);
            var trialUsed = await db.BillingTrials.AnyAsync(x => x.OwnerUserId == userId, token);
            var subscriptionUsed = organizations.Any(x => x.SubscriptionId is not null);
            var summaries = new List<BillingSummary>(organizations.Count);
            foreach (var organization in organizations)
            {
                var groups = await db.BillingGroups.AsNoTracking().Where(x => x.OrganizationId == organization.Id)
                    .Select(x => x.GroupId).ToListAsync(token);
                var now = clock.UtcNow;
                var grant = await BillingProjection.ActiveGrantAsync(db, organization.Id, now, token);
                summaries.Add(new BillingSummary(organization.Id, true, grant?.PlanId ?? organization.EffectivePlan(now),
                    grant is null ? organization.Status : "temporary_grant",
                    organization.Interval, organization.PeriodEndsAt, organization.TrialEndsAt,
                    organization.CancelAtPeriodEnd, grant is not null || organization.CanCreate(now), false, organization.ExtraGroups,
                    organization.ScheduledPlanId, groups, organization.SubscriptionId is not null
                        && organization.Status is not ("canceled" or "incomplete_expired"),
                    !subscriptionUsed && !trialUsed && organization.SubscriptionId is null
                        && organization.Status == "inactive" && organization.TrialEndsAt is null,
                    grant?.ExpiresAt));
            }
            return (IReadOnlyList<BillingSummary>)summaries;
        }, ct);

    public Task<IReadOnlyList<BillingHistoryEntry>> GetHistoryAsync(Guid userId, Guid organizationId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            if (!await db.BillingOrganizations.AsNoTracking().AnyAsync(x => x.Id == organizationId
                && x.OwnerUserId == userId && x.Environment == gateway.Environment, token))
                throw new NotFoundException("Billing account not found.");
            return (IReadOnlyList<BillingHistoryEntry>)await db.BillingFinancialEvents.AsNoTracking()
                .Where(x => x.OrganizationId == organizationId && x.Environment == gateway.Environment)
                .OrderByDescending(x => x.EventAt).ThenByDescending(x => x.EventId).Take(100)
                .Select(x => new BillingHistoryEntry(x.EventId, x.InvoiceId, x.Status, x.AmountMinor,
                    x.Currency, x.EventAt, x.PeriodStart, x.PeriodEnd)).ToListAsync(token);
        }, ct);

    public Task<BillingLink> PortalOrganizationAsync(Guid userId, Guid organizationId, string operationId,
        CancellationToken ct) => data.ExecuteAsUserAsync(userId, async token =>
    {
        if (!Guid.TryParse(operationId, out var operationGuid) || operationGuid == Guid.Empty)
            throw new ValidationException("billing-operation-id-required");
        var organization = await db.BillingOrganizations.SingleOrDefaultAsync(x => x.Id == organizationId
            && x.OwnerUserId == userId && x.Environment == gateway.Environment, token)
            ?? throw new NotFoundException("Billing account not found.");
        await LockAsync(organization.Id, token);
        await db.Entry(organization).ReloadAsync(token);
        if (organization.OwnerUserId != userId || organization.Environment != gateway.Environment)
            throw new NotFoundException("Billing account not found.");
        if (organization.CustomerId is null) throw new ConflictException("billing-customer-required");
        var id = Hash($"{organization.Id}:{operationGuid}");
        var fingerprint = Hash(JsonSerializer.Serialize(new { kind = "portal", organizationId }));
        var operation = await db.BillingOperations.SingleOrDefaultAsync(x => x.Id == id, token);
        if (operation is not null)
        {
            if (operation.Fingerprint != fingerprint) throw new ConflictException("billing-operation-reused");
            if (operation.Result is not null) return JsonSerializer.Deserialize<BillingLink>(operation.Result)!;
        }
        else
        {
            operation = new BillingOperation { Id = id, OrganizationId = organization.Id, Kind = "portal",
                Fingerprint = fingerprint, CreatedAt = clock.UtcNow };
            db.BillingOperations.Add(operation);
        }
        await gateway.ValidatePortalAsync(token);
        var session = await gateway.PostAsync("/v1/billing_portal/sessions", new()
        { ["customer"] = organization.CustomerId, ["return_url"] = gateway.ReturnUrl("portal"),
            ["configuration"] = gateway.PortalConfigurationId() }, id, token);
        var link = new BillingLink(session.GetProperty("url").GetString()!);
        operation.Result = JsonSerializer.Serialize(link);
        Audit(organization.Id, userId, "portal");
        await db.SaveChangesAsync(token);
        return link;
    }, ct);

    public Task<PaymentMethodSetup> CreatePaymentMethodSetupAsync(Guid userId, Guid groupId, string operationId,
        CancellationToken ct) => data.ExecuteAsUserAsync(userId, async token =>
    {
        if (!Guid.TryParse(operationId, out var operationGuid) || operationGuid == Guid.Empty)
            throw new ValidationException("billing-operation-id-required");
        var organization = await RequireOwnerAsync(userId, groupId, token);
        if (!gateway.CanWrite) throw new ValidationException("billing-charging-disabled");
        var publishableKey = gateway.PublishableKey();
        if (organization.SubscriptionId is null || organization.Status is not ("active" or "past_due" or "unpaid"))
            throw new ConflictException("billing-subscription-required");
        await LockAsync(organization.Id, token);
        await db.Entry(organization).ReloadAsync(token);
        await ValidateOwnersAsync(organization, token);
        if (organization.SubscriptionId is null || organization.Status is not ("active" or "past_due" or "unpaid"))
            throw new ConflictException("billing-subscription-required");
        await RequireWritableSubscriptionAsync(organization, token);
        await EnsureCustomerAsync(organization, token);
        await db.SaveChangesAsync(token);
        var setupIntent = await gateway.PostAsync("/v1/setup_intents", new()
        {
            ["customer"] = organization.CustomerId!, ["usage"] = "off_session",
            ["automatic_payment_methods[enabled]"] = "true",
            ["automatic_payment_methods[allow_redirects]"] = "never",
            ["allowed_payment_method_types[0]"] = "card",
            ["excluded_payment_method_types[0]"] = "link",
            ["metadata[billing_organization_id]"] = organization.Id.ToString(),
            ["metadata[purpose]"] = "default_subscription_payment_method"
        }, Hash($"payment-method-setup:{organization.Id}:{operationGuid}"), token);
        return new PaymentMethodSetup(setupIntent.GetProperty("client_secret").GetString()!, publishableKey);
    }, ct);

    public Task<BillingPaymentMethod?> GetPaymentMethodAsync(Guid userId, Guid groupId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            var organization = await RequireOwnerAsync(userId, groupId, token);
            if (organization.CustomerId is null) return null;
            if (organization.SubscriptionId is { } subscriptionId
                && organization.Status is "active" or "trialing" or "past_due" or "unpaid")
            {
                var subscription = await gateway.GetAsync($"/v1/subscriptions/{Uri.EscapeDataString(subscriptionId)}?expand[]=default_payment_method", token);
                if (subscription.TryGetProperty("default_payment_method", out var subscriptionMethod)
                    && subscriptionMethod.ValueKind == JsonValueKind.Object)
                    return ReadCard(subscriptionMethod);
            }
            var customer = await gateway.GetAsync($"/v1/customers/{Uri.EscapeDataString(organization.CustomerId)}?expand[]=invoice_settings.default_payment_method", token);
            var method = customer.GetProperty("invoice_settings").GetProperty("default_payment_method");
            if (method.ValueKind == JsonValueKind.Null) return null;
            return ReadCard(method);
        }, ct);

    public Task<BillingPaymentMethod> ConfirmPaymentMethodAsync(Guid userId, Guid groupId, string setupIntentId,
        string operationId, CancellationToken ct)
        => MutateAsync(userId, groupId, "payment-method-updated", operationId, new { setupIntentId }, async (organization, key, token) =>
        {
            var method = await ApplyPaymentMethodAsync(organization, setupIntentId, token);
            if (method is null) throw new ConflictException("billing-payment-method-not-confirmed");
            return method;
        }, ct);

    private async Task<BillingPaymentMethod?> ApplyPaymentMethodAsync(BillingOrganization organization, string setupIntentId,
        CancellationToken ct)
    {
        if (!setupIntentId.StartsWith("seti_", StringComparison.Ordinal) || organization.CustomerId is null) return null;
        var intent = await gateway.GetAsync($"/v1/setup_intents/{Uri.EscapeDataString(setupIntentId)}", ct);
        if (StripeBillingGateway.Text(intent, "customer") != organization.CustomerId
            || StripeBillingGateway.Text(intent, "status") != "succeeded"
            || StripeBillingGateway.Text(intent, "usage") != "off_session"
            || !intent.TryGetProperty("metadata", out var metadata)
            || StripeBillingGateway.Text(metadata, "billing_organization_id") != organization.Id.ToString()
            || StripeBillingGateway.Text(metadata, "purpose") != "default_subscription_payment_method"
            || StripeBillingGateway.Text(intent, "payment_method") is not { } paymentMethodId
            || !paymentMethodId.StartsWith("pm_", StringComparison.Ordinal)) return null;

        var paymentMethod = await gateway.GetAsync($"/v1/payment_methods/{Uri.EscapeDataString(paymentMethodId)}", ct);
        if (StripeBillingGateway.Text(paymentMethod, "type") != "card") return null;
        var cardSummary = ReadCard(paymentMethod);
        await RequireWritableSubscriptionAsync(organization, ct);

        await gateway.PostPaymentMethodAsync($"/v1/customers/{Uri.EscapeDataString(organization.CustomerId)}", new()
        {
            ["invoice_settings[default_payment_method]"] = paymentMethodId
        }, Hash($"payment-method-customer:{organization.Id}:{setupIntentId}"), ct);
        if (organization.SubscriptionId is { } subscriptionId)
        {
            await gateway.PostPaymentMethodAsync($"/v1/subscriptions/{Uri.EscapeDataString(subscriptionId)}", new()
            {
                ["default_payment_method"] = paymentMethodId
            }, Hash($"payment-method-subscription:{organization.Id}:{subscriptionId}:{setupIntentId}"), ct);
        }
        return cardSummary;
    }

    private async Task RequireWritableSubscriptionAsync(BillingOrganization organization, CancellationToken ct)
    {
        if (organization.CustomerId is null || organization.SubscriptionId is not { } subscriptionId
            || organization.Status is not ("active" or "past_due" or "unpaid"))
            throw new ConflictException("billing-subscription-required");
        var subscription = await gateway.GetAsync($"/v1/subscriptions/{Uri.EscapeDataString(subscriptionId)}", ct);
        if (StripeBillingGateway.Text(subscription, "customer") != organization.CustomerId
            || StripeBillingGateway.Text(subscription, "id") != subscriptionId)
            throw new ConflictException("billing-subscription-mismatch");
        if (StripeBillingGateway.Text(subscription, "status") is not ("active" or "past_due" or "unpaid"))
            throw new ConflictException("billing-subscription-required");
    }

    private static BillingPaymentMethod ReadCard(JsonElement method)
    {
        if (StripeBillingGateway.Text(method, "type") is { } type && type != "card")
            throw new ConflictException("billing-payment-method-invalid");
        var card = method.GetProperty("card");
        return new BillingPaymentMethod(StripeBillingGateway.Text(card, "display_brand")
            ?? StripeBillingGateway.Text(card, "brand") ?? "card",
            StripeBillingGateway.Text(card, "last4") ?? throw new ConflictException("billing-payment-method-invalid"),
            card.GetProperty("exp_month").GetInt64(), card.GetProperty("exp_year").GetInt64());
    }

    public Task<BillingSummary> GetAsync(Guid userId, Guid groupId, CancellationToken ct) => data.ExecuteAsUserAsync(userId, async token =>
    {
        var (group, member) = await access.RequireMemberAsync(groupId, userId, token);
        var link = await db.BillingGroups.SingleOrDefaultAsync(x => x.GroupId == groupId, token)
            ?? throw new ConflictException("billing-not-initialized");
        var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == link.OrganizationId, token);
        var manage = member.IsOwner && organization.OwnerUserId == userId;
        var groups = manage ? await db.BillingGroups.Where(x => x.OrganizationId == organization.Id).Select(x => x.GroupId).ToListAsync(token) : [groupId];
        var legacy = link.LegacyPlanId is not null && organization.SubscriptionId is null && organization.TrialEndsAt is null;
        var grant = await BillingProjection.ActiveGrantAsync(db, organization.Id, clock.UtcNow, token);
        return new BillingSummary(organization.Id, manage, grant?.PlanId ?? organization.EffectivePlan(clock.UtcNow),
            grant is null ? organization.Status : "temporary_grant", organization.Interval,
            organization.PeriodEndsAt, organization.TrialEndsAt, organization.CancelAtPeriodEnd,
            grant is not null || !group.CreationBlocked, legacy, organization.ExtraGroups, organization.ScheduledPlanId, groups,
            organization.SubscriptionId is not null && organization.Status is not ("canceled" or "incomplete_expired"),
            manage && organization.SubscriptionId is null && organization.Status == "inactive"
                && !await db.BillingTrials.AnyAsync(x => x.OrganizationId == organization.Id, token),
            grant?.ExpiresAt);
    }, ct);

    private Task<T> MutateAsync<T>(Guid userId, Guid groupId, string kind, string operationId, object input,
        Func<BillingOrganization, string, CancellationToken, Task<T>> action, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            if (!Guid.TryParse(operationId, out var operationGuid) || operationGuid == Guid.Empty)
                throw new ValidationException("billing-operation-id-required");
            var organization = await RequireOwnerAsync(userId, groupId, token);
            await LockAsync(organization.Id, token);
            await db.Entry(organization).ReloadAsync(token);
            await ValidateOwnersAsync(organization, token);
            var id = Hash($"{organization.Id}:{operationGuid}");
            var fingerprint = MutationFingerprint(kind, input);
            var operation = await db.BillingOperations.SingleOrDefaultAsync(x => x.Id == id, token);
            if (operation is not null)
            {
                if (operation.Fingerprint != fingerprint) throw new ConflictException("billing-operation-reused");
                if (operation.Result is not null) return JsonSerializer.Deserialize<T>(operation.Result)!;
            }
            else
            {
                operation = new() { Id = id, OrganizationId = organization.Id, Kind = kind, Fingerprint = fingerprint, CreatedAt = clock.UtcNow };
                db.BillingOperations.Add(operation);
            }
            var result = await action(organization, id, token);
            operation.Result = JsonSerializer.Serialize(result);
            Audit(organization.Id, userId, kind);
            await db.SaveChangesAsync(token);
            return result;
        }, ct);

    private async Task<BillingOrganization> RequireOwnerAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        await access.RequireOwnerForBillingAsync(groupId, userId, ct);
        var link = await db.BillingGroups.SingleOrDefaultAsync(x => x.GroupId == groupId, ct)
            ?? throw new ConflictException("billing-not-initialized");
        var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == link.OrganizationId, ct);
        if (organization.OwnerUserId != userId) throw new ForbiddenException("billing-owner-required");
        if (organization.Environment != gateway.Environment) throw new ConflictException("billing-environment-mismatch");
        return organization;
    }

    private async Task ValidateOwnersAsync(BillingOrganization organization, CancellationToken ct)
    {
        var groups = await db.BillingGroups.Where(x => x.OrganizationId == organization.Id).Select(x => x.GroupId).ToListAsync(ct);
        foreach (var id in groups) await access.RequireOwnerAsync(id, organization.OwnerUserId, ct);
    }

    internal async Task LockAsync(Guid id, CancellationToken ct)
    {
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({id.ToString()}, 0))", ct);
    }

    private async Task EnsureCustomerAsync(BillingOrganization organization, CancellationToken ct)
    {
        if (organization.CustomerId is not null) return;
        var customer = await gateway.PostAsync("/v1/customers", new() { ["metadata[organization_id]"] = organization.Id.ToString() },
            $"customer-{organization.Id}", ct);
        organization.SetCustomer(customer.GetProperty("id").GetString()!);
    }

    public Task<BillingLink> CheckoutAsync(Guid userId, Guid groupId, BillingCommand command, CancellationToken ct)
        => MutateAsync(userId, groupId, "checkout", command.OperationId,
            new { command.Selection, command.RecurringConsent }, async (organization, key, token) =>
        {
            if (!command.RecurringConsent) throw new ValidationException("billing-recurring-consent-required");
            Validate(command.Selection);
            if (organization.SubscriptionId is not null && organization.Status is not ("canceled" or "incomplete_expired"))
                throw new ConflictException("billing-subscription-exists");
            var existing = await db.BillingOperations.Where(x => x.OrganizationId == organization.Id && x.Kind == "checkout"
                && x.Result != null && x.CreatedAt > clock.UtcNow.AddHours(-23)).OrderByDescending(x => x.CreatedAt)
                .Select(x => new { x.Result, x.Fingerprint }).FirstOrDefaultAsync(token);
            if (existing is not null)
            {
                var fingerprint = Hash(JsonSerializer.Serialize(new
                {
                    kind = "checkout",
                    input = new { command.Selection, command.RecurringConsent }
                }));
                if (existing.Fingerprint != fingerprint)
                    throw new ConflictException("billing-checkout-already-open");
                return JsonSerializer.Deserialize<BillingLink>(existing.Result!)!;
            }
            await gateway.ValidatePriceAsync(command.Selection.PlanId, command.Selection.Interval, false, token);
            if (command.Selection.ExtraGroups > 0) await gateway.ValidatePriceAsync(PlanCatalog.Studio, command.Selection.Interval, true, token);
            await EnsureCustomerAsync(organization, token);
            var fields = new Dictionary<string, string>
            {
                ["mode"] = "subscription", ["customer"] = organization.CustomerId!,
                ["success_url"] = gateway.ReturnUrl("success"), ["cancel_url"] = gateway.ReturnUrl("cancelled"),
                ["line_items[0][price]"] = gateway.PriceId(command.Selection.PlanId, command.Selection.Interval), ["line_items[0][quantity]"] = "1",
                ["subscription_data[metadata][organization_id]"] = organization.Id.ToString(),
                ["client_reference_id"] = organization.Id.ToString()
            };
            if (command.Selection.PlanId == PlanCatalog.Studio) fields["payment_method_collection"] = "always";
            if (command.Selection.ExtraGroups > 0)
            {
                fields["line_items[1][price]"] = gateway.PriceId(PlanCatalog.Studio, command.Selection.Interval, true);
                fields["line_items[1][quantity]"] = command.Selection.ExtraGroups.ToString(CultureInfo.InvariantCulture);
            }
            var session = await gateway.PostAsync("/v1/checkout/sessions", fields, key, token);
            db.BillingAudit.Add(new() { OrganizationId = organization.Id, ActorUserId = userId,
                Action = ConsentAction(command.Selection), CreatedAt = clock.UtcNow });
            return new BillingLink(session.GetProperty("url").GetString()!);
        }, ct);

    public Task<BillingLink> PortalAsync(Guid userId, Guid groupId, string operationId, CancellationToken ct)
        => MutateAsync(userId, groupId, "portal", operationId, new { groupId }, async (organization, key, token) =>
        {
            if (organization.CustomerId is null) throw new ConflictException("billing-customer-required");
            var portalConfiguration = gateway.PortalConfigurationId();
            await gateway.ValidatePortalAsync(token);
            var session = await gateway.PostAsync("/v1/billing_portal/sessions", new()
            { ["customer"] = organization.CustomerId, ["return_url"] = gateway.ReturnUrl("portal"), ["configuration"] = portalConfiguration }, key, token);
            return new BillingLink(session.GetProperty("url").GetString()!);
        }, ct);

    public async Task TrialAsync(Guid userId, Guid groupId, string planId, CancellationToken ct)
    {
        await data.ExecuteAsUserAsync(userId, async token =>
        {
            if (planId != PlanCatalog.Pro) throw new ValidationException("billing-trial-only-pro");
            var organization = await RequireOwnerAsync(userId, groupId, token);
            await LockAsync(organization.Id, token);
            if (await db.BillingTrials.AnyAsync(x => x.OwnerUserId == userId, token)) throw new ConflictException("billing-trial-used");
            var end = clock.UtcNow.AddDays(14);
            organization.StartTrial(planId, end, clock.UtcNow);
            db.BillingTrials.Add(new() { OwnerUserId = userId, OrganizationId = organization.Id, StartedAt = clock.UtcNow, EndsAt = end });
            Audit(organization.Id, userId, "trial-started");
            await ProjectGroupsAsync(organization, token);
            await db.SaveChangesAsync(token);
            return true;
        }, ct);
    }

    public Task<BillingSummary> StartOrganizationTrialAsync(Guid userId, string planId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            if (planId != PlanCatalog.Pro) throw new ValidationException("billing-trial-only-pro");
            await LockAsync(userId, token);
            var organizations = await db.BillingOrganizations
                .Where(x => x.OwnerUserId == userId && x.Environment == gateway.Environment)
                .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(token);
            var existingTrial = await db.BillingTrials.Where(x => x.OwnerUserId == userId)
                .OrderByDescending(x => x.StartedAt).FirstOrDefaultAsync(token);
            var now = clock.UtcNow;
            if (existingTrial is not null)
            {
                var trialOrganization = organizations.SingleOrDefault(x => x.Id == existingTrial.OrganizationId);
                if (trialOrganization is null) throw new ConflictException("billing-trial-used");
                if (trialOrganization.Status == "trialing" && trialOrganization.TrialEndsAt > now)
                    return await OrganizationSummaryAsync(trialOrganization, now, token);
                throw new ConflictException("billing-trial-used");
            }
            if (organizations.Any(x => x.SubscriptionId is not null))
                throw new ConflictException("billing-trial-unavailable");

            var organization = organizations.FirstOrDefault(x => x.Status == "inactive"
                && x.SubscriptionId is null && x.TrialEndsAt is null);
            if (organization is null)
            {
                if (organizations.Count > 0) throw new ConflictException("billing-trial-unavailable");
                organization = BillingOrganization.Create(userId, now, gateway.Environment);
                db.BillingOrganizations.Add(organization);
            }

            await LockAsync(organization.Id, token);
            var end = now.AddDays(14);
            organization.StartTrial(planId, end, now);
            db.BillingTrials.Add(new() { OwnerUserId = userId, OrganizationId = organization.Id, StartedAt = now, EndsAt = end });
            Audit(organization.Id, userId, "trial-started");
            await db.SaveChangesAsync(token);
            return await OrganizationSummaryAsync(organization, now, token);
        }, ct);

    private async Task<BillingSummary> OrganizationSummaryAsync(BillingOrganization organization,
        DateTimeOffset now, CancellationToken ct)
    {
        var groupIds = await db.BillingGroups.Where(x => x.OrganizationId == organization.Id)
            .Select(x => x.GroupId).ToListAsync(ct);
        var grant = await BillingProjection.ActiveGrantAsync(db, organization.Id, now, ct);
        return new BillingSummary(organization.Id, true, grant?.PlanId ?? organization.EffectivePlan(now),
            grant is null ? organization.Status : "temporary_grant", organization.Interval,
            organization.PeriodEndsAt, organization.TrialEndsAt, organization.CancelAtPeriodEnd,
            grant is not null || organization.CanCreate(now), false, organization.ExtraGroups,
            organization.ScheduledPlanId, groupIds, organization.SubscriptionId is not null,
            false, grant?.ExpiresAt);
    }

    private sealed record StoredQuote(BillingSelection Selection, int Version, DateTimeOffset CreatedAt, long ProrationDate);

    public Task<BillingQuote> PreviewAsync(Guid userId, Guid groupId, BillingSelection selection, CancellationToken ct)
        => MutateAsync(userId, groupId, "quote", Guid.NewGuid().ToString(), selection, async (organization, key, token) =>
        {
            await ReconcileAsync(organization, token);
            Validate(selection);
            if (organization.SubscriptionId is null) throw new ConflictException("billing-subscription-required");
            if (selection.PlanId == organization.PlanId && selection.Interval == organization.Interval && selection.ExtraGroups == organization.ExtraGroups)
                throw new ValidationException("billing-selection-unchanged");
            await gateway.ValidatePriceAsync(selection.PlanId, selection.Interval, false, token);
            if (selection.ExtraGroups > 0) await gateway.ValidatePriceAsync(PlanCatalog.Studio, selection.Interval, true, token);
            var date = clock.UtcNow.ToUnixTimeSeconds();
            var immediate = selection.Interval == organization.Interval && (Rank(selection.PlanId) > Rank(organization.PlanId)
                || (selection.PlanId == organization.PlanId && selection.ExtraGroups > organization.ExtraGroups));
            var amountDue = 0L;
            if (immediate)
            {
                var subscription = await gateway.GetAsync($"/v1/subscriptions/{organization.SubscriptionId}", token);
                var fields = UpdateFields(subscription, selection);
                var preview = new Dictionary<string, string>();
                foreach (var field in fields) preview[$"subscription_details[{field.Key.Split('[')[0]}]{field.Key[field.Key.IndexOf('[')..]}"] = field.Value;
                preview["customer"] = organization.CustomerId!; preview["subscription"] = organization.SubscriptionId;
                preview["subscription_details[proration_date]"] = date.ToString(CultureInfo.InvariantCulture);
                var invoice = await gateway.PostAsync("/v1/invoices/create_preview", preview, key, token);
                amountDue = invoice.GetProperty("amount_due").GetInt64();
            }
            var quoteId = Guid.NewGuid().ToString();
            db.BillingOperations.Add(new() { Id = quoteId, OrganizationId = organization.Id, Kind = "quote-data", Fingerprint = Hash(JsonSerializer.Serialize(selection)),
                CreatedAt = clock.UtcNow, Result = JsonSerializer.Serialize(new StoredQuote(selection, organization.Version, clock.UtcNow, date)) });
            return new BillingQuote(amountDue, "mxn", quoteId);
        }, ct);

    public async Task ChangeAsync(Guid userId, Guid groupId, BillingCommand command, string quoteId, CancellationToken ct)
    {
        if (!command.RecurringConsent) throw new ValidationException("billing-recurring-consent-required");
        await MutateAsync(userId, groupId, "change", command.OperationId,
            new { command.Selection, quoteId, command.RecurringConsent }, async (organization, key, token) =>
        {
            await ReconcileAsync(organization, token);
            Validate(command.Selection);
            var quoteRow = await db.BillingOperations.SingleOrDefaultAsync(x => x.Id == quoteId && x.OrganizationId == organization.Id && x.Kind == "quote-data", token);
            var quote = quoteRow?.Result is { } json ? JsonSerializer.Deserialize<StoredQuote>(json) : null;
            if (quote is null || quote.Selection != command.Selection || quote.Version != organization.Version || quote.CreatedAt < clock.UtcNow.AddMinutes(-10))
                throw new ConflictException("billing-quote-expired");
            if (organization.SubscriptionId is null || organization.Status != "active" || organization.CancelAtPeriodEnd)
                throw new ConflictException("billing-active-subscription-required");
            var subscription = await gateway.GetAsync($"/v1/subscriptions/{organization.SubscriptionId}", token);
            var selection = command.Selection;
            var immediate = selection.Interval == organization.Interval && (Rank(selection.PlanId) > Rank(organization.PlanId)
                || (selection.PlanId == organization.PlanId && selection.ExtraGroups > organization.ExtraGroups));
            if (immediate)
            {
                var fields = UpdateFields(subscription, selection);
                fields["payment_behavior"] = "pending_if_incomplete"; fields["proration_behavior"] = "always_invoice";
                fields["proration_date"] = quote.ProrationDate.ToString(CultureInfo.InvariantCulture);
                await gateway.PostAsync($"/v1/subscriptions/{organization.SubscriptionId}", fields, key, token);
            }
            else
            {
                await ScheduleAsync(organization, subscription, selection, key, token);
                organization.ScheduledPlanId = selection.PlanId; organization.ScheduledInterval = selection.Interval;
                organization.ScheduledExtraGroups = selection.ExtraGroups;
            }
            db.BillingAudit.Add(new() { OrganizationId = organization.Id, ActorUserId = userId,
                Action = ConsentAction(selection), CreatedAt = clock.UtcNow });
            await ReconcileAsync(organization, token);
            return true;
        }, ct);
    }

    private Dictionary<string, string> UpdateFields(JsonElement subscription, BillingSelection selection)
    {
        var items = subscription.GetProperty("items").GetProperty("data").EnumerateArray().ToArray();
        if (items.Length is < 1 or > 2) throw new ConflictException("billing-items-unrecognized");
        var baseItem = items.SingleOrDefault(item => TryResolvePrice(item.GetProperty("price").GetProperty("id").GetString()!, out _, out _));
        if (baseItem.ValueKind == JsonValueKind.Undefined) throw new ConflictException("billing-price-unrecognized");
        var extraItem = items.SingleOrDefault(item => item.GetProperty("id").GetString() != baseItem.GetProperty("id").GetString());
        var fields = new Dictionary<string, string> { ["items[0][id]"] = baseItem.GetProperty("id").GetString()!,
            ["items[0][price]"] = gateway.PriceId(selection.PlanId, selection.Interval), ["items[0][quantity]"] = "1" };
        if (extraItem.ValueKind != JsonValueKind.Undefined) fields["items[1][id]"] = extraItem.GetProperty("id").GetString()!;
        if (selection.ExtraGroups > 0)
        { fields["items[1][price]"] = gateway.PriceId(PlanCatalog.Studio, selection.Interval, true); fields["items[1][quantity]"] = selection.ExtraGroups.ToString(CultureInfo.InvariantCulture); }
        else if (extraItem.ValueKind != JsonValueKind.Undefined) fields["items[1][deleted]"] = "true";
        return fields;
    }

    private async Task ScheduleAsync(BillingOrganization organization, JsonElement subscription, BillingSelection selection, string key, CancellationToken ct)
    {
        var scheduleId = StripeBillingGateway.Text(subscription, "schedule");
        if (scheduleId is null)
        {
            var schedule = await gateway.PostAsync("/v1/subscription_schedules", new() { ["from_subscription"] = organization.SubscriptionId! }, key + "-schedule", ct);
            scheduleId = schedule.GetProperty("id").GetString();
        }
        var items = subscription.GetProperty("items").GetProperty("data").EnumerateArray().ToArray();
        var fields = new Dictionary<string, string> { ["end_behavior"] = "release", ["proration_behavior"] = "none",
            ["phases[0][start_date]"] = items[0].GetProperty("current_period_start").GetInt64().ToString(CultureInfo.InvariantCulture),
            ["phases[0][end_date]"] = organization.PeriodEndsAt!.Value.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
            ["phases[1][items][0][price]"] = gateway.PriceId(selection.PlanId, selection.Interval), ["phases[1][items][0][quantity]"] = "1",
            ["phases[1][iterations]"] = "1", ["phases[1][proration_behavior]"] = "none" };
        for (var i = 0; i < items.Length; i++)
        {
            fields[$"phases[0][items][{i}][price]"] = items[i].GetProperty("price").GetProperty("id").GetString()!;
            fields[$"phases[0][items][{i}][quantity]"] = items[i].GetProperty("quantity").GetInt64().ToString(CultureInfo.InvariantCulture);
        }
        if (selection.ExtraGroups > 0)
        { fields["phases[1][items][1][price]"] = gateway.PriceId(PlanCatalog.Studio, selection.Interval, true); fields["phases[1][items][1][quantity]"] = selection.ExtraGroups.ToString(CultureInfo.InvariantCulture); }
        await gateway.PostAsync($"/v1/subscription_schedules/{scheduleId}", fields, key, ct);
    }

    public async Task CancelAsync(Guid userId, Guid groupId, string operationId, bool cancel, CancellationToken ct)
    {
        await MutateAsync(userId, groupId, "cancel", operationId, new { cancel }, async (organization, key, token) =>
        {
            if (organization.SubscriptionId is null) throw new ConflictException("billing-subscription-required");
            var subscription = await gateway.GetAsync($"/v1/subscriptions/{organization.SubscriptionId}", token);
            if (StripeBillingGateway.Text(subscription, "schedule") is { } schedule)
                await gateway.PostAsync($"/v1/subscription_schedules/{schedule}/release", [], key + "-release", token);
            await gateway.PostAsync($"/v1/subscriptions/{organization.SubscriptionId}", new() { ["cancel_at_period_end"] = cancel ? "true" : "false" }, key, token);
            organization.ScheduledPlanId = null; organization.ScheduledInterval = null; organization.ScheduledExtraGroups = null;
            await ReconcileAsync(organization, token);
            return true;
        }, ct);
    }

    public async Task LinkGroupAsync(Guid userId, Guid groupId, Guid targetGroupId, bool link, CancellationToken ct)
    {
        await data.ExecuteAsUserAsync(userId, async token =>
        {
            var organization = await RequireOwnerAsync(userId, groupId, token);
            await access.RequireOwnerAsync(targetGroupId, userId, token);
            var target = await db.BillingGroups.SingleAsync(x => x.GroupId == targetGroupId, token);
            var priorOrganizationId = target.OrganizationId;
            foreach (var id in new[] { organization.Id, target.OrganizationId }.Distinct().Order()) await LockAsync(id, token);
            await db.Entry(organization).ReloadAsync(token);
            await db.Entry(target).ReloadAsync(token);
            if (target.OrganizationId != priorOrganizationId) throw new ConflictException("billing-link-changed");
            await ValidateOwnersAsync(organization, token);
            if (link)
            {
                if (target.OrganizationId == organization.Id) return true;
                var previous = await db.BillingOrganizations.SingleAsync(x => x.Id == target.OrganizationId, token);
                if (previous.OwnerUserId != userId) throw new ForbiddenException("billing-owner-required");
                if (previous.SubscriptionId is not null || previous.TrialEndsAt is not null || await db.BillingGroups.AnyAsync(x => x.OrganizationId == previous.Id && x.LegacyPlanId != null, token))
                    throw new ConflictException("billing-group-has-subscription");
                var count = await db.BillingGroups.CountAsync(x => x.OrganizationId == organization.Id, token);
                var grant = await BillingProjection.ActiveGrantAsync(db, organization.Id, clock.UtcNow, token);
                var capacity = grant is null ? organization.GroupCapacity(clock.UtcNow)
                    : PlanCatalog.Get(grant.PlanId).Limits.Groups ?? int.MaxValue;
                if (count >= capacity) throw new ConflictException("billing-group-limit");
                target.OrganizationId = organization.Id;
            }
            else
            {
                if (target.OrganizationId != organization.Id || targetGroupId == organization.PrimaryGroupId) throw new ConflictException("billing-primary-group-cannot-detach");
                if (organization.CanCreate(clock.UtcNow)) throw new ConflictException("billing-detach-at-period-end");
                var detached = BillingOrganization.Create(userId, targetGroupId, clock.UtcNow, gateway.Environment);
                db.BillingOrganizations.Add(detached); target.OrganizationId = detached.Id;
            }
            Audit(organization.Id, userId, link ? "group-linked" : "group-detached");
            await db.SaveChangesAsync(token);
            await ProjectGroupsAsync(organization, token);
            await db.SaveChangesAsync(token);
            return true;
        }, ct);
    }

    private static void Validate(BillingSelection selection)
    {
        if (selection.Interval != "month" || selection.ExtraGroups != 0)
            throw new ValidationException("billing-selection-not-available");
        try { BillingOrganization.ValidatePlan(selection.PlanId, selection.Interval, selection.ExtraGroups); }
        catch (ArgumentException) { throw new ValidationException("billing-invalid-selection"); }
    }
    private static int Rank(string plan) => plan switch { PlanCatalog.Starter => 0, PlanCatalog.Pro => 1, PlanCatalog.Studio => 2, _ => -1 };
    private static string ConsentAction(BillingSelection selection)
        => $"recurring-consent-v1:{selection.PlanId}:{selection.Interval}:{BillingPrices.Amount(selection.PlanId, selection.Interval)}:mxn";
    private static string MutationFingerprint(string kind, object input)
        => Hash(JsonSerializer.Serialize(new { kind, input }));
    private static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private void Audit(Guid organizationId, Guid? userId, string action) => db.BillingAudit.Add(new() { OrganizationId = organizationId, ActorUserId = userId, Action = action, CreatedAt = clock.UtcNow });
}
