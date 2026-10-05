using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Sonivo.Migration.Api.Infrastructure;

/// <summary>
/// Terminates the pipeline with an RFC 7807 problem response so unhandled
/// exceptions never leak stack traces or internal detail to the client.
/// </summary>
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        InfrastructureLog.UnhandledException(
            logger,
            httpContext.Request.Method,
            httpContext.Request.Path.Value ?? string.Empty,
            exception);

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
            Type = "https://datatracker.ietf.org/doc/html/rfc9110#section-15.6.1",
        };
        problem.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }
}

/// <summary>Source-generated infrastructure log messages (CA1848-compliant).</summary>
internal static partial class InfrastructureLog
{
    [LoggerMessage(
        EventId = 5000,
        Level = LogLevel.Error,
        Message = "Unhandled exception while processing {Method} {Path}")]
    public static partial void UnhandledException(
        ILogger logger,
        string method,
        string path,
        Exception exception);
}
