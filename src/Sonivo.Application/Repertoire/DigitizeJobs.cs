using System.Collections.Concurrent;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// In-memory digitizer job store (ADR-0032 Q-W32-4). Jobs expire 30 minutes
/// after creation; expiry is enforced on reads and transitions-to-processing
/// (terminal writes to an already-expired job are harmless: it is already
/// invisible to readers). Expired entries are purged opportunistically.
/// Restarts may drop in-flight jobs.
/// </summary>
public sealed class InMemoryDigitizeJobStore : IDigitizeJobStore
{
    public static readonly TimeSpan JobLifetime = TimeSpan.FromMinutes(30);

    private readonly IClock _clock;
    private readonly ConcurrentDictionary<Guid, DigitizeJob> _jobs = new();

    public InMemoryDigitizeJobStore(IClock clock)
    {
        _clock = clock;
    }

    public DigitizeJob Create(Guid groupId, Guid arrangementId, Guid resourceId, DateTimeOffset now)
    {
        PurgeExpired(now);
        var job = new DigitizeJob(Guid.NewGuid(), groupId, arrangementId, resourceId, now);
        _jobs[job.Id] = job;
        return job;
    }

    public DigitizeJob? Get(Guid jobId, DateTimeOffset now)
    {
        if (!_jobs.TryGetValue(jobId, out var job))
        {
            return null;
        }

        if (IsExpired(job, now))
        {
            _jobs.TryRemove(jobId, out _);
            return null;
        }

        return job;
    }

    public DigitizeJob? GetScoped(Guid jobId, Guid groupId, Guid arrangementId, DateTimeOffset now)
    {
        var job = Get(jobId, now);
        if (job is null || job.GroupId != groupId || job.ArrangementId != arrangementId)
        {
            return null;
        }

        return job;
    }

    public bool TryTransitionToProcessing(Guid jobId, DateTimeOffset now)
    {
        var job = Get(jobId, now);
        if (job is null)
        {
            return false;
        }

        lock (job)
        {
            if (IsExpired(job, now) || job.Status != DigitizeJobStatus.Queued)
            {
                return false;
            }

            job.Status = DigitizeJobStatus.Processing;
            return true;
        }
    }

    public void Complete(Guid jobId, IReadOnlyList<DigitizeJobSegment> segments)
    {
        if (_jobs.TryGetValue(jobId, out var job))
        {
            lock (job)
            {
                job.Segments = segments;
                job.Error = null;
                job.Status = DigitizeJobStatus.Done;
            }
        }
    }

    public void Fail(Guid jobId, string error)
    {
        if (_jobs.TryGetValue(jobId, out var job))
        {
            lock (job)
            {
                job.Segments = [];
                job.Error = error;
                job.Status = DigitizeJobStatus.Failed;
            }
        }
    }

    private static bool IsExpired(DigitizeJob job, DateTimeOffset now)
        => now - job.CreatedAt >= JobLifetime;

    private void PurgeExpired(DateTimeOffset now)
    {
        foreach (var (id, job) in _jobs)
        {
            if (IsExpired(job, now))
            {
                _jobs.TryRemove(id, out _);
            }
        }
    }
}
