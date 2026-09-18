using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Repertoire;

public sealed record CreateLinkResourceCommand(
    Guid UserId,
    Guid GroupId,
    Guid ArrangementId,
    string? Kind,
    string Purpose,
    string Label,
    string? Part,
    string? Note,
    string Url);

public sealed record CreateFileResourceCommand(
    Guid UserId,
    Guid GroupId,
    Guid ArrangementId,
    string Purpose,
    string Label,
    string? Part,
    string? Note,
    string OriginalFileName,
    string ContentType,
    long ByteSize,
    Stream Content);

public sealed record UpdateLinkResourceCommand(
    Guid UserId,
    Guid GroupId,
    Guid ArrangementId,
    Guid ResourceId,
    string? Purpose,
    string? Label,
    string? Part,
    string? Note);

public sealed record ResourceDetailDto(
    Guid Id,
    Guid ArrangementId,
    string Kind,
    string Purpose,
    string Label,
    string? Part,
    string? Note,
    string? Url,
    string? OriginalFileName,
    string? ContentType,
    long? ByteSize,
    DateTimeOffset CreatedAt);

public sealed record ResourceContentDto(
    Stream Content,
    string ContentType,
    long ByteSize,
    string DownloadFileName);

public sealed class CreateLinkResourceHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;
    private readonly IClock _clock;

    public CreateLinkResourceHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources,
        IClock clock)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
        _clock = clock;
    }

    public async Task<ResourceDetailDto> HandleAsync(
        CreateLinkResourceCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        await RequireLiveArrangementAsync(command.GroupId, command.ArrangementId, cancellationToken);

        try
        {
            Resource.RejectNonLinkKind(command.Kind);
            var resource = Resource.CreateLink(
                command.ArrangementId,
                command.Purpose,
                command.Label,
                command.Url,
                _clock.UtcNow,
                command.Part,
                command.Note);

            await _resources.AddAsync(resource, cancellationToken);
            await _resources.SaveChangesAsync(cancellationToken);
            return ToDetail(resource);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    private async Task RequireLiveArrangementAsync(
        Guid groupId,
        Guid arrangementId,
        CancellationToken cancellationToken)
    {
        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }
    }

    internal static ResourceDetailDto ToDetail(Resource resource) => new(
        resource.Id,
        resource.ArrangementId,
        resource.Kind,
        resource.Purpose,
        resource.Label,
        resource.Part,
        resource.Note,
        resource.Url,
        resource.OriginalFileName,
        resource.ContentType,
        resource.ByteSize,
        resource.CreatedAt);

    internal static ResourceSummaryDto ToSummary(Resource resource) => new(
        resource.Id,
        resource.ArrangementId,
        resource.Kind,
        resource.Purpose,
        resource.Label,
        resource.Part,
        resource.Note,
        resource.Url,
        resource.OriginalFileName,
        resource.ContentType,
        resource.ByteSize,
        resource.CreatedAt);
}

public sealed class CreateFileResourceHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;
    private readonly IBlobStore _blobs;
    private readonly IClock _clock;

    public CreateFileResourceHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources,
        IBlobStore blobs,
        IClock clock)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
        _blobs = blobs;
        _clock = clock;
    }

    public async Task<ResourceDetailDto> HandleAsync(
        CreateFileResourceCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        var arrangement = await _arrangements.GetByIdAsync(command.GroupId, command.ArrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var resourceId = Guid.NewGuid();
        var objectKey = $"resources/{resourceId:D}";

        Resource resource;
        try
        {
            resource = Resource.CreateFile(
                command.ArrangementId,
                command.Purpose,
                command.Label,
                command.OriginalFileName,
                command.ContentType,
                command.ByteSize,
                objectKey,
                _clock.UtcNow,
                command.Part,
                command.Note,
                resourceId);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _blobs.PutAsync(
            objectKey,
            command.Content,
            resource.ContentType!,
            resource.ByteSize!.Value,
            cancellationToken);

        try
        {
            await _resources.AddAsync(resource, cancellationToken);
            await _resources.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            try
            {
                await _blobs.DeleteAsync(objectKey, cancellationToken);
            }
            catch
            {
                // Best-effort cleanup if resource row insert fails after blob put.
            }

            throw;
        }

        return CreateLinkResourceHandler.ToDetail(resource);
    }
}

public sealed class ListResourcesHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;

    public ListResourcesHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
    }

    public async Task<IReadOnlyList<ResourceSummaryDto>> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid arrangementId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var resources = await _resources.ListByArrangementAsync(arrangementId, cancellationToken);
        return resources.Select(CreateLinkResourceHandler.ToSummary).ToList();
    }
}

