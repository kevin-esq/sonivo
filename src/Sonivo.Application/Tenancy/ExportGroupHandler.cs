using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record GroupExportMember(
    Guid MemberId,
    string DisplayName,
    string Role,
    bool HasAccess,
    string? Handle,
    Guid? UserId,
    DateTimeOffset CreatedAt);

public sealed record GroupExportArrangement(
    Guid Id,
    string Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes,
    DateTimeOffset UpdatedAt);

public sealed record GroupExportSong(
    Guid Id,
    string Title,
    string? Attribution,
    string OriginKind,
    string? RightsNotes,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<GroupExportArrangement> Arrangements);

/// <summary>GDPR-style group export: roster + repertoire (ADR-0041 / phase 4.1).</summary>
public sealed record GroupExport(
    Guid GroupId,
    string GroupName,
    string? Slug,
    DateTimeOffset ExportedAt,
    IReadOnlyList<GroupExportMember> Members,
    IReadOnlyList<GroupExportSong> Songs);

public sealed record ExportGroupQuery(Guid ActorUserId, Guid GroupId);

/// <summary>Owner-only export of a group's roster and repertoire (ids + content, no binaries).</summary>
public sealed class ExportGroupHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupStore _groups;
    private readonly IMembershipStore _memberships;
    private readonly IUserDirectory _directory;
    private readonly ISongStore _songs;
    private readonly IArrangementStore _arrangements;
    private readonly IClock _clock;

    public ExportGroupHandler(
        GroupAccessService access,
        IGroupStore groups,
        IMembershipStore memberships,
        IUserDirectory directory,
        ISongStore songs,
        IArrangementStore arrangements,
        IClock clock)
    {
        _access = access;
        _groups = groups;
        _memberships = memberships;
        _directory = directory;
        _songs = songs;
        _arrangements = arrangements;
        _clock = clock;
    }

    public async Task<GroupExport> HandleAsync(ExportGroupQuery query, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(query.GroupId, query.ActorUserId, cancellationToken);
        var group = await _groups.GetByIdAsync(query.GroupId, cancellationToken)
            ?? throw new NotFoundException("Group not found.");

        var rows = await _memberships.ListByGroupAsync(query.GroupId, cancellationToken);
        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).ToList();
        var names = userIds.Count == 0
            ? new Dictionary<Guid, string>()
            : (await _directory.GetByIdsAsync(userIds, cancellationToken))
                .ToDictionary(e => e.UserId, e => e.DisplayName);

        var members = rows
            .Select(m =>
            {
                var name = m.DisplayName;
                if (string.IsNullOrWhiteSpace(name) && m.UserId is { } id)
                {
                    names.TryGetValue(id, out var directoryName);
                    name = directoryName;
                }

                return new GroupExportMember(
                    m.Id,
                    string.IsNullOrWhiteSpace(name) ? (m.UserId?.ToString("D") ?? "—") : name!,
                    m.Role,
                    m.HasAccess,
                    m.Handle,
                    m.UserId,
                    m.CreatedAt);
            })
            .OrderBy(m => m.Role == MembershipRoles.Owner ? 0 : 1)
            .ThenBy(m => m.DisplayName, StringComparer.Ordinal)
            .ToList();

        var songs = new List<GroupExportSong>();
        foreach (var song in (await _songs.ListByGroupAsync(query.GroupId, cancellationToken))
                     .OrderBy(s => s.Title, StringComparer.Ordinal))
        {
            var arrangements = (await _arrangements.ListBySongAsync(query.GroupId, song.Id, cancellationToken))
                .OrderBy(a => a.Label, StringComparer.Ordinal)
                .Select(a => new GroupExportArrangement(
                    a.Id, a.Label, a.DefaultKey, a.DefaultBpm, a.Lyrics, a.Chords, a.Structure, a.Notes, a.UpdatedAt))
                .ToList();

            songs.Add(new GroupExportSong(
                song.Id, song.Title, song.Attribution, song.OriginKind, song.RightsNotes, song.UpdatedAt, arrangements));
        }

        return new GroupExport(query.GroupId, group.Name, group.Slug, _clock.UtcNow, members, songs);
    }
}
