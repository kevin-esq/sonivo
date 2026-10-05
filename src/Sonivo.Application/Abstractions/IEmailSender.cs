namespace Sonivo.Application.Abstractions;

/// <summary>
/// An outbound transactional message. <see cref="HtmlBody"/> is optional; when
/// present the transport sends a rich, branded message with <see cref="TextBody"/>
/// as the plain-text fallback.
/// </summary>
public sealed record OutboundEmail(
    string To,
    string Subject,
    string TextBody,
    string? HtmlBody = null);

public interface IEmailSender
{
    bool IsConfigured { get; }
    Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken);
}

public interface IPublicOrigin
{
    string? GetOrigin();
}
