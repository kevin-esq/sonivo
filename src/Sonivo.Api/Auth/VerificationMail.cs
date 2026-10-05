using System.Net;
using System.Text.Json;
using Sonivo.Application.Abstractions;

namespace Sonivo.Api.Auth;

/// <summary>
/// T-AU-01: best-effort verification / password-reset mail over the configured
/// email transport (<see cref="IEmailSender"/>, provider-agnostic). Never throws:
/// transport gaps degrade to <c>mailed=false</c> + a warning log (existing T-3.9
/// pattern). Messages ship a warm, branded HTML body with a plain-text fallback.
/// No Event/RSVP mail (firewall).
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
                    "¡Hola! Gracias por unirte a Sonivo.\n\n" +
                    "Confirma tu correo para activar tu cuenta:\n\n" +
                    $"{link}\n\n" +
                    "Si no creaste esta cuenta, simplemente ignora este mensaje.",
                    RenderHtml(
                        heading: "Confirma tu correo",
                        intro: "¡Hola! Gracias por unirte a Sonivo. Activa tu cuenta y empieza a organizar tu m\u00fasica.",
                        ctaLabel: "Confirmar mi correo",
                        ctaUrl: link,
                        footnote: "Si no creaste esta cuenta, simplemente ignora este mensaje.")),
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
                    "Restablece tu contrase\u00f1a en Sonivo",
                    "Recibimos una solicitud para restablecer tu contrase\u00f1a.\n\n" +
                    $"{link}\n\n" +
                    "Si no lo solicitaste, ignora este mensaje: tu contrase\u00f1a no cambiar\u00e1.",
                    RenderHtml(
                        heading: "Restablece tu contrase\u00f1a",
                        intro: "Recibimos una solicitud para restablecer tu contrase\u00f1a. Si fuiste t\u00fa, contin\u00faa aqu\u00ed.",
                        ctaLabel: "Crear nueva contrase\u00f1a",
                        ctaUrl: link,
                        footnote: "Si no lo solicitaste, ignora este mensaje: tu contrase\u00f1a no cambiar\u00e1.")),
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

    // Premium, client-safe HTML (table layout + inline styles). Brand-driven so
    // the mail feels like the product, not a system message. Includes a hidden
    // preheader (inbox preview), dark-mode-safe metadata and a bulletproof button
    // — the email-client standards that read as "premium".
    private static string RenderHtml(string heading, string intro, string ctaLabel, string ctaUrl, string footnote)
    {
        var safeUrl = WebUtility.HtmlEncode(ctaUrl);
        // schema.org EmailMessage + ViewAction: renders an in-inbox action button
        // in Gmail once the sending domain is DKIM-signed and registered with
        // Google. Ignored by clients that do not support it.
        var actionLd = JsonSerializer.Serialize(new
        {
            @context = "http://schema.org",
            @type = "EmailMessage",
            potentialAction = new
            {
                @type = "ViewAction",
                name = ctaLabel,
                target = ctaUrl
            }
        });
        return "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<meta name=\"color-scheme\" content=\"light dark\">" +
            "<meta name=\"supported-color-schemes\" content=\"light dark\">" +
            "<style>:root{color-scheme:light dark;}a{text-decoration:none;}</style>" +
            "<script type=\"application/ld+json\">" + actionLd + "</script></head>" +
            "<body style=\"margin:0;padding:0;background:#0b1220;\">" +
            $"<div style=\"display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;\">{WebUtility.HtmlEncode(intro)}</div>" +
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#0b1220;\">" +
            "<tr><td align=\"center\" style=\"padding:36px 16px;\">" +
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" " +
            "style=\"max-width:540px;background:#111a2e;border:1px solid rgba(255,255,255,0.08);border-radius:20px;\">" +
            "<tr><td style=\"padding:30px 34px 6px;\">" +
            "<span style=\"font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#e2e8f0;\">Sonivo</span>" +
            "</td></tr>" +
            "<tr><td style=\"padding:6px 34px 0;\">" +
            $"<h1 style=\"margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:700;color:#e2e8f0;\">{WebUtility.HtmlEncode(heading)}</h1>" +
            $"<p style=\"margin:0;font-size:15px;line-height:1.6;color:#94a3b8;\">{WebUtility.HtmlEncode(intro)}</p>" +
            "</td></tr>" +
            "<tr><td style=\"padding:26px 34px 8px;\">" +
            $"<a href=\"{safeUrl}\" style=\"display:inline-block;background:#8366f1;color:#ffffff;" +
            "padding:13px 22px;border-radius:12px;font-weight:600;font-size:15px;line-height:1.2;\">" +
            $"{WebUtility.HtmlEncode(ctaLabel)}</a>" +
            "</td></tr>" +
            "<tr><td style=\"padding:10px 34px 30px;\">" +
            $"<p style=\"margin:0;font-size:12px;line-height:1.6;color:#64748b;\">{WebUtility.HtmlEncode(footnote)}</p>" +
            "</td></tr>" +
            "</table>" +
            "<p style=\"margin:18px 0 0;font-size:11px;color:#475569;\">Hecho con Sonivo</p>" +
            "</td></tr></table></body></html>";
    }
}
