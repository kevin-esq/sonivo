using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Sonivo.Infrastructure.Identity;

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

    public static async Task<ExternalLoginCompletionResult> CompleteAsync(
        ExternalLoginInfo info,
        UserManager<ApplicationUser> users,
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
            if (!verified)
            {
                return new ExternalLoginCompletionResult(
                    false,
                    null,
                    "Google email is not verified. Sign in with password, then link Google from a future settings flow.",
                    StatusCodes.Status403Forbidden);
            }

            var link = await users.AddLoginAsync(existingByEmail, info);
            if (!link.Succeeded)
            {
                return new ExternalLoginCompletionResult(
                    false,
                    null,
                    string.Join(" ", link.Errors.Select(e => e.Description)),
                    StatusCodes.Status400BadRequest);
            }

            if (!existingByEmail.EmailConfirmed)
            {
                existingByEmail.EmailConfirmed = true;
                await users.UpdateAsync(existingByEmail);
            }

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
