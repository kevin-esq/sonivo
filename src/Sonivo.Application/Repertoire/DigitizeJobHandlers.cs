using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Repertoire;

public sealed record StartDigitizeJobCommand(Guid UserId, Guid GroupId, Guid ArrangementId, Guid ResourceId);

public sealed record DigitizeJobStartedDto(Guid JobId, string Status);

public sealed record DigitizeJobSegmentDto(int StartMs, int EndMs, string Text);

public sealed record DigitizeJobDto(
    Guid JobId,
    string Status,
    IReadOnlyList<DigitizeJobSegmentDto>? Segments,
    string? Error);

/// <summary>
/// Starts an async digitizer job (ADR-0032 Q-W32-4): Owner-only, per-request
/// group+arrangement check (404 non-member/unknown, 403 member non-Owner),
/// eligibility + blob cap validated up front. Transcription itself runs in
/// <see cref="DigitizeJobRunner"/> — this handler never touches
/// <c>Arrangement.Chords</c> (or any Arrangement field).
/// </summary>
public sealed class StartDigitizeJobHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;
    private readonly IDigitizeJobStore _jobs;
    private readonly IClock _clock;

    public StartDigitizeJobHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources,
        IDigitizeJobStore jobs,
        IClock clock)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
        _jobs = jobs;
        _clock = clock;
    }

    public async Task<DigitizeJobStartedDto> HandleAsync(
        StartDigitizeJobCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var arrangement = await _arrangements.GetByIdAsync(
            command.GroupId, command.ArrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        if (command.ResourceId == Guid.Empty)
        {
            throw new ValidationException("El recurso es obligatorio.");
        }

        var resource = await _resources.GetByIdAsync(
            command.ArrangementId, command.ResourceId, cancellationToken);
        if (resource is null)
        {
            throw new NotFoundException("Resource not found.");
        }

        var rejection = DigitizeEligibility.RejectReason(resource);
        if (rejection is not null)
        {
            throw new ValidationException(rejection);
        }

        if (resource.ByteSize is null or > ResourceFileConstraints.MaxByteSize)
        {
            throw new ValidationException(
                $"El archivo supera el máximo de {ResourceFileConstraints.MaxByteSize} bytes.");
        }

        var job = _jobs.Create(command.GroupId, command.ArrangementId, command.ResourceId, _clock.UtcNow);
        return new DigitizeJobStartedDto(job.Id, ToStatus(job.Status));
    }

    internal static string ToStatus(DigitizeJobStatus status)
        => status switch
        {
            DigitizeJobStatus.Queued => "queued",
            DigitizeJobStatus.Processing => "processing",
            DigitizeJobStatus.Done => "done",
            DigitizeJobStatus.Failed => "failed",
            _ => "failed"
        };
}

/// <summary>
/// Polls a digitizer job (ADR-0032 Q-W32-4). Same Owner-only gate as start;
/// job ids are unguessable Guids re-scoped to (groupId, arrangementId) per
/// request. Members never see drafts — endpoints require Owner.
/// </summary>
public sealed class GetDigitizeJobHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IDigitizeJobStore _jobs;
    private readonly IClock _clock;

    public GetDigitizeJobHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IDigitizeJobStore jobs,
        IClock clock)
    {
        _access = access;
        _arrangements = arrangements;
        _jobs = jobs;
        _clock = clock;
    }

    public async Task<DigitizeJobDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid arrangementId,
        Guid jobId,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(groupId, userId, cancellationToken);

        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var job = _jobs.GetScoped(jobId, groupId, arrangementId, _clock.UtcNow);
        if (job is null)
        {
            throw new NotFoundException("No se encontró el trabajo de digitalización.");
        }

        return new DigitizeJobDto(
            job.Id,
            StartDigitizeJobHandler.ToStatus(job.Status),
            job.Status == DigitizeJobStatus.Done
                ? job.Segments.Select(s => new DigitizeJobSegmentDto(s.StartMs, s.EndMs, s.Text)).ToList()
                : null,
            job.Error);
    }
}

/// <summary>
/// Background transcription worker (ADR-0032 Q-W32-4/Q-W32-6). Never throws:
/// every failure lands on the job as <c>failed</c> with a clear Spanish error.
/// Over-cap input fails the job — never partial writes, never Arrangement
/// writes of any kind.
/// </summary>
public sealed class DigitizeJobRunner
{
    private readonly IDigitizeJobStore _jobs;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;
    private readonly IBlobStore _blobs;
    private readonly IAudioTranscriber _transcriber;
    private readonly DigitizeOptions _options;
    private readonly IClock _clock;
    private readonly ILogger<DigitizeJobRunner> _logger;

