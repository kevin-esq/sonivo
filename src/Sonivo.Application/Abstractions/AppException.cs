namespace Sonivo.Application.Abstractions;

public abstract class AppException : Exception
{
    protected AppException(string message)
        : base(message)
    {
    }
}

public sealed class NotFoundException : AppException
{
    public NotFoundException(string message)
        : base(message)
    {
    }
}

public sealed class ForbiddenException : AppException
{
    public ForbiddenException(string message)
        : base(message)
    {
    }
}

public sealed class ValidationException : AppException
{
    public ValidationException(string message)
        : base(message)
    {
    }
}

public sealed class ConflictException : AppException
{
    public ConflictException(string message)
        : base(message)
    {
    }
}

/// <summary>
/// The group's plan limit was reached (ADR-0071, PHASE-PLANS-SPEC §4.1). Maps to
/// 403 with the metric + limit so the client can offer an upgrade.
/// </summary>
public sealed class PlanLimitException : AppException
{
    public PlanLimitException(string metric, long limit)
        : base($"Plan limit reached for {metric} ({limit}).")
    {
        Metric = metric;
        Limit = limit;
    }

    public string Metric { get; }

    public long Limit { get; }
}
