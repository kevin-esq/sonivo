using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Sonivo.Application.Realtime;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tasks;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

/// <summary>
/// Emits a cross-user real-time broadcast for every group-scoped entity a save
/// touches (ADR-0074 §3/§6). Centralizing this in one interceptor keeps the
/// write handlers free of transport concerns and gives broad coverage: songs,
/// setlists, events, tasks, members, group/branding.
///
/// Resources are notified by their handlers (a Resource has no direct GroupId).
/// Best-effort: the notifier swallows transport errors, so a broadcast can never
/// fail the write.
/// </summary>
public sealed class GroupChangeInterceptor : SaveChangesInterceptor
{
    private readonly IGroupNotifier _notifier;
    private readonly List<(Guid GroupId, string Scope)> _pending = [];
    private readonly List<Guid> _pendingResourceArrangements = [];

    public GroupChangeInterceptor(IGroupNotifier notifier)
    {
        _notifier = notifier;
    }

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        Collect(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Collect(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        // Sync path is rare here (stores save async); fire-and-forget to avoid
        // blocking a synchronous save on the hub.
        _ = FlushAsync(eventData.Context, CancellationToken.None);
        return base.SavedChanges(eventData, result);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        await FlushAsync(eventData.Context, cancellationToken);
        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    private void Collect(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted))
            {
                continue;
            }

            switch (entry.Entity)
            {
                case Song song:
                    Enqueue(song.GroupId, "songs");
                    break;
                case Setlist setlist:
                    Enqueue(setlist.GroupId, "setlists");
                    break;
                case Event musicalEvent:
                    Enqueue(musicalEvent.GroupId, "events");
                    break;
                case GroupTask task:
                    Enqueue(task.GroupId, "tasks");
                    break;
                case Membership membership:
                    Enqueue(membership.GroupId, "members");
                    break;
                case GroupBranding branding:
                    Enqueue(branding.GroupId, "group");
                    break;
                case Group group:
                    Enqueue(group.Id, "group");
                    break;
                case Resource resource:
                    // A Resource has no GroupId; resolve it from its Arrangement.
                    EnqueueResource(resource.ArrangementId);
                    break;
            }
        }
    }

    private void Enqueue(Guid groupId, string scope)
    {
        if (groupId == Guid.Empty || _pending.Contains((groupId, scope)))
        {
            return;
        }

        _pending.Add((groupId, scope));
    }

    private void EnqueueResource(Guid arrangementId)
    {
        if (arrangementId == Guid.Empty || _pendingResourceArrangements.Contains(arrangementId))
        {
            return;
        }

        _pendingResourceArrangements.Add(arrangementId);
    }

    private async Task FlushAsync(DbContext? context, CancellationToken cancellationToken)
    {
        await ResolveResourcesAsync(context, cancellationToken);

        if (_pending.Count == 0)
        {
            return;
        }

        var batch = _pending.ToArray();
        _pending.Clear();
        foreach (var (groupId, scope) in batch)
        {
            await _notifier.NotifyGroupChangedAsync(groupId, scope, cancellationToken);
        }
    }

    /// <summary>Maps changed resources to their group (resources live on arrangements).</summary>
    private async Task ResolveResourcesAsync(DbContext? context, CancellationToken cancellationToken)
    {
        if (_pendingResourceArrangements.Count == 0)
        {
            return;
        }

        var arrangementIds = _pendingResourceArrangements.ToArray();
        _pendingResourceArrangements.Clear();
        if (context is null)
        {
            return;
        }

        var groups = await context.Set<Arrangement>()
            .Where(arrangement => arrangementIds.Contains(arrangement.Id))
            .Select(arrangement => new { arrangement.Id, arrangement.GroupId })
            .ToListAsync(cancellationToken);

        foreach (var row in groups)
        {
            Enqueue(row.GroupId, "resources");
        }
    }
}
