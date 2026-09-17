namespace Sonivo.Application.Abstractions;

public sealed record OutboundEmail(string To, string Subject, string TextBody);

public interface IEmailSender
{
    bool IsConfigured { get; }
    Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken);
}

public interface IPublicOrigin
{
    string? GetOrigin();
}
