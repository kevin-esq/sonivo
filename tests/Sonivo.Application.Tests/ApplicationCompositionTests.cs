using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Tests;

public class ApplicationCompositionTests
{
    [Fact]
    public void AddApplication_registers_group_handlers()
    {
        var services = new ServiceCollection();
        services.AddApplication();

        Assert.Contains(services, d => d.ServiceType == typeof(CreateGroupHandler));
        Assert.Contains(services, d => d.ServiceType == typeof(GroupAccessService));
        Assert.Contains(services, d => d.ServiceType == typeof(ListMyGroupsHandler));
    }
}
