using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

[Collection(PostgresMigrationCollection.Name)]
public sealed class RlsPolicyIntegrationTests
{
    private static readonly string[] ProtectedTables =
    [
        "Groups", "Memberships", "GroupSlugHistory", "GroupBranding", "GroupRoles",
        "Invitations", "GroupAuditLog", "ResourceGrants", "Songs", "SongFavorites",
        "Arrangements", "Resources", "Setlists", "SetlistItems", "Events",
        "EventSetlistItems", "Rsvps", "Tasks", "GroupOwnershipTransfers",
        "BillingLegacyGroupNotices", "Notifications", "AccountAudit"
    ];

    [Fact]
    public async Task Every_group_owned_table_has_forced_row_security_and_policy_coverage()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   EXISTS (SELECT 1 FROM pg_catalog.pg_policies p
                           WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS has_policy
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = ANY (@tables)
            """, connection);
        command.Parameters.AddWithValue("tables", ProtectedTables);

        var actual = new Dictionary<string, (bool Enabled, bool Forced, bool HasPolicy)>(StringComparer.Ordinal);
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                actual.Add(reader.GetString(0), (reader.GetBoolean(1), reader.GetBoolean(2), reader.GetBoolean(3)));
            }
        }

        Assert.Equal(ProtectedTables.Length, actual.Count);
        Assert.All(ProtectedTables, table =>
        {
            Assert.True(actual[table].Enabled, $"{table} does not enable row security.");
            Assert.True(actual[table].Forced, $"{table} does not force row security.");
            Assert.True(actual[table].HasPolicy, $"{table} has no reviewed row policy.");
        });
    }

    [Fact]
    public async Task Runtime_role_reads_and_updates_only_member_groups_and_explicit_multi_group_rows()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(ownerConnectionString) || string.IsNullOrWhiteSpace(runtimeConnectionString)) return;

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var ownGroup = Group.Create($"RLS own {Guid.NewGuid():N}", now);
        var otherGroup = Group.Create($"RLS other {Guid.NewGuid():N}", now);
        var secondOwnGroup = Group.Create($"RLS second {Guid.NewGuid():N}", now);

        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.AddRange(User(userId), User(otherUserId));
            ownerDb.Groups.AddRange(ownGroup, otherGroup, secondOwnGroup);
            ownerDb.Memberships.AddRange(
                Membership.CreateOwner(ownGroup.Id, userId, now),
                Membership.CreateOwner(otherGroup.Id, otherUserId, now),
                Membership.CreateMember(secondOwnGroup.Id, userId, now));
            ownerDb.Songs.AddRange(
                Song.Create(ownGroup.Id, "Own song", SongOriginKinds.Original, now),
                Song.Create(otherGroup.Id, "Other song", SongOriginKinds.Original, now),
                Song.Create(secondOwnGroup.Id, "Second own song", SongOriginKinds.Original, now));
            await ownerDb.SaveChangesAsync();
        }

        await using var runtime = new NpgsqlConnection(runtimeConnectionString);
        await runtime.OpenAsync();

        Assert.Equal(1, await CountAsync(runtime, userId, ownGroup.Id, "Groups"));
        Assert.Equal(1, await CountAsync(runtime, userId, ownGroup.Id, "Songs"));
        Assert.Equal(0, await CountAsync(runtime, userId, otherGroup.Id, "Groups"));
        Assert.Equal(0, await CountAsync(runtime, userId, otherGroup.Id, "Songs"));
        Assert.Equal(0, await CountAsync(runtime, userId, null, "Groups"));
        Assert.Equal(0, await CountAsync(runtime, Guid.Empty, ownGroup.Id, "Groups"));

        await using (var transaction = await runtime.BeginTransactionAsync())
        {
            await SetScopeAsync(runtime, transaction, userId, ownGroup.Id);
            await using var update = new NpgsqlCommand(
                "UPDATE public.\"Groups\" SET \"Name\" = 'must not cross groups' WHERE \"Id\" = @id",
                runtime, transaction);
            update.Parameters.AddWithValue("id", otherGroup.Id);
            Assert.Equal(0, await update.ExecuteNonQueryAsync());
            await transaction.RollbackAsync();
        }

        await using (var transaction = await runtime.BeginTransactionAsync())
        {
            await using var setUser = new NpgsqlCommand(
                "SELECT set_config('sonivo.user_id', @user_id, true), set_config('sonivo.multi_group_user_id', @user_id, true)",
                runtime, transaction);
            setUser.Parameters.AddWithValue("user_id", userId.ToString("D"));
            await setUser.ExecuteNonQueryAsync();
            await using var count = new NpgsqlCommand("SELECT count(*) FROM public.\"Songs\"", runtime, transaction);
            Assert.Equal(2L, (long)(await count.ExecuteScalarAsync())!);
            await using var groups = new NpgsqlCommand("SELECT count(*) FROM public.\"Groups\"", runtime, transaction);
            Assert.Equal(2L, (long)(await groups.ExecuteScalarAsync())!);
            await using var memberships = new NpgsqlCommand("SELECT count(*) FROM public.\"Memberships\" WHERE \"UserId\" = @user_id", runtime, transaction);
            memberships.Parameters.AddWithValue("user_id", userId);
            Assert.Equal(2L, (long)(await memberships.ExecuteScalarAsync())!);
            await transaction.RollbackAsync();
        }
    }

    [Fact]
    public async Task Arrangement_detail_verifies_membership_before_loading_group_scoped_rows()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(ownerConnectionString) || string.IsNullOrWhiteSpace(runtimeConnectionString)) return;

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var group = Group.Create($"RLS arrangement {Guid.NewGuid():N}", now);
        var song = Song.Create(group.Id, "Scoped song", SongOriginKinds.Original, now);
        var arrangement = Arrangement.Create(group.Id, song.Id, "Scoped arrangement", now, lyrics: "Scoped lyrics");
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.Add(User(userId));
            ownerDb.Groups.Add(group);
            ownerDb.Memberships.Add(Membership.CreateOwner(group.Id, userId, now));
            ownerDb.Songs.Add(song);
            ownerDb.Arrangements.Add(arrangement);
            await ownerDb.SaveChangesAsync();
        }

        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString)
            .Options;
        await using var runtimeDb = new SonivoDbContext(runtimeOptions);
        await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
        var scope = new EfGroupDatabaseScope(runtimeDb);
        await scope.SetAuthenticatedUserAsync(userId, CancellationToken.None);
        var handler = new GetArrangementHandler(
            new GroupAccessService(new EfGroupStore(runtimeDb), databaseScope: scope),
            new EfArrangementStore(runtimeDb));

        var result = await handler.HandleAsync(userId, group.Id, arrangement.Id, CancellationToken.None);

        Assert.Equal(arrangement.Label, result.Label);
        Assert.Equal("Scoped lyrics", result.Lyrics);
        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task Runtime_role_can_lookup_only_a_member_event_before_group_scope_is_known()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(ownerConnectionString) || string.IsNullOrWhiteSpace(runtimeConnectionString)) return;

        var now = DateTimeOffset.UtcNow;
        var memberId = Guid.NewGuid();
        var outsiderId = Guid.NewGuid();
        var group = Group.Create($"RLS event lookup {Guid.NewGuid():N}", now);
        var musicalEvent = Event.Create(group.Id, "Scoped event", EventTypes.Other, now.AddDays(1), now);
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.AddRange(User(memberId), User(outsiderId));
            ownerDb.Groups.Add(group);
            ownerDb.Memberships.Add(Membership.CreateOwner(group.Id, memberId, now));
            ownerDb.Events.Add(musicalEvent);
            await ownerDb.SaveChangesAsync();
        }

        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString)
            .Options;
        await using var runtimeDb = new SonivoDbContext(runtimeOptions);
        await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
        var scope = new EfGroupDatabaseScope(runtimeDb);
        var resolver = new EfEventGroupResolver(runtimeDb);
        await scope.SetAuthenticatedUserAsync(memberId, CancellationToken.None);
        await scope.SetMemberEventLookupAsync(musicalEvent.Id, CancellationToken.None);
        Assert.Equal(group.Id, await resolver.FindGroupIdByEventIdAsync(musicalEvent.Id, CancellationToken.None));

        await scope.SetAuthenticatedUserAsync(outsiderId, CancellationToken.None);
        Assert.Null(await resolver.FindGroupIdByEventIdAsync(musicalEvent.Id, CancellationToken.None));
        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task Public_slug_and_invitation_selectors_expose_only_the_exact_group()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(ownerConnectionString) || string.IsNullOrWhiteSpace(runtimeConnectionString)) return;

        var now = DateTimeOffset.UtcNow;
        var ownerId = Guid.NewGuid();
        var group = Group.Create($"RLS public {Guid.NewGuid():N}", now);
        var unrelated = Group.Create($"RLS unrelated {Guid.NewGuid():N}", now);
        var tokenHash = Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant().PadRight(64, 'a');
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.Add(User(ownerId));
            ownerDb.Groups.AddRange(group, unrelated);
            ownerDb.Memberships.Add(Membership.CreateOwner(group.Id, ownerId, now));
            ownerDb.Invitations.Add(Invitation.Create(group.Id, tokenHash, ownerId, now, now.AddDays(1)));
            await ownerDb.SaveChangesAsync();
        }

        await using var runtime = new NpgsqlConnection(runtimeConnectionString);
        await runtime.OpenAsync();
        await using (var transaction = await runtime.BeginTransactionAsync())
        {
            await using var setSlug = new NpgsqlCommand(
                "SELECT set_config('sonivo.public_group_slug', @slug, true)", runtime, transaction);
            setSlug.Parameters.AddWithValue("slug", group.Slug!);
            await setSlug.ExecuteNonQueryAsync();
            Assert.Equal(1L, (long)(await new NpgsqlCommand("SELECT count(*) FROM public.\"Groups\"", runtime, transaction).ExecuteScalarAsync())!);
            Assert.Equal(0L, (long)(await new NpgsqlCommand("SELECT count(*) FROM public.\"Memberships\"", runtime, transaction).ExecuteScalarAsync())!);
            await transaction.RollbackAsync();
        }

        await using (var transaction = await runtime.BeginTransactionAsync())
        {
            await using var setToken = new NpgsqlCommand(
                "SELECT set_config('sonivo.invitation_token_hash', @token_hash, true)", runtime, transaction);
            setToken.Parameters.AddWithValue("token_hash", tokenHash);
            await setToken.ExecuteNonQueryAsync();
            Assert.Equal(1L, (long)(await new NpgsqlCommand("SELECT count(*) FROM public.\"Groups\"", runtime, transaction).ExecuteScalarAsync())!);
            Assert.Equal(1L, (long)(await new NpgsqlCommand("SELECT count(*) FROM public.\"Invitations\"", runtime, transaction).ExecuteScalarAsync())!);
            Assert.Equal(0L, (long)(await new NpgsqlCommand("SELECT count(*) FROM public.\"Memberships\"", runtime, transaction).ExecuteScalarAsync())!);
            await transaction.RollbackAsync();
        }
    }

    [Fact]
    public async Task Runtime_role_accepts_lowercase_hashed_invitation_under_rls()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(ownerConnectionString) || string.IsNullOrWhiteSpace(runtimeConnectionString)) return;

        var now = DateTimeOffset.UtcNow;
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(CreateInvitationHandler.TokenByteCount)).ToLowerInvariant();
        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
        var group = Group.Create($"RLS invite {Guid.NewGuid():N}", now);
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.AddRange(User(ownerId), User(memberId));
            ownerDb.Groups.Add(group);
            ownerDb.Memberships.Add(Membership.CreateOwner(group.Id, ownerId, now));
            ownerDb.Invitations.Add(Invitation.Create(group.Id, tokenHash, ownerId, now, now.AddDays(1)));
            await ownerDb.SaveChangesAsync();
        }

        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString)
            .Options;
        await using var runtimeDb = new SonivoDbContext(runtimeOptions);
        await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
        var scope = new EfGroupDatabaseScope(runtimeDb);
        await scope.SetAuthenticatedUserAsync(memberId, CancellationToken.None);
        var handler = new AcceptInvitationHandler(
            new EfGroupStore(runtimeDb),
            new EfInvitationStore(runtimeDb),
            new EfUnitOfWork(runtimeDb),
            new SystemClock(),
            scope);

        var result = await handler.HandleAsync(new AcceptInvitationCommand(memberId, token), CancellationToken.None);

        Assert.Equal(group.Id, result.GroupId);
        Assert.NotNull(await new EfGroupStore(runtimeDb).GetMembershipAsync(group.Id, memberId, CancellationToken.None));
        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task Runtime_role_can_create_only_the_authenticated_bootstrap_group_and_owner()
    {
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(runtimeConnectionString)) return;

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var group = Group.Create($"RLS bootstrap {Guid.NewGuid():N}", now);
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString)
            .Options;
        await using var db = new SonivoDbContext(options);
        await db.Database.OpenConnectionAsync();
        await using var transaction = await db.Database.BeginTransactionAsync();
        var scope = new EfGroupDatabaseScope(db);
        await scope.SetAuthenticatedUserAsync(userId, CancellationToken.None);
        await scope.SetGroupForBootstrapAsync(group.Id, CancellationToken.None);
        db.Users.Add(User(userId));
        db.Groups.Add(group);
        db.Memberships.Add(Membership.CreateOwner(group.Id, userId, now));
        await db.SaveChangesAsync();

        await using (var query = new NpgsqlCommand("SELECT count(*) FROM public.\"Groups\" WHERE \"Id\" = @id", (NpgsqlConnection)db.Database.GetDbConnection(), (NpgsqlTransaction)transaction.GetDbTransaction()))
        {
            query.Parameters.AddWithValue("id", group.Id);
            Assert.Equal(1L, (long)(await query.ExecuteScalarAsync())!);
        }

        await transaction.RollbackAsync();
    }

    private static async Task<int> CountAsync(NpgsqlConnection connection, Guid userId, Guid? groupId, string table)
    {
        await using var transaction = await connection.BeginTransactionAsync();
        await SetScopeAsync(connection, transaction, userId, groupId);
        await using var command = new NpgsqlCommand($"SELECT count(*) FROM public.\"{table}\"", connection, transaction);
        var result = (long)(await command.ExecuteScalarAsync())!;
        await transaction.RollbackAsync();
        return checked((int)result);
    }

    private static async Task SetScopeAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid userId,
        Guid? groupId)
    {
        await using var command = new NpgsqlCommand("""
            SELECT set_config('sonivo.user_id', @user_id, true),
                   set_config('sonivo.group_id', @group_id, true)
            """, connection, transaction);
        command.Parameters.AddWithValue("user_id", userId == Guid.Empty ? "" : userId.ToString("D"));
        command.Parameters.AddWithValue("group_id", groupId?.ToString("D") ?? "");
        await command.ExecuteNonQueryAsync();
    }

    private static ApplicationUser User(Guid id)
        => new()
        {
            Id = id,
            UserName = $"{id:N}@example.test",
            NormalizedUserName = $"{id:N}@EXAMPLE.TEST",
            Email = $"{id:N}@example.test",
            NormalizedEmail = $"{id:N}@EXAMPLE.TEST",
            DisplayName = "RLS integration test"
        };
}
