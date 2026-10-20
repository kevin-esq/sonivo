using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Tenancy;

public sealed record OwnExportMembership(
    Guid GroupId,
    string GroupName,
    string? Slug,
    string Role,
    string? Handle,
    DateTimeOffset CreatedAt);

public sealed record OwnExportAudit(string Action, Guid? GroupId, DateTimeOffset CreatedAt);

/// <summary>GDPR-style export of the requesting user's own data (phase 4.1).</summary>
public sealed record OwnDataExport(
    Guid UserId,
    string? Email,
    string? DisplayName,
    bool EmailConfirmed,
    bool MustChangePassword,
    Guid? ManagedByGroupId,
    DateTimeOffset ExportedAt,
    IReadOnlyList<OwnExportMembership> Memberships,
    IReadOnlyList<OwnExportAudit> AccountAudit);

public sealed record ExportOwnDataQuery(
    Guid UserId,
    string? Email,
    string? DisplayName,
    bool EmailConfirmed,
    bool MustChangePassword,
    Guid? ManagedByGroupId);

public sealed class ExportOwnDataHandler
{
    private readonly IGroupStore _groups;
    private readonly IAccountAuditStore _audit;
    private readonly IClock _clock;
    private readonly IGroupDatabaseScope? _databaseScope;

    public ExportOwnDataHandler(
        IGroupStore groups,
        IAccountAuditStore audit,
        IClock clock,
        IGroupDatabaseScope? databaseScope = null)
    {
        _groups = groups;
        _audit = audit;
        _clock = clock;
        _databaseScope = databaseScope;
    }

    public async Task<OwnDataExport> HandleAsync(
        ExportOwnDataQuery query,
        CancellationToken cancellationToken)
    {
        if (query.UserId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        if (_databaseScope is not null)
        {
            await _databaseScope.SetMultiGroupReadAsync(query.UserId, cancellationToken);
        }

        var groups = await _groups.ListForUserAsync(query.UserId, cancellationToken);
        var memberships = new List<OwnExportMembership>();
        foreach (var group in groups)
        {
            var membership = await _groups.GetMembershipAsync(group.Id, query.UserId, cancellationToken);
            memberships.Add(new OwnExportMembership(
                group.Id,
                group.Name,
                group.Slug,
                group.Role,
                membership?.Handle,
                membership?.CreatedAt ?? group.CreatedAt));
        }

        var audit = (await _audit.ListByTargetAsync(query.UserId, 500, cancellationToken))
            .Select(a => new OwnExportAudit(a.Action, a.GroupId, a.CreatedAt))
            .ToList();

        return new OwnDataExport(
            query.UserId,
            query.Email,
            query.DisplayName,
            query.EmailConfirmed,
            query.MustChangePassword,
            query.ManagedByGroupId,
            _clock.UtcNow,
            memberships,
            audit);
    }
}
