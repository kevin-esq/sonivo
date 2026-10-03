using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tasks;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfTaskStore : ITaskStore
{
    private readonly SonivoDbContext _db;

    public EfTaskStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task AddAsync(GroupTask task, CancellationToken cancellationToken)
        => _db.Tasks.AddAsync(task, cancellationToken).AsTask();

    public async Task<IReadOnlyList<GroupTask>> ListByGroupAsync(
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return await _db.Tasks
            .AsNoTracking()
            .Where(t => t.GroupId == groupId)
            .OrderBy(t => t.Status == TaskStatuses.Done)
            .ThenBy(t => t.DueAt ?? DateTimeOffset.MaxValue)
            .ThenBy(t => t.CreatedAt)
            .ThenBy(t => t.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<GroupTask?> GetByIdAsync(Guid groupId, Guid taskId, CancellationToken cancellationToken)
        => _db.Tasks.FirstOrDefaultAsync(
            t => t.GroupId == groupId && t.Id == taskId,
            cancellationToken);

    public Task UpdateAsync(GroupTask task, CancellationToken cancellationToken)
    {
        _db.Tasks.Update(task);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
