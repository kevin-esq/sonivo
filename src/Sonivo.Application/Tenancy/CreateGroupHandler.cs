using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record CreateGroupCommand(Guid UserId, string Name);

/// <summary>
/// Group detail. <paramref name="PlanId"/> + <paramref name="Capabilities"/> are the
/// effective entitlements (ADR-0071): the client uses them to render locks; the
/// server remains authoritative on writes.
/// </summary>
public sealed record GroupDto(
    Guid Id,
    string Name,
    int Version,
    string? Role,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? Slug,
    string PlanId,
    BrandingCapabilities Capabilities);

public sealed class CreateGroupHandler
{
    private readonly IGroupStore _store;
    private readonly IClock _clock;
    private readonly IGroupDatabaseScope? _databaseScope;

    public CreateGroupHandler(
        IGroupStore store,
        IClock clock,
        IGroupDatabaseScope? databaseScope = null)
    {
        _store = store;
        _clock = clock;
        _databaseScope = databaseScope;
    }

    public async Task<GroupDto> HandleAsync(CreateGroupCommand command, CancellationToken cancellationToken)
    {
        if (command.UserId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        try
        {
            var now = _clock.UtcNow;
            var slug = await AllocateSlugAsync(command.Name, cancellationToken);
            var group = Group.Create(command.Name, now, slug: slug);
            if (_databaseScope is not null)
            {
                await _databaseScope.SetGroupForBootstrapAsync(group.Id, cancellationToken);
            }

            var ownership = Membership.CreateOwner(group.Id, command.UserId, now);
            await _store.AddAsync(group, ownership, cancellationToken);
            await _store.SaveChangesAsync(cancellationToken);

            return new GroupDto(
                group.Id,
                group.Name,
                group.Version,
                MembershipRoles.Owner,
                group.CreatedAt,
                group.UpdatedAt,
                group.Slug,
                group.PlanId,
                PlanCatalog.BrandingCapabilitiesFor(group.PlanId));
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }

    /// <summary>
    /// Slugifies the name and appends a numeric suffix until it is free. Deleted
    /// groups keep their slug reserved, so <c>SlugExistsAsync</c> looks past the
    /// soft-delete query filter.
    /// </summary>
    private async Task<string> AllocateSlugAsync(string name, CancellationToken cancellationToken)
    {
        var baseSlug = GroupSlug.Slugify(name);
        var candidate = baseSlug;
        for (var suffix = 2; ; suffix++)
        {
            if (_databaseScope is not null)
            {
                await _databaseScope.SetGroupSlugUniquenessLookupAsync(candidate, cancellationToken);
            }

            if (!await _store.SlugExistsAsync(candidate, cancellationToken))
            {
                break;
            }

            if (suffix > 1000)
            {
                throw new ValidationException("Could not allocate a unique group slug.");
            }

            candidate = GroupSlug.WithSuffix(baseSlug, suffix);
        }

        return candidate;
    }
}
