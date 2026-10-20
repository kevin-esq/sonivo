using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Sonivo.Api.Realtime;
using Sonivo.Application.Abstractions;
using Sonivo.Api.Security;
using Sonivo.Infrastructure.Persistence;
using Xunit;
using Xunit.Abstractions;

namespace Sonivo.Integration.Tests;

[Collection(PostgresMigrationCollection.Name)]
public sealed class RlsTransactionScopeTests
{
    private readonly ITestOutputHelper _output;

    public RlsTransactionScopeTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task AuthenticatedPostgresRequestWithInvalidUserIdIsRejectedBeforeDataAccess()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql("Host=localhost;Port=5433;Database=sonivo_test;Username=sonivo_app;Password=sonivo-app-dev-only")
            .Options;
        await using var db = new SonivoDbContext(options);
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/groups";
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "not-a-guid")],
            authenticationType: "test"));
        var nextCalled = false;
        var middleware = new RlsRequestScopeMiddleware(_ =>
        {
            nextCalled = true;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(context, db, new EfGroupDatabaseScope(db));

        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
        Assert.False(nextCalled);
        Assert.Equal(System.Data.ConnectionState.Closed, db.Database.GetDbConnection().State);
    }

    [Fact]
    public async Task AuthenticatedCookieDoesNotCreateAmbientScopeForAnonymousEndpoint()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql("Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo_app;Password=sonivo-app-dev-only")
            .Options;
        await using var db = new SonivoDbContext(options);
        var context = AuthenticatedApiContext(Guid.NewGuid());
        context.SetEndpoint(new Endpoint(
            _ => Task.CompletedTask,
            new EndpointMetadataCollection(new AllowAnonymousAttribute()),
            "anonymous-test"));
        var nextCalled = false;
        var middleware = new RlsRequestScopeMiddleware(_ =>
        {
            nextCalled = true;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(context, db, new EfGroupDatabaseScope(db));

        Assert.True(nextCalled);
        Assert.Null(db.Database.CurrentTransaction);
        Assert.Equal(System.Data.ConnectionState.Closed, db.Database.GetDbConnection().State);
    }

    [Fact]
    public async Task MiddlewareJoinsAnExistingTransactionWithoutCommittingIt()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            await using var outerTransaction = await db.Database.BeginTransactionAsync();
            var userId = Guid.NewGuid();
            var context = AuthenticatedApiContext(userId);
            var middleware = new RlsRequestScopeMiddleware(_ => Task.CompletedTask);

            await middleware.InvokeAsync(context, db, new EfGroupDatabaseScope(db));

            Assert.Same(outerTransaction, db.Database.CurrentTransaction);
            Assert.Equal(userId.ToString("D"), await ReadSettingAsync(db, "sonivo.user_id"));
            await outerTransaction.CommitAsync();
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task MiddlewareLeavesJoinedTransactionOpenAfterErrorResponse()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            await using var outerTransaction = await db.Database.BeginTransactionAsync();
            var context = AuthenticatedApiContext(Guid.NewGuid());
            var middleware = new RlsRequestScopeMiddleware(httpContext =>
            {
                httpContext.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            });

            await middleware.InvokeAsync(context, db, new EfGroupDatabaseScope(db));

            Assert.Same(outerTransaction, db.Database.CurrentTransaction);
            Assert.False(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            await outerTransaction.CommitAsync();
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task MiddlewareCommitsOwnedTransactionBeforeResponseBodyStarts()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            var scope = new EfGroupDatabaseScope(db);
            var userId = Guid.NewGuid();
            using var host = await new HostBuilder()
                .ConfigureWebHost(webHost => webHost
                    .UseTestServer()
                    .ConfigureServices(services =>
                    {
                        services.AddSingleton(db);
                        services.AddSingleton<IGroupDatabaseScope>(scope);
                        services.AddScoped<PostCommitActionQueue>();
                    })
                    .Configure(app =>
                    {
                        app.Use(async (context, next) =>
                        {
                            context.User = AuthenticatedApiContext(userId).User;
                            await next();
                        });
                        app.UseMiddleware<RlsRequestScopeMiddleware>();
                        app.Run(async context =>
                        {
                            Assert.Equal(userId.ToString("D"), await ReadSettingAsync(db, "sonivo.user_id"));
                            await context.Response.WriteAsync("stream");
                            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
                        });
                    }))
                .StartAsync();

            using var client = host.GetTestClient();
            using var response = await client.GetAsync("/api/test");

            Assert.True(response.IsSuccessStatusCode);
            Assert.Equal("stream", await response.Content.ReadAsStringAsync());
            Assert.Null(db.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task MiddlewareRunsQueuedActionsOnlyAfterOwnedTransactionCommits()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            var actions = new PostCommitActionQueue();
            var actionObservedCommittedTransaction = false;
            var actionObservedClearedUserScope = false;
            actions.Enqueue(async () =>
            {
                actionObservedCommittedTransaction = db.Database.CurrentTransaction is null;
                actionObservedClearedUserScope = string.IsNullOrEmpty(
                    await ReadSettingAsync(db, "sonivo.user_id"));
            });

            var context = AuthenticatedApiContext(Guid.NewGuid());
            var middleware = new RlsRequestScopeMiddleware(_ => Task.CompletedTask);
            await middleware.InvokeAsync(context, db, new EfGroupDatabaseScope(db), actions);

            Assert.True(actionObservedCommittedTransaction);
            Assert.True(actionObservedClearedUserScope);
            await context.Response.StartAsync();
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task FailedPostCommitActionDoesNotAttemptToRollbackCommittedRequest()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            var actions = new PostCommitActionQueue();
            var context = AuthenticatedApiContext(Guid.NewGuid());
            var actionObservedCommit = false;
            var middleware = new RlsRequestScopeMiddleware(_ =>
            {
                actions.Enqueue(() =>
                {
                    actionObservedCommit = db.Database.CurrentTransaction is null;
                    return Task.FromException(new InvalidOperationException("post-commit action failed"));
                });
                return Task.CompletedTask;
            });

            var exception = await Assert.ThrowsAsync<InvalidOperationException>(
                () => middleware.InvokeAsync(context, db, new EfGroupDatabaseScope(db), actions));

            Assert.Equal("post-commit action failed", exception.Message);
            Assert.True(actionObservedCommit);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task MembershipRealtimeRevocationRunsAfterCommitAndIsSkippedAfterRollback()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();

            var groupId = Guid.NewGuid();
            var userId = Guid.NewGuid();

            var registry = new GroupRealtimeConnectionRegistry();
            registry.AddPending(groupId, userId, "membership-removal-connection");
            Assert.True(registry.TryActivate(groupId, userId, "membership-removal-connection"));

            var rollbackActions = new PostCommitActionQueue();
            var rollbackContext = AuthenticatedApiContext(Guid.NewGuid());
            rollbackContext.Response.StatusCode = StatusCodes.Status403Forbidden;
            await new RlsRequestScopeMiddleware(_ =>
            {
                rollbackActions.Enqueue(() => RevokeMemberConnectionsAsync(registry, groupId, userId));
                return Task.CompletedTask;
            }).InvokeAsync(rollbackContext, db, new EfGroupDatabaseScope(db), rollbackActions);

            Assert.Equal(["membership-removal-connection"], registry.GetActiveGroupConnections(groupId));

            var commitActions = new PostCommitActionQueue();
            var commitContext = AuthenticatedApiContext(Guid.NewGuid());
            await new RlsRequestScopeMiddleware(_ =>
            {
                commitActions.Enqueue(() => RevokeMemberConnectionsAsync(registry, groupId, userId));
                return Task.CompletedTask;
            }).InvokeAsync(commitContext, db, new EfGroupDatabaseScope(db), commitActions);

            Assert.Empty(registry.GetActiveGroupConnections(groupId));
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task HubInvocationUsesAndClearsTransactionLocalUserScope()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            var userId = Guid.NewGuid();
            var services = new ServiceCollection()
                .AddSingleton(db)
                .AddSingleton<IGroupDatabaseScope>(new EfGroupDatabaseScope(db))
                .BuildServiceProvider();
            var hub = new RlsScopeProbeHub();
            var method = typeof(RlsScopeProbeHub).GetMethod(nameof(RlsScopeProbeHub.Probe))!;
            var invocation = new HubInvocationContext(
                new RlsScopeProbeContext(userId),
                services,
                hub,
                method,
                []);
            var filter = new RlsHubTransactionFilter();
            var nextObservedScope = false;

            var result = await filter.InvokeMethodAsync(invocation, async _ =>
            {
                nextObservedScope = db.Database.CurrentTransaction is not null
                    && await ReadSettingAsync(db, "sonivo.user_id") == userId.ToString("D");
                return "ok";
            });

            Assert.Equal("ok", result);
            Assert.True(nextObservedScope);
            Assert.Null(db.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));

            var failedInvocation = new HubInvocationContext(
                new RlsScopeProbeContext(userId),
                services,
                hub,
                method,
                []);
            await Assert.ThrowsAsync<InvalidOperationException>(async () =>
                await filter.InvokeMethodAsync(
                    failedInvocation,
                    _ => ValueTask.FromException<object?>(new InvalidOperationException("Probe failure."))));

            Assert.Null(db.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            await services.DisposeAsync();
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task MiddlewareRollsBackAndClearsScopeAfterExceptionAndCancellation()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            var scope = new EfGroupDatabaseScope(db);
            var middleware = new RlsRequestScopeMiddleware(async _ =>
            {
                await SetAllNonUserSelectorsAsync(scope);
                throw new InvalidOperationException("Request failed.");
            });
            var exceptionContext = AuthenticatedApiContext(Guid.NewGuid());

            await Assert.ThrowsAsync<InvalidOperationException>(
                () => middleware.InvokeAsync(exceptionContext, db, scope));
            Assert.Null(db.Database.CurrentTransaction);
            await AssertAllSelectorsClearedAsync(db);

            var responseActions = new PostCommitActionQueue();
            var ranAfterErrorResponse = false;
            responseActions.Enqueue(() =>
            {
                ranAfterErrorResponse = true;
                return Task.CompletedTask;
            });
            var errorContext = AuthenticatedApiContext(Guid.NewGuid());
            var errorMiddleware = new RlsRequestScopeMiddleware(httpContext =>
            {
                httpContext.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            });
            await errorMiddleware.InvokeAsync(errorContext, db, scope, responseActions);
            Assert.False(ranAfterErrorResponse);
            Assert.Null(db.Database.CurrentTransaction);

            using var cancellation = new CancellationTokenSource();
            var cancellationContext = AuthenticatedApiContext(Guid.NewGuid());
            cancellationContext.RequestAborted = cancellation.Token;
            var cancellationMiddleware = new RlsRequestScopeMiddleware(async _ =>
            {
                await SetAllNonUserSelectorsAsync(scope);
                Assert.False(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
                cancellation.Cancel();
                await Task.FromCanceled(cancellation.Token);
            });

            await Assert.ThrowsAnyAsync<OperationCanceledException>(
                () => cancellationMiddleware.InvokeAsync(cancellationContext, db, scope));
            Assert.Null(db.Database.CurrentTransaction);
            await AssertAllSelectorsClearedAsync(db);
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task MiddlewareDoesNotTouchDisposedTransactionWhenOuterExceptionHandlerWritesResponse()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            var scope = new EfGroupDatabaseScope(db);
            var userId = Guid.NewGuid();
            using var host = await new HostBuilder()
                .ConfigureWebHost(webHost => webHost
                    .UseTestServer()
                    .ConfigureServices(services =>
                    {
                        services.AddSingleton(db);
                        services.AddSingleton<IGroupDatabaseScope>(scope);
                        services.AddScoped<PostCommitActionQueue>();
                    })
                    .Configure(app =>
                    {
                        app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
                        {
                            context.Response.StatusCode = StatusCodes.Status404NotFound;
                            await context.Response.WriteAsync("not found");
                        }));
                        app.Use(async (context, next) =>
                        {
                            context.User = AuthenticatedApiContext(userId).User;
                            await next();
                        });
                        app.UseMiddleware<RlsRequestScopeMiddleware>();
                        app.Run(_ => throw new NotFoundException("Group not found."));
                    }))
                .StartAsync();

            using var client = host.GetTestClient();
            using var response = await client.GetAsync("/api/groups/missing");

            Assert.Equal(StatusCodes.Status404NotFound, (int)response.StatusCode);
            Assert.Equal("not found", await response.Content.ReadAsStringAsync());
            Assert.Null(db.Database.CurrentTransaction);
            await AssertAllSelectorsClearedAsync(db);
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task UserAndGroupContextIsTransactionLocalAndDoesNotLeakAfterCommit()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            var userId = Guid.NewGuid();
            var groupId = Guid.NewGuid();
            var invitationTokenHash = new string('a', 64);
            const string lookupSlug = "test-band";
            const string memberSlug = "member-band";
            const string lookupHandle = "kevin";
            const string uniquenessSlug = "unique-band";
            var eventId = Guid.NewGuid();
            var managedAccountGroupId = Guid.NewGuid();
            var managedAccountUserId = Guid.NewGuid();
            var scope = new EfGroupDatabaseScope(db);

            await db.Database.OpenConnectionAsync();
            await using (var transaction = await db.Database.BeginTransactionAsync())
            {
                await scope.SetAuthenticatedUserAsync(userId, CancellationToken.None);
                await scope.SetMultiGroupReadAsync(userId, CancellationToken.None);
                await scope.SetVerifiedGroupAsync(groupId, CancellationToken.None);
                await scope.SetSignedPaymentWebhookGroupAsync(groupId, CancellationToken.None);
                await scope.SetGroupForBootstrapAsync(groupId, CancellationToken.None);
                await scope.SetInvitationTokenLookupAsync(invitationTokenHash, CancellationToken.None);
                await scope.SetPublicGroupSlugAsync(lookupSlug, CancellationToken.None);
                await scope.SetAuthenticatedGroupSlugLookupAsync(memberSlug, CancellationToken.None);
                await scope.SetMemberEventLookupAsync(eventId, CancellationToken.None);
                await scope.SetManagedAccountMembershipLookupAsync(
                    managedAccountGroupId,
                    managedAccountUserId,
                    CancellationToken.None);
                await scope.SetHandleLoginLookupAsync(lookupSlug, lookupHandle, CancellationToken.None);
                await scope.SetGroupSlugUniquenessLookupAsync(uniquenessSlug, CancellationToken.None);

                await new EfUnitOfWork(db).SaveChangesAsync(CancellationToken.None);
                Assert.NotNull(db.Database.CurrentTransaction);

                Assert.Equal(userId.ToString("D"), await ReadSettingAsync(db, "sonivo.user_id"));
                Assert.Equal(userId.ToString("D"), await ReadSettingAsync(db, "sonivo.multi_group_user_id"));
                Assert.Equal(groupId.ToString("D"), await ReadSettingAsync(db, "sonivo.group_id"));
                Assert.Equal(groupId.ToString("D"), await ReadSettingAsync(db, "sonivo.payment_webhook_group_id"));
                Assert.Equal(groupId.ToString("D"), await ReadSettingAsync(db, "sonivo.bootstrap_group_id"));
                Assert.Equal(invitationTokenHash.ToUpperInvariant(),
                    await ReadSettingAsync(db, "sonivo.invitation_token_hash"));
                Assert.Equal(lookupSlug, await ReadSettingAsync(db, "sonivo.public_group_slug"));
                Assert.Equal(memberSlug, await ReadSettingAsync(db, "sonivo.member_group_slug"));
                Assert.Equal(eventId.ToString("D"), await ReadSettingAsync(db, "sonivo.member_event_id"));
                Assert.Equal(managedAccountGroupId.ToString("D"),
                    await ReadSettingAsync(db, "sonivo.managed_account_group_id"));
                Assert.Equal(managedAccountUserId.ToString("D"),
                    await ReadSettingAsync(db, "sonivo.managed_account_user_id"));
                Assert.Equal(lookupSlug, await ReadSettingAsync(db, "sonivo.handle_group_slug"));
                Assert.Equal(lookupHandle, await ReadSettingAsync(db, "sonivo.handle_value"));
                Assert.Equal(uniquenessSlug, await ReadSettingAsync(db, "sonivo.group_slug_lookup"));

                await transaction.CommitAsync();
            }

            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.multi_group_user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.payment_webhook_group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.bootstrap_group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.invitation_token_hash")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.public_group_slug")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.member_group_slug")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.member_event_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.managed_account_group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.managed_account_user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.handle_group_slug")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.handle_value")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.group_slug_lookup")));

            // A reused pooled connection must start a fresh transaction with no
            // previous principal or Group context. Rollback must clear both too.
            await using (var transaction = await db.Database.BeginTransactionAsync())
            {
                await scope.SetAuthenticatedUserAsync(Guid.NewGuid(), CancellationToken.None);
                await scope.SetMultiGroupReadAsync(Guid.NewGuid(), CancellationToken.None);
                await scope.SetVerifiedGroupAsync(Guid.NewGuid(), CancellationToken.None);
                await scope.SetSignedPaymentWebhookGroupAsync(Guid.NewGuid(), CancellationToken.None);
                await scope.SetGroupForBootstrapAsync(Guid.NewGuid(), CancellationToken.None);
                await scope.SetInvitationTokenLookupAsync(invitationTokenHash, CancellationToken.None);
                await scope.SetPublicGroupSlugAsync(lookupSlug, CancellationToken.None);
                await scope.SetAuthenticatedGroupSlugLookupAsync(memberSlug, CancellationToken.None);
                await scope.SetMemberEventLookupAsync(eventId, CancellationToken.None);
                await scope.SetManagedAccountMembershipLookupAsync(
                    managedAccountGroupId,
                    managedAccountUserId,
                    CancellationToken.None);
                await scope.SetHandleLoginLookupAsync(lookupSlug, lookupHandle, CancellationToken.None);
                await scope.SetGroupSlugUniquenessLookupAsync(uniquenessSlug, CancellationToken.None);
                Assert.False(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
                Assert.False(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.group_id")));
                Assert.Equal(invitationTokenHash.ToUpperInvariant(),
                    await ReadSettingAsync(db, "sonivo.invitation_token_hash"));

                await transaction.RollbackAsync();
            }

            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.multi_group_user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.payment_webhook_group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.bootstrap_group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.invitation_token_hash")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.public_group_slug")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.member_group_slug")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.member_event_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.managed_account_group_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.managed_account_user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.handle_group_slug")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.handle_value")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.group_slug_lookup")));
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task EveryRlsSelectorRequiresAnActivePostgresTransaction()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql("Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo_app;Password=sonivo-app-dev-only")
            .Options;
        await using var db = new SonivoDbContext(options);
        var scope = new EfGroupDatabaseScope(db);
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var selectors = new Func<CancellationToken, Task>[]
        {
            token => scope.SetAuthenticatedUserAsync(userId, token),
            token => scope.SetMultiGroupReadAsync(userId, token),
            token => scope.SetVerifiedGroupAsync(groupId, token),
            token => scope.SetSignedPaymentWebhookGroupAsync(groupId, token),
            token => scope.SetGroupForBootstrapAsync(groupId, token),
            token => scope.SetInvitationTokenLookupAsync(new string('a', 64), token),
            token => scope.SetPublicGroupSlugAsync("public-band", token),
            token => scope.SetAuthenticatedGroupSlugLookupAsync("member-band", token),
            token => scope.SetMemberEventLookupAsync(Guid.NewGuid(), token),
            token => scope.SetManagedAccountMembershipLookupAsync(Guid.NewGuid(), Guid.NewGuid(), token),
            token => scope.SetHandleLoginLookupAsync("handle-band", "kevin", token),
            token => scope.SetGroupSlugUniquenessLookupAsync("unique-band", token),
        };

        foreach (var setSelector in selectors)
        {
            await Assert.ThrowsAsync<InvalidOperationException>(
                () => setSelector(CancellationToken.None));
        }

        Assert.Null(db.Database.CurrentTransaction);
    }

    [Fact]
    public async Task ManagedAccountMembershipSelectorRejectsEmptyIdentities()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql("Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo_app;Password=sonivo-app-dev-only")
            .Options;
        await using var db = new SonivoDbContext(options);
        var scope = new EfGroupDatabaseScope(db);

        await Assert.ThrowsAsync<ArgumentException>(() => scope.SetManagedAccountMembershipLookupAsync(
            Guid.Empty,
            Guid.NewGuid(),
            CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => scope.SetManagedAccountMembershipLookupAsync(
            Guid.NewGuid(),
            Guid.Empty,
            CancellationToken.None));

        Assert.Null(db.Database.CurrentTransaction);
    }

    [Fact]
    public async Task BackgroundGroupOperationSetsUserContextAndClosesItsOwnedTransaction()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            Assert.False(db.Database.CreateExecutionStrategy().RetriesOnFailure);
            var userId = Guid.NewGuid();
            var operation = new EfGroupDataOperation(db, new EfGroupDatabaseScope(db));
            await db.Database.OpenConnectionAsync();
            var observedUser = await operation.ExecuteAsUserAsync(
                userId,
                async cancellationToken =>
                {
                    Assert.NotNull(db.Database.CurrentTransaction);
                    return await ReadSettingAsync(db, "sonivo.user_id");
                },
                CancellationToken.None);

            Assert.Equal(userId.ToString("D"), observedUser);
            Assert.Null(db.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));

            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                operation.ExecuteAsUserAsync<string>(
                    Guid.NewGuid(),
                    _ => throw new InvalidOperationException("Background read failed."),
                    CancellationToken.None));
            Assert.Null(db.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, "sonivo.user_id")));
            await db.Database.CloseConnectionAsync();
        }
    }

    [Fact]
    public async Task RuntimeRoleHasOnlyReviewedPlatformTablePrivileges()
    {
        var (db, configuredConnection) = await CreateConnectedDbAsync();
        if (db is null)
        {
            if (configuredConnection)
            {
                Assert.Fail("SONIVO_RLS_TEST_PG is configured but PostgreSQL is unavailable.");
            }

            _output.WriteLine("SKIPPED: local PostgreSQL is unavailable.");
            return;
        }

        await using (db)
        {
            await db.Database.OpenConnectionAsync();
            Assert.True(await QueryBooleanAsync(db,
                "SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb " +
                "FROM pg_roles WHERE rolname = current_user"));

            Assert.True(await HasTablePrivilegeAsync(db, "AccountAudit", "SELECT"));
            Assert.True(await HasTablePrivilegeAsync(db, "AccountAudit", "INSERT"));
            Assert.False(await HasTablePrivilegeAsync(db, "AccountAudit", "UPDATE"));
            Assert.False(await HasTablePrivilegeAsync(db, "AccountAudit", "DELETE"));

            Assert.True(await HasTablePrivilegeAsync(db, "GroupAuditLog", "SELECT"));
            Assert.True(await HasTablePrivilegeAsync(db, "GroupAuditLog", "INSERT"));
            Assert.False(await HasTablePrivilegeAsync(db, "GroupAuditLog", "UPDATE"));
            Assert.False(await HasTablePrivilegeAsync(db, "GroupAuditLog", "DELETE"));

            Assert.True(await HasTablePrivilegeAsync(db, "Notifications", "UPDATE"));
            Assert.False(await HasTablePrivilegeAsync(db, "Notifications", "DELETE"));
            Assert.True(await HasTablePrivilegeAsync(db, "WebhookEvents", "INSERT"));
            Assert.False(await HasTablePrivilegeAsync(db, "WebhookEvents", "UPDATE"));
            Assert.False(await HasTablePrivilegeAsync(db, "WebhookEvents", "DELETE"));

            foreach (var privilege in new[] { "SELECT", "INSERT", "UPDATE", "DELETE" })
            {
                Assert.False(await HasTablePrivilegeAsync(db, "__EFMigrationsHistory", privilege));
            }

            Assert.True(await HasTablePrivilegeAsync(db, "DataProtectionKeys", "SELECT"));
            Assert.True(await HasTablePrivilegeAsync(db, "DataProtectionKeys", "INSERT"));
            Assert.True(await HasTablePrivilegeAsync(db, "DataProtectionKeys", "DELETE"));
            Assert.False(await HasTablePrivilegeAsync(db, "DataProtectionKeys", "UPDATE"));
            await db.Database.CloseConnectionAsync();
        }
    }

    private static DefaultHttpContext AuthenticatedApiContext(Guid userId)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/groups";
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString("D"))],
            authenticationType: "test"));
        return context;
    }

    private static async Task<(SonivoDbContext? Db, bool ConfiguredConnection)> CreateConnectedDbAsync()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        var connectionString = configuredConnection
            ?? "Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo_app;Password=sonivo-app-dev-only";
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        var db = new SonivoDbContext(options);
        if (await db.Database.CanConnectAsync())
        {
            return (db, !string.IsNullOrWhiteSpace(configuredConnection));
        }

        await db.DisposeAsync();
        return (null, !string.IsNullOrWhiteSpace(configuredConnection));
    }

    private static async Task<string?> ReadSettingAsync(SonivoDbContext db, string setting)
    {
        var connection = db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT current_setting(@setting, true)";
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        var parameter = command.CreateParameter();
        parameter.ParameterName = "setting";
        parameter.Value = setting;
        command.Parameters.Add(parameter);
        var result = await command.ExecuteScalarAsync();
        return result is DBNull ? null : result as string;
    }

    private static Task RevokeMemberConnectionsAsync(
        GroupRealtimeConnectionRegistry registry,
        Guid groupId,
        Guid userId)
    {
        registry.MarkMemberRevoked(groupId, userId);
        registry.RemoveMember(groupId, userId);
        return Task.CompletedTask;
    }

    private sealed class RlsScopeProbeHub : Hub
    {
        public Task Probe() => Task.CompletedTask;
    }

    private sealed class RlsScopeProbeContext(Guid userId) : HubCallerContext
    {
        public override string ConnectionId => "rls-scope-probe";

        public override string? UserIdentifier => userId.ToString("D");

        public override ClaimsPrincipal? User { get; } = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString("D"))],
            authenticationType: "test"));

        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();

        public override IFeatureCollection Features { get; } = new FeatureCollection();

        public override CancellationToken ConnectionAborted => CancellationToken.None;

        public override void Abort()
        {
        }
    }

    private static async Task SetAllNonUserSelectorsAsync(IGroupDatabaseScope scope)
    {
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await scope.SetMultiGroupReadAsync(userId, CancellationToken.None);
        await scope.SetVerifiedGroupAsync(groupId, CancellationToken.None);
        await scope.SetSignedPaymentWebhookGroupAsync(groupId, CancellationToken.None);
        await scope.SetGroupForBootstrapAsync(groupId, CancellationToken.None);
        await scope.SetInvitationTokenLookupAsync(new string('b', 64), CancellationToken.None);
        await scope.SetPublicGroupSlugAsync("public-band", CancellationToken.None);
        await scope.SetAuthenticatedGroupSlugLookupAsync("member-band", CancellationToken.None);
        await scope.SetMemberEventLookupAsync(Guid.NewGuid(), CancellationToken.None);
        await scope.SetManagedAccountMembershipLookupAsync(groupId, Guid.NewGuid(), CancellationToken.None);
        await scope.SetHandleLoginLookupAsync("handle-band", "kevin", CancellationToken.None);
        await scope.SetGroupSlugUniquenessLookupAsync("unique-band", CancellationToken.None);
    }

    private static async Task AssertAllSelectorsClearedAsync(SonivoDbContext db)
    {
        foreach (var setting in new[]
        {
            "sonivo.user_id",
            "sonivo.multi_group_user_id",
            "sonivo.group_id",
            "sonivo.payment_webhook_group_id",
            "sonivo.bootstrap_group_id",
            "sonivo.invitation_token_hash",
            "sonivo.public_group_slug",
            "sonivo.member_group_slug",
            "sonivo.member_event_id",
            "sonivo.managed_account_group_id",
            "sonivo.managed_account_user_id",
            "sonivo.handle_group_slug",
            "sonivo.handle_value",
            "sonivo.group_slug_lookup",
        })
        {
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(db, setting)),
                $"Transaction-local selector {setting} leaked after request cleanup.");
        }
    }

    private static async Task<bool> HasTablePrivilegeAsync(
        SonivoDbContext db,
        string table,
        string privilege)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT has_table_privilege(current_user, @table, @privilege)";
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        var tableParameter = command.CreateParameter();
        tableParameter.ParameterName = "table";
        tableParameter.Value = $"public.\"{table}\"";
        command.Parameters.Add(tableParameter);
        var privilegeParameter = command.CreateParameter();
        privilegeParameter.ParameterName = "privilege";
        privilegeParameter.Value = privilege;
        command.Parameters.Add(privilegeParameter);
        return (bool)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<bool> QueryBooleanAsync(SonivoDbContext db, string query)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = query;
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        return (bool)(await command.ExecuteScalarAsync())!;
    }
}
