using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Infrastructure.Notifications;

/// <summary>
/// ADR-0052: event/RSVP mail over the existing Gmail API sender. Flag-gated
/// (<c>Features:Notifications</c>, default off) and best-effort: no mailbox or a
/// transport gap degrades to no mail, never a failed request. Members without an
/// email are covered by the in-app surfaces (group events + ICS feed).
/// </summary>
public sealed class EventNotifier : IEventNotifier
{
    private readonly IConfiguration _configuration;
    private readonly IMembershipStore _memberships;
    private readonly IGroupStore _groups;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IEmailSender _email;
    private readonly ILogger<EventNotifier> _logger;

    public EventNotifier(
        IConfiguration configuration,
        IMembershipStore memberships,
        IGroupStore groups,
        UserManager<ApplicationUser> users,
        IEmailSender email,
        ILogger<EventNotifier> logger)
    {
        _configuration = configuration;
        _memberships = memberships;
        _groups = groups;
        _users = users;
        _email = email;
        _logger = logger;
    }

    public async Task EventChangedAsync(
        Guid groupId,
        Guid eventId,
        string title,
        DateTimeOffset startsAt,
        string change,
        CancellationToken cancellationToken)
    {
        if (!Enabled || !_email.IsConfigured)
        {
            return;
        }

        var groupName = (await _groups.GetByIdAsync(groupId, cancellationToken))?.Name ?? "tu grupo";
        var subject = change switch
        {
            EventNotificationChanges.Created => $"{groupName}: nuevo evento «{title}»",
            EventNotificationChanges.Cancelled => $"{groupName}: evento cancelado «{title}»",
            _ => $"{groupName}: evento actualizado «{title}»"
        };
        var body = change switch
        {
            EventNotificationChanges.Created => $"Se creó el evento «{title}» para {FormatWhen(startsAt)}.",
            EventNotificationChanges.Cancelled => $"Se canceló el evento «{title}» ({FormatWhen(startsAt)}).",
            _ => $"Se actualizó el evento «{title}»: ahora es {FormatWhen(startsAt)}."
        };

        var recipients = await ResolveMemberEmailsAsync(groupId, cancellationToken);
        foreach (var to in recipients)
        {
            await SendAsync(to, subject, body, cancellationToken);
        }
    }

    public async Task RsvpChangedAsync(
        Guid groupId,
        Guid eventId,
        Guid userId,
        string response,
        string title,
        DateTimeOffset startsAt,
        CancellationToken cancellationToken)
    {
        if (!Enabled || !_email.IsConfigured)
        {
            return;
        }

        var user = await _users.FindByIdAsync(userId.ToString("D"));
        if (user is null || !TryGetRealEmail(user, out var to))
        {
            return;
        }

        var label = response switch
        {
            "yes" => "Sí",
            "no" => "No",
            "maybe" => "Quizá",
            _ => response
        };
        await SendAsync(
            to,
            $"Asistencia registrada: «{title}»",
            $"Registramos tu asistencia ({label}) al evento «{title}» ({FormatWhen(startsAt)}).",
            cancellationToken);
    }

    private bool Enabled => _configuration.GetValue("Features:Notifications", false);

    private async Task<IReadOnlyList<string>> ResolveMemberEmailsAsync(
        Guid groupId,
        CancellationToken cancellationToken)
    {
        var memberships = await _memberships.ListByGroupAsync(groupId, cancellationToken);
        var emails = new List<string>();
        foreach (var membership in memberships)
        {
            var user = await _users.FindByIdAsync(membership.UserId.ToString("D"));
            if (user is not null && TryGetRealEmail(user, out var to) && !emails.Contains(to))
            {
                emails.Add(to);
            }
        }

        return emails;
    }

    private static bool TryGetRealEmail(ApplicationUser user, out string email)
    {
        email = user.Email ?? string.Empty;
        return !string.IsNullOrWhiteSpace(email)
            && !email.EndsWith("@managed.invalid", StringComparison.Ordinal);
    }

    private async Task SendAsync(string to, string subject, string body, CancellationToken cancellationToken)
    {
        try
        {
            await _email.TrySendAsync(new OutboundEmail(to, subject, body), cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Event notification could not be sent (best-effort).");
        }
    }

    private static string FormatWhen(DateTimeOffset when) =>
        when.ToUniversalTime().ToString("yyyy-MM-dd HH:mm 'UTC'", System.Globalization.CultureInfo.InvariantCulture);
}
