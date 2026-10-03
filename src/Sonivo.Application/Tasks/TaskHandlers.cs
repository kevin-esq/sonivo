using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Common;
using Sonivo.Domain.Tasks;

namespace Sonivo.Application.Tasks;

public sealed record CreateTaskCommand(
    Guid UserId,
    Guid GroupId,
    string Title,
    string? Notes,
    DateTimeOffset? DueAt,
    Guid? AssigneeUserId);

public sealed record UpdateTaskCommand(
    Guid UserId,
    Guid GroupId,
    Guid TaskId,
    string Title,
    string? Notes,
    DateTimeOffset? DueAt,
    Guid? AssigneeUserId,
    int ExpectedVersion);

public sealed record SetTaskStatusCommand(
    Guid UserId,
    Guid GroupId,
    Guid TaskId,
    string Status,
    int ExpectedVersion);

public sealed record DeleteTaskCommand(
    Guid UserId,
    Guid GroupId,
    Guid TaskId,
    int ExpectedVersion);

public sealed record ListTasksQuery(Guid UserId, Guid GroupId);

public sealed record TaskItemDto(
    Guid Id,
    string Title,
    string? Notes,
    string Status,
    DateTimeOffset? DueAt,
    Guid? AssigneeUserId,
    Guid CreatedByUserId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int Version);

public static class TaskMapper
{
    public static TaskItemDto ToDto(GroupTask task) => new(
        task.Id,
        task.Title,
        task.Notes,
        task.Status,
        task.DueAt,
        task.AssigneeUserId,
        task.CreatedByUserId,
        task.CreatedAt,
        task.UpdatedAt,
        task.Version);
}

public sealed class CreateTaskHandler
{
    private readonly GroupAccessService _access;
    private readonly ITaskStore _tasks;
    private readonly IClock _clock;

    public CreateTaskHandler(GroupAccessService access, ITaskStore tasks, IClock clock)
    {
        _access = access;
        _tasks = tasks;
        _clock = clock;
    }

    public async Task<TaskItemDto> HandleAsync(CreateTaskCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireManagerAsync(command.GroupId, command.UserId, cancellationToken);

        try
        {
            var task = GroupTask.Create(
                command.GroupId,
                command.Title,
                command.Notes,
                command.DueAt,
                command.AssigneeUserId,
                command.UserId,
                _clock.UtcNow);
            await _tasks.AddAsync(task, cancellationToken);
            await _tasks.SaveChangesAsync(cancellationToken);
            return TaskMapper.ToDto(task);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
    }
}

public sealed class UpdateTaskHandler
{
    private readonly GroupAccessService _access;
    private readonly ITaskStore _tasks;
    private readonly IClock _clock;

    public UpdateTaskHandler(GroupAccessService access, ITaskStore tasks, IClock clock)
    {
        _access = access;
        _tasks = tasks;
        _clock = clock;
    }

    public async Task<TaskItemDto> HandleAsync(UpdateTaskCommand command, CancellationToken cancellationToken)
    {
        if (command.ExpectedVersion < 1)
        {
            throw new ValidationException("expectedVersion is required.");
        }

        await _access.RequireManagerAsync(command.GroupId, command.UserId, cancellationToken);

        var task = await _tasks.GetByIdAsync(command.GroupId, command.TaskId, cancellationToken);
        if (task is null)
        {
            throw new NotFoundException("Task not found.");
        }

        try
        {
            task.Update(
                command.Title,
                command.Notes,
                command.DueAt,
                command.AssigneeUserId,
                command.ExpectedVersion,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _tasks.UpdateAsync(task, cancellationToken);
        await _tasks.SaveChangesAsync(cancellationToken);
        return TaskMapper.ToDto(task);
    }
}

public sealed class SetTaskStatusHandler
{
    private readonly GroupAccessService _access;
    private readonly ITaskStore _tasks;
    private readonly IClock _clock;

    public SetTaskStatusHandler(GroupAccessService access, ITaskStore tasks, IClock clock)
    {
        _access = access;
        _tasks = tasks;
        _clock = clock;
    }

    public async Task<TaskItemDto> HandleAsync(SetTaskStatusCommand command, CancellationToken cancellationToken)
    {
        if (command.ExpectedVersion < 1)
        {
            throw new ValidationException("expectedVersion is required.");
        }

        await _access.RequireManagerAsync(command.GroupId, command.UserId, cancellationToken);

        var task = await _tasks.GetByIdAsync(command.GroupId, command.TaskId, cancellationToken);
        if (task is null)
        {
            throw new NotFoundException("Task not found.");
        }

        try
        {
            task.SetStatus(command.Status, command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _tasks.UpdateAsync(task, cancellationToken);
        await _tasks.SaveChangesAsync(cancellationToken);
        return TaskMapper.ToDto(task);
    }
}

public sealed class DeleteTaskHandler
{
    private readonly GroupAccessService _access;
    private readonly ITaskStore _tasks;
    private readonly IClock _clock;

    public DeleteTaskHandler(GroupAccessService access, ITaskStore tasks, IClock clock)
    {
        _access = access;
        _tasks = tasks;
        _clock = clock;
    }

    public async Task HandleAsync(DeleteTaskCommand command, CancellationToken cancellationToken)
    {
        if (command.ExpectedVersion < 1)
        {
            throw new ValidationException("expectedVersion is required.");
        }

        await _access.RequireManagerAsync(command.GroupId, command.UserId, cancellationToken);

        var task = await _tasks.GetByIdAsync(command.GroupId, command.TaskId, cancellationToken);
        if (task is null)
        {
            throw new NotFoundException("Task not found.");
        }

        try
        {
            task.SoftDelete(command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _tasks.UpdateAsync(task, cancellationToken);
        await _tasks.SaveChangesAsync(cancellationToken);
    }
}

public sealed class ListTasksHandler
{
    private readonly GroupAccessService _access;
    private readonly ITaskStore _tasks;

    public ListTasksHandler(GroupAccessService access, ITaskStore tasks)
    {
        _access = access;
        _tasks = tasks;
    }

    public async Task<IReadOnlyList<TaskItemDto>> HandleAsync(
        ListTasksQuery query,
        CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(query.GroupId, query.UserId, cancellationToken);
        var tasks = await _tasks.ListByGroupAsync(query.GroupId, cancellationToken);
        return tasks.Select(TaskMapper.ToDto).ToList();
    }
}
