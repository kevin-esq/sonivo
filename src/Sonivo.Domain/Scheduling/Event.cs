using Sonivo.Domain.Common;

namespace Sonivo.Domain.Scheduling;

public static class EventTypes
{
    public const string Rehearsal = "rehearsal";
    public const string Performance = "performance";
    public const string Other = "other";

    public static bool IsValid(string? value)
        => value is Rehearsal or Performance or Other;
}

public static class EventStatuses
{
    public const string Scheduled = "scheduled";
    public const string Cancelled = "cancelled";
}

public sealed class Event : IVersionedEntity
{
    public const int MaxTitleLength = 200;

    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string Type { get; private set; } = EventTypes.Rehearsal;
    public string Title { get; private set; } = string.Empty;
    public DateTimeOffset StartsAt { get; private set; }
    public string? Location { get; private set; }
    public string? Notes { get; private set; }
    public string Status { get; private set; } = EventStatuses.Scheduled;
    public DateTimeOffset? CancelledAt { get; private set; }
    public bool IsHidden { get; private set; }
    public Guid? SourceSetlistId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public int Version { get; private set; } = 1;

    public ICollection<EventSetlistItem> Items { get; private set; } = new List<EventSetlistItem>();
    public ICollection<Rsvp> Rsvps { get; private set; } = new List<Rsvp>();

    private Event()
    {
    }

    public static Event Create(
        Guid groupId,
        string title,
        string type,
        DateTimeOffset startsAt,
        DateTimeOffset now,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        return new Event
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            Title = NormalizeTitle(title),
            Type = NormalizeType(type),
            StartsAt = startsAt,
            Status = EventStatuses.Scheduled,
            IsHidden = false,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1,
            Items = new List<EventSetlistItem>(),
            Rsvps = new List<Rsvp>()
        };
    }

    private static string NormalizeTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ArgumentException("Event title is required.", nameof(title));
        }

        var trimmed = title.Trim();
        if (trimmed.Length > MaxTitleLength)
        {
            throw new ArgumentException(
                $"Event title must be {MaxTitleLength} characters or fewer.",
                nameof(title));
        }

        return trimmed;
    }

    private static string NormalizeType(string type)
    {
        if (string.IsNullOrWhiteSpace(type))
        {
            throw new ArgumentException("Event type is required.", nameof(type));
        }

        var trimmed = type.Trim();
        if (!EventTypes.IsValid(trimmed))
        {
            throw new ArgumentException(
                "Event type must be rehearsal, performance, or other.",
                nameof(type));
        }

        return trimmed;
    }
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
