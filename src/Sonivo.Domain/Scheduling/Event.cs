using Sonivo.Domain.Common;

namespace Sonivo.Domain.Scheduling;

public static class EventTypes
{
    public const string Rehearsal = "rehearsal";
    public const string Performance = "performance";
    public const string Other = "other";
}

public static class EventStatuses
{
    public const string Scheduled = "scheduled";
    public const string Cancelled = "cancelled";
}

public sealed class Event : IVersionedEntity
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public required string Type { get; set; }
    public required string Title { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public required string Status { get; set; } = EventStatuses.Scheduled;
    public DateTimeOffset? CancelledAt { get; set; }
    public bool IsHidden { get; set; }
    public Guid? SourceSetlistId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public int Version { get; set; } = 1;

    public ICollection<EventSetlistItem> Items { get; set; } = new List<EventSetlistItem>();
    public ICollection<Rsvp> Rsvps { get; set; } = new List<Rsvp>();
}

public sealed class EventSetlistItem
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public Guid GroupId { get; set; }
    public Guid ArrangementId { get; set; }
    public required string DisplaySongTitle { get; set; }
    public required string DisplayArrangementLabel { get; set; }
    public int SortOrder { get; set; }
    public string? OverrideKey { get; set; }
    public decimal? OverrideBpm { get; set; }
    public int? OverrideCapo { get; set; }
    public string? OverrideNotes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public static class RsvpResponses
{
    public const string Yes = "yes";
    public const string No = "no";
    public const string Maybe = "maybe";
}

public sealed class Rsvp
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public Guid UserId { get; set; }
    public required string Response { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
