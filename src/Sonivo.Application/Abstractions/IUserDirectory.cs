namespace Sonivo.Application.Abstractions;

public sealed record UserDirectoryEntry(Guid UserId, string DisplayName, DateTimeOffset? LastSeenAt, string? Email);

public interface IUserDirectory
{
    Task<IReadOnlyList<UserDirectoryEntry>> GetByIdsAsync(
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken);

    /// <summary>ADR-0055 W-E: best-effort presence touch (throttled by the caller).</summary>
    Task TouchLastSeenAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken);
}
