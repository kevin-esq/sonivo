using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Realtime;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<GroupAccessService>();
        services.AddScoped<ITenantResolver, PathTenantResolver>();
        services.AddScoped<CreateGroupHandler>();
        services.AddScoped<ListMyGroupsHandler>();
        services.AddScoped<ListUpcomingActivityHandler>();
        services.AddScoped<ListCalendarEventsHandler>();
        services.AddScoped<GetGroupHandler>();
        services.AddScoped<GetGroupBySlugHandler>();
        services.AddScoped<ChangeGroupSlugHandler>();
        services.AddScoped<GetGroupBrandingHandler>();
        services.AddScoped<UpdateGroupBrandingHandler>();
        services.AddScoped<SetGroupLogoHandler>();
        services.AddScoped<GetGroupLogoHandler>();
        services.AddScoped<SetGroupBannerHandler>();
        services.AddScoped<GetGroupBannerHandler>();
        services.AddScoped<GetPublicBrandingHandler>();
        services.AddScoped<GetPublicBrandingLogoHandler>();
        services.AddScoped<GetPublicBrandingBannerHandler>();
        services.AddScoped<UpdateGroupHandler>();
        services.AddScoped<SoftDeleteGroupHandler>();
        services.AddScoped<ListMembersHandler>();
        services.AddScoped<ListRosterHandler>();
        services.AddScoped<ExportGroupHandler>();
        services.AddScoped<ExportOwnDataHandler>();
        services.AddScoped<RemoveMemberHandler>();
        services.AddScoped<ChangeMemberRoleHandler>();
        services.AddScoped<SetMusicalRoleHandler>();
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
        services.AddScoped<CreateFileResourceHandler>();
        services.AddScoped<ListResourcesHandler>();
        services.AddScoped<ListGroupResourcesHandler>();
        services.AddScoped<GetResourceHandler>();
        services.AddScoped<GetResourceContentHandler>();
        services.AddScoped<StartDigitizeJobHandler>();
        services.AddScoped<GetDigitizeJobHandler>();
        services.AddScoped<DigitizeJobRunner>();
        services.AddSingleton<IDigitizeJobStore, InMemoryDigitizeJobStore>();
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
        services.AddSingleton<PracticeRoomState>();
        services.AddScoped<ConductorRoomAuthorizer>();
        return services;
    }
}
