using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure;

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
