using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Blobs;

/// <summary>
/// Blob config (T-R2-04): directory for the filesystem fallback used when R2
/// is NOT configured (local dev without creds, CI). Bound from <c>Blobs</c>.
/// </summary>
public sealed class BlobsOptions
{
    public const string SectionName = "Blobs";

    /// <summary>
    /// Root directory for stored blobs. Empty = <c>{temp}/sonivo-blobs</c>.
    /// Ephemeral storage is acceptable: dev/CI blobs are throwaway, and prod
    /// always runs the R2 backend. Never points at the repo.
    /// </summary>
    public string FileSystemDirectory { get; set; } = string.Empty;
}

/// <summary>
/// Filesystem <see cref="IBlobStore"/> for environments without R2
/// credentials (T-R2-04): local dev, CI. One data file per object key plus a
/// small <c>.meta</c> sidecar (content type + byte size). Best-effort delete.
/// Object keys are path-sanitized: no traversal outside the root.
/// </summary>
public sealed class FileSystemBlobStore : IBlobStore
{
    private readonly string _root;

    public FileSystemBlobStore(IOptions<BlobsOptions> options)
    {
        var configured = options.Value.FileSystemDirectory;
        _root = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(Path.GetTempPath(), "sonivo-blobs")
            : configured;
        Directory.CreateDirectory(_root);
    }

    public async Task PutAsync(
        string objectKey,
        Stream content,
        string contentType,
        long byteSize,
        CancellationToken cancellationToken)
    {
        var path = PathFor(objectKey);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        await using var file = File.Create(path);
        await content.CopyToAsync(file, cancellationToken);
        await file.FlushAsync(cancellationToken);
        var written = new FileInfo(path).Length;
        if (written != byteSize)
        {
            throw new InvalidOperationException(
                $"Blob size mismatch: expected {byteSize}, got {written}.");
        }

        await File.WriteAllTextAsync(
            MetaPath(path), $"{contentType}\n{byteSize}\n", cancellationToken);
    }

    public async Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken)
    {
        var path = PathFor(objectKey);
        if (!File.Exists(path))
        {
            return null;
        }

        var (contentType, byteSize) = await ReadMetaAsync(path, cancellationToken);
        var stream = new FileStream(
            path, FileMode.Open, FileAccess.Read, FileShare.Read,
            bufferSize: 4096, useAsync: true);
        return new BlobContent(stream, contentType, byteSize);
    }

    public Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
    {
        var path = PathFor(objectKey);
        TryDelete(path);
        TryDelete(MetaPath(path));
        return Task.CompletedTask;
    }

    internal string PathFor(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            throw new ArgumentException("Object key is required.", nameof(objectKey));
        }

        var parts = objectKey.Replace('\\', '/').Split('/');
        var safe = new List<string>(parts.Length);
        foreach (var part in parts)
        {
            if (part.Length == 0 || part is "." or "..")
            {
                throw new ArgumentException(
                    $"Invalid object key segment: '{part}'.", nameof(objectKey));
            }

            safe.Add(string.Concat(part.Select(c =>
                char.IsLetterOrDigit(c) || c is '.' or '_' or '-' ? c : '_')));
        }

        return Path.Combine([_root, .. safe]);
    }

    private static string MetaPath(string path) => path + ".meta";

    private static async Task<(string ContentType, long ByteSize)> ReadMetaAsync(
        string path, CancellationToken cancellationToken)
    {
        var metaPath = MetaPath(path);
        if (!File.Exists(metaPath))
        {
            return ("application/octet-stream", new FileInfo(path).Length);
        }

        var lines = await File.ReadAllLinesAsync(metaPath, cancellationToken);
        var contentType = lines.Length > 0 && !string.IsNullOrWhiteSpace(lines[0])
            ? lines[0]
            : "application/octet-stream";
        var byteSize = lines.Length > 1 && long.TryParse(lines[1], out var parsed) && parsed >= 0
            ? parsed
            : new FileInfo(path).Length;
        return (contentType, byteSize);
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
            // Best-effort: missing or locked files are not errors for Delete.
        }
        catch (UnauthorizedAccessException)
        {
            // Best-effort: see above.
        }
    }
}
