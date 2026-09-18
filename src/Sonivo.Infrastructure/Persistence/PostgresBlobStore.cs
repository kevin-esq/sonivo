using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Persistence;

public sealed class PostgresBlobStore : IBlobStore
{
    private readonly SonivoDbContext _db;
    private readonly IClock _clock;

    public PostgresBlobStore(SonivoDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task PutAsync(
        string objectKey,
        Stream content,
        string contentType,
        long byteSize,
        CancellationToken cancellationToken)
    {
        await using var buffer = new MemoryStream(capacity: (int)Math.Min(byteSize, int.MaxValue));
        await content.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length != byteSize)
        {
            throw new InvalidOperationException(
                $"Blob size mismatch: expected {byteSize}, got {buffer.Length}.");
        }

        var existing = await _db.ResourceBlobs.FindAsync([objectKey], cancellationToken);
        if (existing is not null)
        {
            existing.Bytes = buffer.ToArray();
            existing.ContentType = contentType;
            existing.ByteSize = byteSize;
        }
        else
        {
            await _db.ResourceBlobs.AddAsync(
                new ResourceBlob
                {
                    ObjectKey = objectKey,
                    Bytes = buffer.ToArray(),
                    ContentType = contentType,
                    ByteSize = byteSize,
                    CreatedAt = _clock.UtcNow
                },
                cancellationToken);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken)
    {
        var blob = await _db.ResourceBlobs
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.ObjectKey == objectKey, cancellationToken);
        if (blob is null)
        {
            return null;
        }

        return new BlobContent(new MemoryStream(blob.Bytes, writable: false), blob.ContentType, blob.ByteSize);
    }

    public async Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
    {
        var blob = await _db.ResourceBlobs.FindAsync([objectKey], cancellationToken);
        if (blob is null)
        {
            return;
        }

        _db.ResourceBlobs.Remove(blob);
        await _db.SaveChangesAsync(cancellationToken);
    }
}
