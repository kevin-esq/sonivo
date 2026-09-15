using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application.Repertoire;
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
        services.AddScoped<CreateSongHandler>();
        services.AddScoped<ListSongsHandler>();
        services.AddScoped<GetSongHandler>();
        services.AddScoped<UpdateSongHandler>();
        services.AddScoped<SoftDeleteSongHandler>();
        services.AddScoped<CreateArrangementHandler>();
        services.AddScoped<ListArrangementsHandler>();
        services.AddScoped<GetArrangementHandler>();
        services.AddScoped<UpdateArrangementHandler>();
        services.AddScoped<SoftDeleteArrangementHandler>();
        services.AddScoped<CreateLinkResourceHandler>();
        services.AddScoped<ListResourcesHandler>();
        services.AddScoped<GetResourceHandler>();
        services.AddScoped<UpdateLinkResourceHandler>();
        services.AddScoped<DeleteResourceHandler>();
        return services;
    }
}
