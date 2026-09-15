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

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            await transaction.RollbackAsync(cancellationToken);
            _db.ChangeTracker.Clear();
            throw new ConflictException("The resource was modified by another request.");
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            _db.ChangeTracker.Clear();
            throw;
        }
    }
}
