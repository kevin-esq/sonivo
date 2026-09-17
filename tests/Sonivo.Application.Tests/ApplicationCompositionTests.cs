using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Tests;

public class ApplicationCompositionTests
{
    [Fact]
    public void AddApplication_registers_group_and_song_handlers()
    {
        var services = new ServiceCollection();
        services.AddApplication();

        Assert.Contains(services, d => d.ServiceType == typeof(CreateGroupHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(GroupAccessService));
        Assert.Contains(services, d => d.ServiceType == typeof(ListMyGroupsHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(CreateSongHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(ListSongsHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(GetSongHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(UpdateSongHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(SoftDeleteSongHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(CreateArrangementHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(ListArrangementsHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(SoftDeleteArrangementHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(CreateLinkResourceHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(DeleteResourceHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(CreateSetlistHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(ListSetlistsHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(GetSetlistHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(UpdateSetlistHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(ReplaceSetlistItemsHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(CreateEventHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(ListEventsHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(GetEventHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(ReplaceEventPlanFromSetlistHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(UpsertEventRsvpHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(ListEventRsvpsHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(CreateInvitationHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(AcceptInvitationHandler));
    }
}
