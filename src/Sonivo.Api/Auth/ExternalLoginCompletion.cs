using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Auth;

public sealed record ExternalLoginCompletionResult(
    bool Succeeded,
    ApplicationUser? User,
    string? ErrorDetail,
    int StatusCode);

/// <summary>
/// Create/link Identity users from an external login (Google). Cookie session is applied by the caller.
/// </summary>
public static class ExternalLoginCompletion
{
    public const string GoogleProvider = "Google";
    private const string PasskeyLoginProvider = "Passkeys";

    public static async Task<ExternalLoginCompletionResult> CompleteAsync(
        ExternalLoginInfo info,
        UserManager<ApplicationUser> users,
        SonivoDbContext db,
        IAccountAuditStore audit,
        IClock clock,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var existingByLogin = await users.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
        if (existingByLogin is not null)
        {
            if (IsEmailVerified(info.Principal) && !existingByLogin.EmailConfirmed)
            {
                existingByLogin.EmailConfirmed = true;
                await users.UpdateAsync(existingByLogin);
            }

            return new ExternalLoginCompletionResult(true, existingByLogin, null, StatusCodes.Status200OK);
        }

        var email = GetEmail(info.Principal);
        if (string.IsNullOrWhiteSpace(email))
        {
            return new ExternalLoginCompletionResult(
                false,
                null,
                "Google account did not provide an email address.",
                StatusCodes.Status400BadRequest);
        }

        email = email.Trim();
        var verified = IsEmailVerified(info.Principal);
        var existingByEmail = await users.FindByEmailAsync(email);

        if (existingByEmail is not null)
        {
            // ADR-0047 pre-hijacking defence: never auto-link to an account whose
            // email was never verified. An attacker can create an unverified
            // account with a victim's address; auto-linking a verified provider
            // login would hand it over. The owner must verify first.
            if (!existingByEmail.EmailConfirmed)
            {
                return new ExternalLoginCompletionResult(
                    false,
                    null,
                    "Verify your email before linking an external account.",
                    StatusCodes.Status403Forbidden);
            }

            if (!verified)
            {
                return new ExternalLoginCompletionResult(
                    false,
                    null,
                    "Google email is not verified.",
                    StatusCodes.Status403Forbidden);
            }

            // Before linking, revoke prior credentials (ADR-0047): drop passkeys
            // registered on this account and rotate the security stamp so any
            // pre-existing session can no longer act as this user.
            await RevokePriorCredentialsAsync(existingByEmail, users, db, cancellationToken);

            var link = await users.AddLoginAsync(existingByEmail, info);
            if (!link.Succeeded)
            {
                return new ExternalLoginCompletionResult(
                    false,
                    null,
                    string.Join(" ", link.Errors.Select(e => e.Description)),
                    StatusCodes.Status400BadRequest);
            }

            // ADR-0047 lifecycle: an external link makes a group-managed account
            // self-owned (the group no longer resets it).
            if (existingByEmail.ManagedByGroupId is not null || existingByEmail.MustChangePassword)
            {
                existingByEmail.ManagedByGroupId = null;
                existingByEmail.MustChangePassword = false;
                await users.UpdateAsync(existingByEmail);
            }

            await audit.AddAsync(
                AccountAudit.Create(AccountAudit.ActionLinked, clock.UtcNow, targetUserId: existingByEmail.Id),
                cancellationToken);
            await audit.SaveChangesAsync(cancellationToken);

            return new ExternalLoginCompletionResult(true, existingByEmail, null, StatusCodes.Status200OK);
        }

        var displayName = GetDisplayName(info.Principal);
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            EmailConfirmed = verified,
            DisplayName = displayName
        };

        var create = await users.CreateAsync(user);
        if (!create.Succeeded)
        {
            return new ExternalLoginCompletionResult(
                false,
                null,
                string.Join(" ", create.Errors.Select(e => e.Description)),
                StatusCodes.Status400BadRequest);
        }

        var addLogin = await users.AddLoginAsync(user, info);
        if (!addLogin.Succeeded)
        {
            return new ExternalLoginCompletionResult(
                false,
                null,
                string.Join(" ", addLogin.Errors.Select(e => e.Description)),
                StatusCodes.Status400BadRequest);
        }

        return new ExternalLoginCompletionResult(true, user, null, StatusCodes.Status200OK);
    }

    private static async Task RevokePriorCredentialsAsync(
        ApplicationUser user,
        UserManager<ApplicationUser> users,
        SonivoDbContext db,
        CancellationToken cancellationToken)
    {
        var passkeys = await db.UserTokens
            .Where(t => t.UserId == user.Id && t.LoginProvider == PasskeyLoginProvider)
            .ToListAsync(cancellationToken);
        if (passkeys.Count > 0)
        {
            db.UserTokens.RemoveRange(passkeys);
            await db.SaveChangesAsync(cancellationToken);
        }

        await users.UpdateSecurityStampAsync(user);
    }

    public static bool IsEmailVerified(ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue("email_verified")
            ?? principal.FindFirstValue("emailverified");
        return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(value, "True", StringComparison.Ordinal);
    }

    public static string? GetEmail(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.Email)
        ?? principal.FindFirstValue("email");

    public static string? GetDisplayName(ClaimsPrincipal principal)
    {
        var name = principal.FindFirstValue(ClaimTypes.Name)
            ?? principal.FindFirstValue("name");
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        return name.Trim();
    }
}
