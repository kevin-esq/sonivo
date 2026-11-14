using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Blobs;

namespace Sonivo.Integration.Tests;

public sealed class BlobPurgeLedgerTests
{
    [Fact]
    public async Task File_ledger_keeps_idempotent_group_tombstone_for_restore_replay()
    {
        var root = Path.Combine(Path.GetTempPath(), "sonivo-purge-ledger", Guid.NewGuid().ToString("N"));
        var blobs = new FileSystemBlobStore(Options.Create(new BlobsOptions { FileSystemDirectory = root }));
        var ledger = new BlobPurgeLedger(blobs, blobs);
        var groupId = Guid.NewGuid();
        var tombstone = new GroupPurgeTombstone(groupId, DateTimeOffset.UtcNow, Guid.NewGuid(),
            "owner-confirmed", [$"resources/{Guid.NewGuid():D}", $"groups/{groupId:N}/songs/{Guid.NewGuid():N}/covers/{Guid.NewGuid():N}"]);

        await ledger.WriteAsync(tombstone, CancellationToken.None);
        var additionalKey = $"resources/{Guid.NewGuid():D}";
        await ledger.WriteAsync(tombstone with { ObjectKeys = [.. tombstone.ObjectKeys, additionalKey] }, CancellationToken.None);

        var restored = Assert.Single(await ledger.ListAsync(CancellationToken.None));
        Assert.Equal(tombstone.GroupId, restored.GroupId);
        Assert.Equal(tombstone.ActorUserId, restored.ActorUserId);
        Assert.Equal([.. tombstone.ObjectKeys, additionalKey], restored.ObjectKeys);
        Assert.False(restored.Committed);

        await ledger.MarkCommittedAsync(groupId, CancellationToken.None);
        Assert.True(Assert.Single(await ledger.ListAsync(CancellationToken.None)).Committed);
    }

    [Fact]
    public async Task File_ledger_fails_closed_on_invalid_tombstone()
    {
        var root = Path.Combine(Path.GetTempPath(), "sonivo-purge-ledger", Guid.NewGuid().ToString("N"));
        var blobs = new FileSystemBlobStore(Options.Create(new BlobsOptions { FileSystemDirectory = root }));
        var invalid = new MemoryStream("{}"u8.ToArray());
        await blobs.PutAsync("system/purge-ledger/groups/bad.json", invalid, "application/json", 2, CancellationToken.None);

        var ledger = new BlobPurgeLedger(blobs, blobs);
        await Assert.ThrowsAsync<InvalidDataException>(() => ledger.ListAsync(CancellationToken.None));
    }

    [Fact]
    public async Task File_ledger_rejects_tombstones_with_mismatched_group_or_system_object_key()
    {
        var root = Path.Combine(Path.GetTempPath(), "sonivo-purge-ledger", Guid.NewGuid().ToString("N"));
        var blobs = new FileSystemBlobStore(Options.Create(new BlobsOptions { FileSystemDirectory = root }));
        var ledger = new BlobPurgeLedger(blobs, blobs);
        var keyGroupId = Guid.NewGuid();
        var otherGroupId = Guid.NewGuid();
        var tombstone = new GroupPurgeTombstone(keyGroupId, DateTimeOffset.UtcNow, null,
            "retention-expired", [$"system/purge-ledger/groups/{Guid.NewGuid():N}.json"]);
        var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(tombstone,
            new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        await using var content = new MemoryStream(bytes);
        await blobs.PutAsync($"system/purge-ledger/groups/{keyGroupId:N}.json", content,
            "application/json", bytes.Length, CancellationToken.None);

        await Assert.ThrowsAsync<InvalidDataException>(() => ledger.ListAsync(CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => ledger.WriteAsync(tombstone, CancellationToken.None));

        var mismatched = tombstone with { GroupId = otherGroupId, ObjectKeys = [$"resources/{Guid.NewGuid():D}"] };
        var mismatchedBytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(mismatched,
            new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        await using var mismatchedContent = new MemoryStream(mismatchedBytes);
        await blobs.PutAsync($"system/purge-ledger/groups/{otherGroupId:N}.json", mismatchedContent,
            "application/json", mismatchedBytes.Length, CancellationToken.None);
        await Assert.ThrowsAsync<InvalidDataException>(() => ledger.ListAsync(CancellationToken.None));
    }
}
