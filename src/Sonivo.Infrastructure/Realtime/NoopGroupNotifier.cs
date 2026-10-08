using Sonivo.Application.Realtime;

namespace Sonivo.Infrastructure.Realtime;

/// <summary>
/// Default no-op <see cref="IGroupNotifier"/>. Lets non-web hosts (integration
/// tests, tooling) build the DbContext with the group-change interceptor when no
/// real-time transport is wired. The API overrides this with the SignalR one.
/// </summary>
public sealed class NoopGroupNotifier : IGroupNotifier
{
    public Task NotifyGroupChangedAsync(Guid groupId, string scope, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}
