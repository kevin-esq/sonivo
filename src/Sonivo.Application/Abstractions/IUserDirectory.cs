namespace Sonivo.Application.Abstractions;

public sealed record UserDirectoryEntry(Guid UserId, string DisplayName);

public interface IUserDirectory
{
    Task<IReadOnlyList<UserDirectoryEntry>> GetByIdsAsync(
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken);
}
