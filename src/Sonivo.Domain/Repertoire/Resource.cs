namespace Sonivo.Domain.Repertoire;

public static class ResourcePurposes
{
    public const string Chart = "chart";
    public const string Lyrics = "lyrics";
    public const string Audio = "audio";
    public const string Click = "click";
    public const string Reference = "reference";
    public const string Other = "other";
}

public sealed class Resource
{
    public Guid Id { get; set; }
    public Guid ArrangementId { get; set; }
    public required string Purpose { get; set; }
    public string? Note { get; set; }
    public string? OriginalFileName { get; set; }
    public required string ContentType { get; set; }
    public long ByteSize { get; set; }
    public required string ObjectKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
