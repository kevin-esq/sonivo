namespace Sonivo.Domain.Tenancy;

/// <summary>
/// A slug a Group used before its one allowed rename (ADR-0045 D1). Rows are
/// permanent: the slug resolves to the Group (permanent redirect) and can never
/// be claimed by another Group.
/// </summary>
public sealed class GroupSlugHistory
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string Slug { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }

    private GroupSlugHistory()
    {
    }

    public static GroupSlugHistory Create(Guid groupId, string slug, DateTimeOffset now, Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("GroupId is required.", nameof(groupId));
        }

        if (!GroupSlug.IsValid(slug))
        {
            throw new ArgumentException("Slug is invalid.", nameof(slug));
        }

        return new GroupSlugHistory
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            Slug = slug,
            CreatedAt = now
        };
    }
}
