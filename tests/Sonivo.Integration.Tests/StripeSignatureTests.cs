using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Sonivo.Infrastructure.Payments;
using Stripe;

namespace Sonivo.Integration.Tests;

public sealed class StripeSignatureTests
{
    [Fact]
    public void Price_validation_rejects_metered_and_transformed_prices()
    {
        static JsonElement Price(string usage, string? transform = null) => JsonSerializer.SerializeToElement(new
        {
            active = true, currency = "mxn", unit_amount = 9900, tax_behavior = "inclusive",
            billing_scheme = "per_unit", transform_quantity = transform is null ? null : new { divide_by = 2, round = "up" },
            recurring = new { usage_type = usage, interval = "month", interval_count = 1 }, livemode = false
        });
        Assert.True(StripeBillingGateway.MatchesPrice(Price("licensed"), 9900, "month", false));
        Assert.False(StripeBillingGateway.MatchesPrice(Price("metered"), 9900, "month", false));
        Assert.False(StripeBillingGateway.MatchesPrice(Price("licensed", "transformed"), 9900, "month", false));
    }

    [Fact]
    public void Restricted_sandbox_key_is_accepted_only_in_sandbox()
    {
        static StripeBillingGateway Gateway(string environment) => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Payments:Stripe:Environment"] = environment,
            ["Payments:Stripe:ApiKey"] = "rk_test_unit_only",
            ["Payments:Stripe:WebhookSecret"] = "whsec_unit_only"
        }).Build());
        Assert.True(Gateway("sandbox").IsConfigured);
        Assert.False(Gateway("live").IsConfigured);
        var unrestricted = new StripeBillingGateway(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Payments:Stripe:Environment"] = "sandbox",
            ["Payments:Stripe:ApiKey"] = "sk_test_unit_only",
            ["Payments:Stripe:WebhookSecret"] = "whsec_unit_only"
        }).Build());
        Assert.False(unrestricted.IsConfigured);
    }

    [Fact]
    public void Live_billing_writes_require_explicit_activation_fiscal_readiness_and_financial_rls()
    {
        static StripeBillingGateway Gateway(bool allowLive, bool fiscalReady, bool financialRlsReady) => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Payments:Stripe:Environment"] = "live",
            ["Payments:Stripe:ApiKey"] = "rk_live_unit_only",
            ["Payments:Stripe:WebhookSecret"] = "whsec_unit_only",
            ["Payments:Stripe:AllowLiveCharges"] = allowLive.ToString(),
            ["Payments:Stripe:FiscalReady"] = fiscalReady.ToString(),
            ["Payments:Stripe:FinancialRlsReady"] = financialRlsReady.ToString()
        }).Build());

        Assert.False(Gateway(true, true, false).CanWrite);
        Assert.False(Gateway(false, true, true).CanWrite);
        Assert.False(Gateway(true, false, true).CanWrite);
        Assert.True(Gateway(true, true, true).CanWrite);
    }

    [Fact]
    public void Only_recent_valid_sandbox_event_is_accepted()
    {
        var gateway = new StripeBillingGateway(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Payments:Stripe:Environment"] = "sandbox",
            ["Payments:Stripe:ApiKey"] = "rk_test_unit_only",
            ["Payments:Stripe:WebhookSecret"] = "whsec_unit_only"
        }).Build());
        var body = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["id"] = "evt_test", ["object"] = "event", ["api_version"] = StripeConfiguration.ApiVersion,
            ["created"] = 1, ["livemode"] = false, ["type"] = "customer.subscription.updated",
            ["data"] = new { @object = new { id = "sub_1", @object = "subscription", customer = "cus_1" } }
        });
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        static string Header(long timestamp, string payload)
        {
            var digest = HMACSHA256.HashData(Encoding.UTF8.GetBytes("whsec_unit_only"), Encoding.UTF8.GetBytes($"{timestamp}.{payload}"));
            return $"t={timestamp},v1={Convert.ToHexStringLower(digest)}";
        }
        Assert.Equal("evt_test", gateway.VerifyEvent(body, Header(now, body))?.Id);
        Assert.Null(gateway.VerifyEvent(body, Header(now, body + "tampered")));
        Assert.Null(gateway.VerifyEvent(body, Header(now - 600, body)));
    }

    [Fact]
    public void Accepts_signed_events_using_a_different_stripe_api_version()
    {
        var gateway = new StripeBillingGateway(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Payments:Stripe:Environment"] = "sandbox",
            ["Payments:Stripe:ApiKey"] = "rk_test_unit_only",
            ["Payments:Stripe:WebhookSecret"] = "whsec_unit_only"
        }).Build());
        var body = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["id"] = "evt_version_mismatch", ["object"] = "event", ["api_version"] = "2026-01-28.clover",
            ["created"] = 1, ["livemode"] = false, ["type"] = "customer.subscription.created",
            ["data"] = new { @object = new { id = "sub_1", @object = "subscription", customer = "cus_1" } }
        });
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var digest = HMACSHA256.HashData(Encoding.UTF8.GetBytes("whsec_unit_only"), Encoding.UTF8.GetBytes($"{timestamp}.{body}"));
        var signature = $"t={timestamp},v1={Convert.ToHexStringLower(digest)}";

        Assert.Equal("evt_version_mismatch", gateway.VerifyEvent(body, signature)?.Id);
    }
}
