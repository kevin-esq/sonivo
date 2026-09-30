using System.Collections.Concurrent;
using System.Formats.Cbor;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Sonivo.Application.Abstractions;

namespace Sonivo.Api.Auth;

public sealed record PasskeyCredential(
    string CredentialId,
    string PublicKeyCose,
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
    string ClientData,
    string AttestationObject,
    string? DeviceName);

public sealed record PasskeyLoginStartResponse(
    string Challenge,
    string RpId);

public sealed record PasskeyLoginFinishRequest(
    string CredentialId,
    string ClientData,
    string AuthenticatorData,
    string Signature);

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

/// <summary>
/// T-SEC-01: server-side WebAuthn verifier. Upgrades the S3 passkey transport
/// into an actual verified ceremony: clientData (type/challenge/origin),
/// authenticatorData (rpIdHash/UP/UV/signCount), attestation (none | packed
/// self-attestation), and ES256/RS256 assertion signatures. Replaces all
/// trust in client-supplied credentialId/publicKey strings.
/// </summary>
public static class PasskeyVerifier
{
    public const int Es256 = -7;    // ECDSA w/ SHA-256, P-256 (COSE alg)
    public const int Rs256 = -257;  // RSASSA-PKCS1-v1_5 w/ SHA-256 (COSE alg)

    public sealed record ClientData(string Type, string Challenge, string Origin);

    public sealed record RegistrationProof(
        string CredentialId,        // extracted from attestedCredentialData — never from the client body
        byte[] CoseKey,             // raw CBOR of the credential public key
        long SignCount,
        string Fmt);

    public sealed record AssertionProof(long SignCount, bool UserPresent, bool UserVerified);

    public sealed class PasskeyVerificationException : Exception
    {
        public PasskeyVerificationException(string message) : base(message) { }

        public PasskeyVerificationException(string message, Exception inner) : base(message, inner) { }
    }

    public static byte[] Base64UrlDecode(string s)
    {
        try
        {
            s = s.Trim().Replace('-', '+').Replace('_', '/').PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
            return Convert.FromBase64String(s);
        }
        catch (FormatException ex)
        {
            throw new PasskeyVerificationException("Invalid base64url value.", ex);
        }
    }

    public static string Base64UrlEncode(byte[] b) =>
        Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    // ---- clientDataJSON ----------------------------------------------------
    public static ClientData ParseClientData(string clientDataBase64Url)
    {
        try
        {
            using var doc = JsonDocument.Parse(Base64UrlDecode(clientDataBase64Url));
            var root = doc.RootElement;
            return new ClientData(
                root.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "",
                root.TryGetProperty("challenge", out var c) ? c.GetString() ?? "" : "",
                root.TryGetProperty("origin", out var o) ? o.GetString() ?? "" : "");
        }
        catch (JsonException ex)
        {
            throw new PasskeyVerificationException("clientDataJSON is not valid JSON.", ex);
        }
    }

    public static void EnsureClientData(
        ClientData cd, string expectedType, string issuedChallenge, IReadOnlySet<string> allowedOrigins)
    {
        if (!string.Equals(cd.Type, expectedType, StringComparison.Ordinal))
            throw new PasskeyVerificationException("clientData type mismatch.");
        if (!string.Equals(cd.Challenge, issuedChallenge, StringComparison.Ordinal))
            throw new PasskeyVerificationException("challenge mismatch.");          // replay killed here
        if (!allowedOrigins.Contains(cd.Origin.TrimEnd('/')))
            throw new PasskeyVerificationException("origin not allowed.");           // phishing binding
    }

    // ---- authenticatorData (fixed binary layout, NOT CBOR) -----------------
    // rpIdHash(32) | flags(1) | signCount(4 BE) | [attestedCredentialData]
    private static (byte[] RpIdHash, byte Flags, long SignCount) ReadAuthDataHeader(ReadOnlySpan<byte> d)
    {
        if (d.Length < 37) throw new PasskeyVerificationException("authData too short.");
        var rpIdHash = d[..32].ToArray();
        var flags = d[32];
        var signCount = (long)((uint)d[33] << 24 | (uint)d[34] << 16 | (uint)d[35] << 8 | d[36]);
        return (rpIdHash, flags, signCount);
    }

    public static AssertionProof ParseAssertionAuthenticatorData(string authDataBase64Url, string rpId)
    {
        var d = Base64UrlDecode(authDataBase64Url);
        var (rpIdHash, flags, signCount) = ReadAuthDataHeader(d);
        EnsureRpIdHash(rpIdHash, rpId);
        if ((flags & 0x01) == 0)                       // UP — user presence is mandatory
            throw new PasskeyVerificationException("user-present flag missing.");
        return new AssertionProof(signCount, UserPresent: true, UserVerified: (flags & 0x04) != 0);
    }

