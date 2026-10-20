using Microsoft.Extensions.Logging;
using Sonivo.Domain.Tenancy;
using Sonivo.Domain.Billing;
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

public static class ResourceUploadLimits
{
    private const long MiB = 1024L * 1024L;

    public static long MaxByteSize(string? planId, string purpose)
    {
        if (!string.Equals(purpose?.Trim(), ResourcePurposes.Audio, StringComparison.Ordinal))
        {
            return ResourceFileConstraints.MaxNonAudioByteSize;
        }

        return PlanCatalog.Get(planId).Id switch
        {
            PlanCatalog.Starter => 25 * MiB,
            PlanCatalog.Pro => 100 * MiB,
            PlanCatalog.Studio => 250 * MiB,
            _ => 25 * MiB
        };
    }
}

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
        await _access.RequirePermissionAsync(command.GroupId, command.UserId, GroupPermissions.ResourceUpload, cancellationToken);
        await RequireLiveArrangementAsync(
            command.GroupId, command.UserId, command.ArrangementId, cancellationToken);

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
        Guid userId,
        Guid arrangementId,
        CancellationToken cancellationToken)
    {
        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        await _access.RequireResourcePathPermissionAsync(
            groupId,
            userId,
            GroupPermissions.ResourceUpload,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
            },
            cancellationToken);
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
        var (group, _) = await _access.RequirePermissionAsync(
            command.GroupId,
            command.UserId,
            GroupPermissions.ResourceUpload,
            cancellationToken);
        var arrangement = await _arrangements.GetByIdAsync(command.GroupId, command.ArrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        await _access.RequireResourcePathPermissionAsync(
            command.GroupId,
            command.UserId,
            GroupPermissions.ResourceUpload,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
            },
            cancellationToken);

        var maxByteSize = ResourceUploadLimits.MaxByteSize(group.PlanId, command.Purpose);
        if (command.ByteSize > maxByteSize)
        {
            throw new UploadLimitException(maxByteSize);
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

        try
        {
            await _blobs.PutAsync(
                objectKey,
                command.Content,
                resource.ContentType!,
                resource.ByteSize!.Value,
                cancellationToken);

            await _resources.AddAsync(resource, cancellationToken);
            await _resources.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            try
            {
                // The request token may already be canceled. Cleanup must still
                // remove a partially written object after upload or DB failure.
                await _blobs.DeleteAsync(objectKey, CancellationToken.None);
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
        var arrangement = await _arrangements.GetByIdAsync(groupId, arrangementId, cancellationToken);
        if (arrangement is null)
        {
            throw new NotFoundException("Arrangement not found.");
        }

        await _access.RequireResourceReadPathPermissionAsync(
            groupId,
            userId,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId, GroupPermissions.SongView),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, GroupPermissions.ArrangementView),
            },
            cancellationToken);

        var resources = await _resources.ListByArrangementAsync(arrangementId, cancellationToken);
        var hasGroupResourceRead = await _access.HasPermissionAsync(
            groupId, userId, GroupPermissions.ResourceView, cancellationToken);
        var hasParentResourceRead = await _access.HasResourceReadPermissionAsync(
                groupId, userId, GroupPermissions.ResourceView,
                ResourceGrant.ResourceTypes.Song, arrangement.SongId, cancellationToken)
            || await _access.HasResourceReadPermissionAsync(
                groupId, userId, GroupPermissions.ResourceView,
                ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, cancellationToken);
        var visible = new List<ResourceSummaryDto>(resources.Count);
        foreach (var resource in resources)
        {
            if (await _access.HasResourceReadPathPermissionAsync(
                    groupId,
                    userId,
                    new[]
                    {
                        (ResourceGrant.ResourceTypes.Song, arrangement.SongId, GroupPermissions.SongView),
                        (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, GroupPermissions.ArrangementView),
                        (ResourceGrant.ResourceTypes.Resource, resource.Id, GroupPermissions.ResourceView),
                    },
                    cancellationToken))
            {
                visible.Add(CreateLinkResourceHandler.ToSummary(resource));
            }
        }

        if (!hasGroupResourceRead && !hasParentResourceRead && visible.Count == 0)
        {
            await _access.RequirePermissionAsync(
                groupId, userId, GroupPermissions.ResourceView, cancellationToken);
        }

        return visible;
    }
}

public sealed record ListGroupResourcesQuery(Guid UserId, Guid GroupId);

