using Sonivo.Domain.Common;

namespace Sonivo.Domain.Tasks;

public static class TaskStatuses
{
    public const string Open = "open";
    public const string Done = "done";

    public static bool IsValid(string? value)
        => value is Open or Done;
}

/// <summary>
/// ADR-0055 W-G: a group task. Named <c>GroupTask</c> (not <c>Task</c>) to avoid the
/// clash with <see cref="System.Task"/> in C#; the table is <c>Tasks</c>.
/// </summary>
public sealed class GroupTask : IVersionedEntity
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string? Notes { get; private set; }
    public string Status { get; private set; } = TaskStatuses.Open;
    public DateTimeOffset? DueAt { get; private set; }
    public Guid? AssigneeUserId { get; private set; }
    public Guid CreatedByUserId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }
    public int Version { get; private set; }

    private GroupTask()
    {
    }

    public const int MaxTitleLength = 200;
    public const int MaxNotesLength = 2000;

    public bool IsDeleted => DeletedAt is not null;

    public bool IsDone => Status == TaskStatuses.Done;

    public static GroupTask Create(
        Guid groupId,
        string title,
        string? notes,
        DateTimeOffset? dueAt,
        Guid? assigneeUserId,
        Guid createdByUserId,
        DateTimeOffset now,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        return new GroupTask
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            Title = NormalizeTitle(title),
            Notes = NormalizeOptional(notes, MaxNotesLength, nameof(notes)),
            Status = TaskStatuses.Open,
            DueAt = dueAt,
            AssigneeUserId = assigneeUserId,
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
    }

    public void Update(
        string title,
        string? notes,
        DateTimeOffset? dueAt,
        Guid? assigneeUserId,
        int expectedVersion,
        DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        Title = NormalizeTitle(title);
        Notes = NormalizeOptional(notes, MaxNotesLength, nameof(notes));
        DueAt = dueAt;
        AssigneeUserId = assigneeUserId;
        Touch(now);
    }

    public void SetStatus(string status, int expectedVersion, DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        Status = NormalizeStatus(status);
        Touch(now);
    }

    public void SoftDelete(int expectedVersion, DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        DeletedAt = now;
        Touch(now);
    }

    private void Touch(DateTimeOffset now)
    {
        UpdatedAt = now;
        Version += 1;
    }

    private void EnsureNotDeleted()
    {
        if (IsDeleted)
        {
            throw new InvalidOperationException("Task is deleted.");
        }
    }

    private void EnsureExpectedVersion(int expectedVersion)
    {
        if (Version != expectedVersion)
        {
            throw new ConcurrencyConflictException(
                $"Task version mismatch. Expected {expectedVersion}, actual {Version}.");
        }
    }

    private static string NormalizeTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ArgumentException("Task title is required.", nameof(title));
        }

        var trimmed = title.Trim();
        if (trimmed.Length > MaxTitleLength)
        {
            throw new ArgumentException(
                $"Task title must be {MaxTitleLength} characters or fewer.",
                nameof(title));
        }

        return trimmed;
    }

    private static string NormalizeStatus(string status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            throw new ArgumentException("Task status is required.", nameof(status));
        }

        var trimmed = status.Trim();
        if (!TaskStatuses.IsValid(trimmed))
        {
            throw new ArgumentException(
                "Task status must be open or done.",
                nameof(status));
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
