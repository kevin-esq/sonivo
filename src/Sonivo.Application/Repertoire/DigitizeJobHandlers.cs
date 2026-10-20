using Microsoft.Extensions.Logging;
using Sonivo.Domain.Tenancy;
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
    string? ErrorCode);

public static class DigitizeJobErrorCodes
{
    public const string Failed = "digitize_failed";
    public const string QueueFull = "queue_full";
    public const string ResourceUnavailable = "resource_unavailable";
    public const string UnsupportedResource = "unsupported_resource";
    public const string UnsupportedPurpose = "unsupported_purpose";
    public const string UnsupportedAudioType = "unsupported_audio_type";
    public const string UnsupportedAudioFormat = "unsupported_audio_format";
    public const string FileTooLarge = "file_too_large";
    public const string AudioContentMissing = "audio_content_missing";
    public const string TranscriptionFailed = "transcription_failed";
    public const string TooManySegments = "too_many_segments";
    public const string AudioTooLong = "audio_too_long";
}

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
        await _access.RequirePermissionAsync(command.GroupId, command.UserId, GroupPermissions.ResourceDigitize, cancellationToken);

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

        await _access.RequireResourcePathPermissionAsync(
            command.GroupId,
            command.UserId,
            GroupPermissions.ResourceDigitize,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
                (ResourceGrant.ResourceTypes.Resource, resource.Id),
            },
            cancellationToken);

        var rejection = DigitizeEligibility.RejectReason(resource);
        if (rejection is not null)
        {
            throw new ValidationException(rejection);
        }

        if (resource.ByteSize is null or > ResourceFileConstraints.MaxDigitizationByteSize)
        {
            throw new ValidationException(
                $"El archivo supera el máximo de {ResourceFileConstraints.MaxDigitizationByteSize} bytes.");
        }

        var job = _jobs.Create(command.UserId, command.GroupId, command.ArrangementId, command.ResourceId, _clock.UtcNow);
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
        await _access.RequirePermissionAsync(groupId, userId, GroupPermissions.ResourceDigitize, cancellationToken);

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

        await _access.RequireResourcePathPermissionAsync(
            groupId,
            userId,
            GroupPermissions.ResourceDigitize,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
                (ResourceGrant.ResourceTypes.Resource, job.ResourceId),
            },
            cancellationToken);

        return new DigitizeJobDto(
            job.Id,
            StartDigitizeJobHandler.ToStatus(job.Status),
            job.Status == DigitizeJobStatus.Done
                ? job.Segments.Select(s => new DigitizeJobSegmentDto(s.StartMs, s.EndMs, s.Text)).ToList()
                : null,
            job.ErrorCode);
    }
}

/// <summary>
/// Background transcription worker (ADR-0032 Q-W32-4/Q-W32-6). Never throws:
/// every failure lands on the job as <c>failed</c> with a stable error code.
/// Over-cap input fails the job — never partial writes, never Arrangement
/// writes of any kind.
/// </summary>
public sealed class DigitizeJobRunner
{
    private readonly IDigitizeJobStore _jobs;
    private readonly GroupAccessService _access;
    private readonly IGroupDataOperation _groupDataOperation;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;
    private readonly IBlobStore _blobs;
    private readonly IAudioTranscriber _transcriber;
    private readonly DigitizeOptions _options;
    private readonly IClock _clock;
    private readonly ILogger<DigitizeJobRunner> _logger;

