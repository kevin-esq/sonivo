/// <summary>LRC import payload. Send <c>contentBase64</c> to exercise BOM/encoding detection.</summary>
internal sealed record ImportLrcRequest(string? Content, string? ContentBase64, int? OffsetMs);
internal sealed record CreateSongRequest(
    string? Title,
    string? Attribution,
    string? OriginKind,
    string? RightsNotes,
    string[]? Tags = null,
    string? Genre = null,
    string? Album = null,
    int? ReleaseYear = null);
internal sealed record SetDefaultArrangementRequest(Guid ArrangementId, int ExpectedVersion);

internal sealed record UpdateSongRequest(
    string? Title,
    string? Attribution,
    string? OriginKind,
    string? RightsNotes,
    int ExpectedVersion,
    string[]? Tags = null,
    string? Genre = null,
    string? Album = null,
    int? ReleaseYear = null,
    bool ClearReleaseYear = false);
internal sealed record SoftDeleteSongRequest(int ExpectedVersion);
internal sealed record CreateArrangementRequest(
    string? Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes,
    string? HarmonyJson = null);
internal sealed record UpdateArrangementRequest(
    string? Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes,
    string? ChordTimingJson,
    int ExpectedVersion,
    string? HarmonyJson = null);
internal sealed record SoftDeleteArrangementRequest(int ExpectedVersion);
internal sealed record CreateLinkResourceRequest(
    string? Kind,
    string? Purpose,
    string? Label,
    string? Part,
    string? Note,
    string? Url);
internal sealed record UpdateLinkResourceRequest(
    string? Purpose,
    string? Label,
    string? Part,
    string? Note);
internal sealed record DigitizeRequest(Guid ResourceId);
