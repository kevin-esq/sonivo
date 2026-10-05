using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure;

/// <summary>
/// Provider-agnostic transactional email transport. The concrete email vendor is
/// an infrastructure detail: it is expressed only through configuration
/// (<c>Email:Endpoint</c>, <c>Email:ApiKey</c>, <c>Email:From</c>), never in code.
/// The sender POSTs a JSON message to the configured endpoint with a bearer key,
/// which every modern email API (including Resend) accepts.
///
/// Best-effort by contract: transport gaps never throw, they degrade to
/// <c>false</c> so the caller can fall back to the "resend" affordance.
/// </summary>
public sealed class HttpEmailSender : IEmailSender
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly HttpClient _http;
    private readonly ILogger<HttpEmailSender> _logger;
    private readonly string? _endpoint;
    private readonly string? _apiKey;
    private readonly string? _from;

    public HttpEmailSender(
        HttpClient http,
        IConfiguration configuration,
        ILogger<HttpEmailSender> logger)
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
            using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            request.Content = JsonContent.Create(
                new
                {
                    from = NormalizeFrom(_from!),
                    to = email.To,
                    subject = email.Subject,
                    text = email.TextBody
                },
                options: JsonOptions);

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
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
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
