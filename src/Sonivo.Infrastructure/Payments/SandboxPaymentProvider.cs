using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Sonivo.Application.Billing.Payments;
using Sonivo.Domain.Billing.Payments;

namespace Sonivo.Infrastructure.Payments;

/// <summary>
/// Deterministic, signed test gateway (ADR-0073 §9.13). It talks to no external
/// service: it synthesizes checkout URLs and verifies webhooks with an
/// HMAC-SHA256 signature whose secret comes from configuration. This is the
/// reference implementation real adapters (Stripe/Mercado Pago/Conekta) mirror:
/// signature verification, secret from config, normalized event.
/// </summary>
public sealed class SandboxPaymentProvider : IPaymentProvider
{
    /// <summary>Signature header format: <c>sha256=&lt;hex&gt;</c>.</summary>
    public const string SignaturePrefix = "sha256=";

    private readonly string _secret;
    private readonly string _checkoutBaseUrl;

    public SandboxPaymentProvider(string secret, string checkoutBaseUrl)
    {
        _secret = secret ?? string.Empty;
        _checkoutBaseUrl = string.IsNullOrWhiteSpace(checkoutBaseUrl)
            ? "https://sandbox.sonivo.test/checkout"
            : checkoutBaseUrl;
    }

    public PaymentProviderKind Kind => PaymentProviderKind.Sandbox;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_secret);

    public CheckoutSession CreateCheckoutSession(CheckoutRequest request)
    {
        if (!IsConfigured)
        {
            throw new PaymentNotConfiguredException();
        }

        var sessionId = "sandbox_" + Guid.NewGuid().ToString("N");
        var url = string.Create(
            CultureInfo.InvariantCulture,
            $"{_checkoutBaseUrl}?session={sessionId}&plan={Uri.EscapeDataString(request.PlanId)}&group={request.GroupId}");
        return new CheckoutSession(sessionId, url);
    }

    public VerifiedWebhook? VerifyWebhook(string payload, string? signatureHeader)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(signatureHeader))
        {
            return null;
        }

        if (!signatureHeader.StartsWith(SignaturePrefix, StringComparison.Ordinal))
        {
            return null;
        }

        var provided = signatureHeader[SignaturePrefix.Length..];
        var expected = ComputeSignature(payload);
        if (!FixedTimeEquals(provided, expected))
        {
            return null;
        }

        return Parse(payload);
    }

    /// <summary>Hex HMAC-SHA256 of the raw payload (used by sandbox senders/tests).</summary>
    public string ComputeSignature(string payload)
    {
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(_secret), Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexStringLower(mac);
    }

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a),
            Encoding.UTF8.GetBytes(b));

    private static VerifiedWebhook? Parse(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;

            var eventId = GetString(root, "eventId");
            var eventType = GetString(root, "type");
            if (string.IsNullOrWhiteSpace(eventId) || string.IsNullOrWhiteSpace(eventType))
            {
                return null;
            }

            Guid? groupId = null;
            if (Guid.TryParse(GetString(root, "groupId"), out var parsedGroupId))
            {
                groupId = parsedGroupId;
            }

            DateTimeOffset? periodEndsAt = null;
            if (DateTimeOffset.TryParse(
                    GetString(root, "currentPeriodEndsAt"),
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out var parsedPeriod))
            {
                periodEndsAt = parsedPeriod;
            }

            var cancelAtPeriodEnd = root.TryGetProperty("cancelAtPeriodEnd", out var cancel)
                && cancel.ValueKind == JsonValueKind.True;

            return new VerifiedWebhook(
                eventId,
                eventType,
                groupId,
                GetString(root, "planId"),
                GetString(root, "status"),
                periodEndsAt,
                cancelAtPeriodEnd);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? GetString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
