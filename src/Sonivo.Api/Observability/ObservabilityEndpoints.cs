using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Observability
{
    internal static class ObservabilityEndpoints
    {
        public static void MapHealthEndpoints(this WebApplication app)
        {
            app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }))
                .WithName("Health")
                .AllowAnonymous();

            // SECURITY-AUDIT-2026-10 (C9): readiness check with a real database probe so
            // load balancers stop routing to an instance that lost its Postgres connection.
            app.MapGet("/api/health/ready", async (SonivoDbContext db, CancellationToken cancellationToken) =>
            {
                var canConnect = await db.Database.CanConnectAsync(cancellationToken);
                return canConnect
                    ? Results.Ok(new { status = "ready" })
                    : Results.Problem(
                        detail: "Database unavailable.",
                        statusCode: StatusCodes.Status503ServiceUnavailable,
                        title: "Service Unavailable");
            })
            .WithName("HealthReady")
            .AllowAnonymous();
        }

        public static void MapClientErrorEndpoints(this WebApplication app)
        {
            // Observability (ADR-0076): authenticated client error reports are best-effort.
            // Only bounded source/message values are logged; legacy URL/stack fields are discarded.
            app.MapPost("/api/client-errors", (
                ClientErrorReport request,
                ILoggerFactory loggerFactory) =>
            {
                var logger = loggerFactory.CreateLogger("Sonivo.ClientError");

                static string Sanitize(string? value, int max)
                {
                    if (string.IsNullOrWhiteSpace(value)) return string.Empty;
                    var normalized = new string(value.Trim().Where(c => !char.IsControl(c)).ToArray());
                    return new string(ClientErrorTextRedactor.Redact(normalized).Trim().Take(max).ToArray());
                }

                logger.LogWarning(
                    "Client error [{Source}]: {Message}",
                    Sanitize(request.Source, 60),
                    Sanitize(request.Message, 500));

                return Results.Accepted();
            })
            .WithName("ReportClientError")
            .RequireAuthorization()
            .RequireRateLimiting("client-errors");
        }
    }
}

/// <summary>
/// Best-effort client error report (observability). All fields are untrusted
/// client input; only Source and Message are normalized and logged. Legacy
/// Stack and Url fields remain accepted and are discarded.
/// </summary>
public sealed record ClientErrorReport(string? Source, string? Message, string? Stack, string? Url);
