namespace Sonivo.Api.Security;

/// <summary>
/// Holds request side effects that must run only after the request transaction
/// commits, such as revoking users from in-memory realtime fanout.
/// </summary>
public sealed class PostCommitActionQueue
{
    private readonly List<Func<Task>> _actions = [];
    private readonly object _lock = new();

    public void Enqueue(Func<Task> action)
    {
        ArgumentNullException.ThrowIfNull(action);
        lock (_lock)
        {
            _actions.Add(action);
        }
    }

    public async Task ExecuteAsync()
    {
        Func<Task>[] actions;
        lock (_lock)
        {
            actions = _actions.ToArray();
            _actions.Clear();
        }

        foreach (var action in actions)
        {
            await action();
        }
    }
}
