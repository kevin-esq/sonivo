using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Payments;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Billing;

internal sealed record AdminServiceIdentity(string KeyId, string ServiceId, string ActorId,
    string OperationId, string Fingerprint, IReadOnlySet<string> Scopes)
{
    public const string ItemKey = "sonivo.admin-service";
}

internal static class AdminServiceSignature
{
    internal static string Canonicalize(string method, string path, string query, string bodyHash,
        string timestamp, string nonce, string keyId, string operationId, string actorId)
        => string.Join('\n', method.ToUpperInvariant(), path, CanonicalQuery(query), bodyHash,
            timestamp, nonce, keyId, operationId, actorId);

    internal static string CanonicalQuery(string query)
    {
        if (string.IsNullOrEmpty(query) || query == "?") return "";
        return string.Join('&', query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Split('=', 2))
            .Select(pair => (Key: Uri.UnescapeDataString(pair[0].Replace('+', ' ')),
                Value: pair.Length == 2 ? Uri.UnescapeDataString(pair[1].Replace('+', ' ')) : ""))
            .OrderBy(x => x.Key, StringComparer.Ordinal).ThenBy(x => x.Value, StringComparer.Ordinal)
            .Select(x => $"{Uri.EscapeDataString(x.Key)}={Uri.EscapeDataString(x.Value)}"));
    }

    internal static string Fingerprint(string canonical)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));

    internal static string OperationFingerprint(string method, string path, string query, string bodyHash,
        string keyId, string operationId, string actorId)
        => Fingerprint(string.Join('\n', method.ToUpperInvariant(), path, CanonicalQuery(query), bodyHash,
            keyId, operationId, actorId));

    internal static bool Verify(string secret, string canonical, string signature)
    {
        byte[] key;
        byte[] supplied;
        try { key = Convert.FromBase64String(secret); supplied = Convert.FromBase64String(signature); }
        catch (FormatException) { return false; }
        if (key.Length < 32 || supplied.Length != 32) return false;
        var expected = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(canonical));
        return CryptographicOperations.FixedTimeEquals(expected, supplied);
    }
}

internal sealed class AdminServiceAuthenticationMiddleware(RequestDelegate next)
{
    private const string Prefix = "/api/admin/v1";
    private const int MaxBodyBytes = 65_536;

