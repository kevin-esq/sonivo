using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Identity;

/// <summary>
/// ADR-0047 / privacy §13: notifies the group's managed accounts that the reset
/// power changed hands when a new Owner is promoted. Email is best-effort; the
/// account UI already shows the permanent "managed by the group" notice.
/// </summary>
public sealed class ManagedAccountNotifier : IManagedAccountNotifier
{
    private readonly IMembershipStore _memberships;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IEmailSender _email;
    private readonly ILogger<ManagedAccountNotifier> _logger;

    public ManagedAccountNotifier(
        IMembershipStore memberships,
        UserManager<ApplicationUser> users,
        IEmailSender email,
        ILogger<ManagedAccountNotifier> logger)
    {
        _memberships = memberships;
        _users = users;
        _email = email;
        _logger = logger;
    }

    public async Task NotifyOwnerChangedAsync(
        Guid groupId,
        Guid newOwnerUserId,
        CancellationToken cancellationToken)
    {
        if (!_email.IsConfigured)
        {
            return;
        }

        var memberships = await _memberships.ListByGroupAsync(groupId, cancellationToken);
        foreach (var membership in memberships)
        {
            if (membership.UserId is not { } userId || userId == newOwnerUserId)
            {
                continue;
            }

            var account = await _users.FindByIdAsync(userId.ToString("D"));
            if (account is null
                || account.ManagedByGroupId != groupId
                || string.IsNullOrWhiteSpace(account.Email)
                || account.Email.EndsWith("@managed.invalid", StringComparison.Ordinal))
            {
                continue;
            }

            try
            {
                await _email.TrySendAsync(
                    new OutboundEmail(
                        account.Email,
                        "Tu grupo tiene un nuevo Organizador",
                        "El Organizador de tu grupo cambió. Tu cuenta sigue administrada "
                        + "por el grupo y el nuevo Organizador puede restablecer tu acceso.\n\n"
                        + "Si no esperabas este cambio, contacta a tu grupo."),
                    cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Owner-change notice could not be sent (best-effort).");
            }
        }
    }
}
