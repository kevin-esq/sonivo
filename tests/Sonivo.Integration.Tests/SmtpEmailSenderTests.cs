using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Sonivo.Infrastructure;

namespace Sonivo.Integration.Tests;

public class SmtpEmailSenderTests
{
    [Fact]
    public void IsConfigured_requires_host_and_from()
    {
        var sender = CreateSender(new Dictionary<string, string?>());
        Assert.False(sender.IsConfigured);
    }

    [Fact]
    public void IsConfigured_true_when_host_and_from_present()
    {
        var sender = CreateSender(new Dictionary<string, string?>
        {
            ["Email:Smtp:Host"] = "smtp.example-email.com",
            ["Email:Smtp:From"] = "owner@example.com"
        });
        Assert.True(sender.IsConfigured);
    }

    [Fact]
    public void IsConfigured_true_with_starttls_and_credentials()
    {
        var sender = CreateSender(new Dictionary<string, string?>
        {
            ["Email:Smtp:Host"] = "smtp.example-email.com",
            ["Email:Smtp:Port"] = "587",
            ["Email:Smtp:UserName"] = "apikey",
            ["Email:Smtp:Password"] = "secret",
            ["Email:Smtp:UseStartTls"] = "true",
            ["Email:Smtp:From"] = "Sonivo <no-reply@example.com>"
        });
        Assert.True(sender.IsConfigured);
    }

    [Fact]
    public async Task TrySendAsync_returns_false_when_not_configured()
    {
        var sender = CreateSender(new Dictionary<string, string?>());
        var sent = await sender.TrySendAsync(
            new Sonivo.Application.Abstractions.OutboundEmail("singer@example.com", "Hi", "body"),
            CancellationToken.None);
        Assert.False(sent);
    }

    [Fact]
    public void FromValidator_accepts_bare_address()
    {
        Assert.True(EmailFromValidator.IsValid("owner@example.com"));
    }

    [Fact]
    public void FromValidator_accepts_display_name_with_brackets_and_trims_whitespace()
    {
        Assert.True(EmailFromValidator.IsValid("  Sonivo <owner@example.com>  "));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-an-address")]
    [InlineData("owner@")]
    [InlineData("@example.com")]
    [InlineData("owner@example")]
    [InlineData("owner @example.com")]
    [InlineData("Sonivo <owner@example>")]
    [InlineData("Sonivo <not-an-address>")]
    [InlineData("Sonivo <owner@example.com")]
    public void FromValidator_rejects_malformed(string? from)
    {
        Assert.False(EmailFromValidator.IsValid(from));
    }

    [Fact]
    public void FromValidator_extracts_bare_address_from_display_form()
    {
        Assert.True(EmailFromValidator.TryExtractAddress("Sonivo <owner@example.com>", out var address));
        Assert.Equal("owner@example.com", address);
    }

    [Fact]
    public void PublicOrigin_trims_trailing_slash()
    {
        var origin = new ConfigurationPublicOrigin(
            new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["PublicOrigin"] = "https://sonivo.lat/"
                })
                .Build());

        Assert.Equal("https://sonivo.lat", origin.GetOrigin());
    }

    private static SmtpEmailSender CreateSender(Dictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new SmtpEmailSender(configuration, NullLogger<SmtpEmailSender>.Instance);
    }
}
