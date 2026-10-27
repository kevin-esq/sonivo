namespace Sonivo.Domain.Repertoire;

/// <summary>Records one user's favorite marker for a Song inside its Group.</summary>
public sealed class SongFavorite
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid SongId { get; private set; }
    public Guid UserId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    private SongFavorite() { }

    public static SongFavorite Create(Guid groupId, Guid songId, Guid userId, DateTimeOffset createdAt)
    {
        if (groupId == Guid.Empty || songId == Guid.Empty || userId == Guid.Empty)
        {
            throw new ArgumentException("Group, song, and user ids are required.");
        }

        return new SongFavorite
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            SongId = songId,
            UserId = userId,
            CreatedAt = createdAt
        };
    }
}
