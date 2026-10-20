using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Gives each authenticated hub invocation an isolated transaction-local RLS
/// user scope. GroupAccessService adds the Group scope after checking membership.
/// </summary>
public sealed class RlsHubTransactionFilter : IHubFilter
{
    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext invocationContext,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        var userIdValue = invocationContext.Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        var services = invocationContext.ServiceProvider;
        var db = services.GetRequiredService<SonivoDbContext>();
        if (!string.Equals(
                db.Database.ProviderName,
                "Npgsql.EntityFrameworkCore.PostgreSQL",
                StringComparison.Ordinal))
        {
            return await next(invocationContext);
        }

        if (!Guid.TryParse(userIdValue, out var userId) || userId == Guid.Empty)
        {
            throw new HubException("Authenticated user is required.");
        }

        var databaseScope = services.GetRequiredService<IGroupDatabaseScope>();
        var transaction = db.Database.CurrentTransaction;
        var ownsTransaction = transaction is null;
        if (transaction is null)
        {
            transaction = await db.Database.BeginTransactionAsync(
                invocationContext.Context.ConnectionAborted);
        }

        try
        {
            await databaseScope.SetAuthenticatedUserAsync(
                userId,
                invocationContext.Context.ConnectionAborted);
            var result = await next(invocationContext);
            if (ownsTransaction)
            {
                await transaction.CommitAsync(invocationContext.Context.ConnectionAborted);
            }

            return result;
        }
        catch
        {
            if (ownsTransaction)
            {
                await transaction.RollbackAsync(CancellationToken.None);
            }

            throw;
        }
        finally
        {
            if (ownsTransaction)
            {
                await transaction.DisposeAsync();
            }
        }
    }
}
