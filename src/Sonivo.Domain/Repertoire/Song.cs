using Sonivo.Domain.Common;

namespace Sonivo.Domain.Repertoire;

public sealed class Song : IVersionedEntity
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public required string Title { get; set; }
    public string? Attribution { get; set; }
    public bool IsOriginal { get; set; } = true;
    public string? RightsNotes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public int Version { get; set; } = 1;
}
