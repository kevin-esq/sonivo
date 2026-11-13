using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Payments;

public sealed class BillingWorker(IServiceScopeFactory scopes, ILogger<BillingWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var nextRefresh = DateTimeOffset.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var serviceScope = scopes.CreateScope();
                var gateway = serviceScope.ServiceProvider.GetRequiredService<StripeBillingGateway>();
                if (gateway.IsConfigured)
                {
                    var db = serviceScope.ServiceProvider.GetRequiredService<SonivoDbContext>();
                    var ids = await db.BillingInbox.AsNoTracking().Where(x => x.Environment == gateway.Environment && x.ProcessedAt == null
                        && x.Attempts < 10 && x.NextAttemptAt <= DateTimeOffset.UtcNow).OrderBy(x => x.ReceivedAt).Select(x => x.Id).Take(50).ToListAsync(stoppingToken);
                    foreach (var id in ids) await RunAsync(id, null, stoppingToken);
                    if (gateway.ReferralRewardsEnabled)
                    {
                        var rewardIds = await db.BillingReferralRewards.AsNoTracking()
                            .Where(x => (x.Status == "pending" && x.NextAttemptAt <= DateTimeOffset.UtcNow)
                                || (x.Status == "processing" && x.ProcessingUntil <= DateTimeOffset.UtcNow))
                            .OrderBy(x => x.NextAttemptAt).Select(x => x.Id).Take(25).ToListAsync(stoppingToken);
                        foreach (var rewardId in rewardIds) await RunReferralRewardAsync(rewardId, stoppingToken);
                    }
                    var refresh = DateTimeOffset.UtcNow >= nextRefresh;
                    var organizations = await db.BillingOrganizations.AsNoTracking().Where(x => x.Environment == gateway.Environment
                        && (refresh || x.TrialEndsAt != null || x.PastDueSince != null || x.PeriodEndsAt <= DateTimeOffset.UtcNow)).Select(x => x.Id).ToListAsync(stoppingToken);
                    foreach (var organization in organizations) await RunAsync(null, organization, stoppingToken);
                    if (refresh) nextRefresh = DateTimeOffset.UtcNow.AddMinutes(15);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception) { logger.LogWarning("Billing worker iteration failed; retrying without exposing provider payloads."); }
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private async Task RunReferralRewardAsync(Guid rewardId, CancellationToken ct)
    {
        using var serviceScope = scopes.CreateScope();
        var service = serviceScope.ServiceProvider.GetRequiredService<StripeBillingService>();
        try { await service.ProcessReferralRewardAsync(rewardId, ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { logger.LogWarning("Referral reward processing failed; the durable reward remains retryable."); }
    }

    private async Task RunAsync(string? eventId, Guid? organizationId, CancellationToken ct)
    {
        using var serviceScope = scopes.CreateScope();
        var service = serviceScope.ServiceProvider.GetRequiredService<StripeBillingService>();
        try
        {
            if (eventId is not null) await service.ProcessEventAsync(eventId, ct);
            else await service.RefreshAsync(organizationId!.Value, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception error)
        {
            logger.LogWarning("Billing reconciliation failed. EventId: {EventId}, OrganizationId: {OrganizationId}", eventId, organizationId);
            if (eventId is null) return;
            var db = serviceScope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            db.ChangeTracker.Clear();
            var environment = serviceScope.ServiceProvider.GetRequiredService<StripeBillingGateway>().Environment;
            var ev = await db.BillingInbox.SingleAsync(x => x.Id == eventId && x.Environment == environment, ct);
            ev.Attempts++; ev.ErrorCode = error is ConflictException { Message: "billing-unmapped-customer" }
                ? "unmapped-customer" : "reconciliation-failed";
            ev.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(Math.Min(60, Math.Pow(2, ev.Attempts)));
            await db.SaveChangesAsync(ct);
        }
    }
}
