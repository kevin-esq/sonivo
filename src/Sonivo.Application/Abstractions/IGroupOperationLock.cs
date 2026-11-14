namespace Sonivo.Application.Abstractions;

public interface IGroupOperationLock
{
    Task LockAsync(Guid groupId, CancellationToken cancellationToken);
}
