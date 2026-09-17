using Microsoft.Extensions.Configuration;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure;

public sealed class ConfigurationPublicOrigin : IPublicOrigin
{
    private readonly IConfiguration _configuration;

    public ConfigurationPublicOrigin(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string? GetOrigin()
    {
        var value = _configuration["PublicOrigin"];
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().TrimEnd('/');
    }
}
