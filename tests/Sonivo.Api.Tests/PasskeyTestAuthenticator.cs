using System.Formats.Cbor;
using System.Security.Cryptography;
using System.Text;

namespace Sonivo.Api.Tests;

/// <summary>
/// T-SEC-01: deterministic in-process fake authenticator for the WebAuthn
/// verifier's RED→GREEN matrix. Owns an ECDSA P-256 keypair and crafts a real
/// clientDataJSON / authenticatorData / attestationObject / assertion, so the
/// verifier is exercised end-to-end (no "mock-signature" short-circuit).
/// </summary>
internal sealed class FakeAuthenticator
{
    private readonly ECDsa _ecdsa;
    private readonly ECParameters _publicKey;
    private readonly byte[] _credentialId;

    public FakeAuthenticator(string? credentialId = null)
    {
        _ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _publicKey = _ecdsa.ExportParameters(includePrivateParameters: false);

        // Credential IDs are non-secret identifiers; a fixed, random 32-byte id.
        if (credentialId is null)
        {
            _credentialId = new byte[32];
            RandomNumberGenerator.Fill(_credentialId);
        }
        else
        {
            _credentialId = Encoding.UTF8.GetBytes(credentialId);
        }
    }

    /// <summary>base64url of the credential id embedded in attestedCredentialData.</summary>
    public string CredentialId => Base64Url(_credentialId);

    public (string ClientDataJson, string AttestationObject) BuildAttestation(
        string rpId, string challenge, string origin, long signCount = 0,
        string fmt = "none", byte[]? attestationStatementSig = null)
    {
        var clientDataJson = ClientData("webauthn.create", challenge, origin);
        var clientDataBytes = Encoding.UTF8.GetBytes(clientDataJson);

        // flags: UP(0x01) | UV(0x04) | AT(0x40)
        var authData = BuildAuthData(rpId, flags: 0x45, signCount, includeAttestedData: true);
        var attestationObject = BuildAttestationObject(fmt, authData, attestationStatementSig);

        return (Base64Url(clientDataBytes), Base64Url(attestationObject));
    }

    public (string ClientData, string AuthenticatorData, string Signature) BuildAssertion(
        string rpId, string challenge, string origin, long signCount = 1, bool rawSignature = false)
    {
        var clientDataJson = ClientData("webauthn.get", challenge, origin);
        var clientDataBytes = Encoding.UTF8.GetBytes(clientDataJson);

        // flags: UP(0x01) | UV(0x04)
        var authData = BuildAuthData(rpId, flags: 0x05, signCount, includeAttestedData: false);

        // signature over authenticatorData || SHA256(clientDataJSON)
        var message = authData.Concat(SHA256.HashData(clientDataBytes)).ToArray();
        var signature = _ecdsa.SignData(message, HashAlgorithmName.SHA256);
        if (rawSignature)
        {
            // WebCrypto-based software authenticators (password managers) emit the
            // raw r||s pair instead of the ASN.1 DER form the spec mandates. .NET's
            // own SignData output is already raw on Windows and DER on Unix, so
            // normalise to raw.
            signature = AsRaw(signature);
        }

        return (Base64Url(clientDataBytes), Base64Url(authData), Base64Url(signature));
    }

    private static byte[] AsRaw(byte[] signature) =>
        signature.Length == 64 ? signature : DerToRaw(signature);

    private static byte[] DerToRaw(byte[] der)
    {
        var offset = 0;
        if (der[offset++] != 0x30)
        {
            throw new InvalidOperationException("Unexpected DER encoding.");
        }

        offset += LengthBytes(der[offset]);      // SEQUENCE length (short or long form)
        var r = ReadDerInteger(der, ref offset);
        var s = ReadDerInteger(der, ref offset);
        var raw = new byte[64];
        Array.Copy(r, 0, raw, 32 - r.Length, r.Length);
        Array.Copy(s, 0, raw, 64 - s.Length, s.Length);
        return raw;
    }

