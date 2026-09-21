using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Blobs;

// ADR-0035 migration path (T-R2-02): R2-first dual-read with Postgres
// (ResourceBlobs) fallback + lazy backfill.
// - New bytes go to R2 only (PutAsync → primary).
// - Reads try R2 first; on miss OR error they fall back to Postgres.
// - A Postgres hit while R2 is configured is backfilled to R2 (best-effort);
//   the Postgres row is ALWAYS kept — ResourceBlobs is NEVER dropped in this slice.
// - Deletes remove from both backends (fallback best-effort).
// - Metadata stays in Postgres; orphans stay (same rule as Postgres, no lifecycle rule).
// - All serving stays behind the AuthZ'd GET .../content proxy (no public/presigned/CORS).
public sealed class DualReadBlobStore : IBlobStore
{
    private readonly IBlobStore _primary;
    private readonly IBlobStore _fallback;
    private readonly ILogger<DualReadBlobStore> _logger;

    public DualReadBlobStore(
        R2BlobStore primary,
        PostgresBlobStore fallback,
        ILogger<DualReadBlobStore> logger)
    {
        _primary = primary;
        _fallback = fallback;
        _logger = logger;
    }

    public Task PutAsync(
        string objectKey,
        Stream content,
        string contentType,
        long byteSize,
        CancellationToken cancellationToken)
        => _primary.PutAsync(objectKey, content, contentType, byteSize, cancellationToken);

    public async Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken)
    {
        BlobContent? primary = null;
        try
        {
            primary = await _primary.GetAsync(objectKey, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(
                ex,
                "R2 read failed for {ObjectKey}; trying Postgres fallback.",
                objectKey);
        }

        if (primary is not null)
        {
            return primary;
        }

        var fallback = await _fallback.GetAsync(objectKey, cancellationToken);
        if (fallback is null)
        {
            return null;
        }

        await using var source = fallback.Content;
        await using var buffer = new MemoryStream();
        await source.CopyToAsync(buffer, cancellationToken);
        var bytes = buffer.ToArray();

        try
        {
            await _primary.PutAsync(
                objectKey,
                new MemoryStream(bytes, writable: false),
                fallback.ContentType,
                bytes.Length,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "R2 backfill failed for {ObjectKey}; Postgres row kept.",
                objectKey);
        }

        return new BlobContent(
            new MemoryStream(bytes, writable: false),
            fallback.ContentType,
            bytes.Length);
    }

    public async Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
    {
        await _primary.DeleteAsync(objectKey, cancellationToken);
        try
        {
            await _fallback.DeleteAsync(objectKey, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Postgres fallback delete failed for {ObjectKey}.",
                objectKey);
        }
    }
}
