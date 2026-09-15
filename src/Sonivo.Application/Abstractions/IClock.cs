namespace Sonivo.Application.Abstractions;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}
