internal sealed record CreateTaskRequest(string? Title, string? Notes, DateTimeOffset? DueAt, Guid? AssigneeUserId);
internal sealed record UpdateTaskRequest(string? Title, string? Notes, DateTimeOffset? DueAt, Guid? AssigneeUserId, int ExpectedVersion);
internal sealed record SetTaskStatusRequest(string? Status, int ExpectedVersion);
internal sealed record DeleteTaskRequest(int ExpectedVersion);
