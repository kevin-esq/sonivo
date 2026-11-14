using System.Text.Json;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Blobs;

public sealed class BlobPurgeLedger(IBlobStore blobs, IBlobKeyLister keys) : IPurgeLedger
{
    private const string Prefix = "system/purge-ledger/groups/";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task WriteAsync(GroupPurgeTombstone tombstone, CancellationToken cancellationToken)
    {
        if (tombstone.GroupId == Guid.Empty || tombstone.CreatedAt == default || tombstone.ObjectKeys is null
            || tombstone.ObjectKeys.Any(objectKey => !IsGroupObjectKey(tombstone.GroupId, objectKey)))
            throw new ArgumentException("Purge tombstone is invalid.", nameof(tombstone));
        var objectKey = Key(tombstone.GroupId);
        var existing = await blobs.GetAsync(objectKey, cancellationToken);
        if (existing is not null)
        {
            await using var existingContent = existing.Content;
            var previous = await JsonSerializer.DeserializeAsync<GroupPurgeTombstone>(existingContent, JsonOptions, cancellationToken)
                ?? throw new InvalidDataException("An existing purge tombstone is invalid.");
            if (previous.GroupId != tombstone.GroupId || previous.CreatedAt == default || previous.ObjectKeys is null
                || previous.ObjectKeys.Any(key => !IsGroupObjectKey(previous.GroupId, key)))
                throw new InvalidDataException("An existing purge tombstone is invalid.");
            tombstone = previous with
            {
                ObjectKeys = previous.ObjectKeys.Concat(tombstone.ObjectKeys).Distinct(StringComparer.Ordinal).ToArray(),
                Committed = previous.Committed || tombstone.Committed
            };
        }
        await StoreAsync(objectKey, tombstone, cancellationToken);
    }

    public async Task MarkCommittedAsync(Guid groupId, CancellationToken cancellationToken)
    {
        var objectKey = Key(groupId);
        var existing = await blobs.GetAsync(objectKey, cancellationToken)
            ?? throw new InvalidDataException("A purge tombstone is missing.");
        GroupPurgeTombstone tombstone;
        await using (existing.Content)
        {
            tombstone = await JsonSerializer.DeserializeAsync<GroupPurgeTombstone>(existing.Content, JsonOptions, cancellationToken)
                ?? throw new InvalidDataException("A purge tombstone is invalid.");
        }
        if (tombstone.GroupId != groupId || tombstone.CreatedAt == default || tombstone.ObjectKeys is null
            || tombstone.ObjectKeys.Any(key => !IsGroupObjectKey(groupId, key)))
            throw new InvalidDataException("A purge tombstone is invalid.");
        if (!tombstone.Committed)
            await StoreAsync(objectKey, tombstone with { Committed = true }, cancellationToken);
    }

    private async Task StoreAsync(string objectKey, GroupPurgeTombstone tombstone, CancellationToken cancellationToken)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(tombstone, JsonOptions);
        await using var content = new MemoryStream(bytes, writable: false);
        await blobs.PutAsync(objectKey, content, "application/json", bytes.Length, cancellationToken);
    }

    public async Task<IReadOnlyList<GroupPurgeTombstone>> ListAsync(CancellationToken cancellationToken)
    {
        var result = new List<GroupPurgeTombstone>();
        foreach (var key in await keys.ListKeysAsync(Prefix, cancellationToken))
        {
            var blob = await blobs.GetAsync(key, cancellationToken)
                ?? throw new InvalidDataException("A purge tombstone object is missing.");
            await using var content = blob.Content;
            var tombstone = await JsonSerializer.DeserializeAsync<GroupPurgeTombstone>(content, JsonOptions, cancellationToken)
                ?? throw new InvalidDataException("A purge tombstone object is invalid.");
            var fileId = Path.GetFileNameWithoutExtension(key);
            if (!Guid.TryParseExact(fileId, "N", out var keyedGroupId)
                || tombstone.GroupId == Guid.Empty || keyedGroupId != tombstone.GroupId
                || tombstone.CreatedAt == default || tombstone.ObjectKeys is null
                || tombstone.ObjectKeys.Any(objectKey => !IsGroupObjectKey(tombstone.GroupId, objectKey)))
                throw new InvalidDataException("A purge tombstone object is invalid.");
            result.Add(tombstone);
        }
        return result.OrderBy(x => x.CreatedAt).ThenBy(x => x.GroupId).ToArray();
    }

    private static string Key(Guid groupId) => $"{Prefix}{groupId:N}.json";

    private static bool IsGroupObjectKey(Guid groupId, string? key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 512 || key.Contains('\\')
            || key.Split('/').Any(segment => segment is "" or "." or "..")) return false;
        const string resourcePrefix = "resources/";
        if (key.StartsWith(resourcePrefix, StringComparison.Ordinal)
            && Guid.TryParseExact(key[resourcePrefix.Length..], "D", out _)) return true;

        var coverPrefix = $"groups/{groupId:N}/songs/";
        if (key.StartsWith(coverPrefix, StringComparison.Ordinal))
        {
            var parts = key[coverPrefix.Length..].Split('/');
            return parts.Length == 3 && Guid.TryParseExact(parts[0], "N", out _)
                && parts[1] == "covers" && Guid.TryParseExact(parts[2], "N", out _);
        }

        var brandingPrefix = $"group-branding/{groupId:D}/";
        if (key.StartsWith(brandingPrefix, StringComparison.Ordinal))
        {
            var parts = key[brandingPrefix.Length..].Split('-');
            return parts.Length == 2 && parts[0] is "logo" or "banner" or "favicon"
                && Guid.TryParseExact(parts[1], "N", out _);
        }
        return false;
    }
}
