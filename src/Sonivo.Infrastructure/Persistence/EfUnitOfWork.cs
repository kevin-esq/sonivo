using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly SonivoDbContext _db;

    public EfUnitOfWork(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        if (!_db.Database.IsRelational())
        {
            try
            {
                await _db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                _db.ChangeTracker.Clear();
                throw new ConflictException("The resource was modified by another request.");
            }

            return;
        }

        // Authenticated HTTP requests may already own the outer transaction
        // that carries transaction-local RLS context. Save within it so the
        // middleware can commit or roll back the entire request atomically.
        if (_db.Database.CurrentTransaction is not null)
        {
            await SaveChangesWithinCurrentTransactionAsync(cancellationToken);
            return;
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await SaveChangesWithinCurrentTransactionAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private async Task SaveChangesWithinCurrentTransactionAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            _db.ChangeTracker.Clear();
            throw new ConflictException("The resource was modified by another request.");
        }
        catch
        {
            _db.ChangeTracker.Clear();
            throw;
        }
    }
}
