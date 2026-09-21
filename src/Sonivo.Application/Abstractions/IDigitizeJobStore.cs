namespace Sonivo.Application.Abstractions;

/// <summary>
/// Digitizer job lifecycle (ADR-0032 Q-W32-4). Jobs are ephemeral drafts:
/// in-memory with 30-minute expiry; restarts may drop in-flight jobs.
/// </summary>
public enum DigitizeJobStatus
{
    Queued,
    Processing,
    Done,
    Failed
}

/// <summary>
/// One transcript segment kept on a finished job. Draft only — an Owner
/// explicitly saves marks/lyrics via the existing Arrangement PATCH.
/// </summary>
public sealed record DigitizeJobSegment(int StartMs, int EndMs, string Text);

public sealed class DigitizeJob
{
    public DigitizeJob(
        Guid id,
        Guid groupId,
        Guid arrangementId,
        Guid resourceId,
        DateTimeOffset createdAt)
    {
        Id = id;
        GroupId = groupId;
        ArrangementId = arrangementId;
        ResourceId = resourceId;
        CreatedAt = createdAt;
    }

    public Guid Id { get; }
    public Guid GroupId { get; }
    public Guid ArrangementId { get; }
    public Guid ResourceId { get; }
    public DigitizeJobStatus Status { get; set; } = DigitizeJobStatus.Queued;
    public IReadOnlyList<DigitizeJobSegment> Segments { get; set; } = [];
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; }
}

/// <summary>
/// In-memory job store. No new tables (ADR-0032 Q-W32-1).
/// </summary>
public interface IDigitizeJobStore
{
    DigitizeJob Create(Guid groupId, Guid arrangementId, Guid resourceId, DateTimeOffset now);

    /// <summary>Unscoped read for the background runner; null when missing or expired.</summary>
    DigitizeJob? Get(Guid jobId, DateTimeOffset now);

    /// <summary>
    /// Scoped read for status polling; null when missing, expired, or scoped to a
    /// different (groupId, arrangementId) — callers map null to 404.
    /// </summary>
    DigitizeJob? GetScoped(Guid jobId, Guid groupId, Guid arrangementId, DateTimeOffset now);

    /// <summary>Queued → Processing; false when missing, expired, or no longer queued.</summary>
    bool TryTransitionToProcessing(Guid jobId, DateTimeOffset now);

    void Complete(Guid jobId, IReadOnlyList<DigitizeJobSegment> segments);

    void Fail(Guid jobId, string error);
}