    private static void EnsureRpIdHash(byte[] actual, string rpId)
    {
        var expected = SHA256.HashData(Encoding.ASCII.GetBytes(rpId));
        if (!actual.AsSpan().SequenceEqual(expected))
            throw new PasskeyVerificationException("rpIdHash mismatch.");           // relying-party binding
    }

    // ---- attestationObject (registration) ----------------------------------
    public static RegistrationProof ParseAttestation(string attestationBase64Url, string rpId)
    {
        byte[] authData;
        string fmt;
        try
        {
            var reader = new CborReader(Base64UrlDecode(attestationBase64Url), CborConformanceMode.Lax);
            fmt = "";
            authData = [];
            reader.ReadStartMap();
            while (reader.PeekState() != CborReaderState.EndMap)
            {
                var key = reader.ReadTextString();
                switch (key)
                {
                    case "fmt": fmt = reader.ReadTextString(); break;
                    case "authData": authData = reader.ReadByteString().ToArray(); break;
                    case "attStmt": reader.SkipValue(); break;   // packed handled after the COSE key is known
                    default: reader.SkipValue(); break;
                }
            }
            reader.ReadEndMap();
        }
        catch (PasskeyVerificationException)
        {
            throw;
        }
        catch (Exception ex) when (ex is CborContentException or InvalidOperationException or FormatException)
        {
            throw new PasskeyVerificationException("attestationObject is malformed.", ex);
        }

        if (fmt is not ("none" or "packed"))
            throw new PasskeyVerificationException($"unsupported attestation fmt '{fmt}'.");

        var (rpIdHash, flags, signCount) = ReadAuthDataHeader(authData);
        EnsureRpIdHash(rpIdHash, rpId);
        if ((flags & 0x01) == 0 || (flags & 0x40) == 0)   // UP + AT (attested credential data present)
            throw new PasskeyVerificationException("registration flags missing (UP/AT).");

        // attestedCredentialData: aaguid(16) | credIdLen(2 BE) | credentialId | COSE key CBOR
        var acd = authData.AsSpan(37);
        if (acd.Length < 18) throw new PasskeyVerificationException("attestedCredentialData too short.");
        var credIdLen = (acd[16] << 8) | acd[17];
        if (acd.Length < 18 + credIdLen) throw new PasskeyVerificationException("credentialId length out of range.");
        var credId = acd.Slice(18, credIdLen).ToArray();

        byte[] coseKey;
        try
        {
            var coseReader = new CborReader(acd.Slice(18 + credIdLen).ToArray(), CborConformanceMode.Lax);
            coseKey = coseReader.ReadEncodedValue().ToArray();  // raw CBOR — store exactly this
        }
        catch (Exception ex) when (ex is CborContentException or InvalidOperationException)
        {
            throw new PasskeyVerificationException("COSE key is malformed.", ex);
        }

        return new RegistrationProof(Base64UrlEncode(credId), coseKey, signCount, fmt);
    }

    /// <summary>packed self-attestation: sig over authData || SHA256(clientDataJSON) with the COSE key.</summary>
    public static void VerifyPackedSelfAttestation(
        string attestationBase64Url, string clientDataBase64Url, byte[] coseKey)
    {
        byte[] authData;
        byte[] sig;
        try
        {
            var reader = new CborReader(Base64UrlDecode(attestationBase64Url), CborConformanceMode.Lax);
            reader.ReadStartMap();
            authData = [];
            sig = [];
            var hasAttStmt = false;
            while (reader.PeekState() != CborReaderState.EndMap)
            {
                var key = reader.ReadTextString();
                switch (key)
                {
                    case "fmt": reader.SkipValue(); break;
                    case "authData": authData = reader.ReadByteString().ToArray(); break;
                    case "attStmt":
                        hasAttStmt = true;
                        var s = new CborReader(reader.ReadEncodedValue().ToArray(), CborConformanceMode.Lax);
                        s.ReadStartMap();
                        while (s.PeekState() != CborReaderState.EndMap)
                        {
                            var k2 = s.ReadTextString();
                            if (k2 == "sig") sig = s.ReadByteString().ToArray(); else s.SkipValue();
                        }
                        break;
                }
            }
            reader.ReadEndMap();

            if (!hasAttStmt || sig.Length == 0) return;  // fmt "none" — nothing to verify
            var message = authData.Concat(SHA256.HashData(Base64UrlDecode(clientDataBase64Url))).ToArray();
            if (!VerifyWithCoseKey(coseKey, message, sig))
                throw new PasskeyVerificationException("packed self-attestation signature invalid.");
        }
        catch (PasskeyVerificationException)
        {
            throw;
        }
        catch (Exception ex) when (ex is CborContentException or InvalidOperationException or FormatException)
        {
            throw new PasskeyVerificationException("attestationObject is malformed.", ex);
        }
    }

