using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<GroupAccessService>();
        services.AddScoped<CreateGroupHandler>();
        services.AddScoped<ListMyGroupsHandler>();
        services.AddScoped<GetGroupHandler>();
        services.AddScoped<UpdateGroupHandler>();
        services.AddScoped<SoftDeleteGroupHandler>();
        return services;
    }
}
