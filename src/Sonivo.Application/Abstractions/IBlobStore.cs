namespace Sonivo.Application.Abstractions;

public sealed record BlobContent(Stream Content, string ContentType, long ByteSize);

public interface IBlobStore
{
    Task PutAsync(
        string objectKey,
        Stream content,
        string contentType,
        long byteSize,
        CancellationToken cancellationToken);

    Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken);

    Task DeleteAsync(string objectKey, CancellationToken cancellationToken);
}
