namespace Sonivo.Migration.Api.Contracts;

/// <summary>Minimal liveness/readiness payload.</summary>
public sealed record HealthResponse(string Status);
