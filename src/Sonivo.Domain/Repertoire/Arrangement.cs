using Sonivo.Domain.Common;

namespace Sonivo.Domain.Repertoire;

public sealed class Arrangement : IVersionedEntity
{
    public const int MaxLabelLength = 200;
    public const int MaxDefaultKeyLength = 32;
    public const int MaxBodyLength = 100_000;
    public const int MinBpm = 1;
    public const int MaxBpm = 400;

    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid SongId { get; private set; }
    public string Label { get; private set; } = string.Empty;
    public string? Lyrics { get; private set; }
    public string? Chords { get; private set; }
    public string? Structure { get; private set; }
    public string? DefaultKey { get; private set; }
    public int? DefaultBpm { get; private set; }
    public string? Notes { get; private set; }
    /// <summary>
    /// Owner-authored ChordPro line timing marks as JSON text (ADR-0031). Null = no marks.
    /// </summary>
    public string? ChordTimingJson { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }
    public int Version { get; private set; }

    public ICollection<Resource> Resources { get; private set; } = new List<Resource>();

    private Arrangement()
    {
    }

    public static Arrangement Create(
        Guid groupId,
        Guid songId,
        string label,
        DateTimeOffset now,
        string? defaultKey = null,
        int? defaultBpm = null,
        string? lyrics = null,
        string? chords = null,
        string? structure = null,
        string? notes = null,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        if (songId == Guid.Empty)
        {
            throw new ArgumentException("Song id is required.", nameof(songId));
        }

        return new Arrangement
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            SongId = songId,
            Label = NormalizeLabel(label),
            DefaultKey = NormalizeOptional(defaultKey, MaxDefaultKeyLength, nameof(defaultKey)),
            DefaultBpm = NormalizeBpm(defaultBpm),
            Lyrics = NormalizeOptional(lyrics, MaxBodyLength, nameof(lyrics)),
            Chords = NormalizeOptional(chords, MaxBodyLength, nameof(chords)),
            Structure = NormalizeOptional(structure, MaxBodyLength, nameof(structure)),
            Notes = NormalizeOptional(notes, MaxBodyLength, nameof(notes)),
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
    }

    public void Update(
        string label,
        string? defaultKey,
        int? defaultBpm,
        string? lyrics,
        string? chords,
        string? structure,
        string? notes,
        string? chordTimingJson,
        int expectedVersion,
        DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        Label = NormalizeLabel(label);
        DefaultKey = NormalizeOptional(defaultKey, MaxDefaultKeyLength, nameof(defaultKey));
        DefaultBpm = NormalizeBpm(defaultBpm);
        Lyrics = NormalizeOptional(lyrics, MaxBodyLength, nameof(lyrics));
        Chords = NormalizeOptional(chords, MaxBodyLength, nameof(chords));
        Structure = NormalizeOptional(structure, MaxBodyLength, nameof(structure));
        Notes = NormalizeOptional(notes, MaxBodyLength, nameof(notes));
        // Pre-validated/normalized by Application (or null to clear). Length-checked here.
        ChordTimingJson = NormalizeOptional(chordTimingJson, MaxBodyLength, nameof(chordTimingJson));
        Touch(now);
    }

    public void SoftDelete(int expectedVersion, DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        DeletedAt = now;
        Touch(now);
    }

    public bool IsDeleted => DeletedAt is not null;

    private void Touch(DateTimeOffset now)
    {
        UpdatedAt = now;
        Version += 1;
    }

    private void EnsureNotDeleted()
    {
        if (IsDeleted)
        {
            throw new InvalidOperationException("Arrangement is deleted.");
        }
    }

    private void EnsureExpectedVersion(int expectedVersion)
    {
        if (Version != expectedVersion)
        {
            throw new ConcurrencyConflictException(
                $"Arrangement version mismatch. Expected {expectedVersion}, actual {Version}.");
        }
    }

    private static string NormalizeLabel(string label)
    {
        if (string.IsNullOrWhiteSpace(label))
        {
            throw new ArgumentException("Arrangement label is required.", nameof(label));
        }

        var trimmed = label.Trim();
        if (trimmed.Length > MaxLabelLength)
        {
            throw new ArgumentException(
                $"Arrangement label must be {MaxLabelLength} characters or fewer.",
                nameof(label));
        }

        return trimmed;
    }

    private static int? NormalizeBpm(int? bpm)
    {
        if (bpm is null)
        {
            return null;
        }

        if (bpm < MinBpm || bpm > MaxBpm)
        {
            throw new ArgumentException(
                $"Arrangement BPM must be between {MinBpm} and {MaxBpm}.",
                nameof(bpm));
        }

        return bpm;
    }

    private static string? NormalizeOptional(string? value, int maxLength, string paramName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            throw new ArgumentException(
                $"{paramName} must be {maxLength} characters or fewer.",
                paramName);
        }

        return trimmed;
    }
}
