using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure;

public sealed class GmailEmailSender : IEmailSender
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly HttpClient _http;
    private readonly ILogger<GmailEmailSender> _logger;
    private readonly string? _clientId;
    private readonly string? _clientSecret;
    private readonly string? _refreshToken;
    private readonly string? _from;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _accessToken;
    private DateTimeOffset _accessTokenExpiresAt;

    public GmailEmailSender(
        HttpClient http,
        IConfiguration configuration,
        ILogger<GmailEmailSender> logger)
    {
        _http = http;
        _logger = logger;
        _clientId = configuration["Gmail:ClientId"];
        _clientSecret = configuration["Gmail:ClientSecret"];
        _refreshToken = configuration["Gmail:RefreshToken"];
        _from = configuration["Gmail:From"];
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_clientId)
        && !string.IsNullOrWhiteSpace(_clientSecret)
        && !string.IsNullOrWhiteSpace(_refreshToken)
        && !string.IsNullOrWhiteSpace(_from);

    public async Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        try
        {
            var accessToken = await GetAccessTokenAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                return false;
            }

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Content = JsonContent.Create(new { raw = EncodeRfc2822(email) }, options: JsonOptions);

            using var response = await _http.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "Gmail rejected invite email ({Status}): {Body}",
                (int)response.StatusCode,
                body);
            return false;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Gmail invite email failed.");
            return false;
        }
    }

    private async Task<string?> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        await _tokenLock.WaitAsync(cancellationToken);
        try
        {
            if (!string.IsNullOrWhiteSpace(_accessToken)
                && _accessTokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
            {
                return _accessToken;
            }

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://oauth2.googleapis.com/token")
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = _clientId!,
                    ["client_secret"] = _clientSecret!,
                    ["refresh_token"] = _refreshToken!,
                    ["grant_type"] = "refresh_token"
                })
            };

            using var response = await _http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Gmail token refresh failed ({Status}): {Body}",
                    (int)response.StatusCode,
                    body);
                return null;
            }

            var payload = await response.Content.ReadFromJsonAsync<TokenResponse>(cancellationToken);
            if (string.IsNullOrWhiteSpace(payload?.AccessToken))
            {
                return null;
            }

            _accessToken = payload.AccessToken;
            var lifetime = payload.ExpiresIn is > 0 ? payload.ExpiresIn.Value : 3600;
            _accessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(lifetime);
            return _accessToken;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private string EncodeRfc2822(OutboundEmail email)
    {
        var from = _from!.Trim();
        if (!from.Contains('<', StringComparison.Ordinal))
        {
            from = $"Sonivo <{from}>";
        }

        var message =
            $"From: {from}\r\n" +
            $"To: {email.To}\r\n" +
            $"Subject: {EncodeHeader(email.Subject)}\r\n" +
            "MIME-Version: 1.0\r\n" +
            "Content-Type: text/plain; charset=utf-8\r\n" +
            "\r\n" +
            email.TextBody;
        var bytes = Encoding.UTF8.GetBytes(message);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string EncodeHeader(string value)
    {
        if (value.All(static c => c < 128))
        {
            return value;
        }

        return "=?UTF-8?B?" + Convert.ToBase64String(Encoding.UTF8.GetBytes(value)) + "?=";
    }

    private sealed record TokenResponse(
        [property: System.Text.Json.Serialization.JsonPropertyName("access_token")] string? AccessToken,
        [property: System.Text.Json.Serialization.JsonPropertyName("expires_in")] int? ExpiresIn);
}
