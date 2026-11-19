using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace Sonivo.Api.Features;

internal static class FeatureEndpoints
{
    public static void MapFeatureEndpoints(this WebApplication endpoints)
    {
        endpoints.MapGet("/api/features", (IConfiguration configuration) => Results.Ok(new
        {
            lrc = configuration.GetValue("Features:Lrc", false),
            stageMode = configuration.GetValue("Features:StageMode", false),
            groupBranding = configuration.GetValue("Features:GroupBranding", true),
            notifications = configuration.GetValue("Features:Notifications", false),
            managedAccounts = configuration.GetValue("Features:ManagedAccounts", false)
        }))
        .WithName("GetFeatures")
        .AllowAnonymous();
    }
}
