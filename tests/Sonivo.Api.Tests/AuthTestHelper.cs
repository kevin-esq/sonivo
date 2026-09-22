using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Tests;

/// <summary>
/// T-AU-01: white-box email confirmation for pre-existing API tests.
/// With RequireConfirmedEmail=true the register→login helpers must confirm
/// the mailbox before login; production code paths (tokens, mail) are
/// covered by VerificationApiTests instead.
/// </summary>
internal static class AuthTestHelper
{
    internal static async Task ConfirmEmailAsync(IServiceProvider services, string email)
    {
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email)
            ?? throw new InvalidOperationException($"Test user not found: {email}");
        if (user.EmailConfirmed)
        {
            return;
        }

        user.EmailConfirmed = true;
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                string.Join(", ", result.Errors.Select(e => e.Description)));
        }
    }
}
