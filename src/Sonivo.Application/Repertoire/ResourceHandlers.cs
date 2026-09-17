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
    DateTimeOffset CreatedAt);

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
        resource.CreatedAt);
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

    public DeleteResourceHandler(
        GroupAccessService access,
        IArrangementStore arrangements,
        IResourceStore resources)
    {
        _access = access;
        _arrangements = arrangements;
        _resources = resources;
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

        await _resources.RemoveAsync(resource, cancellationToken);
        await _resources.SaveChangesAsync(cancellationToken);
    }
}
