using Sonivo.Api.Observability;

namespace Sonivo.Api.Tests;

public sealed class ClientErrorTextRedactorTests
{
    [Theory]
    [InlineData("Open https://example.test/a?token=secret.", "Open [url].")]
    [InlineData("GET /api/groups/123?token=secret", "GET [url]")]
    [InlineData("GET /app/settings#private", "GET [url]")]
    [InlineData("Contact person@example.test.", "Contact [email].")]
    [InlineData("Authorization: Bearer abc.def_123", "Authorization: [token]")]
    [InlineData("JWT abcdefgh.ijklmnop.qrstuvwx", "JWT [token]")]
    [InlineData("Group 2f3a1b4c-5d6e-7f80-9123-456789abcdef", "Group [id]")]
    [InlineData("Key 0123456789abcdef0123456789abcdef", "Key [token]")]
    [InlineData("Key YWJjZDEyMzQ1Njc4OWFiY2RlZjAxMjM0", "Key [token]")]
    [InlineData("Key YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo", "Key [token]")]
    public void Redacts_common_sensitive_patterns(string value, string expected)
    {
        Assert.Equal(expected, ClientErrorTextRedactor.Redact(value));
    }

    [Theory]
    [InlineData("A normal error, with punctuation.")]
    [InlineData("The request failed (status 409); retry later!")]
    public void Preserves_ordinary_text_and_punctuation(string value)
    {
        Assert.Equal(value, ClientErrorTextRedactor.Redact(value));
    }
}