    public async Task InvokeAsync(HttpContext context, IConfiguration configuration,
        SonivoDbContext db, IClock clock, ILogger<AdminServiceAuthenticationMiddleware> logger)
    {
        if (!context.Request.Path.StartsWithSegments(Prefix, StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        if (!configuration.GetValue<bool>("AdminApi:Enabled")
            || !configuration.GetValue<bool>("AdminApi:DatabaseIsolationReady")
            || !string.Equals(configuration["Payments:Provider"], "stripe", StringComparison.Ordinal)
            || !string.Equals(configuration["Payments:Stripe:Environment"] ?? "sandbox",
                "sandbox", StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (!Header(context, "X-Sonivo-Key-Id", out var keyId)
            || !Header(context, "X-Sonivo-Timestamp", out var timestampText)
            || !Header(context, "X-Sonivo-Nonce", out var nonce)
            || !Header(context, "X-Sonivo-Operation-Id", out var operationId)
            || !Header(context, "X-Sonivo-Actor-Id", out var actorId)
            || !Header(context, "X-Sonivo-Signature", out var signature)
            || keyId.Length > 100 || keyId.Any(x => !char.IsAsciiLetterOrDigit(x) && x is not ('-' or '_'))
            || nonce.Length is < 16 or > 100 || nonce.Any(x => !char.IsAsciiLetterOrDigit(x) && x is not ('.' or '_' or '~' or '-'))
            || actorId.Length is < 1 or > 200 || actorId.Any(char.IsControl) || string.IsNullOrWhiteSpace(actorId)
            || !Guid.TryParse(operationId, out var parsedOperation) || parsedOperation == Guid.Empty
            || !long.TryParse(timestampText, NumberStyles.None, CultureInfo.InvariantCulture, out var timestamp)
            || timestamp < clock.UtcNow.ToUnixTimeSeconds() - 300
            || timestamp > clock.UtcNow.ToUnixTimeSeconds() + 300)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var key = configuration.GetSection("AdminApi:Keys").GetSection(keyId);
        var secret = key["Secret"];
        var serviceId = key["ServiceId"];
        var scopes = key.GetSection("Scopes").GetChildren().Select(x => x.Value ?? "")
            .Where(x => x.Length > 0).ToHashSet(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(serviceId)
            || serviceId.Length > 100 || serviceId.Any(char.IsControl) || scopes.Count == 0
            || context.Request.ContentLength > MaxBodyBytes)
        {
            context.Response.StatusCode = context.Request.ContentLength > MaxBodyBytes
                ? StatusCodes.Status413PayloadTooLarge : StatusCodes.Status401Unauthorized;
            return;
        }

        context.Request.EnableBuffering();
        using var body = new MemoryStream(Math.Min(context.Request.ContentLength is > 0 and <= MaxBodyBytes
            ? (int)context.Request.ContentLength.Value : 4096, MaxBodyBytes));
        var buffer = new byte[8192];
        int read;
        while ((read = await context.Request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
        {
            if (body.Length + read > MaxBodyBytes)
            {
                context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                return;
            }
            await body.WriteAsync(buffer.AsMemory(0, read), context.RequestAborted);
        }
        context.Request.Body.Position = 0;
        var bodyHash = Convert.ToHexStringLower(SHA256.HashData(body.ToArray()));
        var canonical = AdminServiceSignature.Canonicalize(context.Request.Method,
            context.Request.Path.Value ?? "", context.Request.QueryString.Value ?? "", bodyHash,
            timestampText, nonce, keyId, parsedOperation.ToString("D"), actorId);
        if (!AdminServiceSignature.Verify(secret, canonical, signature))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var environment = configuration["Payments:Stripe:Environment"] ?? "sandbox";
        var targetOrganizationId = Guid.TryParse(context.Request.RouteValues["organizationId"]?.ToString(), out var orgId)
            ? orgId : (Guid?)null;
        try
        {
            if (db.Database.IsRelational())
            {
                await db.BillingAdminRequestNonces.Where(x => x.Environment == environment
                    && x.ExpiresAt <= clock.UtcNow).ExecuteDeleteAsync(context.RequestAborted);
            }
            else
            {
                var expired = await db.BillingAdminRequestNonces.Where(x => x.Environment == environment
                    && x.ExpiresAt <= clock.UtcNow).ToListAsync(context.RequestAborted);
                db.BillingAdminRequestNonces.RemoveRange(expired);
            }
            if (await db.BillingAdminRequestNonces.AnyAsync(x => x.Environment == environment
                && x.KeyId == keyId && x.Nonce == nonce, context.RequestAborted))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }
            db.BillingAdminRequestNonces.Add(new BillingAdminRequestNonce
            {
                Environment = environment, KeyId = keyId, Nonce = nonce,
                OrganizationId = targetOrganizationId,
                CreatedAt = clock.UtcNow, ExpiresAt = clock.UtcNow.AddMinutes(10)
            });
            await db.SaveChangesAsync(context.RequestAborted);
        }
        catch (DbUpdateException error) when (error.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "PK_BillingAdminRequestNonces" })
        {
            db.ChangeTracker.Clear();
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            return;
        }

        context.Items[AdminServiceIdentity.ItemKey] = new AdminServiceIdentity(keyId, serviceId,
            actorId, parsedOperation.ToString("D"), AdminServiceSignature.OperationFingerprint(
                context.Request.Method, context.Request.Path.Value ?? "", context.Request.QueryString.Value ?? "",
                bodyHash, keyId, parsedOperation.ToString("D"), actorId), scopes);
        context.Response.Headers.CacheControl = "no-store, private";
        var audit = new BillingAdminRequestAudit
        {
            Environment = environment, KeyId = keyId, ServiceId = serviceId, AssertedActorId = actorId,
            OperationId = parsedOperation,
            OrganizationId = targetOrganizationId,
            Method = context.Request.Method, Path = context.Request.Path.Value ?? "",
            StartedAt = clock.UtcNow, OutcomeStatus = 0
        };
        db.BillingAdminRequestAudits.Add(audit);
        try { await db.SaveChangesAsync(context.RequestAborted); }
        catch (Exception)
        {
            db.ChangeTracker.Clear();
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            return;
        }

        var outcome = StatusCodes.Status500InternalServerError;
        try
        {
            await next(context);
            outcome = context.Response.StatusCode;
        }
        finally
        {
            audit.OutcomeStatus = outcome;
            audit.CompletedAt = clock.UtcNow;
            try { await db.SaveChangesAsync(CancellationToken.None); }
            catch (Exception)
            {
                logger.LogError("Administrative request audit completion failed. AuditId: {AuditId}", audit.Id);
            }
        }
    }

    private static bool Header(HttpContext context, string name, out string value)
    {
        value = context.Request.Headers[name].ToString();
        return value.Length > 0 && value.Length <= 512 && !value.Contains(',');
    }
}
