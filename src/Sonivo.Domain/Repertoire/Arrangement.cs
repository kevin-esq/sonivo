using Sonivo.Domain.Common;

namespace Sonivo.Domain.Repertoire;

public sealed class Arrangement : IVersionedEntity
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid SongId { get; set; }
    public required string Label { get; set; }
    public string? Lyrics { get; set; }
    public string? Chords { get; set; }
    public string? Structure { get; set; }
    public string? DefaultKey { get; set; }
    public decimal? DefaultBpm { get; set; }
    public string? Notes { get; set; }
    public bool IsDefault { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public int Version { get; set; } = 1;

    public ICollection<Resource> Resources { get; set; } = new List<Resource>();
}
