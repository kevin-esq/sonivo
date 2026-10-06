using Sonivo.Application.Billing.Payments;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Billing.Payments;
using Sonivo.Infrastructure.Payments;

namespace Sonivo.Integration.Tests.Payments;

public sealed class SandboxPaymentProviderTests
{
    private const string Secret = "test-webhook-secret";
    private const string GroupId = "11111111-1111-1111-1111-111111111111";

    private static SandboxPaymentProvider Provider(string secret = Secret) =>
        new(secret, "https://sandbox.test/checkout");

    [Fact]
    public void Verifies_a_correctly_signed_webhook()
    {
        var provider = Provider();
        var payload =
            $$"""
            {"eventId":"evt_1","type":"subscription.updated","groupId":"{{GroupId}}","planId":"pro","status":"active"}
            """;
        var signature = SandboxPaymentProvider.SignaturePrefix + provider.ComputeSignature(payload);

        var webhook = provider.VerifyWebhook(payload, signature);

        Assert.NotNull(webhook);
        Assert.Equal("evt_1", webhook!.EventId);
        Assert.Equal(Guid.Parse(GroupId), webhook.GroupId);
        Assert.Equal(PlanCatalog.Pro, webhook.PlanId);
        Assert.Equal(BillingStatuses.Active, webhook.Status);
    }

    [Fact]
    public void Rejects_a_tampered_payload()
    {
        var provider = Provider();
        var payload = """{"eventId":"evt_1","type":"subscription.updated","status":"active"}""";
        var signature = SandboxPaymentProvider.SignaturePrefix + provider.ComputeSignature(payload);
        var tampered = payload.Replace("active", "read_only", StringComparison.Ordinal);

        Assert.Null(provider.VerifyWebhook(tampered, signature));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("deadbeef")]
    [InlineData("sha256=0000000000000000000000000000000000000000000000000000000000000000")]
    public void Rejects_missing_or_invalid_signatures(string? signature)
    {
        var provider = Provider();
        var payload = """{"eventId":"evt_1","type":"subscription.updated","status":"active"}""";

        Assert.Null(provider.VerifyWebhook(payload, signature));
    }

    [Fact]
    public void Rejects_everything_when_not_configured()
    {
        var provider = Provider(secret: "");

        Assert.False(provider.IsConfigured);
        Assert.Null(provider.VerifyWebhook(
            """{"eventId":"evt_1","type":"x","status":"active"}""",
            "sha256=whatever"));
        Assert.Throws<PaymentNotConfiguredException>(() => provider.CreateCheckoutSession(
            new CheckoutRequest(Guid.Parse(GroupId), PlanCatalog.Pro, null, "https://ok", "https://cancel")));
    }

    [Fact]
    public void Creates_a_checkout_session_that_carries_the_plan_and_group()
    {
        var provider = Provider();

        var session = provider.CreateCheckoutSession(
            new CheckoutRequest(Guid.Parse(GroupId), PlanCatalog.Studio, null, "https://ok", "https://cancel"));

        Assert.StartsWith("sandbox_", session.ProviderSessionId, StringComparison.Ordinal);
        Assert.Contains($"group={GroupId}", session.CheckoutUrl, StringComparison.Ordinal);
        Assert.Contains("plan=studio", session.CheckoutUrl, StringComparison.Ordinal);
    }
}
