using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Blobs;

// ADR-0035: S3-compatible Cloudflare R2 backend for IBlobStore.
// Object keys reuse the existing ObjectKey scheme unchanged (resources/{id}).
// Reads/writes stay server-side behind the AuthZ'd GET .../content proxy:
// no public buckets, no presigned reads, no browser-direct PUT, no CORS.
public sealed class R2BlobStore : IBlobStore
{
    private readonly IAmazonS3 _client;

    public R2BlobStore(IAmazonS3 client, IOptions<R2Options> options)
    {
        _client = client;
        var bucket = options.Value.BucketName;
        if (string.IsNullOrWhiteSpace(bucket))
        {
            throw new InvalidOperationException("R2 bucket is not configured.");
        }

        BucketName = bucket.Trim();
    }

    public string BucketName { get; }

    // Documented R2 dotnet pattern (developers.cloudflare.com/r2/examples/aws/aws-sdk-net):
    // ServiceURL https://<ACCOUNT>.r2.cloudflarestorage.com, region "auto",
    // DisablePayloadSigning + DisableDefaultChecksumValidation on puts
    // (R2 lacks the streaming SigV4 implementation used by AWSSDK.S3).
    public static IAmazonS3 CreateClient(R2Options options, HttpClientFactory? httpClientFactory = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(options.AccountId);
        ArgumentException.ThrowIfNullOrWhiteSpace(options.AccessKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(options.Secret);

        var config = new AmazonS3Config
        {
            ServiceURL = $"https://{options.AccountId.Trim()}.r2.cloudflarestorage.com",
            AuthenticationRegion = "auto"
        };
        if (httpClientFactory is not null)
        {
            config.HttpClientFactory = httpClientFactory;
        }

        return new AmazonS3Client(
            new BasicAWSCredentials(options.AccessKey, options.Secret),
            config);
    }

    public async Task PutAsync(
        string objectKey,
        Stream content,
        string contentType,
        long byteSize,
        CancellationToken cancellationToken)
    {
        var request = new PutObjectRequest
        {
            BucketName = BucketName,
            Key = objectKey,
            InputStream = content,
            ContentType = contentType,
            DisablePayloadSigning = true,
            DisableDefaultChecksumValidation = true
        };
        await _client.PutObjectAsync(request, cancellationToken);
    }

    public async Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken)
    {
        GetObjectResponse? response = null;
        try
        {
            response = await _client.GetObjectAsync(BucketName, objectKey, cancellationToken);
            return new BlobContent(
                new ResponseOwnedStream(response),
                response.Headers.ContentType ?? "application/octet-stream",
                response.Headers.ContentLength);
        }
        catch (AmazonS3Exception ex)
            when (ex.StatusCode == HttpStatusCode.NotFound || ex.ErrorCode == "NoSuchKey")
        {
            response?.Dispose();
            return null;
        }
        catch
        {
            response?.Dispose();
            throw;
        }
    }

    public async Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
    {
        await _client.DeleteObjectAsync(BucketName, objectKey, cancellationToken);
    }

    private sealed class ResponseOwnedStream : Stream
    {
        private readonly GetObjectResponse _response;
        private readonly Stream _inner;

        public ResponseOwnedStream(GetObjectResponse response)
        {
            _response = response;
            _inner = response.ResponseStream;
        }

        public override bool CanRead => _inner.CanRead;
        public override bool CanSeek => _inner.CanSeek;
        public override bool CanWrite => _inner.CanWrite;
        public override long Length => _inner.Length;
        public override long Position { get => _inner.Position; set => _inner.Position = value; }
        public override void Flush() => _inner.Flush();
        public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
            => _inner.ReadAsync(buffer, cancellationToken);
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
            => _inner.ReadAsync(buffer, offset, count, cancellationToken);
        public override long Seek(long offset, SeekOrigin origin) => _inner.Seek(offset, origin);
        public override void SetLength(long value) => _inner.SetLength(value);
        public override void Write(byte[] buffer, int offset, int count) => _inner.Write(buffer, offset, count);

        protected override void Dispose(bool disposing)
        {
            if (disposing) _response.Dispose();
            base.Dispose(disposing);
        }

        public override async ValueTask DisposeAsync()
        {
            await _inner.DisposeAsync();
            _response.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
