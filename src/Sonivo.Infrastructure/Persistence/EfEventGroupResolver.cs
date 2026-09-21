using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfEventGroupResolver : IEventGroupResolver
{
    private readonly SonivoDbContext _db;

    public EfEventGroupResolver(SonivoDbContext db)
    {
        _db = db;
    }

    public Task<Guid?> FindGroupIdByEventIdAsync(Guid eventId, CancellationToken cancellationToken)
        => _db.Events
            .AsNoTracking()
            .Where(e => e.Id == eventId)
            .Select(e => (Guid?)e.GroupId)
            .FirstOrDefaultAsync(cancellationToken);
}