    public DigitizeJobRunner(
        IDigitizeJobStore jobs,
        GroupAccessService access,
        IGroupDataOperation groupDataOperation,
        IArrangementStore arrangements,
        IResourceStore resources,
        IBlobStore blobs,
        IAudioTranscriber transcriber,
        IOptions<DigitizeOptions> options,
        IClock clock,
        ILogger<DigitizeJobRunner> logger)
    {
        _jobs = jobs;
        _access = access;
        _groupDataOperation = groupDataOperation;
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
            _jobs.Fail(jobId, DigitizeJobErrorCodes.Failed);
        }
    }

    private async Task ProcessCoreAsync(DigitizeJob job, CancellationToken cancellationToken)
    {
        var source = await _groupDataOperation.ExecuteAsUserAsync(
            job.UserId,
            async token =>
            {
                await _access.RequirePermissionAsync(
                    job.GroupId, job.UserId, GroupPermissions.ResourceDigitize, token);

                var arrangement = await _arrangements.GetByIdAsync(job.GroupId, job.ArrangementId, token);
                if (arrangement is null)
                {
                    return null;
                }

                var resource = await _resources.GetByIdAsync(job.ArrangementId, job.ResourceId, token);
                if (resource is null)
                {
                    return null;
                }

                await _access.RequireResourcePathPermissionAsync(
                    job.GroupId,
                    job.UserId,
                    GroupPermissions.ResourceDigitize,
                    new[]
                    {
                        (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                        (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
                        (ResourceGrant.ResourceTypes.Resource, resource.Id),
                    },
                    token);

                return new DigitizeSource(resource.ObjectKey, resource.ContentType, resource.ByteSize, resource);
            },
            cancellationToken);

        if (source is null)
        {
            _jobs.Fail(job.Id, DigitizeJobErrorCodes.ResourceUnavailable);
            return;
        }

        var resource = source.Resource;
        var rejectionCode = DigitizeEligibility.RejectCode(resource);
        if (rejectionCode is not null)
        {
            _jobs.Fail(job.Id, rejectionCode);
            return;
        }

        if (source.ByteSize is null or > ResourceFileConstraints.MaxDigitizationByteSize)
        {
            _jobs.Fail(job.Id, DigitizeJobErrorCodes.FileTooLarge);
            return;
        }

        if (string.IsNullOrWhiteSpace(source.ObjectKey))
        {
            _jobs.Fail(job.Id, DigitizeJobErrorCodes.AudioContentMissing);
            return;
        }

        var blob = await _blobs.GetAsync(source.ObjectKey, cancellationToken);
        if (blob is null)
        {
            _jobs.Fail(job.Id, DigitizeJobErrorCodes.AudioContentMissing);
            return;
        }

        await using var buffer = new MemoryStream();
        await blob.Content.CopyToAsync(buffer, cancellationToken);
        var bytes = buffer.ToArray();
        if (bytes.Length > ResourceFileConstraints.MaxDigitizationByteSize)
        {
            _jobs.Fail(job.Id, DigitizeJobErrorCodes.FileTooLarge);
            return;
        }

        IReadOnlyList<TranscribedSegment> raw;
        try
        {
            await using var audio = new MemoryStream(bytes, writable: false);
            raw = await _transcriber.TranscribeAsync(audio, source.ContentType!, cancellationToken);
        }
        catch (TranscriptionException ex)
        {
            _logger.LogInformation(ex, "Transcription rejected for digitize job {JobId}.", job.Id);
            _jobs.Fail(job.Id, DigitizeJobErrorCodes.TranscriptionFailed);
            return;
        }

        IReadOnlyList<TranscribedSegment> cleaned;
        try
        {
            cleaned = DigitizeSegmentMapper.Clean(raw);
        }
        catch (TranscriptionException ex)
        {
            _logger.LogWarning(ex, "Invalid transcription output for digitize job {JobId}.", job.Id);
            _jobs.Fail(job.Id, DigitizeJobErrorCodes.TranscriptionFailed);
            return;
        }

        if (cleaned.Count > DigitizeSegmentMapper.MaxSegments)
        {
            _jobs.Fail(
                job.Id,
                DigitizeJobErrorCodes.TooManySegments);
            return;
        }

        var maxEndMs = cleaned.Count == 0 ? 0 : cleaned.Max(s => s.EndMs);
        var maxMs = (long)Math.Max(1, _options.MaxAudioSeconds) * 1000;
        if (maxEndMs > maxMs)
        {
            _jobs.Fail(
                job.Id,
                DigitizeJobErrorCodes.AudioTooLong);
            return;
        }

        _jobs.Complete(
            job.Id,
            cleaned.Select(s => new DigitizeJobSegment(s.StartMs, s.EndMs, s.Text)).ToList());
    }

    private sealed record DigitizeSource(string? ObjectKey, string? ContentType, long? ByteSize, Resource Resource);
}
