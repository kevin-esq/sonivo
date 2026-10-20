using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Security;

/// <summary>
/// Opens a transaction for authenticated HTTP API requests and installs only
/// the signed-in user's transaction-local database scope. SignalR uses a hub
/// filter so its long-lived WebSocket request never owns a database transaction.
/// Group scope is set later by GroupAccessService after membership is checked.
/// </summary>
public sealed class RlsRequestScopeMiddleware
{
    private readonly RequestDelegate _next;

    public RlsRequestScopeMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(
        HttpContext context,
        SonivoDbContext db,
        IGroupDatabaseScope databaseScope,
        PostCommitActionQueue? postCommitActions = null)
    {
        postCommitActions ??= new PostCommitActionQueue();
        var isScopedPath = context.Request.Path.StartsWithSegments("/api");
        var isAnonymousEndpoint = context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is not null;
        var userIdValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!isScopedPath
            || isAnonymousEndpoint
            || context.User.Identity?.IsAuthenticated != true
            || !string.Equals(
                db.Database.ProviderName,
                "Npgsql.EntityFrameworkCore.PostgreSQL",
                StringComparison.Ordinal))
        {
            await _next(context);
            return;
        }

        if (!Guid.TryParse(userIdValue, out var userId) || userId == Guid.Empty)
        {
            // An authenticated principal without the Identity GUID required by
            // the database scope must not continue into API data access.
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var transaction = db.Database.CurrentTransaction;
        var ownsTransaction = transaction is null;
        if (transaction is null)
        {
            transaction = await db.Database.BeginTransactionAsync(context.RequestAborted);
        }

        var transactionCompleted = false;
        var transactionCommitted = false;
        var actionsExecuted = false;
        if (ownsTransaction)
        {
            // Commit after endpoint authorization/data access but before a file
            // or other streamed response starts writing to the client.
            context.Response.OnStarting(async () =>
            {
                if (transactionCompleted)
                {
                    return;
                }

                if (context.Response.StatusCode >= StatusCodes.Status400BadRequest)
                {
                    await transaction.RollbackAsync(CancellationToken.None);
                }
                else
                {
                    await transaction.CommitAsync(context.RequestAborted);
                    transactionCommitted = true;
                    transactionCompleted = true;
                    await postCommitActions.ExecuteAsync();
                    actionsExecuted = true;
                }

                transactionCompleted = true;
            });
        }

        try
        {
            await databaseScope.SetAuthenticatedUserAsync(userId, context.RequestAborted);
            await _next(context);

            if (!ownsTransaction)
            {
                return;
            }

            if (!transactionCompleted && context.Response.StatusCode >= StatusCodes.Status400BadRequest)
            {
                await transaction.RollbackAsync(CancellationToken.None);
            }
            else if (!transactionCompleted)
            {
                await transaction.CommitAsync(context.RequestAborted);
                transactionCommitted = true;
                transactionCompleted = true;
                await postCommitActions.ExecuteAsync();
                actionsExecuted = true;
            }

            transactionCompleted = true;
        }
        catch
        {
            if (ownsTransaction && !transactionCompleted)
            {
                transactionCompleted = true;
                await transaction.RollbackAsync(CancellationToken.None);
            }

            throw;
        }
        finally
        {
            if (ownsTransaction)
            {
                if (transactionCommitted && !actionsExecuted)
                {
                    await postCommitActions.ExecuteAsync();
                }

                await transaction.DisposeAsync();
            }
        }
    }
}
