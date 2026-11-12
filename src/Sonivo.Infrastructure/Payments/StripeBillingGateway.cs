using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Billing.Payments;
using Stripe;

namespace Sonivo.Infrastructure.Payments;

public sealed class StripeBillingGateway : IPaymentProvider
{
    private readonly IConfiguration _configuration;
    private readonly StripeClient? _client;
    public StripeBillingGateway(IConfiguration configuration)
    {
        _configuration = configuration;
        var key = configuration["Payments:Stripe:ApiKey"];
        if (!string.IsNullOrWhiteSpace(key)) _client = new StripeClient(key);
    }

    public PaymentProviderKind Kind => PaymentProviderKind.Stripe;
    public string Environment => _configuration["Payments:Stripe:Environment"] ?? "sandbox";
    public bool IsConfigured => _client is not null
        && _configuration["Payments:Stripe:ApiKey"]?.StartsWith(Environment == "live" ? "rk_live_" : "rk_test_", StringComparison.Ordinal) == true
        && Environment is "sandbox" or "live"
        && !string.IsNullOrWhiteSpace(_configuration["Payments:Stripe:WebhookSecret"]);
    public bool CanWrite => IsConfigured && (Environment == "sandbox" ||
        (_configuration.GetValue<bool>("Payments:Stripe:AllowLiveCharges")
            && _configuration.GetValue<bool>("Payments:Stripe:FiscalReady")
            && _configuration.GetValue<bool>("Payments:Stripe:FinancialRlsReady")));
    public bool ReferralRewardsEnabled => CanWrite && _configuration.GetValue<bool>("Payments:EnableReferralRewards");

    public string ReturnUrl(string result)
    {
        if (!Uri.TryCreate(_configuration["Payments:Stripe:PublicOrigin"], UriKind.Absolute, out var origin)
            || (!origin.Scheme.Equals("https", StringComparison.Ordinal) && !(Environment == "sandbox" && origin.IsLoopback))
            || origin.UserInfo.Length != 0 || origin.AbsolutePath != "/" || origin.Query.Length != 0 || origin.Fragment.Length != 0)
            throw new ValidationException("billing-origin-not-configured");
        return new Uri(origin, $"/app/plans?checkout={Uri.EscapeDataString(result)}").AbsoluteUri;
    }

    public string PriceId(string plan, string interval, bool extra = false)
    {
        BillingOrganization.ValidatePlan(plan, interval, 0);
        var key = extra ? $"extra-{interval}" : $"{plan}-{interval}";
        var value = _configuration[$"Payments:Stripe:Prices:{key}"];
        return !string.IsNullOrWhiteSpace(value) && value.StartsWith("price_", StringComparison.Ordinal)
            ? value : throw new ValidationException("billing-price-not-configured");
    }

    public string PortalConfigurationId()
    {
        var value = _configuration["Payments:Stripe:PortalConfigurationId"];
        return value?.StartsWith("bpc_", StringComparison.Ordinal) == true ? value
            : throw new ValidationException("billing-portal-not-configured");
    }

    public string PublishableKey()
    {
        var value = _configuration["Payments:Stripe:PublishableKey"];
        var prefix = Environment == "live" ? "pk_live_" : "pk_test_";
        return value?.StartsWith(prefix, StringComparison.Ordinal) == true
            ? value : throw new ValidationException("billing-publishable-key-not-configured");
    }

    public async Task ValidatePortalAsync(CancellationToken ct)
    {
        var configuration = await GetAsync($"/v1/billing_portal/configurations/{PortalConfigurationId()}", ct);
        var features = configuration.GetProperty("features");
        if (!configuration.GetProperty("active").GetBoolean()
            || features.GetProperty("subscription_update").GetProperty("enabled").GetBoolean()
            || features.GetProperty("subscription_cancel").GetProperty("enabled").GetBoolean())
            throw new ValidationException("billing-portal-unsafe");
    }

