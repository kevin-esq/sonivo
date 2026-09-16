using Sonivo.Domain.Common;

namespace Sonivo.Domain.Scheduling;

public sealed class Setlist : IVersionedEntity
{
    public const int MaxNameLength = 200;

    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Notes { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public int Version { get; private set; } = 1;

    public ICollection<SetlistItem> Items { get; private set; } = new List<SetlistItem>();

    private Setlist()
    {
    }

    public static Setlist Create(Guid groupId, string name, DateTimeOffset now, Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        return new Setlist
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            Name = NormalizeName(name),
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1,
            Items = new List<SetlistItem>()
        };
    }

    public void Rename(string name, int expectedVersion, DateTimeOffset now)
    {
        EnsureExpectedVersion(expectedVersion);
        Name = NormalizeName(name);
        Touch(now);
    }

    /// <summary>
    /// Replaces the item collection in memory. Caller persists removals/adds.
    /// Bumps Version after expectedVersion check.
    /// </summary>
    public void BeginReplaceItems(int expectedVersion, DateTimeOffset now)
    {
        EnsureExpectedVersion(expectedVersion);
        Touch(now);
    }

    private void Touch(DateTimeOffset now)
    {
        UpdatedAt = now;
        Version += 1;
    }

    private void EnsureExpectedVersion(int expectedVersion)
    {
        if (Version != expectedVersion)
        {
            throw new ConcurrencyConflictException(
                $"Setlist version mismatch. Expected {expectedVersion}, actual {Version}.");
        }
    }

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Setlist name is required.", nameof(name));
        }

        var trimmed = name.Trim();
        if (trimmed.Length > MaxNameLength)
        {
            throw new ArgumentException(
                $"Setlist name must be {MaxNameLength} characters or fewer.",
                nameof(name));
        }

        return trimmed;
    }
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

    public static SetlistItem Create(Guid setlistId, Guid groupId, Guid arrangementId, int sortOrder, Guid? id = null)
    {
        if (setlistId == Guid.Empty)
        {
            throw new ArgumentException("Setlist id is required.", nameof(setlistId));
        }

        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        if (arrangementId == Guid.Empty)
        {
            throw new ArgumentException("Arrangement id is required.", nameof(arrangementId));
        }

        return new SetlistItem
        {
            Id = id ?? Guid.NewGuid(),
            SetlistId = setlistId,
            GroupId = groupId,
            ArrangementId = arrangementId,
            SortOrder = sortOrder
        };
    }
}