    public DigitizeJobRunner(
        IDigitizeJobStore jobs,
        IArrangementStore arrangements,
        IResourceStore resources,
        IBlobStore blobs,
        IAudioTranscriber transcriber,
        IOptions<DigitizeOptions> options,
        IClock clock,
        ILogger<DigitizeJobRunner> logger)
    {
        _jobs = jobs;
        _arrangements = arrangements;
        _resources = resources;
        _blobs = blobs;
        _transcriber = transcriber;
        _options = options.Value;
        _clock = clock;
        _logger = logger;
    }

    public async Task ProcessAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var now = _clock.UtcNow;
        var job = _jobs.Get(jobId, now);
        if (job is null || !_jobs.TryTransitionToProcessing(jobId, now))
        {
            return;
        }

        try
        {
            await ProcessCoreAsync(job, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Digitize job {JobId} failed unexpectedly.", jobId);
            _jobs.Fail(jobId, "No se pudo digitalizar el audio. Inténtalo de nuevo.");
        }
    }

    private async Task ProcessCoreAsync(DigitizeJob job, CancellationToken cancellationToken)
    {
        var arrangement = await _arrangements.GetByIdAsync(job.GroupId, job.ArrangementId, cancellationToken);
        if (arrangement is null)
        {
            _jobs.Fail(job.Id, "El arreglo ya no existe.");
            return;
        }

        var resource = await _resources.GetByIdAsync(job.ArrangementId, job.ResourceId, cancellationToken);
        if (resource is null)
        {
            _jobs.Fail(job.Id, "El recurso ya no existe.");
            return;
        }

        var rejection = DigitizeEligibility.RejectReason(resource);
        if (rejection is not null)
        {
            _jobs.Fail(job.Id, rejection);
            return;
        }

        if (resource.ByteSize is null or > ResourceFileConstraints.MaxByteSize)
        {
            _jobs.Fail(job.Id, $"El archivo supera el máximo de {ResourceFileConstraints.MaxByteSize} bytes.");
            return;
        }

        if (string.IsNullOrWhiteSpace(resource.ObjectKey))
        {
            _jobs.Fail(job.Id, "No se encontró el contenido del audio.");
            return;
        }

        var blob = await _blobs.GetAsync(resource.ObjectKey, cancellationToken);
        if (blob is null)
        {
            _jobs.Fail(job.Id, "No se encontró el contenido del audio.");
            return;
        }

        await using var buffer = new MemoryStream();
        await blob.Content.CopyToAsync(buffer, cancellationToken);
        var bytes = buffer.ToArray();
        if (bytes.Length > ResourceFileConstraints.MaxByteSize)
        {
            _jobs.Fail(job.Id, $"El archivo supera el máximo de {ResourceFileConstraints.MaxByteSize} bytes.");
            return;
        }

        IReadOnlyList<TranscribedSegment> raw;
        try
        {
            await using var audio = new MemoryStream(bytes, writable: false);
            raw = await _transcriber.TranscribeAsync(audio, resource.ContentType!, cancellationToken);
        }
        catch (TranscriptionException ex)
        {
            _jobs.Fail(job.Id, ex.Message);
            return;
        }

        IReadOnlyList<TranscribedSegment> cleaned;
        try
        {
            cleaned = DigitizeSegmentMapper.Clean(raw);
        }
        catch (TranscriptionException ex)
        {
            _jobs.Fail(job.Id, ex.Message);
            return;
        }

        if (cleaned.Count > DigitizeSegmentMapper.MaxSegments)
        {
            _jobs.Fail(
                job.Id,
                $"La transcripción produjo {cleaned.Count} segmentos (máximo {DigitizeSegmentMapper.MaxSegments}). Usa un audio más corto.");
            return;
        }

        var maxEndMs = cleaned.Count == 0 ? 0 : cleaned.Max(s => s.EndMs);
        var maxMs = (long)Math.Max(1, _options.MaxAudioSeconds) * 1000;
        if (maxEndMs > maxMs)
        {
            _jobs.Fail(
                job.Id,
                $"El audio dura aproximadamente {maxEndMs / 1000} s (máximo {_options.MaxAudioSeconds} s). Usa un audio más corto.");
            return;
        }

        _jobs.Complete(
            job.Id,
            cleaned.Select(s => new DigitizeJobSegment(s.StartMs, s.EndMs, s.Text)).ToList());
    }
}
