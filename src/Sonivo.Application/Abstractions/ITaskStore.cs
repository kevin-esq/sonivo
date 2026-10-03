using Sonivo.Domain.Tasks;

namespace Sonivo.Application.Abstractions;

public interface ITaskStore
{
    Task AddAsync(GroupTask task, CancellationToken cancellationToken);
    Task<IReadOnlyList<GroupTask>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task<GroupTask?> GetByIdAsync(Guid groupId, Guid taskId, CancellationToken cancellationToken);
    Task UpdateAsync(GroupTask task, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
