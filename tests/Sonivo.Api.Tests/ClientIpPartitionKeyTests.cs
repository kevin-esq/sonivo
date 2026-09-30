using System.Net;
using Sonivo.Api.Auth;

namespace Sonivo.Api.Tests;

/// <summary>
/// SECURITY-AUDIT-2026-09 M2 (residual): per-IP rate-limit partition key.
/// Covers IPv4 pass-through, IPv6 /64 truncation, IPv4-mapped normalization
/// (auditor fix: mapped addresses must not collapse into one partition), and
/// the null fallback.
/// </summary>
public class ClientIpPartitionKeyTests
{
    [Fact]
    public void Null_address_maps_to_unknown()
    {
        Assert.Equal("unknown", ClientIpPartitionKey.Normalize(null));
    }

    [Fact]
    public void Ipv4_is_used_as_is()
    {
        Assert.Equal("203.0.113.7", ClientIpPartitionKey.Normalize(IPAddress.Parse("203.0.113.7")));
    }

    [Fact]
    public void Ipv6_is_truncated_to_its_64_network()
    {
        var first = ClientIpPartitionKey.Normalize(IPAddress.Parse("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd"));
        var sameNetwork = ClientIpPartitionKey.Normalize(IPAddress.Parse("2001:db8:1234:5678:1111:2222:3333:4444"));

        Assert.Equal("2001:db8:1234:5678::", first);
        Assert.Equal(first, sameNetwork);
    }

    [Fact]
    public void Different_ipv6_64_networks_do_not_collide()
    {
        var a = ClientIpPartitionKey.Normalize(IPAddress.Parse("2001:db8:1:1::1"));
        var b = ClientIpPartitionKey.Normalize(IPAddress.Parse("2001:db8:2:2::1"));

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void Ipv4_mapped_ipv6_normalizes_to_its_ipv4_address()
    {
        // Auditor fix: ::ffff:203.0.113.7 must key as 203.0.113.7 — not as a
        // truncated /64 that would merge every mapped client into one bucket.
        var mapped = IPAddress.Parse("::ffff:203.0.113.7");

        Assert.Equal("203.0.113.7", ClientIpPartitionKey.Normalize(mapped));
    }
}
