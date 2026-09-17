using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Scheduling;
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
        services.AddScoped<ListMembersHandler>();
        services.AddScoped<RemoveMemberHandler>();
        services.AddScoped<ChangeMemberRoleHandler>();
        services.AddScoped<LeaveGroupHandler>();
        services.AddScoped<CreateInvitationHandler>();
        services.AddScoped<AcceptInvitationHandler>();
        services.AddScoped<ListInvitationsHandler>();
        services.AddScoped<RevokeInvitationHandler>();
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
        services.AddScoped<CreateSetlistHandler>();
        services.AddScoped<ListSetlistsHandler>();
        services.AddScoped<GetSetlistHandler>();
        services.AddScoped<UpdateSetlistHandler>();
        services.AddScoped<ReplaceSetlistItemsHandler>();
        services.AddScoped<CreateEventHandler>();
        services.AddScoped<ListEventsHandler>();
        services.AddScoped<GetEventHandler>();
        services.AddScoped<UpdateEventHandler>();
        services.AddScoped<CancelEventHandler>();
        services.AddScoped<ReplaceEventPlanFromSetlistHandler>();
        services.AddScoped<UpsertEventRsvpHandler>();
        services.AddScoped<ListEventRsvpsHandler>();
        return services;
    }
}