    public async Task ValidatePriceAsync(string plan, string interval, bool extra, CancellationToken ct)
    {
        if (extra) throw new ValidationException("billing-extra-groups-unavailable");
        var price = await GetAsync($"/v1/prices/{Uri.EscapeDataString(PriceId(plan, interval))}", ct);
        if (!MatchesPrice(price, BillingPrices.Amount(plan, interval), interval, Environment == "live"))
            throw new ValidationException("billing-price-mismatch");
    }

    public static bool MatchesPrice(JsonElement price, long amount, string interval, bool live)
    {
        if (!price.TryGetProperty("recurring", out var recurring) || recurring.ValueKind != JsonValueKind.Object) return false;
        return price.GetProperty("active").GetBoolean() && Text(price, "currency") == "mxn"
            && price.GetProperty("unit_amount").GetInt64() == amount && Text(price, "tax_behavior") == "inclusive"
            && Text(price, "billing_scheme") == "per_unit"
            && (!price.TryGetProperty("transform_quantity", out var transform) || transform.ValueKind == JsonValueKind.Null)
            && Text(recurring, "usage_type") == "licensed"
            && Text(recurring, "interval") == interval
            && recurring.GetProperty("interval_count").GetInt32() == 1
            && price.GetProperty("livemode").GetBoolean() == live;
    }

    public Task<JsonElement> GetAsync(string path, CancellationToken ct) => RequestAsync(HttpMethod.Get, path, null, null, ct);
    public Task<JsonElement> PostAsync(string path, Dictionary<string, string> fields, string operationId, CancellationToken ct)
    {
        if (!CanWrite) throw new ValidationException("billing-charging-disabled");
        return RequestAsync(HttpMethod.Post, path, fields, operationId, ct);
    }

    public Task<JsonElement> PostPaymentMethodAsync(string path, Dictionary<string, string> fields, string operationId, CancellationToken ct)
    {
        if (!IsConfigured) throw new ValidationException("billing-not-configured");
        if (!path.StartsWith("/v1/customers/", StringComparison.Ordinal)
            && !path.StartsWith("/v1/subscriptions/", StringComparison.Ordinal))
            throw new ArgumentException("Invalid Stripe payment method path.");
        return RequestAsync(HttpMethod.Post, path, fields, operationId, ct);
    }

    private async Task<JsonElement> RequestAsync(HttpMethod method, string path, Dictionary<string, string>? fields, string? key, CancellationToken ct)
    {
        if (!IsConfigured || _client is null) throw new ValidationException("billing-not-configured");
        if (!path.StartsWith("/v1/", StringComparison.Ordinal) || path.Contains("://", StringComparison.Ordinal))
            throw new ArgumentException("Invalid Stripe API path.");
        using var form = fields is null ? null : new FormUrlEncodedContent(fields);
        var body = form is null ? null : await form.ReadAsStringAsync(ct);
        var response = await _client.RawRequestAsync(method, path, body,
            new RawRequestOptions { IdempotencyKey = key }, ct);
        using var document = JsonDocument.Parse(response.Content);
        var result = document.RootElement.Clone();
        if (result.TryGetProperty("livemode", out var live) && live.GetBoolean() != (Environment == "live"))
            throw new ValidationException("billing-environment-mismatch");
        return result;
    }

    public Event? VerifyEvent(string payload, string signature)
    {
        if (!IsConfigured) return null;
        try
        {
            var ev = EventUtility.ConstructEvent(payload, signature, _configuration["Payments:Stripe:WebhookSecret"],
                tolerance: 300, throwOnApiVersionMismatch: false);
            return ev.Livemode == (Environment == "live") ? ev : null;
        }
        catch (StripeException) { return null; }
        catch (JsonException) { return null; }
        catch (ArgumentException) { return null; }
    }

    // Stripe checkout requires a persisted, authorized customer and operation identity.
    public CheckoutSession CreateCheckoutSession(CheckoutRequest request) => throw new NotSupportedException("Use the authorized billing service.");
    public VerifiedWebhook? VerifyWebhook(string payload, string? signatureHeader) => null;
    public static string? Text(JsonElement value, string name) => value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
    public static DateTimeOffset? Timestamp(JsonElement value, string name) => value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.Number
        ? DateTimeOffset.FromUnixTimeSeconds(field.GetInt64()) : null;
}
