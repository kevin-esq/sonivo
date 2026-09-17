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

    public void UpdateMetadata(
        string purpose,
        string label,
        string? part,
        string? note)
    {
        if (Kind != ResourceKinds.Link)
        {
            throw new InvalidOperationException("Only link Resources can be updated in this phase.");
        }

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
            throw new ArgumentException("Resource kind 'file' is not supported in this phase.", nameof(kind));
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
