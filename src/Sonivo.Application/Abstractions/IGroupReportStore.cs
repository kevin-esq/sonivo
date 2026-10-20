namespace Sonivo.Application.Abstractions;

public interface IGroupReportStore
{
    Task<GroupRepertoireReportData> GetRepertoireAsync(
        Guid groupId,
        CancellationToken cancellationToken);

    Task<GroupEventResponseReportData> GetEventResponsesAsync(
        Guid groupId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken);

    Task<GroupTaskReportData> GetTasksAsync(
        Guid groupId,
        DateTimeOffset from,
        DateTimeOffset to,
        DateTimeOffset asOf,
        CancellationToken cancellationToken);

    Task<GroupSetlistUsageReportData> GetSetlistUsageAsync(
        Guid groupId,
        DateTimeOffset asOf,
        CancellationToken cancellationToken);
}

public sealed record GroupRepertoireReportData(
    long Songs,
    long Arrangements,
    long Files,
    long Links,
    IReadOnlyList<ResourcePurposeReportCount> ResourcesByPurpose);

public sealed record ResourcePurposeReportCount(string Purpose, long Count);

public sealed record GroupEventResponseReportData(
    long Members,
    IReadOnlyList<EventResponseReportRow> Events);

public sealed record EventResponseReportRow(
    Guid EventId,
    string Title,
    string Type,
    DateTimeOffset StartsAt,
    long Yes,
    long No,
    long Maybe,
    long Responses,
    long NoResponse);

public sealed record GroupTaskReportData(
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

public sealed record TaskAssigneeReportRow(Guid UserId, string DisplayName, long Count);

public sealed record GroupSetlistUsageReportData(
    DateTimeOffset AsOf,
    long Setlists,
    long ArrangementReferences);
