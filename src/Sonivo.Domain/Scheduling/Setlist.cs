using Sonivo.Domain.Common;

namespace Sonivo.Domain.Scheduling;

public sealed class Setlist : IVersionedEntity
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public required string Name { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public int Version { get; set; } = 1;

    public ICollection<SetlistItem> Items { get; set; } = new List<SetlistItem>();
}

public sealed class SetlistItem
{
    public Guid Id { get; set; }
    public Guid SetlistId { get; set; }
    public Guid GroupId { get; set; }
    public Guid ArrangementId { get; set; }
    public int SortOrder { get; set; }
    public string? OverrideKey { get; set; }
    public decimal? OverrideBpm { get; set; }
    public int? OverrideCapo { get; set; }
    public string? OverrideNotes { get; set; }
}