    private static int LengthBytes(byte first) => (first & 0x80) == 0 ? 1 : 1 + (first & 0x7F);

    private static byte[] ReadDerInteger(byte[] der, ref int offset)
    {
        if (der[offset++] != 0x02)
        {
            throw new InvalidOperationException("Unexpected DER encoding.");
        }

        var lengthBytes = LengthBytes(der[offset]);
        var length = 0;
        if (lengthBytes == 1)
        {
            length = der[offset];
        }
        else
        {
            for (var i = 1; i < lengthBytes; i++)
            {
                length = (length << 8) | der[offset + i];
            }
        }

        offset += lengthBytes;
        var value = der[offset..(offset + length)];
        offset += length;
        return value.Length > 0 && value[0] == 0 ? value[1..] : value;   // drop the sign pad
    }

    private static string ClientData(string type, string challenge, string origin)
    {
        // WebAuthn clientDataJSON is a UTF-8 JSON document; the challenge is the
        // base64url form carried in the issued challenge (round-tripped verbatim).
        return $"{{\"type\":\"{type}\",\"challenge\":\"{challenge}\",\"origin\":\"{origin}\"}}";
    }

    private byte[] BuildAuthData(string rpId, byte flags, long signCount, bool includeAttestedData)
    {
        var rpIdHash = SHA256.HashData(Encoding.ASCII.GetBytes(rpId));
        var signCountBytes = new byte[4];
        var value = (uint)signCount;
        signCountBytes[0] = (byte)(value >> 24);
        signCountBytes[1] = (byte)(value >> 16);
        signCountBytes[2] = (byte)(value >> 8);
        signCountBytes[3] = (byte)value;

        using var ms = new MemoryStream();
        ms.Write(rpIdHash);          // rpIdHash(32)
        ms.WriteByte(flags);          // flags(1)
        ms.Write(signCountBytes);     // signCount(4 BE)
        if (includeAttestedData)
        {
            ms.Write(new byte[16]);   // aaguid (zeros)
            ms.WriteByte((byte)(_credentialId.Length >> 8));  // credIdLen(2 BE)
            ms.WriteByte((byte)_credentialId.Length);
            ms.Write(_credentialId);  // credentialId
            ms.Write(BuildCoseKey()); // COSE key CBOR
        }
        return ms.ToArray();
    }

    private byte[] BuildCoseKey()
    {
        var writer = new CborWriter(CborConformanceMode.Lax);
        writer.WriteStartMap(5);
        writer.WriteInt32(1); writer.WriteInt32(2);    // kty: EC2
        writer.WriteInt32(3); writer.WriteInt32(-7);   // alg: ES256
        writer.WriteInt32(-1); writer.WriteInt32(1);   // crv: P-256
        writer.WriteInt32(-2); writer.WriteByteString(_publicKey.Q.X!);   // x
        writer.WriteInt32(-3); writer.WriteByteString(_publicKey.Q.Y!);   // y
        writer.WriteEndMap();
        return writer.Encode();
    }

    private static byte[] BuildAttestationObject(string fmt, byte[] authData, byte[]? attStmtSig = null)
    {
        var writer = new CborWriter(CborConformanceMode.Lax);
        writer.WriteStartMap(3);
        writer.WriteTextString("fmt");
        writer.WriteTextString(fmt);
        writer.WriteTextString("attStmt");
        if (attStmtSig is null)
        {
            writer.WriteStartMap(0);
        }
        else
        {
            // Provider attestation statement (packed/x5c style) that the server must
            // NOT verify for a "none" conveyance.
            writer.WriteStartMap(1);
            writer.WriteTextString("sig");
            writer.WriteByteString(attStmtSig);
        }
        writer.WriteEndMap();
        writer.WriteTextString("authData");
        writer.WriteByteString(authData);
        writer.WriteEndMap();
        return writer.Encode();
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
