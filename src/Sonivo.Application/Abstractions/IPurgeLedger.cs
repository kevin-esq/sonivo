namespace Sonivo.Application.Abstractions;

public sealed record GroupPurgeTombstone(Guid GroupId, DateTimeOffset CreatedAt, Guid? ActorUserId,
    string Reason, IReadOnlyList<string> ObjectKeys, bool Committed = false);

public interface IBlobKeyLister
{
    Task<IReadOnlyList<string>> ListKeysAsync(string prefix, CancellationToken cancellationToken);
}

public interface IPurgeLedger
{
    Task WriteAsync(GroupPurgeTombstone tombstone, CancellationToken cancellationToken);
    Task MarkCommittedAsync(Guid groupId, CancellationToken cancellationToken);
    Task<IReadOnlyList<GroupPurgeTombstone>> ListAsync(CancellationToken cancellationToken);
}

public interface IGroupPurger
{
    bool IsEnabled { get; }
    bool IsRetentionEnabled { get; }
    bool IsReplayEnabled { get; }
    Task PurgeAsync(Guid groupId, Guid? actorUserId, int? expectedVersion, CancellationToken cancellationToken);
    Task RunRetentionAsync(CancellationToken cancellationToken);
    Task ReplayAsync(CancellationToken cancellationToken);
}

public interface IPostCommitActionQueue
{
    void Enqueue(Func<Task> action);
}
