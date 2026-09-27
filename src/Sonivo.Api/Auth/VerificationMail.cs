using Sonivo.Application.Abstractions;

namespace Sonivo.Api.Auth;

/// <summary>
/// T-AU-01: best-effort verification / password-reset mail over the Phase 3.9
/// Gmail API HTTPS sender. Never throws: transport gaps degrade to
/// <c>mailed=false</c> + a warning log (existing T-3.9 pattern).
/// No generic SMTP, no Event/RSVP mail (firewall).
/// </summary>
internal static class VerificationMail
{
    internal static async Task<bool> TrySendConfirmationAsync(
        IEmailSender email,
        IPublicOrigin origin,
        ILogger logger,
        string to,
        string token,
        CancellationToken cancellationToken)
    {
        var baseUrl = origin.GetOrigin();
        if (!email.IsConfigured || string.IsNullOrWhiteSpace(baseUrl))
        {
            return false;
        }

        try
        {
            var link = $"{baseUrl}/confirm" +
                $"?email={Uri.EscapeDataString(to)}" +
                $"&token={Uri.EscapeDataString(token)}";
            var sent = await email.TrySendAsync(
                new OutboundEmail(
                    to,
                    "Confirma tu correo en Sonivo",
                    "Confirma tu correo para usar Sonivo:\n\n" +
                    $"{link}\n\n" +
                    "Si no creaste esta cuenta, ignora este mensaje."),
                cancellationToken);
            if (!sent)
            {
                logger.LogWarning("Verification email could not be sent (best-effort).");
            }

            return sent;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Verification email could not be sent (best-effort).");
            return false;
        }
    }

    internal static async Task<bool> TrySendPasswordResetAsync(
        IEmailSender email,
        IPublicOrigin origin,
        ILogger logger,
        string to,
        string token,
        CancellationToken cancellationToken)
    {
        var baseUrl = origin.GetOrigin();
        if (!email.IsConfigured || string.IsNullOrWhiteSpace(baseUrl))
        {
            return false;
        }

        try
        {
            var link = $"{baseUrl}/reset-password" +
                $"?email={Uri.EscapeDataString(to)}" +
                $"&token={Uri.EscapeDataString(token)}";
            var sent = await email.TrySendAsync(
                new OutboundEmail(
                    to,
                    "Restablecer contraseña en Sonivo",
                    "Solicitaste restablecer tu contraseña en Sonivo:\n\n" +
                    $"{link}\n\n" +
                    "Si no fuiste tú, ignora este mensaje."),
                cancellationToken);
            if (!sent)
            {
                logger.LogWarning("Password-reset email could not be sent (best-effort).");
            }

            return sent;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Password-reset email could not be sent (best-effort).");
            return false;
        }
    }
}