public sealed class GetResourceHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;

    public GetResourceHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
    }

    public async Task<ResourceDetailDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid arrangementId,
        Guid resourceId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var resource = await _resources.GetByIdAsync(arrangementId, resourceId, cancellationToken);
        if (resource is null)
        {
            throw new NotFoundException("Resource not found.");
        }

        return CreateLinkResourceHandler.ToDetail(resource);
    }
}

public sealed class GetResourceContentHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;
    private readonly IBlobStore _blobs;

    public GetResourceContentHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources,
        IBlobStore blobs)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
        _blobs = blobs;
    }

    public async Task<ResourceContentDto> HandleAsync(
        Guid userId,
        Guid groupId,
        Guid arrangementId,
        Guid resourceId,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var resource = await _resources.GetByIdAsync(arrangementId, resourceId, cancellationToken);
        if (resource is null)
        {
            throw new NotFoundException("Resource not found.");
        }

        if (resource.Kind != ResourceKinds.File
            || string.IsNullOrWhiteSpace(resource.ObjectKey)
            || string.IsNullOrWhiteSpace(resource.ContentType)
            || resource.ByteSize is null
            || string.IsNullOrWhiteSpace(resource.OriginalFileName))
        {
            throw new ValidationException("Resource content is only available for file Resources.");
        }

        var blob = await _blobs.GetAsync(resource.ObjectKey, cancellationToken);
        if (blob is null)
        {
            throw new NotFoundException("Resource content not found.");
        }

        return new ResourceContentDto(
            blob.Content,
            resource.ContentType,
            resource.ByteSize.Value,
            SanitizeDownloadFileName(resource.OriginalFileName));
    }

    internal static string SanitizeDownloadFileName(string originalFileName)
    {
        var name = Path.GetFileName(originalFileName.Trim());
        if (string.IsNullOrWhiteSpace(name))
        {
            return "download";
        }

        Span<char> buffer = stackalloc char[name.Length];
        var written = 0;
        foreach (var ch in name)
        {
            if (ch is '"' or '\\' or '/' or '\0' || char.IsControl(ch))
            {
                buffer[written++] = '_';
            }
            else
            {
                buffer[written++] = ch;
            }
        }

        var sanitized = new string(buffer[..written]).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "download" : sanitized;
    }
}

public sealed class UpdateLinkResourceHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;

    public UpdateLinkResourceHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
    }

    public async Task<ResourceDetailDto> HandleAsync(
        UpdateLinkResourceCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        var arrangement = await _arrangements.GetByIdAsync(command.GroupId, command.ArrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var resource = await _resources.GetByIdAsync(command.ArrangementId, command.ResourceId, cancellationToken);
        if (resource is null)
        {
            throw new NotFoundException("Resource not found.");
        }

        var purpose = command.Purpose ?? resource.Purpose;
        var label = command.Label ?? resource.Label;
        var part = command.Part ?? resource.Part;
        var note = command.Note ?? resource.Note;

        try
        {
            resource.UpdateMetadata(purpose, label, part, note);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _resources.UpdateAsync(resource, cancellationToken);
        await _resources.SaveChangesAsync(cancellationToken);
        return CreateLinkResourceHandler.ToDetail(resource);
    }
}

public sealed class DeleteResourceHandler
{
    private readonly GroupAccessService _access;
    private readonly IArrangementStore _arrangements;
    private readonly IResourceStore _resources;
    private readonly IBlobStore _blobs;
    private readonly ILogger<DeleteResourceHandler> _logger;

    public DeleteResourceHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources,
        IBlobStore blobs,
        ILogger<DeleteResourceHandler> logger)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
        _blobs = blobs;
        _logger = logger;
    }

    public async Task HandleAsync(
        Guid userId,
        Guid groupId,
        Guid arrangementId,
        Guid resourceId,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(groupId, userId, cancellationToken);
        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        var resource = await _resources.GetByIdAsync(arrangementId, resourceId, cancellationToken);
        if (resource is null)
        {
            throw new NotFoundException("Resource not found.");
        }

        var objectKey = resource.ObjectKey;
        await _resources.RemoveAsync(resource, cancellationToken);
        await _resources.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(objectKey))
        {
            try
            {
                await _blobs.DeleteAsync(objectKey, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Failed to delete Resource blob {ObjectKey} after Resource {ResourceId} hard-delete.",
                    objectKey,
                    resourceId);
            }
        }
    }
}
