using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Auth;

/// <summary>
/// Phase 4.1 (F3b): creates the Identity account behind a roster row.
/// With email → single-use activation link (the Owner never sees a password);
/// without email → one-use temporary password + a unique login handle.
/// </summary>
public sealed record ProvisionedAccess(
    ApplicationUser Account,
    string Credential,
    bool Mailed,
    string? TemporaryPassword,
    string? Handle);

public static class ManagedAccountProvisioner
{
    public const string ActivationLink = "activation_link";
    public const string TemporaryPasswordCredential = "temporary_password";

    /// <summary>Temporary password that satisfies the Identity policy; shown once.
    /// SECURITY-AUDIT-2026-10 (C5): readable charset without ambiguous glyphs
    /// (no 0/O/1/l/I) instead of a 32-hex GUID an Owner must dictate. The three
    /// guaranteed placements keep the Identity policy (digit, lowercase,
    /// uppercase) satisfied on every draw.</summary>
    public static string GenerateTemporaryPassword()
    {
        const string digits = "23456789";
        const string letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
        const string all = digits + letters;
        var chars = new char[12];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = all[RandomNumberGenerator.GetInt32(all.Length)];
        }

        // Guarantee ≥1 digit, ≥1 lowercase and ≥1 uppercase at distinct indexes.
        var digitIndex = RandomNumberGenerator.GetInt32(chars.Length);
        int lowerIndex;
        do { lowerIndex = RandomNumberGenerator.GetInt32(chars.Length); } while (lowerIndex == digitIndex);
        int upperIndex;
        do { upperIndex = RandomNumberGenerator.GetInt32(chars.Length); } while (upperIndex == digitIndex || upperIndex == lowerIndex);
        chars[digitIndex] = digits[RandomNumberGenerator.GetInt32(digits.Length)];
        chars[lowerIndex] = (char)('a' + RandomNumberGenerator.GetInt32(26));
        chars[upperIndex] = (char)('A' + RandomNumberGenerator.GetInt32(26));

        return "Tmp!" + new string(chars);
    }

    public static async Task<ProvisionedAccess> CreateForGroupAsync(
        UserManager<ApplicationUser> users,
        IMembershipStore memberships,
        IEmailSender email,
        IPublicOrigin origin,
        ILogger logger,
        Guid groupId,
        string displayName,
        string? emailAddress,
        string? requestedHandle,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(emailAddress))
        {
            if (await users.FindByEmailAsync(emailAddress) is not null)
            {
                // Anti-pre-hijacking: never take over an existing account.
                throw new ConflictException("Ese correo ya tiene una cuenta.");
            }

            var account = new ApplicationUser
            {
                Email = emailAddress,
                UserName = emailAddress,
                DisplayName = displayName,
                // Activated by the single-use link; login stays blocked until then.
                EmailConfirmed = false,
                ManagedByGroupId = groupId
            };
            var created = await users.CreateAsync(account, GenerateTemporaryPassword());
            if (!created.Succeeded)
            {
                throw new ValidationException(string.Join(
                    " ", created.Errors.Select(e => e.Description)));
            }

            var token = await users.GeneratePasswordResetTokenAsync(account);
            var mailed = await VerificationMail.TrySendPasswordResetAsync(
                email, origin, logger, emailAddress, token, cancellationToken);
            return new ProvisionedAccess(account, ActivationLink, mailed, null, null);
        }

        // No email: Identity still needs a unique, non-routable address. The
        // account is confirmed because there is no mailbox to verify; access is
        // governed by the group and the one-use temporary password.
        var placeholderEmail = $"managed-{Guid.NewGuid():N}@managed.invalid";
        var handle = await ResolveHandleAsync(memberships, groupId, displayName, requestedHandle, cancellationToken);
        var noEmailAccount = new ApplicationUser
        {
            Email = placeholderEmail,
            UserName = placeholderEmail,
            DisplayName = displayName,
            EmailConfirmed = true,
            ManagedByGroupId = groupId,
            MustChangePassword = true
        };
        var temporaryPassword = GenerateTemporaryPassword();
        var noEmailCreated = await users.CreateAsync(noEmailAccount, temporaryPassword);
        if (!noEmailCreated.Succeeded)
        {
            throw new ValidationException(string.Join(
                " ", noEmailCreated.Errors.Select(e => e.Description)));
        }

        return new ProvisionedAccess(
            noEmailAccount, TemporaryPasswordCredential, Mailed: false, temporaryPassword, handle);
    }

    /// <summary>
    /// Resolves a unique, valid handle for a group: the requested one (validated)
    /// or a value derived from the display name, suffixed until it is free.
    /// </summary>
    public static async Task<string> ResolveHandleAsync(
        IMembershipStore memberships,
        Guid groupId,
        string displayName,
        string? requestedHandle,
        CancellationToken cancellationToken)
    {
        var requested = MembershipHandles.Normalize(requestedHandle);
        if (requested is not null)
        {
            if (!MembershipHandles.IsValid(requested))
            {
                throw new ValidationException(
                    $"El identificador debe coincidir con [a-z0-9._-]{{{MembershipHandles.MinLength},{MembershipHandles.MaxLength}}}.");
            }

            if (await memberships.HandleExistsAsync(groupId, requested, cancellationToken))
            {
                throw new ConflictException("Ese identificador ya está en uso en este grupo.");
            }

            return requested;
        }

        var derived = MembershipHandles.Derive(displayName);
        var candidate = derived;
        var suffix = 2;
        while (await memberships.HandleExistsAsync(groupId, candidate, cancellationToken))
        {
            if (suffix > 500)
            {
                throw new ConflictException("No se pudo asignar un identificador único.");
            }

            candidate = MembershipHandles.WithSuffix(derived, suffix++);
        }

        return candidate;
    }
}
