using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Sonivo.Infrastructure.Persistence;

public sealed class RlsRuntimePrincipalStartupVerifier(
    SonivoDbContext db,
    ILogger<RlsRuntimePrincipalStartupVerifier> logger)
{
    private const string VerificationScriptResource =
        "Sonivo.Infrastructure.Persistence.verify-runtime-principal.sql";

    public async Task VerifyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var stream = typeof(RlsRuntimePrincipalStartupVerifier)
                .Assembly
                .GetManifestResourceStream(VerificationScriptResource)
                ?? throw new InvalidOperationException("RLS runtime verification script is unavailable.");

            using var reader = new StreamReader(stream);
            var script = await reader.ReadToEndAsync(cancellationToken);
            await db.Database.ExecuteSqlRawAsync(script, cancellationToken);
            logger.LogInformation("RLS runtime principal and forced-policy verification passed.");
        }
        catch (Exception exception)
        {
            logger.LogCritical(exception, "RLS runtime verification failed; API startup is aborted.");
            throw new InvalidOperationException(
                "RLS runtime verification failed. Refusing to start the API.",
                exception);
        }
    }
}
