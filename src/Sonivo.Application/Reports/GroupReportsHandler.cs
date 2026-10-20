using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Reports;

public sealed record GroupRepertoireReportDto(
    long Songs,
    long Arrangements,
    long Files,
    long Links,
    IReadOnlyList<ResourcePurposeReportCount> ResourcesByPurpose);

public sealed record GroupEventResponseReportDto(
    DateTimeOffset From,
    DateTimeOffset To,
    long Members,
    IReadOnlyList<EventResponseReportRow> Events);

public sealed record GroupTaskReportDto(
    DateTimeOffset From,
    DateTimeOffset To,
    DateTimeOffset AsOf,
    long Total,
    long Open,
    long InProgress,
    long Done,
    long Unassigned,
    long Overdue,
    IReadOnlyList<TaskAssigneeReportRow> ByAssignee);

public sealed record GroupSetlistUsageReportDto(
    DateTimeOffset AsOf,
    long Setlists,
    long ArrangementReferences);

/// <summary>Owner-authorized aggregate reports over current Group data (ADR-0083).</summary>
public sealed class GroupReportsHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupReportStore _reports;

    public GroupReportsHandler(GroupAccessService access, IGroupReportStore reports)
    {
        _access = access;
        _reports = reports;
    }

    public async Task<GroupRepertoireReportDto> GetRepertoireAsync(
        Guid userId,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(groupId, userId, cancellationToken);
        var result = await _reports.GetRepertoireAsync(groupId, cancellationToken);
        return new GroupRepertoireReportDto(
            result.Songs,
            result.Arrangements,
            result.Files,
            result.Links,
            result.ResourcesByPurpose);
    }

    public async Task<GroupEventResponseReportDto> GetEventResponsesAsync(
        Guid userId,
        Guid groupId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken)
    {
        if (from >= to || to - from > TimeSpan.FromDays(366))
        {
            throw new ArgumentOutOfRangeException(nameof(to), "The report range must be positive and no longer than 366 days.");
        }

        await _access.RequireOwnerAsync(groupId, userId, cancellationToken);
        var result = await _reports.GetEventResponsesAsync(groupId, from, to, cancellationToken);
        return new GroupEventResponseReportDto(from, to, result.Members, result.Events);
    }

    public async Task<GroupTaskReportDto> GetTasksAsync(
        Guid userId,
        Guid groupId,
        DateTimeOffset from,
        DateTimeOffset to,
        DateTimeOffset asOf,
        CancellationToken cancellationToken)
    {
        if (from >= to || to - from > TimeSpan.FromDays(366))
        {
            throw new ArgumentOutOfRangeException(nameof(to), "The report range must be positive and no longer than 366 days.");
        }

        await _access.RequireOwnerAsync(groupId, userId, cancellationToken);
        var result = await _reports.GetTasksAsync(groupId, from, to, asOf, cancellationToken);
        return new GroupTaskReportDto(
            result.From, result.To, result.AsOf, result.Total, result.Open, result.InProgress,
            result.Done, result.Unassigned, result.Overdue, result.ByAssignee);
    }

    public async Task<GroupSetlistUsageReportDto> GetSetlistUsageAsync(
        Guid userId,
        Guid groupId,
        DateTimeOffset asOf,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(groupId, userId, cancellationToken);
        var result = await _reports.GetSetlistUsageAsync(groupId, asOf, cancellationToken);
        return new GroupSetlistUsageReportDto(result.AsOf, result.Setlists, result.ArrangementReferences);
    }
}
