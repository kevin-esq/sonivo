using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Payments;

public sealed class GroupPurgeReplayWorker(
    IServiceScopeFactory scopes,
    ILogger<GroupPurgeReplayWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var purger = scope.ServiceProvider.GetRequiredService<IGroupPurger>();
                if (purger.IsReplayEnabled)
                    await purger.ReplayAsync(stoppingToken);
                await purger.RunRetentionAsync(stoppingToken);
                await scope.ServiceProvider.GetRequiredService<LegacyGroupCleanupProcessor>().RunAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                logger.LogError("Purge lifecycle worker failed with {ErrorType}; eligible work will retry.", ex.GetType().Name);
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                continue;
            }
            await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
        }
    }
}
