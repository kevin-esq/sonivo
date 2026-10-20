namespace Sonivo.Application.Abstractions;

/// <summary>
/// Runs one bounded database operation inside a transaction. Callers establish
/// the required authenticated-user or purpose-limited lookup context inside
/// the callback. Group scope still comes from GroupAccessService after
/// membership verification. Operations may be retried by the provider and
/// must not perform external side effects; those belong after this method
/// returns.
/// </summary>
public interface IGroupDataOperation
{
    Task<T> ExecuteInTransactionAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken);

    Task<T> ExecuteAsUserAsync<T>(
        Guid userId,
        Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken);
}
