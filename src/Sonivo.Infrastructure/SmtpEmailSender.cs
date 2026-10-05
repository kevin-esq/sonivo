using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure;

/// <summary>
/// Provider-agnostic transactional email over SMTP — the one wire protocol every
/// email provider speaks (Google, Resend, SendGrid, Mailgun, a self-hosted MTA).
/// The concrete provider is an infrastructure detail expressed only through
/// configuration (<c>Email:Smtp:*</c>); the source names no vendor, so switching
/// providers is an environment change, never a code change.
///
/// Best-effort by contract: transport gaps never throw, they degrade to
/// <c>false</c> so the caller can fall back to the "resend" affordance.
/// </summary>
public sealed class SmtpEmailSender : IEmailSender
{
    private readonly ILogger<SmtpEmailSender> _logger;
    private readonly string? _host;
    private readonly int _port;
    private readonly string? _userName;
    private readonly string? _password;
    private readonly string? _from;
    private readonly bool _useStartTls;

    public SmtpEmailSender(IConfiguration configuration, ILogger<SmtpEmailSender> logger)
    {
        _logger = logger;
        _host = configuration["Email:Smtp:Host"];
        _port = configuration.GetValue("Email:Smtp:Port", 587);
        _userName = configuration["Email:Smtp:UserName"];
        _password = configuration["Email:Smtp:Password"];
        _from = configuration["Email:From"];
        _useStartTls = configuration.GetValue("Email:Smtp:UseStartTls", true);
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_host)
        && !string.IsNullOrWhiteSpace(_from);

    public async Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        try
        {
            var message = new MimeMessage();
            message.From.Add(ParseFrom(_from!));
            message.To.Add(MailboxAddress.Parse(email.To));
            message.Subject = email.Subject;
            var body = new BodyBuilder { TextBody = email.TextBody };
            if (!string.IsNullOrWhiteSpace(email.HtmlBody))
            {
                body.HtmlBody = email.HtmlBody;
            }

            message.Body = body.ToMessageBody();

            using var client = new SmtpClient();
            var security = _useStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto;
            await client.ConnectAsync(_host!, _port, security, cancellationToken);
            if (!string.IsNullOrWhiteSpace(_userName))
            {
                await client.AuthenticateAsync(_userName, _password ?? string.Empty, cancellationToken);
            }

            await client.SendAsync(message, cancellationToken);
            await client.DisconnectAsync(quit: true, cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            // Best-effort: never surface transport failures as exceptions.
            _logger.LogWarning(ex, "Email transport failed.");
            return false;
        }
    }

    private static MailboxAddress ParseFrom(string from)
    {
        if (MailboxAddress.TryParse(from, out var parsed) && parsed is not null)
        {
            return parsed;
        }

        return new MailboxAddress("Sonivo", from.Trim());
    }
}
