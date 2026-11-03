using Sonivo.Application.Abstractions;
using Sonivo.Domain.Common;

namespace Sonivo.Application.Tenancy;

public sealed record GroupSongTagsDto(IReadOnlyList<string> Tags, int Version);

public sealed class GetGroupSongTagsHandler(GroupAccessService access, IGroupStore groups)
{
    public async Task<GroupSongTagsDto> HandleAsync(Guid userId, Guid groupId, CancellationToken cancellationToken)
    {
        await access.RequireMemberAsync(groupId, userId, cancellationToken);
        var group = await groups.GetByIdAsync(groupId, cancellationToken)
            ?? throw new NotFoundException("Group not found.");
        return new GroupSongTagsDto(group.SongTagList, group.Version);
    }
}

public sealed record UpdateGroupSongTagsCommand(
    Guid UserId,
    Guid GroupId,
    int ExpectedVersion,
    IReadOnlyList<string> Tags);

public sealed class UpdateGroupSongTagsHandler(
    GroupAccessService access,
    IGroupStore groups,
    ISongStore songs,
    IClock clock)
{
    public async Task<GroupSongTagsDto> HandleAsync(
        UpdateGroupSongTagsCommand command,
        CancellationToken cancellationToken)
    {
        var (group, _) = await access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        var normalized = command.Tags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Select(tag => tag.Trim().ToLowerInvariant())
            .ToHashSet(StringComparer.Ordinal);
        var inUse = (await songs.ListByGroupAsync(command.GroupId, cancellationToken))
            .SelectMany(song => song.TagList)
            .FirstOrDefault(tag => !normalized.Contains(tag));
        if (inUse is not null)
            throw new ConflictException($"Tag '{inUse}' is assigned to songs and cannot be removed yet.");

        try
        {
            group.SetSongTagDefinitions(command.Tags, command.ExpectedVersion, clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await groups.UpdateAsync(group, cancellationToken);
        await groups.SaveChangesAsync(cancellationToken);
        return new GroupSongTagsDto(group.SongTagList, group.Version);
    }
}
