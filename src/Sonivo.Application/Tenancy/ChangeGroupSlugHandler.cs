using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record ChangeGroupSlugCommand(Guid UserId, Guid GroupId, string Slug);

/// <summary>
/// Phase 4.3 (ADR-0045 D1): the Owner may change the auto-generated slug **once**.
/// The previous slug is stored in <see cref="GroupSlugHistory"/> so it keeps
/// resolving to this Group (permanent redirect) and can never be claimed by
/// another Group.
/// </summary>
public sealed class ChangeGroupSlugHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupStore _store;
    private readonly IClock _clock;
    private readonly ILogger<ChangeGroupSlugHandler>? _logger;

    public ChangeGroupSlugHandler(
        GroupAccessService access,
        IGroupStore store,
        IClock clock,
        ILogger<ChangeGroupSlugHandler>? logger = null)
    {
        _access = access;
        _store = store;
        _clock = clock;
        _logger = logger;
    }

    public async Task<GroupDto> HandleAsync(ChangeGroupSlugCommand command, CancellationToken cancellationToken)
    {
        var (group, membership) = await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        var newSlug = (command.Slug ?? string.Empty).Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(newSlug))
        {
            throw new ValidationException("Slug is invalid.");
        }

        if (!group.CanChangeSlug)
        {
            throw new ConflictException("Slug already confirmed.");
        }

        if (string.Equals(group.Slug, newSlug, StringComparison.Ordinal))
        {
            throw new ValidationException("New slug must differ from the current slug.");
        }

        // Covers current slugs, soft-deleted groups and every historical slug, so
        // one group can never claim another group's previous slug.
        if (await _store.SlugExistsAsync(newSlug, cancellationToken))
        {
            throw new ConflictException("Slug is already taken.");
        }

        string previous;
        try
        {
            previous = group.ChangeSlug(newSlug, _clock.UtcNow);
        }
        catch (InvalidOperationException)
        {
            throw new ConflictException("Slug already confirmed.");
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        if (!string.IsNullOrEmpty(previous))
        {
            await _store.AddSlugHistoryAsync(
                GroupSlugHistory.Create(group.Id, previous, _clock.UtcNow),
                cancellationToken);
        }

        await _store.UpdateAsync(group, cancellationToken);
        await _store.SaveChangesAsync(cancellationToken);

        _logger?.LogWarning(
            "Security event: group slug changed. ActorUserId: {ActorUserId}, GroupId: {GroupId}",
            command.UserId,
            command.GroupId);

        return new GroupDto(
            group.Id,
            group.Name,
            group.Version,
            membership.Role,
            group.CreatedAt,
            group.UpdatedAt,
            group.Slug);
    }
}
