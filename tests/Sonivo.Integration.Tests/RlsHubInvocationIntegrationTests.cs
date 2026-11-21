using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Api.Realtime;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Realtime;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

[Collection(PostgresMigrationCollection.Name)]
public sealed class RlsHubInvocationIntegrationTests
{
    [Fact]
    public async Task Group_hub_invocation_uses_runtime_scope_and_rejects_a_nonmember()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var memberId = Guid.NewGuid();
        var nonmemberId = Guid.NewGuid();
        var group = Group.Create($"RLS hub {Guid.NewGuid():N}", now);
        var @event = Event.Create(group.Id, "RLS hub event", EventTypes.Rehearsal, now.AddHours(1), now);

        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.AddRange(User(memberId), User(nonmemberId));
            ownerDb.Groups.Add(group);
            ownerDb.Memberships.Add(Membership.CreateOwner(group.Id, memberId, now));
            ownerDb.Events.Add(@event);
            await ownerDb.SaveChangesAsync();
        }

        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString)
            .Options;
        try
        {
            await using var runtimeDb = new SonivoDbContext(runtimeOptions);
            await runtimeDb.Database.OpenConnectionAsync();
            await using var services = new ServiceCollection()
                .AddLogging()
                .AddSingleton(runtimeDb)
                .AddSingleton<IGroupDatabaseScope>(new EfGroupDatabaseScope(runtimeDb))
                .AddIdentityCore<ApplicationUser>()
                .AddEntityFrameworkStores<SonivoDbContext>()
                .Services
                .AddSingleton<GroupRealtimeConnectionRegistry>()
                .AddSingleton<PracticeRoomState>()
                .AddSingleton<IClock, SystemClock>()
                .AddSingleton(sp => new GroupAccessService(
                    new EfGroupStore(runtimeDb),
                    databaseScope: sp.GetRequiredService<IGroupDatabaseScope>()))
                .AddSingleton(sp => new ConductorRoomAuthorizer(
                    new EfEventGroupResolver(runtimeDb),
                    sp.GetRequiredService<GroupAccessService>(),
                    sp.GetRequiredService<IGroupDatabaseScope>()))
                .BuildServiceProvider();

            var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
            var registry = services.GetRequiredService<GroupRealtimeConnectionRegistry>();
            var access = services.GetRequiredService<GroupAccessService>();
            var filter = new RlsHubTransactionFilter();
            var method = typeof(GroupHub).GetMethod(nameof(GroupHub.JoinGroup))!;

            var memberContext = new TestHubCallerContext(memberId, "member-connection");
            var memberHub = new GroupHub(access, userManager, registry) { Context = memberContext };
            var memberInvocation = new HubInvocationContext(memberContext, services, memberHub, method, [group.Id]);
            string? groupScopeDuringInvocation = null;
            string? userScopeDuringInvocation = null;
            await filter.InvokeMethodAsync(memberInvocation, async _ =>
            {
                await memberHub.JoinGroup(group.Id);
                groupScopeDuringInvocation = await ReadSettingAsync(runtimeDb, "sonivo.group_id");
                userScopeDuringInvocation = await ReadSettingAsync(runtimeDb, "sonivo.user_id");
                return null;
            });

            Assert.Equal(group.Id.ToString("D"), groupScopeDuringInvocation);
            Assert.Equal(memberId.ToString("D"), userScopeDuringInvocation);
            Assert.Contains("member-connection", registry.GetActiveGroupConnections(group.Id));
            Assert.Null(runtimeDb.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(runtimeDb, "sonivo.user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(runtimeDb, "sonivo.group_id")));

            var roomState = services.GetRequiredService<PracticeRoomState>();
            var eventContext = new TestHubCallerContext(nonmemberId, "nonmember-event-connection");
            var eventHub = new PracticeRoomHub(
                services.GetRequiredService<ConductorRoomAuthorizer>(),
                roomState,
                userManager,
                services.GetRequiredService<IClock>(),
                services.GetRequiredService<Microsoft.Extensions.Logging.ILogger<PracticeRoomHub>>())
            {
                Context = eventContext
            };
            var eventMethod = typeof(PracticeRoomHub).GetMethod(nameof(PracticeRoomHub.JoinRoom))!;
            var eventInvocation = new HubInvocationContext(eventContext, services, eventHub, eventMethod, [@event.Id]);
            string? eventScopeDuringDenial = null;
            await Assert.ThrowsAsync<HubException>(async () =>
                await filter.InvokeMethodAsync(eventInvocation, async _ =>
                {
                    try
                    {
                        await eventHub.JoinRoom(@event.Id);
                        return null;
                    }
                    catch (HubException)
                    {
                        eventScopeDuringDenial = await ReadSettingAsync(runtimeDb, "sonivo.member_event_id");
                        throw;
                    }
                }));

            Assert.Equal(@event.Id.ToString("D"), eventScopeDuringDenial);
            Assert.Empty(roomState.GetPresence(PracticeRoomState.RoomKey(@event.Id)));
            Assert.Null(runtimeDb.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(runtimeDb, "sonivo.user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(runtimeDb, "sonivo.member_event_id")));

            var nonmemberContext = new TestHubCallerContext(nonmemberId, "nonmember-connection");
            var nonmemberHub = new GroupHub(access, userManager, registry) { Context = nonmemberContext };
            var nonmemberInvocation = new HubInvocationContext(nonmemberContext, services, nonmemberHub, method, [group.Id]);
            await Assert.ThrowsAsync<HubException>(async () =>
                await filter.InvokeMethodAsync(nonmemberInvocation, async _ =>
                {
                    await nonmemberHub.JoinGroup(group.Id);
                    return null;
                }));

            Assert.DoesNotContain("nonmember-connection", registry.GetActiveGroupConnections(group.Id));
            Assert.Null(runtimeDb.Database.CurrentTransaction);
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(runtimeDb, "sonivo.user_id")));
            Assert.True(string.IsNullOrEmpty(await ReadSettingAsync(runtimeDb, "sonivo.group_id")));
            await runtimeDb.Database.CloseConnectionAsync();
        }
        finally
        {
            // Runtime credentials cannot seed or clean test fixtures; remove the exact
            // owner-seeded rows after the constrained hub invocation finishes.
            await using var cleanupDb = new SonivoDbContext(ownerOptions);
            cleanupDb.Memberships.RemoveRange(await cleanupDb.Memberships
                .Where(membership => membership.GroupId == group.Id)
                .ToListAsync());
            cleanupDb.Events.RemoveRange(await cleanupDb.Events
                .Where(candidate => candidate.Id == @event.Id)
                .ToListAsync());
            cleanupDb.Groups.RemoveRange(await cleanupDb.Groups
                .Where(candidate => candidate.Id == group.Id)
                .ToListAsync());
            cleanupDb.Users.RemoveRange(await cleanupDb.Users
                .Where(user => user.Id == memberId || user.Id == nonmemberId)
                .ToListAsync());
            await cleanupDb.SaveChangesAsync();
        }
    }

    private static ApplicationUser User(Guid id)
        => new()
        {
            Id = id,
            UserName = $"{id:N}@example.test",
            NormalizedUserName = $"{id:N}@EXAMPLE.TEST",
            Email = $"{id:N}@example.test",
            NormalizedEmail = $"{id:N}@EXAMPLE.TEST",
            DisplayName = "RLS hub integration test"
        };

    private static async Task<string?> ReadSettingAsync(SonivoDbContext db, string setting)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT current_setting(@setting, true)";
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        var parameter = command.CreateParameter();
        parameter.ParameterName = "setting";
        parameter.Value = setting;
        command.Parameters.Add(parameter);
        var result = await command.ExecuteScalarAsync();
        return result is DBNull ? null : result as string;
    }

    private sealed class TestHubCallerContext(Guid userId, string connectionId) : HubCallerContext
    {
        public override string ConnectionId => connectionId;
        public override string? UserIdentifier => userId.ToString("D");
        public override ClaimsPrincipal? User { get; } = new(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString("D"))],
            authenticationType: "test"));
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort()
        {
        }
    }
}
