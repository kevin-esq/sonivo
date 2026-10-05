using System.Threading.Channels;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;

namespace Sonivo.Api.Realtime;

/// <summary>
/// SECURITY-AUDIT-2026-10 (B7): bounded background queue for digitize jobs.
/// Replaces the fire-and-forget <c>Task.Run</c> in the digitize endpoint:
/// <list type="bullet">
/// <item>bounded concurrency (2 transcriptions max) so a scripted flood cannot
/// exhaust CPU/RAM on Whisper inference;</item>
/// <item>a full queue fails the job immediately (visible via the poll endpoint)
/// instead of leaving a queued row that never runs;</item>
/// <item>exceptions outside the runner are caught and land on the job as
/// <c>failed</c> instead of an unobserved task;</item>
/// <item>graceful shutdown respects the host cancellation token.</item>
/// </list>
/// The job store itself stays in-memory per ADR-0032 Q-W32-1 (jobs are
/// ephemeral drafts; restarts may drop in-flight jobs).
/// </summary>
public sealed class DigitizeJobQueue : BackgroundService
{
    private const int MaxConcurrency = 2;
    private const int QueueCapacity = 16;

    private readonly Channel<Guid> _jobs;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<DigitizeJobQueue> _logger;

    public DigitizeJobQueue(IServiceScopeFactory scopes, ILogger<DigitizeJobQueue> logger)
    {
        _scopes = scopes;
        _logger = logger;
        _jobs = Channel.CreateBounded<Guid>(new BoundedChannelOptions(QueueCapacity)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleWriter = false,
            SingleReader = false
        });
    }

    /// <summary>
    /// Enqueues a job. When the queue is full the job is marked <c>failed</c>
    /// via the store (the owner sees the error when polling) and false is
    /// returned so the endpoint can answer 503.
    /// </summary>
    public async Task<bool> TryEnqueueAsync(Guid jobId, CancellationToken cancellationToken)
    {
        if (_jobs.Writer.TryWrite(jobId))
        {
            return true;
        }

        try
        {
            using var scope = _scopes.CreateScope();
            var jobs = scope.ServiceProvider.GetRequiredService<IDigitizeJobStore>();
            jobs.Fail(jobId, "La cola de digitalización está llena. Inténtalo en unos minutos.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not fail digitize job {JobId} after a full-queue rejection.", jobId);
        }

        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Parallel.ForEachAsync(
                _jobs.Reader.ReadAllAsync(stoppingToken),
                new ParallelOptions { MaxDegreeOfParallelism = MaxConcurrency, CancellationToken = stoppingToken },
                async (jobId, cancellationToken) =>
                {
                    try
                    {
                        using var scope = _scopes.CreateScope();
                        var runner = scope.ServiceProvider.GetRequiredService<DigitizeJobRunner>();
                        await runner.ProcessAsync(jobId, cancellationToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        // Host shutdown — stop quietly.
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Digitize job {JobId} crashed outside the runner.", jobId);
                        try
                        {
                            using var scope = _scopes.CreateScope();
                            var jobs = scope.ServiceProvider.GetRequiredService<IDigitizeJobStore>();
                            jobs.Fail(jobId, "No se pudo digitalizar el audio. Inténtalo de nuevo.");
                        }
                        catch (Exception storeEx)
                        {
                            _logger.LogWarning(storeEx, "Could not mark digitize job {JobId} as failed.", jobId);
                        }
                    }
                });
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Graceful shutdown.
        }
    }
}
