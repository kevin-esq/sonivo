using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Auth;

/// <summary>
/// Tracks revocable application-cookie sessions in Identity's existing token table.
/// Only a random opaque id is carried by the protected cookie; its SHA-256 digest
/// is used as the per-user token key, so the database never stores the bearer id.
/// </summary>
public sealed class IdentitySessionRegistry(SonivoDbContext db)
{
    public const string SessionIdProperty = "SonivoSessionId";
    private const string LoginProvider = "Sonivo.Session";
    private static readonly TimeSpan LastSeenWriteInterval = TimeSpan.FromMinutes(5);

    public async Task<string> RegisterAsync(Guid userId, DateTimeOffset issuedAt, CancellationToken cancellationToken = default)
    {
        var sessionId = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var now = DateTimeOffset.UtcNow;
        var issued = issuedAt <= now ? issuedAt : now;
        var token = new IdentityUserToken<Guid>
        {
            UserId = userId,
            LoginProvider = LoginProvider,
            Name = Hash(sessionId),
            Value = JsonSerializer.Serialize(new SessionMetadata(issued, now, issued + SessionAbsolutePolicy.AbsoluteLifetime)),
        };

        db.UserTokens.Add(token);
        await db.SaveChangesAsync(cancellationToken);
        return sessionId;
    }

    public async Task<bool> IsActiveAsync(
        Guid userId,
        string sessionId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        if (!IsValidSessionId(sessionId))
        {
            return false;
        }

        var token = await FindAsync(userId, Hash(sessionId), cancellationToken);
        if (token?.Value is null || !TryRead(token.Value, out var metadata))
        {
            return false;
        }

        if (metadata.ExpiresAt <= now)
        {
            db.UserTokens.Remove(token);
            await db.SaveChangesAsync(cancellationToken);
            return false;
        }

        if (now - metadata.LastSeenAt >= LastSeenWriteInterval)
        {
            token.Value = JsonSerializer.Serialize(metadata with { LastSeenAt = now });
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<IReadOnlyList<SessionListItem>> ListAsync(
        Guid userId,
        string? currentSessionId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var tokens = await db.UserTokens
            .Where(token => token.UserId == userId && token.LoginProvider == LoginProvider)
            .ToListAsync(cancellationToken);
        var expired = new List<IdentityUserToken<Guid>>();
        var sessions = new List<SessionListItem>(tokens.Count);

        foreach (var token in tokens)
        {
            if (token.Value is null || !TryRead(token.Value, out var metadata))
            {
                expired.Add(token);
                continue;
            }

            if (metadata.ExpiresAt <= now)
            {
                expired.Add(token);
                continue;
            }

            sessions.Add(new SessionListItem(
                token.Name,
                currentSessionId is not null && IsValidSessionId(currentSessionId)
                    && FixedTimeEquals(token.Name, Hash(currentSessionId)),
                metadata.CreatedAt,
                metadata.LastSeenAt,
                metadata.ExpiresAt));
        }

        if (expired.Count > 0)
        {
            db.UserTokens.RemoveRange(expired);
            await db.SaveChangesAsync(cancellationToken);
        }

        return sessions
            .OrderByDescending(session => session.IsCurrent)
            .ThenByDescending(session => session.LastSeenAt)
            .Take(100)
            .ToArray();
    }

    public async Task<bool> RevokeAsync(Guid userId, string sessionKey, CancellationToken cancellationToken = default)
    {
        if (!IsValidSessionKey(sessionKey))
        {
            return false;
        }

        var token = await FindAsync(userId, sessionKey, cancellationToken);
        if (token is null)
        {
            return false;
        }

        db.UserTokens.Remove(token);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task RevokeOtherSessionsAsync(
        Guid userId,
        string? currentSessionId,
        CancellationToken cancellationToken = default)
    {
        var currentKey = currentSessionId is not null && IsValidSessionId(currentSessionId)
            ? Hash(currentSessionId)
            : null;
        var tokens = await db.UserTokens
            .Where(token => token.UserId == userId
                && token.LoginProvider == LoginProvider
                && (currentKey == null || token.Name != currentKey))
            .ToListAsync(cancellationToken);
        if (tokens.Count == 0)
        {
            return;
        }

        db.UserTokens.RemoveRange(tokens);
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task RevokeCurrentAsync(Guid userId, string? currentSessionId, CancellationToken cancellationToken = default) =>
        currentSessionId is not null && IsValidSessionId(currentSessionId)
            ? RevokeAsync(userId, Hash(currentSessionId), cancellationToken)
            : Task.CompletedTask;

    private Task<IdentityUserToken<Guid>?> FindAsync(Guid userId, string sessionKey, CancellationToken cancellationToken) =>
        db.UserTokens.SingleOrDefaultAsync(
            token => token.UserId == userId
                && token.LoginProvider == LoginProvider
                && token.Name == sessionKey,
            cancellationToken);

    private static bool TryRead(string value, out SessionMetadata metadata)
    {
        try
        {
            metadata = JsonSerializer.Deserialize<SessionMetadata>(value)!;
            return metadata is not null
                && metadata.CreatedAt != default
                && metadata.LastSeenAt != default
                && metadata.ExpiresAt != default;
        }
        catch (JsonException)
        {
            metadata = default!;
            return false;
        }
    }

    private static string Hash(string sessionId) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sessionId)));

    private static bool IsValidSessionId(string value) =>
        value.Length is >= 40 and <= 64
        && value.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    private static bool IsValidSessionKey(string value) =>
        value.Length == 64 && value.All(Uri.IsHexDigit);

    private static bool FixedTimeEquals(string left, string right) =>
        left.Length == right.Length
        && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(left), Encoding.ASCII.GetBytes(right));

    private sealed record SessionMetadata(DateTimeOffset CreatedAt, DateTimeOffset LastSeenAt, DateTimeOffset ExpiresAt);

    public sealed record SessionListItem(
        string SessionKey,
        bool IsCurrent,
        DateTimeOffset CreatedAt,
        DateTimeOffset LastSeenAt,
        DateTimeOffset ExpiresAt);
}
