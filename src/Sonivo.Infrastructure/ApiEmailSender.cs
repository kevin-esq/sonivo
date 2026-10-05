using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure;

/// <summary>
/// Provider-agnostic transactional email over an HTTP JSON API. This transport
/// exists for hosts that block outbound SMTP (serverless free tiers block ports
/// 25/465/587); it POSTs a JSON message to the configured endpoint with a bearer
/// key. The concrete provider is an infrastructure detail expressed only through
/// configuration (<c>Email:Endpoint</c>, <c>Email:ApiKey</c>, <c>Email:From</c>);
/// the source names no vendor.
///
/// Best-effort by contract: transport gaps never throw, they degrade to
/// <c>false</c> so the caller can fall back to the "resend" affordance.
/// </summary>
public sealed class ApiEmailSender : IEmailSender
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly HttpClient _http;
    private readonly ILogger<ApiEmailSender> _logger;
    private readonly string? _endpoint;
    private readonly string? _apiKey;
    private readonly string? _from;

    public ApiEmailSender(
        HttpClient http,
        IConfiguration configuration,
        ILogger<ApiEmailSender> logger)
    {
        _http = http;
        _logger = logger;
        _endpoint = configuration["Email:Endpoint"];
        _apiKey = configuration["Email:ApiKey"];
        _from = configuration["Email:From"];
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_endpoint)
        && !string.IsNullOrWhiteSpace(_apiKey)
        && !string.IsNullOrWhiteSpace(_from);

    public async Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        try
        {
            var payload = new Dictionary<string, object?>
            {
                ["from"] = NormalizeFrom(_from!),
                ["to"] = email.To,
                ["subject"] = email.Subject,
                ["text"] = email.TextBody
            };
            if (!string.IsNullOrWhiteSpace(email.HtmlBody))
            {
                payload["html"] = email.HtmlBody;
            }

            using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            request.Content = JsonContent.Create(payload, options: JsonOptions);

            using var response = await _http.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "Email transport rejected the message ({Status}): {Body}",
                (int)response.StatusCode,
                body);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Email transport failed.");
            return false;
        }
    }

    private static string NormalizeFrom(string from)
    {
        var trimmed = from.Trim();
        return trimmed.Contains('<', StringComparison.Ordinal) ? trimmed : $"Sonivo <{trimmed}>";
    }
}
