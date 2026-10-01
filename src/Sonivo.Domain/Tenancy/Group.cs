using Sonivo.Domain.Common;

namespace Sonivo.Domain.Tenancy;

public sealed class Group : IVersionedEntity
{
    public Guid Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    /// <summary>Immutable path slug (ADR-0048 D1). Null only for rows awaiting backfill.</summary>
    public string? Slug { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }
    public int Version { get; private set; }

    public ICollection<Membership> Memberships { get; private set; } = new List<Membership>();

    private Group()
    {
    }

    public static Group Create(string name, DateTimeOffset now, Guid? id = null, string? slug = null)
    {
        var trimmed = NormalizeName(name);
        var resolvedSlug = slug ?? GroupSlug.Slugify(trimmed);
        if (!GroupSlug.IsValid(resolvedSlug))
        {
            throw new ArgumentException("Slug is invalid.", nameof(slug));
        }

        return new Group
        {
            Id = id ?? Guid.NewGuid(),
            Name = trimmed,
            Slug = resolvedSlug,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
    }

    /// <summary>Assigns the slug once (used by the migration backfill). Never overwrites.</summary>
    public void AssignSlug(string slug)
    {
        if (Slug is { Length: > 0 })
        {
            return;
        }

        if (!GroupSlug.IsValid(slug))
        {
            throw new ArgumentException("Slug is invalid.", nameof(slug));
        }

        Slug = slug;
    }

    public void Rename(string name, int expectedVersion, DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        Name = NormalizeName(name);
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
            throw new InvalidOperationException("Group is deleted.");
        }
    }

    private void EnsureExpectedVersion(int expectedVersion)
    {
        if (Version != expectedVersion)
        {
            throw new ConcurrencyConflictException(
                $"Group version mismatch. Expected {expectedVersion}, actual {Version}.");
        }
    }

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Group name is required.", nameof(name));
        }

        var trimmed = name.Trim();
        if (trimmed.Length > 200)
        {
            throw new ArgumentException("Group name must be 200 characters or fewer.", nameof(name));
        }

        return trimmed;
    }
}
