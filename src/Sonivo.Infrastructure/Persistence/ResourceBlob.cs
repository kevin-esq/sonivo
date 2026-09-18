namespace Sonivo.Infrastructure.Persistence;

/// <summary>
/// Postgres bytea blob row keyed by ObjectKey (Q-R1 thin File Resource).
/// </summary>
public sealed class ResourceBlob
{
    public string ObjectKey { get; set; } = string.Empty;
    public byte[] Bytes { get; set; } = [];
    public string ContentType { get; set; } = string.Empty;
    public long ByteSize { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
