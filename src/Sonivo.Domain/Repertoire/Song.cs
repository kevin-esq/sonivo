using Sonivo.Domain.Common;

namespace Sonivo.Domain.Repertoire;

public static class SongOriginKinds
{
    public const string Original = "original";
    public const string Cover = "cover";
    public const string Other = "other";

    public static bool IsValid(string? value)
        => value is Original or Cover or Other;
}

public sealed class Song : IVersionedEntity
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string? Attribution { get; private set; }
    public string OriginKind { get; private set; } = SongOriginKinds.Original;
    public string? RightsNotes { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }
    public int Version { get; private set; }

    private Song()
    {
    }

    public static Song Create(
        Guid groupId,
        string title,
        string originKind,
        DateTimeOffset now,
        string? attribution = null,
        string? rightsNotes = null,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        return new Song
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            Title = NormalizeTitle(title),
            Attribution = NormalizeOptional(attribution, 300, nameof(attribution)),
            OriginKind = NormalizeOriginKind(originKind),
            RightsNotes = NormalizeOptional(rightsNotes, 2000, nameof(rightsNotes)),
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
    }

    public void Update(
        string title,
        string? attribution,
        string originKind,
        string? rightsNotes,
        int expectedVersion,
        DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        Title = NormalizeTitle(title);
        Attribution = NormalizeOptional(attribution, 300, nameof(attribution));
        OriginKind = NormalizeOriginKind(originKind);
        RightsNotes = NormalizeOptional(rightsNotes, 2000, nameof(rightsNotes));
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
            throw new InvalidOperationException("Song is deleted.");
        }
    }

    private void EnsureExpectedVersion(int expectedVersion)
    {
        if (Version != expectedVersion)
        {
            throw new ConcurrencyConflictException(
                $"Song version mismatch. Expected {expectedVersion}, actual {Version}.");
        }
    }

    private static string NormalizeTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ArgumentException("Song title is required.", nameof(title));
        }

        var trimmed = title.Trim();
        if (trimmed.Length > 200)
        {
            throw new ArgumentException("Song title must be 200 characters or fewer.", nameof(title));
        }

        return trimmed;
    }

    private static string NormalizeOriginKind(string originKind)
    {
        if (string.IsNullOrWhiteSpace(originKind))
        {
            throw new ArgumentException("Song origin kind is required.", nameof(originKind));
        }

        var trimmed = originKind.Trim();
        if (!SongOriginKinds.IsValid(trimmed))
        {
            throw new ArgumentException(
                "Song origin kind must be original, cover, or other.",
                nameof(originKind));
        }

        return trimmed;
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
