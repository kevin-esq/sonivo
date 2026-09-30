using System.Net;
using System.Net.Sockets;

namespace Sonivo.Api.Auth;

/// <summary>
/// SECURITY-AUDIT-2026-09 M2 (residual): per-IP rate-limit partition key.
/// Render publishes no static proxy egress IPs, so X-Forwarded-For stays
/// trust-all today; this key hardens what the limiter can still control:
/// IPv6 clients are truncated to their /64 network (an attacker cannot rotate
/// the partition key inside a single /64), IPv4-mapped addresses are normalized
/// to IPv4 first (otherwise every mapped client would collapse into one
/// partition), and IPv4 is used as-is. Trusted-proxy pinning and absolute
/// per-account budgets remain follow-ups.
/// </summary>
public static class ClientIpPartitionKey
{
    public const string Unknown = "unknown";

    public static string Normalize(IPAddress? address)
    {
        if (address is null)
        {
            return Unknown;
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return address.ToString();
        }

        var bytes = address.GetAddressBytes();
        for (var i = 8; i < bytes.Length; i++)
        {
            bytes[i] = 0;
        }

        return new IPAddress(bytes).ToString();
    }
}