    // ---- assertion verification (login) -------------------------------------
    public static bool VerifyAssertion(
        byte[] coseKey, string authDataBase64Url, string clientDataBase64Url, string signatureBase64Url)
    {
        // WebAuthn: signature over authenticatorData || SHA256(clientDataJSON)
        var message = Base64UrlDecode(authDataBase64Url)
            .Concat(SHA256.HashData(Base64UrlDecode(clientDataBase64Url))).ToArray();
        return VerifyWithCoseKey(coseKey, message, Base64UrlDecode(signatureBase64Url));
    }

    private static bool VerifyWithCoseKey(byte[] coseKeyCbor, byte[] message, byte[] signature)
    {
        try
        {
            var reader = new CborReader(coseKeyCbor, CborConformanceMode.Lax);
            int kty = 0, alg = 0, crv = 0;
            byte[]? x = null, y = null, n = null, e = null;

            reader.ReadStartMap();
            while (reader.PeekState() != CborReaderState.EndMap)
            {
                switch (reader.ReadInt32())
                {
                    case 1: kty = reader.ReadInt32(); break;
                    case 3: alg = reader.ReadInt32(); break;
                    case -1:
                        if (kty == 3) n = reader.ReadByteString().ToArray();   // RSA modulus
                        else crv = reader.ReadInt32();                          // EC2 curve (P-256 = 1)
                        break;
                    case -2:
                        if (kty == 3) e = reader.ReadByteString().ToArray();    // RSA exponent
                        else x = reader.ReadByteString().ToArray();             // EC2 x
                        break;
                    case -3: y = reader.ReadByteString().ToArray(); break;      // EC2 y
                    default: reader.SkipValue(); break;
                }
            }
            reader.ReadEndMap();

            if (kty == 2 && alg == Es256 && crv == 1 && x is not null && y is not null)   // EC2 P-256
            {
                using var ec = ECDsa.Create(new ECParameters
                {
                    Curve = ECCurve.NamedCurves.nistP256,
                    Q = new ECPoint { X = x, Y = y }
                });
                // ECDsa hashes internally; the to-be-signed bytes already embed SHA256(clientData),
                // so verify over the SHA-256 of the full message.
                return ec.VerifyData(message, signature, HashAlgorithmName.SHA256);
            }
            if (kty == 3 && alg == Rs256 && n is not null && e is not null)                 // RSA
            {
                using var rsa = RSA.Create(new RSAParameters { Modulus = n, Exponent = e });
                return rsa.VerifyData(message, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            }
            return false;                                    // reject unknown alg/kty — deny by default
        }
        catch (PasskeyVerificationException)
        {
            throw;
        }
        catch (Exception ex) when (ex is CborContentException or InvalidOperationException or ArgumentException or CryptographicException)
        {
            return false;                                    // malformed key/signature — deny by default
        }
    }
}

/// <summary>
/// T-SEC-01: WebAuthn relying-party id + origin allow-list resolution.
/// Origins are exact string matches WITHOUT a trailing slash.
/// </summary>
public static class PasskeyOrigins
{
    public static string GetRelyingPartyId(HttpContext http, IConfiguration config)
    {
        var configured = config["Passkeys:RelyingPartyId"];
        if (!string.IsNullOrWhiteSpace(configured)) return configured.Trim();
        return http.Request.Host.Host;
    }

    public static IReadOnlySet<string> Allowed(HttpContext http, IConfiguration config, IPublicOrigin origin)
    {
        var allowed = new HashSet<string>(StringComparer.Ordinal);

        var configured = config["Passkeys:AllowedOrigins"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            foreach (var part in configured.Split(','))
            {
                var trimmed = part.Trim().TrimEnd('/');
                if (trimmed.Length > 0) allowed.Add(trimmed);
            }
            return allowed;
        }

        var publicOrigin = origin.GetOrigin();
        if (!string.IsNullOrWhiteSpace(publicOrigin))
        {
            allowed.Add(publicOrigin.TrimEnd('/'));
        }

        if (http.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            allowed.Add("http://localhost:5173");
            allowed.Add("http://127.0.0.1:5173");
        }

        return allowed;
    }
}
