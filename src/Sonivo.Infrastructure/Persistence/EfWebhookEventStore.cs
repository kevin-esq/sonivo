using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Persistence;

/// <summary>EF Core-backed payment webhook idempotency ledger (ADR-0073).</summary>
public sealed class EfWebhookEventStore : IWebhookEventStore
{
    private readonly SonivoDbContext _dbContext;

    public EfWebhookEventStore(SonivoDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<bool> ExistsAsync(string eventId, CancellationToken cancellationToken) =>
        _dbContext.WebhookEvents.AsNoTracking().AnyAsync(e => e.EventId == eventId, cancellationToken);

    public async Task RecordAsync(
        string eventId,
        string eventType,
        DateTimeOffset receivedAt,
        CancellationToken cancellationToken)
    {
        _dbContext.WebhookEvents.Add(WebhookEvent.Create(eventId, eventType, receivedAt));
        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
