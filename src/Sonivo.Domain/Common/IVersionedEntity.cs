namespace Sonivo.Domain.Common;

/// <summary>Aggregate roots that participate in optimistic concurrency.</summary>
public interface IVersionedEntity
{
    int Version { get; }
}
