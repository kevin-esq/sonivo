using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure;

public sealed class ResendEmailSender : IEmailSender
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private readonly HttpClient _http;
    private readonly ILogger<ResendEmailSender> _logger;
    private readonly string? _apiKey;
    private readonly string? _from;

    public ResendEmailSender(
        HttpClient http,
        IConfiguration configuration,
        ILogger<ResendEmailSender> logger)
    {
        _http = http;
        _logger = logger;
        _apiKey = configuration["Resend:ApiKey"];
        _from = configuration["Resend:From"];
        _http.BaseAddress ??= new Uri("https://api.resend.com/");
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_apiKey) && !string.IsNullOrWhiteSpace(_from);

    public async Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        request.Content = JsonContent.Create(
            new
            {
                from = _from,
                to = new[] { email.To },
                subject = email.Subject,
                text = email.TextBody
            },
            options: JsonOptions);

        try
        {
            using var response = await _http.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "Resend rejected invite email ({Status}): {Body}",
                (int)response.StatusCode,
                body);
            return false;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Resend invite email failed.");
            return false;
        }
    }
}
