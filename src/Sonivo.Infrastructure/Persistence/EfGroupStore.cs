using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupStore : IGroupStore
{
    private readonly SonivoDbContext _db;

    public EfGroupStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
    {
        await _db.Groups.AddAsync(group, cancellationToken);
        await _db.Memberships.AddAsync(ownerMembership, cancellationToken);
    }

    public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        => _db.Memberships.AddAsync(membership, cancellationToken).AsTask();

    public async Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        // Captured locally so the provider sends it as a parameter instead of evaluating per row.
        var now = DateTimeOffset.UtcNow;

        var rows = await _db.Memberships
            .AsNoTracking()
            .Where(m => m.UserId == userId)
            .Join(
                _db.Groups.AsNoTracking(),
                m => m.GroupId,
                g => g.Id,
                (m, g) => new { Membership = m, Group = g })
            .OrderBy(x => x.Group.Name)
            // Two-step projection: each correlated aggregate is computed once per group, then
            // combined in memory, instead of repeating the same subquery inside nested conditionals.
            .Select(x => new
            {
                x.Group.Id,
                x.Group.Name,
                x.Group.Slug,
                x.Membership.Role,
                x.Group.Version,
                x.Group.CreatedAt,
                GroupUpdatedAt = x.Group.UpdatedAt,
                MemberCount = _db.Memberships.Count(other => other.GroupId == x.Group.Id),
                NextEventAt = _db.Events
                    .Where(e => e.GroupId == x.Group.Id && !e.IsHidden && e.StartsAt >= now)
                    .Min(e => (DateTimeOffset?)e.StartsAt),
                SongsUpdatedAt = _db.Songs
                    .Where(s => s.GroupId == x.Group.Id && s.DeletedAt == null)
                    .Max(s => (DateTimeOffset?)s.UpdatedAt),
                EventsUpdatedAt = _db.Events
                    .Where(e => e.GroupId == x.Group.Id && !e.IsHidden)
                    .Max(e => (DateTimeOffset?)e.UpdatedAt),
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(row => new GroupListItem(
                row.Id,
                row.Name,
                row.Slug,
                row.Role,
                row.Version,
                row.CreatedAt,
                row.MemberCount,
                row.NextEventAt,
                Latest(row.GroupUpdatedAt, row.SongsUpdatedAt, row.EventsUpdatedAt)))
            .ToList();
    }

    /// <summary>Most recent of the supplied timestamps, ignoring nulls.</summary>
    private static DateTimeOffset Latest(params DateTimeOffset?[] candidates)
    {
        var latest = DateTimeOffset.MinValue;
        foreach (var candidate in candidates)
        {
            if (candidate is { } value && value > latest)
            {
                latest = value;
            }
        }

        return latest;
    }

    public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
        => _db.Groups.FirstOrDefaultAsync(g => g.Id == groupId, cancellationToken);

    public Task<Group?> GetBySlugAsync(string slug, CancellationToken cancellationToken)
        => _db.Groups.FirstOrDefaultAsync(g => g.Slug == slug, cancellationToken);

    /// <summary>
    /// Includes soft-deleted rows on purpose: a deleted Group keeps its slug
    /// reserved (ADR-0048 D1), so the slug can never be reused.
    /// </summary>
    public Task<bool> SlugExistsAsync(string slug, CancellationToken cancellationToken)
        => _db.Groups.IgnoreQueryFilters().AnyAsync(g => g.Slug == slug, cancellationToken);

    public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
        => _db.Memberships.AsNoTracking()
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId, cancellationToken);

    public Task UpdateAsync(Group group, CancellationToken cancellationToken)
    {
        _db.Groups.Update(group);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
