using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;

namespace Sonivo.Api.Auth;

public sealed record PasskeyCredential(
    string CredentialId,
    string PublicKey,
    string DeviceName,
    DateTimeOffset CreatedAt,
    long SignCount = 0);

public sealed record PasskeyChallenge(
    string Challenge,
    Guid? UserId,
    DateTimeOffset CreatedAt);

public sealed record PasskeyRegistrationStartResponse(
    string Challenge,
    string RpId,
    string RpName,
    PasskeyUserDto User);

public sealed record PasskeyUserDto(
    string Id,
    string Name,
    string DisplayName);

public sealed record PasskeyRegistrationFinishRequest(
    string CredentialId,
    string? PublicKey,
    string? DeviceName);

public sealed record PasskeyLoginStartResponse(
    string Challenge,
    string RpId);

public sealed record PasskeyLoginFinishRequest(
    string CredentialId,
    string? ClientData,
    string? Signature);

public sealed record PasskeyDto(
    string Id,
    string Name,
    DateTimeOffset CreatedAt);

public static class PasskeyChallengeStore
{
    private static readonly ConcurrentDictionary<string, PasskeyChallenge> Challenges = new();

    public static string CreateChallenge(Guid? userId = null)
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        var challenge = Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');

        // Cleanup expired (> 5 min)
        var cutoff = DateTimeOffset.UtcNow.AddMinutes(-5);
        foreach (var kvp in Challenges)
        {
            if (kvp.Value.CreatedAt < cutoff)
            {
                Challenges.TryRemove(kvp.Key, out _);
            }
        }

        Challenges[challenge] = new PasskeyChallenge(challenge, userId, DateTimeOffset.UtcNow);
        return challenge;
    }

    public static bool ConsumeChallenge(string challenge, Guid? expectedUserId = null)
    {
        if (string.IsNullOrWhiteSpace(challenge)) return false;

        if (Challenges.TryRemove(challenge, out var entry))
        {
            if (entry.CreatedAt < DateTimeOffset.UtcNow.AddMinutes(-5))
            {
                return false;
            }
            if (expectedUserId.HasValue && entry.UserId.HasValue && entry.UserId != expectedUserId)
            {
                return false;
            }
            return true;
        }

        return false;
    }
}
