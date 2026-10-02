using Microsoft.AspNetCore.Identity;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Auth;

/// <summary>
/// ADR-0047: uniform failures and timings for identifier-based login so the
/// response never reveals whether a slug, handle or account exists.
/// </summary>
public static class AuthUniformity
{
    // Computed once at startup; never compared against a real credential.
    private static readonly string DummyPasswordHash =
        new PasswordHasher<ApplicationUser>().HashPassword(new ApplicationUser(), "Dummy-Password1a");

    public static IResult InvalidLogin() => Results.Problem(
        detail: "Invalid credentials.",
        statusCode: StatusCodes.Status401Unauthorized,
        title: "Unauthorized");

    /// <summary>Consumes one password-hash verification so a missing account is not
    /// measurably faster than a wrong password.</summary>
    public static void BurnPasswordVerification(UserManager<ApplicationUser> users, string? password)
    {
        users.PasswordHasher.VerifyHashedPassword(
            new ApplicationUser(), DummyPasswordHash, password ?? string.Empty);
    }
}
