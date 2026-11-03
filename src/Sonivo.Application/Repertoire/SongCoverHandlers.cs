using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Repertoire;

public static class SongCoverImageConstraints
{
    public const long MaxByteSize = 2 * 1024 * 1024;
    public static bool IsAllowed(string contentType) => contentType is "image/jpeg" or "image/png" or "image/webp";
}

public sealed record UploadSongCoverCommand(
    Guid UserId, Guid GroupId, Guid SongId, int ExpectedVersion,
    string ContentType, long ByteSize, Stream Content);

public sealed class UploadSongCoverHandler(
    GroupAccessService access, ISongStore songs, IBlobStore blobs, IClock clock)
{
    public async Task<SongDetailDto> HandleAsync(UploadSongCoverCommand command, CancellationToken cancellationToken)
    {
        if (command.ByteSize is <= 0 or > SongCoverImageConstraints.MaxByteSize)
            throw new ValidationException("Song cover image exceeds the allowed size.");
        if (!SongCoverImageConstraints.IsAllowed(command.ContentType))
            throw new ValidationException("Song cover image must be JPEG, PNG, or WebP.");
        await access.RequireResourcePermissionAsync(command.GroupId, command.UserId, GroupPermissions.SongEdit,
            ResourceGrant.ResourceTypes.Song, command.SongId, cancellationToken);
        var song = await songs.GetByIdAsync(command.GroupId, command.SongId, cancellationToken)
            ?? throw new NotFoundException("Song not found.");

        var objectKey = $"groups/{command.GroupId:N}/songs/{command.SongId:N}/covers/{Guid.NewGuid():N}";
        await blobs.PutAsync(objectKey, command.Content, command.ContentType, command.ByteSize, cancellationToken);
        var previousKey = song.CoverImageObjectKey;
        try
        {
            song.SetCoverImage(objectKey, command.ContentType, command.ExpectedVersion, clock.UtcNow);
            await songs.UpdateAsync(song, cancellationToken);
            await songs.SaveChangesAsync(cancellationToken);
        }
        catch (ConcurrencyConflictException ex)
        {
            await blobs.DeleteAsync(objectKey, cancellationToken);
            throw new ConflictException(ex.Message);
        }
        catch
        {
            await blobs.DeleteAsync(objectKey, cancellationToken);
            throw;
        }

        if (previousKey is not null)
        {
            try { await blobs.DeleteAsync(previousKey, cancellationToken); }
            catch { /* The new object pointer is already committed; cleanup can be retried independently. */ }
        }
        return CreateSongHandler.ToDetail(song, await songs.CountLiveArrangementsAsync(command.GroupId, song.Id, cancellationToken));
    }
}

public sealed class RemoveSongCoverHandler(
    GroupAccessService access, ISongStore songs, IBlobStore blobs, IClock clock)
{
    public async Task<SongDetailDto> HandleAsync(
        Guid userId, Guid groupId, Guid songId, int expectedVersion, CancellationToken cancellationToken)
    {
        await access.RequireResourcePermissionAsync(groupId, userId, GroupPermissions.SongEdit,
            ResourceGrant.ResourceTypes.Song, songId, cancellationToken);
        var song = await songs.GetByIdAsync(groupId, songId, cancellationToken)
            ?? throw new NotFoundException("Song not found.");
        if (song.CoverImageObjectKey is { } oldKey)
        {
            try { _ = song.RemoveCoverImage(expectedVersion, clock.UtcNow); }
            catch (ConcurrencyConflictException ex) { throw new ConflictException(ex.Message); }
            await songs.UpdateAsync(song, cancellationToken);
            await songs.SaveChangesAsync(cancellationToken);
            try { await blobs.DeleteAsync(oldKey, cancellationToken); }
            catch { /* The database no longer references this object. */ }
        }
        return CreateSongHandler.ToDetail(song, await songs.CountLiveArrangementsAsync(groupId, song.Id, cancellationToken));
    }
}

public sealed class GetSongCoverHandler(GroupAccessService access, ISongStore songs, IBlobStore blobs)
{
    public async Task<BlobContent?> HandleAsync(Guid userId, Guid groupId, Guid songId, CancellationToken cancellationToken)
    {
        await access.RequireResourcePermissionAsync(groupId, userId, GroupPermissions.SongView,
            ResourceGrant.ResourceTypes.Song, songId, cancellationToken);
        var song = await songs.GetByIdAsync(groupId, songId, cancellationToken);
        return song?.CoverImageObjectKey is { } key ? await blobs.GetAsync(key, cancellationToken) : null;
    }
}
