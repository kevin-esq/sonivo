namespace Sonivo.Application.Abstractions;

/// <summary>
/// Persists pending tracked changes. Relational providers use a DB transaction so
/// multi-aggregate cascades (e.g. Song delete) are all-or-nothing.
/// </summary>
public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
