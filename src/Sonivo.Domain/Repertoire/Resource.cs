namespace Sonivo.Domain.Repertoire;

public static class ResourcePurposes
{
    public const string Chart = "chart";
    public const string Lyrics = "lyrics";
    public const string Audio = "audio";
    public const string Click = "click";
    public const string Reference = "reference";
    public const string Practice = "practice";
    public const string Other = "other";

    public static bool IsValid(string? value)
        => value is Chart or Lyrics or Audio or Click or Reference or Practice or Other;
}

public static class ResourceKinds
{
    public const string File = "file";
    public const string Link = "link";

    public static bool IsValid(string? value)
        => value is File or Link;
}

public static class ResourceFileConstraints
{
    public const long MaxByteSize = 5L * 1024 * 1024; // 5 MiB
    public const int MaxOriginalFileNameLength = 255;
    public const int MaxContentTypeLength = 100;
    public const int MaxObjectKeyLength = 200;

    public static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "audio/mpeg",
        "audio/wav",
        "audio/mp4",
        "text/plain"
    };

    public static bool IsAllowedContentType(string? contentType)
        => !string.IsNullOrWhiteSpace(contentType)
           && AllowedContentTypes.Contains(contentType.Trim());
}

public sealed class Resource
{
    public const int MaxLabelLength = 200;
    public const int MaxPartLength = 100;
    public const int MaxNoteLength = 2000;
    public const int MaxUrlLength = 2000;

    public Guid Id { get; private set; }
    public Guid ArrangementId { get; private set; }
    public string Kind { get; private set; } = ResourceKinds.Link;
    public string Purpose { get; private set; } = ResourcePurposes.Other;
    public string Label { get; private set; } = string.Empty;
    public string? Part { get; private set; }
    public string? Note { get; private set; }
    public string? Url { get; private set; }
    public string? OriginalFileName { get; private set; }
    public string? ContentType { get; private set; }
    public long? ByteSize { get; private set; }
    public string? ObjectKey { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    private Resource()
    {
    }

    public static Resource CreateLink(
        Guid arrangementId,
        string purpose,
        string label,
        string url,
        DateTimeOffset now,
        string? part = null,
        string? note = null,
        Guid? id = null)
    {
        if (arrangementId == Guid.Empty)
        {
            throw new ArgumentException("Arrangement id is required.", nameof(arrangementId));
        }

        return new Resource
        {
            Id = id ?? Guid.NewGuid(),
            ArrangementId = arrangementId,
            Kind = ResourceKinds.Link,
            Purpose = NormalizePurpose(purpose),
            Label = NormalizeLabel(label),
            Part = NormalizeOptional(part, MaxPartLength, nameof(part)),
            Note = NormalizeOptional(note, MaxNoteLength, nameof(note)),
            Url = NormalizeUrl(url),
            OriginalFileName = null,
            ContentType = null,
            ByteSize = null,
            ObjectKey = null,
            CreatedAt = now
        };
    }

    public static Resource CreateFile(
        Guid arrangementId,
        string purpose,
        string label,
        string originalFileName,
        string contentType,
        long byteSize,
        string objectKey,
        DateTimeOffset now,
        string? part = null,
        string? note = null,
        Guid? id = null)
    {
        if (arrangementId == Guid.Empty)
        {
            throw new ArgumentException("Arrangement id is required.", nameof(arrangementId));
        }

        return new Resource
        {
            Id = id ?? Guid.NewGuid(),
            ArrangementId = arrangementId,
            Kind = ResourceKinds.File,
            Purpose = NormalizePurpose(purpose),
            Label = NormalizeLabel(label),
            Part = NormalizeOptional(part, MaxPartLength, nameof(part)),
            Note = NormalizeOptional(note, MaxNoteLength, nameof(note)),
            Url = null,
            OriginalFileName = NormalizeOriginalFileName(originalFileName),
            ContentType = NormalizeContentType(contentType),
            ByteSize = NormalizeByteSize(byteSize),
            ObjectKey = NormalizeObjectKey(objectKey),
            CreatedAt = now
        };
    }

    public void UpdateMetadata(
        string purpose,
        string label,
        string? part,
        string? note)
    {
        Purpose = NormalizePurpose(purpose);
        Label = NormalizeLabel(label);
        Part = NormalizeOptional(part, MaxPartLength, nameof(part));
        Note = NormalizeOptional(note, MaxNoteLength, nameof(note));
    }

    public static void RejectNonLinkKind(string? kind)
    {
        if (string.IsNullOrWhiteSpace(kind))
        {
            throw new ArgumentException("Resource kind is required.", nameof(kind));
        }

        var trimmed = kind.Trim();
        if (trimmed == ResourceKinds.File)
        {
            throw new ArgumentException(
                "Resource kind 'file' requires multipart upload; use the file create path.",
                nameof(kind));
        }

        if (trimmed != ResourceKinds.Link)
        {
            throw new ArgumentException("Resource kind must be link.", nameof(kind));
        }
    }

    private static string NormalizePurpose(string purpose)
    {
        if (string.IsNullOrWhiteSpace(purpose))
        {
            throw new ArgumentException("Resource purpose is required.", nameof(purpose));
        }

        var trimmed = purpose.Trim();
        if (!ResourcePurposes.IsValid(trimmed))
        {
            throw new ArgumentException(
                "Resource purpose must be chart, lyrics, audio, click, reference, practice, or other.",
                nameof(purpose));
        }

        return trimmed;
    }

    private static string NormalizeLabel(string label)
    {
        if (string.IsNullOrWhiteSpace(label))
        {
            throw new ArgumentException("Resource label is required.", nameof(label));
        }

        var trimmed = label.Trim();
        if (trimmed.Length > MaxLabelLength)
        {
            throw new ArgumentException(
                $"Resource label must be {MaxLabelLength} characters or fewer.",
                nameof(label));
        }

        return trimmed;
    }

    private static string NormalizeUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new ArgumentException("Resource url is required.", nameof(url));
        }