public sealed record GroupResourceListItemDto(
    Guid Id,
    Guid ArrangementId,
    Guid SongId,
    string SongTitle,
    string ArrangementLabel,
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

/// <summary>ADR-0055 W-D: aggregated group material library (member read).</summary>
public sealed class ListGroupResourcesHandler
{
    private readonly GroupAccessService _access;
    private readonly IResourceStore _resources;
    private readonly IArrangementStore _arrangements;
    private readonly ISongStore _songs;

    public ListGroupResourcesHandler(
        GroupAccessService access,
        IResourceStore resources,
        IArrangementStore arrangements,
        ISongStore songs)
    {
        _access = access;
        _resources = resources;
        _arrangements = arrangements;
        _songs = songs;
    }

    public async Task<IReadOnlyList<GroupResourceListItemDto>> HandleAsync(
        ListGroupResourcesQuery query,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(query.GroupId, query.UserId, cancellationToken);
        var resources = await _resources.ListByGroupAsync(query.GroupId, cancellationToken);
        if (resources.Count == 0)
        {
            return Array.Empty<GroupResourceListItemDto>();
        }

        var arrangements = (await _arrangements.ListByGroupAsync(query.GroupId, cancellationToken))
            .ToDictionary(a => a.Id);
        var songs = (await _songs.ListByGroupAsync(query.GroupId, cancellationToken))
            .ToDictionary(s => s.Id);

        var candidates = resources
            .Select(resource =>
            {
                arrangements.TryGetValue(resource.ArrangementId, out var arrangement);
                songs.TryGetValue(arrangement?.SongId ?? Guid.Empty, out var song);
                return new GroupResourceListItemDto(
                    resource.Id,
                    resource.ArrangementId,
                    arrangement?.SongId ?? Guid.Empty,
                    song?.Title ?? string.Empty,
                    arrangement?.Label ?? string.Empty,
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
            })
            .ToList();

        var visible = new List<GroupResourceListItemDto>(candidates.Count);
        foreach (var item in candidates)
        {
            if (item.SongId == Guid.Empty || item.ArrangementId == Guid.Empty)
            {
                continue;
            }

            if (await _access.HasResourceReadPathPermissionAsync(
                    query.GroupId,
                    query.UserId,
                    new[]
                    {
                        (ResourceGrant.ResourceTypes.Song, item.SongId, GroupPermissions.SongView),
                        (ResourceGrant.ResourceTypes.Arrangement, item.ArrangementId, GroupPermissions.ArrangementView),
                        (ResourceGrant.ResourceTypes.Resource, item.Id, GroupPermissions.ResourceView),
                    },
                    cancellationToken))
            {
                visible.Add(item);
            }
        }

        return visible;
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

        await _access.RequireResourceReadPathPermissionAsync(
            groupId,
            userId,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId, GroupPermissions.SongView),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, GroupPermissions.ArrangementView),
                (ResourceGrant.ResourceTypes.Resource, resource.Id, GroupPermissions.ResourceView),
            },
            cancellationToken);

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

        await _access.RequireResourceReadPathPermissionAsync(
            groupId,
            userId,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId, GroupPermissions.SongView),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id, GroupPermissions.ArrangementView),
                (ResourceGrant.ResourceTypes.Resource, resource.Id, GroupPermissions.ResourceView),
            },
            cancellationToken);

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
        await _access.RequirePermissionAsync(command.GroupId, command.UserId, GroupPermissions.ResourceEdit, cancellationToken);
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

        await _access.RequireResourcePathPermissionAsync(
            command.GroupId,
            command.UserId,
            GroupPermissions.ResourceEdit,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
                (ResourceGrant.ResourceTypes.Resource, resource.Id),
            },
            cancellationToken);

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
        await _access.RequirePermissionAsync(groupId, userId, GroupPermissions.ResourceDelete, cancellationToken);
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

        await _access.RequireResourcePathPermissionAsync(
            groupId,
            userId,
            GroupPermissions.ResourceDelete,
            new[]
            {
                (ResourceGrant.ResourceTypes.Song, arrangement.SongId),
                (ResourceGrant.ResourceTypes.Arrangement, arrangement.Id),
                (ResourceGrant.ResourceTypes.Resource, resource.Id),
            },
            cancellationToken);

        var objectKey = resource.ObjectKey;
        await _resources.RemoveAsync(resource, cancellationToken);
        await _resources.SaveChangesAsync(cancellationToken);

        _logger.LogWarning(
            "Security event: resource deleted. ActorUserId: {ActorUserId}, GroupId: {GroupId}, ResourceId: {ResourceId}",
            userId,
            groupId,
            resourceId);

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