        var trimmed = url.Trim();
        if (trimmed.Length > MaxUrlLength)
        {
            throw new ArgumentException(
                $"Resource url must be {MaxUrlLength} characters or fewer.",
                nameof(url));
        }

        return trimmed;
    }

    private static string NormalizeOriginalFileName(string originalFileName)
    {
        if (string.IsNullOrWhiteSpace(originalFileName))
        {
            throw new ArgumentException("Original file name is required.", nameof(originalFileName));
        }

        var trimmed = Path.GetFileName(originalFileName.Trim());
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new ArgumentException("Original file name is required.", nameof(originalFileName));
        }

        if (trimmed.Length > ResourceFileConstraints.MaxOriginalFileNameLength)
        {
            throw new ArgumentException(
                $"Original file name must be {ResourceFileConstraints.MaxOriginalFileNameLength} characters or fewer.",
                nameof(originalFileName));
        }

        return trimmed;
    }

    private static string NormalizeContentType(string contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            throw new ArgumentException("Content type is required.", nameof(contentType));
        }

        var trimmed = contentType.Trim();
        // Strip parameters (e.g. charset) for allowlist check.
        var mediaType = trimmed.Split(';', 2)[0].Trim();
        if (!ResourceFileConstraints.IsAllowedContentType(mediaType))
        {
            throw new ArgumentException(
                "Content type is not allowed.",
                nameof(contentType));
        }

        if (mediaType.Length > ResourceFileConstraints.MaxContentTypeLength)
        {
            throw new ArgumentException(
                $"Content type must be {ResourceFileConstraints.MaxContentTypeLength} characters or fewer.",
                nameof(contentType));
        }

        return mediaType;
    }

    private static long NormalizeByteSize(long byteSize)
    {
        if (byteSize <= 0)
        {
            throw new ArgumentException("File must not be empty.", nameof(byteSize));
        }

        if (byteSize > ResourceFileConstraints.MaxByteSize)
        {
            throw new ArgumentException(
                $"File must be {ResourceFileConstraints.MaxByteSize} bytes or fewer.",
                nameof(byteSize));
        }

        return byteSize;
    }

    private static string NormalizeObjectKey(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            throw new ArgumentException("Object key is required.", nameof(objectKey));
        }

        var trimmed = objectKey.Trim();
        if (trimmed.Length > ResourceFileConstraints.MaxObjectKeyLength)
        {
            throw new ArgumentException(
                $"Object key must be {ResourceFileConstraints.MaxObjectKeyLength} characters or fewer.",
                nameof(objectKey));
        }

        return trimmed;
    }

    private static string? NormalizeOptional(string? value, int maxLength, string paramName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            throw new ArgumentException(
                $"{paramName} must be {maxLength} characters or fewer.",
                paramName);
        }

        return trimmed;
    }
}
