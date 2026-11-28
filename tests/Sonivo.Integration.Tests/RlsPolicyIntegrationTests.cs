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
    public async Task Runtime_role_does_not_leak_group_context_across_transactions_on_reused_connection()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString),
            "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString),
            "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();
        var groupA = Group.Create($"RLS pooler A {Guid.NewGuid():N}", now);
        var groupB = Group.Create($"RLS pooler B {Guid.NewGuid():N}", now);
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.AddRange(User(userA), User(userB));
            ownerDb.Groups.AddRange(groupA, groupB);
            ownerDb.Memberships.AddRange(
                Membership.CreateOwner(groupA.Id, userA, now),
                Membership.CreateOwner(groupB.Id, userB, now));
            await ownerDb.SaveChangesAsync();
        }

        // Reusing one physical connection models sequential transactions on a transaction pooler's backend.
        await using var runtime = new NpgsqlConnection(runtimeConnectionString);
        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtime)
            .Options;
        await using var runtimeDb = new SonivoDbContext(runtimeOptions);
        await runtimeDb.Database.OpenConnectionAsync();
        var scope = new EfGroupDatabaseScope(runtimeDb);
        var backendPid = await ReadBackendPidAsync(runtime);
        Assert.True(await RuntimeRoleIsConstrainedAsync(runtime));

        await using (var transaction = await runtimeDb.Database.BeginTransactionAsync())
        {
            await scope.SetAuthenticatedUserAsync(userA, CancellationToken.None);
            await scope.SetVerifiedGroupAsync(groupA.Id, CancellationToken.None);
            var dbTransaction = (NpgsqlTransaction)transaction.GetDbTransaction();
            Assert.Equal(1, await CountGroupAsync(runtime, dbTransaction, groupA.Id));
            Assert.Equal(0, await CountGroupAsync(runtime, dbTransaction, groupB.Id));
            Assert.Equal(1, await UpdateGroupNameAsync(runtime, dbTransaction, groupA.Id));
            Assert.Equal(0, await UpdateGroupNameAsync(runtime, dbTransaction, groupB.Id));
            await transaction.CommitAsync();
        }

        Assert.Equal(backendPid, await ReadBackendPidAsync(runtime));
        await AssertNoTenantContextAsync(runtime);
        Assert.Equal(0, await CountGroupsWithoutContextAsync(runtime));

        await using (var transaction = await runtimeDb.Database.BeginTransactionAsync())
        {
            await scope.SetAuthenticatedUserAsync(userB, CancellationToken.None);
            await scope.SetVerifiedGroupAsync(groupB.Id, CancellationToken.None);
            var dbTransaction = (NpgsqlTransaction)transaction.GetDbTransaction();
            Assert.Equal(0, await CountGroupAsync(runtime, dbTransaction, groupA.Id));
            Assert.Equal(1, await CountGroupAsync(runtime, dbTransaction, groupB.Id));
            Assert.Equal(0, await UpdateGroupNameAsync(runtime, dbTransaction, groupA.Id));
            Assert.Equal(1, await UpdateGroupNameAsync(runtime, dbTransaction, groupB.Id));
            await transaction.RollbackAsync();
        }

        Assert.Equal(backendPid, await ReadBackendPidAsync(runtime));
        await AssertNoTenantContextAsync(runtime);
        Assert.Equal(0, await CountGroupsWithoutContextAsync(runtime));

        await using (var transaction = await runtimeDb.Database.BeginTransactionAsync())
        {
            await scope.SetAuthenticatedUserAsync(userA, CancellationToken.None);
            await using var setMalformedGroup = new NpgsqlCommand(
                "SELECT set_config('sonivo.group_id', 'not-a-guid', true)",
                runtime,
                (NpgsqlTransaction)transaction.GetDbTransaction());
            await setMalformedGroup.ExecuteNonQueryAsync();
            Assert.Equal(0, await CountGroupAsync(
                runtime,
                (NpgsqlTransaction)transaction.GetDbTransaction(),
                groupA.Id));
            await transaction.CommitAsync();
        }

        await AssertNoTenantContextAsync(runtime);
        Assert.Equal(0, await CountGroupsWithoutContextAsync(runtime));
        await runtimeDb.Database.CloseConnectionAsync();
    }

    [Fact]
    public async Task Retry_replays_whole_group_transaction_without_duplicate_writes_or_leaking_scope()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var group = Group.Create($"RLS retry {Guid.NewGuid():N}", now);
        var songId = Guid.NewGuid();
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.Add(User(userId));
            ownerDb.Groups.Add(group);
            ownerDb.Memberships.Add(Membership.CreateOwner(group.Id, userId, now));
            await ownerDb.SaveChangesAsync();
        }

        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString, npgsql => npgsql.EnableRetryOnFailure(
                maxRetryCount: 1,
                maxRetryDelay: TimeSpan.FromMilliseconds(1),
                errorCodesToAdd: null))
            .Options;
        await using var runtimeDb = new SonivoDbContext(runtimeOptions);
        await runtimeDb.Database.OpenConnectionAsync();
        var scope = new EfGroupDatabaseScope(runtimeDb);
        var operation = new EfGroupDataOperation(runtimeDb, scope);
        var attempts = 0;

        var result = await operation.ExecuteAsUserAsync(
            userId,
            async cancellationToken =>
            {
                attempts++;
                Assert.NotNull(runtimeDb.Database.CurrentTransaction);
                await scope.SetVerifiedGroupAsync(group.Id, cancellationToken);
                runtimeDb.Songs.Add(Song.Create(
                    group.Id,
                    "Retry boundary song",
                    SongOriginKinds.Original,
                    now,
                    id: songId));
                await runtimeDb.SaveChangesAsync(cancellationToken);

                if (attempts == 1)
                {
                    throw new PostgresException(
                        "Simulated serialization failure.",
                        "ERROR",
                        "ERROR",
                        PostgresErrorCodes.SerializationFailure);
                }

                return songId;
            },
            CancellationToken.None);

        Assert.Equal(songId, result);
        Assert.Equal(2, attempts);
        Assert.Null(runtimeDb.Database.CurrentTransaction);

        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            Assert.Equal(1, await ownerDb.Songs.CountAsync(song => song.Id == songId));
        }

        await using (var command = new NpgsqlCommand(
            "SELECT current_setting('sonivo.user_id', true), current_setting('sonivo.group_id', true)",
            (NpgsqlConnection)runtimeDb.Database.GetDbConnection()))
        await using (var reader = await command.ExecuteReaderAsync())
        {
            Assert.True(await reader.ReadAsync());
            Assert.True(reader.IsDBNull(0) || string.IsNullOrEmpty(reader.GetString(0)));
            Assert.True(reader.IsDBNull(1) || string.IsNullOrEmpty(reader.GetString(1)));
        }

        await runtimeDb.Database.CloseConnectionAsync();
    }

    private static async Task<bool> RuntimeRoleIsConstrainedAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand("""
            SELECT session_user = current_user
               AND current_user = 'sonivo_app'
               AND NOT r.rolsuper
               AND NOT r.rolbypassrls
            FROM pg_catalog.pg_roles AS r
            WHERE r.rolname = current_user
            """, connection);
        return (bool)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<int> ReadBackendPidAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand("SELECT pg_backend_pid()", connection);
        return (int)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<int> CountGroupAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid groupId)
    {
        await using var command = new NpgsqlCommand(
            "SELECT count(*) FROM public.\"Groups\" WHERE \"Id\" = @group_id",
            connection,
            transaction);
        command.Parameters.AddWithValue("group_id", groupId);
        return checked((int)(long)(await command.ExecuteScalarAsync())!);
    }

    private static async Task<int> UpdateGroupNameAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid groupId)
    {
        await using var command = new NpgsqlCommand(
            "UPDATE public.\"Groups\" SET \"Name\" = \"Name\" WHERE \"Id\" = @group_id",
            connection,
            transaction);
        command.Parameters.AddWithValue("group_id", groupId);
        return await command.ExecuteNonQueryAsync();
    }

    private static async Task<int> CountGroupsWithoutContextAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand("SELECT count(*) FROM public.\"Groups\"", connection);
        return checked((int)(long)(await command.ExecuteScalarAsync())!);
    }

    private static async Task AssertNoTenantContextAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand("""
            SELECT current_setting('sonivo.user_id', true), current_setting('sonivo.group_id', true)
            """, connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.True(string.IsNullOrEmpty(reader.IsDBNull(0) ? null : reader.GetString(0)));
        Assert.True(string.IsNullOrEmpty(reader.IsDBNull(1) ? null : reader.GetString(1)));
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
    public async Task Runtime_role_group_slug_lookup_exposes_only_the_exact_selected_slug()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var memberGroup = Group.Create($"RLS slug member {Guid.NewGuid():N}", now);
        var selectedGroup = Group.Create(
            "RLS slug selected", now, slug: $"rls-{Guid.NewGuid():N}");
        var unrelatedGroup = Group.Create(
            "RLS slug unrelated", now, slug: $"rls-{Guid.NewGuid():N}");
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.Add(User(userId));
            ownerDb.Groups.AddRange(memberGroup, selectedGroup, unrelatedGroup);
            ownerDb.Memberships.Add(Membership.CreateOwner(memberGroup.Id, userId, now));
            await ownerDb.SaveChangesAsync();
        }

        await using var runtime = new NpgsqlConnection(runtimeConnectionString);
        await runtime.OpenAsync();
        await using var transaction = await runtime.BeginTransactionAsync();
        await using var setUser = new NpgsqlCommand(
            "SELECT set_config('sonivo.user_id', @user_id, true)", runtime, transaction);
        setUser.Parameters.AddWithValue("user_id", userId.ToString("D"));
        await setUser.ExecuteNonQueryAsync();

        await using var setSelectedSlug = new NpgsqlCommand(
            "SELECT set_config('sonivo.group_slug_lookup', @slug, true)", runtime, transaction);
        setSelectedSlug.Parameters.AddWithValue("slug", selectedGroup.Slug!);
        await setSelectedSlug.ExecuteNonQueryAsync();

        await using var selected = new NpgsqlCommand(
            "SELECT \"Id\" FROM public.\"Groups\" WHERE \"Slug\" = @slug", runtime, transaction);
        selected.Parameters.AddWithValue("slug", selectedGroup.Slug!);
        Assert.Equal(selectedGroup.Id, (Guid)(await selected.ExecuteScalarAsync())!);

        await using var unrelated = new NpgsqlCommand(
            "SELECT count(*) FROM public.\"Groups\" WHERE \"Slug\" = @slug", runtime, transaction);
        unrelated.Parameters.AddWithValue("slug", unrelatedGroup.Slug!);
        Assert.Equal(0L, (long)(await unrelated.ExecuteScalarAsync())!);

        var missingSlug = $"rls-{Guid.NewGuid():N}";
        await using var setMissingSlug = new NpgsqlCommand(
            "SELECT set_config('sonivo.group_slug_lookup', @slug, true)", runtime, transaction);
        setMissingSlug.Parameters.AddWithValue("slug", missingSlug);
        await setMissingSlug.ExecuteNonQueryAsync();
        await using var missing = new NpgsqlCommand(
            "SELECT count(*) FROM public.\"Groups\" WHERE \"Slug\" = @slug", runtime, transaction);
        missing.Parameters.AddWithValue("slug", missingSlug);
        Assert.Equal(0L, (long)(await missing.ExecuteScalarAsync())!);

        await transaction.RollbackAsync();
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

    [Fact]
    public async Task Runtime_role_enforces_resource_ancestry_and_rejects_malformed_group_scope()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var memberGroup = Group.Create($"RLS resource member {Guid.NewGuid():N}", now);
        var foreignGroup = Group.Create($"RLS resource foreign {Guid.NewGuid():N}", now);
        var memberSong = Song.Create(memberGroup.Id, "Member song", SongOriginKinds.Original, now);
        var foreignSong = Song.Create(foreignGroup.Id, "Foreign song", SongOriginKinds.Original, now);
        var memberArrangement = Arrangement.Create(memberGroup.Id, memberSong.Id, "Member arrangement", now);
        var foreignArrangement = Arrangement.Create(foreignGroup.Id, foreignSong.Id, "Foreign arrangement", now);
        var memberResource = Resource.CreateLink(
            memberArrangement.Id, ResourcePurposes.Chart, "Member chart", "https://example.test/member-chart", now);
        var foreignResource = Resource.CreateLink(
            foreignArrangement.Id, ResourcePurposes.Chart, "Foreign chart", "https://example.test/chart", now);

        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.Add(User(userId));
            ownerDb.Groups.AddRange(memberGroup, foreignGroup);
            ownerDb.Memberships.Add(Membership.CreateOwner(memberGroup.Id, userId, now));
            ownerDb.Songs.AddRange(memberSong, foreignSong);
            ownerDb.Arrangements.AddRange(memberArrangement, foreignArrangement);
            ownerDb.Resources.AddRange(memberResource, foreignResource);
            await ownerDb.SaveChangesAsync();
            Assert.Equal(1, await ownerDb.Resources.CountAsync(resource => resource.Id == foreignResource.Id));
            Assert.Equal(1, await ownerDb.Resources.CountAsync(resource => resource.Id == memberResource.Id));
        }

        await using var runtime = new NpgsqlConnection(runtimeConnectionString);
        await runtime.OpenAsync();
        await using (var transaction = await runtime.BeginTransactionAsync())
        {
            await SetScopeAsync(runtime, transaction, userId, memberGroup.Id);

            await using var read = new NpgsqlCommand(
                "SELECT count(*) FROM public.\"Resources\"", runtime, transaction);
            Assert.Equal(1L, (long)(await read.ExecuteScalarAsync())!);

            await using var foreignRead = new NpgsqlCommand(
                "SELECT count(*) FROM public.\"Resources\" WHERE \"Id\" = @id", runtime, transaction);
            foreignRead.Parameters.AddWithValue("id", foreignResource.Id);
            Assert.Equal(0L, (long)(await foreignRead.ExecuteScalarAsync())!);

            await using var update = new NpgsqlCommand(
                "UPDATE public.\"Resources\" SET \"Label\" = 'unauthorized' WHERE \"Id\" = @id",
                runtime, transaction);
            update.Parameters.AddWithValue("id", foreignResource.Id);
            Assert.Equal(0, await update.ExecuteNonQueryAsync());

            await using var delete = new NpgsqlCommand(
                "DELETE FROM public.\"Resources\" WHERE \"Id\" = @id", runtime, transaction);
            delete.Parameters.AddWithValue("id", foreignResource.Id);
            Assert.Equal(0, await delete.ExecuteNonQueryAsync());

            await using var insert = new NpgsqlCommand("""
                INSERT INTO public."Resources"
                    ("Id", "ArrangementId", "Kind", "Purpose", "Label", "CreatedAt")
                VALUES (@id, @arrangement_id, 'link', 'chart', 'unauthorized', @created_at)
                """, runtime, transaction);
            insert.Parameters.AddWithValue("id", Guid.NewGuid());
            insert.Parameters.AddWithValue("arrangement_id", foreignArrangement.Id);
            insert.Parameters.AddWithValue("created_at", now);
            var insertError = await Assert.ThrowsAsync<PostgresException>(() => insert.ExecuteNonQueryAsync());
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, insertError.SqlState);
            await transaction.RollbackAsync();
        }

        await using (var transaction = await runtime.BeginTransactionAsync())
        {
            await using var malformedScope = new NpgsqlCommand("""
                SELECT set_config('sonivo.user_id', @user_id, true),
                       set_config('sonivo.group_id', 'not-a-guid', true)
                """, runtime, transaction);
            malformedScope.Parameters.AddWithValue("user_id", userId.ToString("D"));
            await malformedScope.ExecuteNonQueryAsync();

            await using var read = new NpgsqlCommand(
                "SELECT count(*) FROM public.\"Groups\"", runtime, transaction);
            Assert.Equal(0L, (long)(await read.ExecuteScalarAsync())!);
            await transaction.RollbackAsync();
        }
    }

    [Fact]
    public async Task Item_deny_still_hides_resource_that_runtime_rls_allows()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var group = Group.Create($"RLS resource grant {Guid.NewGuid():N}", now);
        var song = Song.Create(group.Id, "Granted song", SongOriginKinds.Original, now);
        var arrangement = Arrangement.Create(group.Id, song.Id, "Granted arrangement", now);
        var resource = Resource.CreateLink(
            arrangement.Id, ResourcePurposes.Chart, "Denied chart", "https://example.test/denied-chart", now);

        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.AddRange(User(ownerId), User(memberId));
            ownerDb.Groups.Add(group);
            ownerDb.Memberships.AddRange(
                Membership.CreateOwner(group.Id, ownerId, now),
                Membership.CreateMember(group.Id, memberId, now));
            ownerDb.Songs.Add(song);
            ownerDb.Arrangements.Add(arrangement);
            ownerDb.Resources.Add(resource);
            ownerDb.ResourceGrants.Add(ResourceGrant.Create(
                group.Id,
                memberId,
                ResourceGrant.ResourceTypes.Resource,
                resource.Id,
                granted: false,
                now,
                grantedByUserId: ownerId));
            await ownerDb.SaveChangesAsync();
        }

        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString)
            .Options;
        await using var runtimeDb = new SonivoDbContext(runtimeOptions);
        await runtimeDb.Database.OpenConnectionAsync();
        await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
        var scope = new EfGroupDatabaseScope(runtimeDb);
        await scope.SetAuthenticatedUserAsync(memberId, CancellationToken.None);
        await scope.SetVerifiedGroupAsync(group.Id, CancellationToken.None);

        Assert.True(await runtimeDb.Resources.AnyAsync(item => item.Id == resource.Id));
        var grants = new EfResourceGrantStore(runtimeDb);
        Assert.False((await grants.FindAsync(
            group.Id,
            memberId,
            ResourceGrant.ResourceTypes.Resource,
            resource.Id,
            CancellationToken.None))!.Granted);

        var access = new GroupAccessService(
            new EfGroupStore(runtimeDb),
            new EfGroupRoleStore(runtimeDb),
            grants,
            databaseScope: scope);
        var handler = new ListGroupResourcesHandler(
            access,
            new EfResourceStore(runtimeDb),
            new EfArrangementStore(runtimeDb),
            new EfSongStore(runtimeDb));

        var visible = await handler.HandleAsync(
            new ListGroupResourcesQuery(memberId, group.Id),
            CancellationToken.None);

        Assert.Empty(visible);
        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task Runtime_rls_and_group_role_allow_only_arrangements_with_an_item_grant()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var group = Group.Create($"RLS resource role {Guid.NewGuid():N}", now);
        var role = GroupRole.Create(group.Id, "Song reader", now, [GroupPermissions.SongView]);
        var song = Song.Create(group.Id, "Scoped song", SongOriginKinds.Original, now);
        var grantedArrangement = Arrangement.Create(group.Id, song.Id, "Granted arrangement", now);
        var restrictedArrangement = Arrangement.Create(group.Id, song.Id, "Restricted arrangement", now);
        var grantedResource = Resource.CreateLink(
            grantedArrangement.Id, ResourcePurposes.Chart, "Granted chart", "https://example.test/granted", now);
        var restrictedResource = Resource.CreateLink(
            restrictedArrangement.Id, ResourcePurposes.Chart, "Restricted chart", "https://example.test/restricted", now);
        var member = Membership.CreateMember(group.Id, memberId, now);
        member.AssignGroupRole(role.Id);

        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.AddRange(User(ownerId), User(memberId));
            ownerDb.Groups.Add(group);
            ownerDb.Memberships.AddRange(Membership.CreateOwner(group.Id, ownerId, now), member);
            ownerDb.GroupRoles.Add(role);
            ownerDb.Songs.Add(song);
            ownerDb.Arrangements.AddRange(grantedArrangement, restrictedArrangement);
            ownerDb.Resources.AddRange(grantedResource, restrictedResource);
            ownerDb.ResourceGrants.Add(ResourceGrant.Create(
                group.Id,
                memberId,
                ResourceGrant.ResourceTypes.Arrangement,
                grantedArrangement.Id,
                granted: true,
                now,
                grantedByUserId: ownerId));
            await ownerDb.SaveChangesAsync();
        }

        var runtimeOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(runtimeConnectionString)
            .Options;
        await using var runtimeDb = new SonivoDbContext(runtimeOptions);
        await runtimeDb.Database.OpenConnectionAsync();
        await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
        var scope = new EfGroupDatabaseScope(runtimeDb);
        await scope.SetAuthenticatedUserAsync(memberId, CancellationToken.None);
        await scope.SetVerifiedGroupAsync(group.Id, CancellationToken.None);

        Assert.Equal(2, await runtimeDb.Resources.CountAsync());
        var runtimeRole = await new EfGroupRoleStore(runtimeDb).GetAsync(
            group.Id, role.Id, CancellationToken.None);
        Assert.NotNull(runtimeRole);
        Assert.Contains(GroupPermissions.SongView, runtimeRole.PermissionList);
        Assert.DoesNotContain(GroupPermissions.ArrangementView, runtimeRole.PermissionList);
        Assert.DoesNotContain(GroupPermissions.ResourceView, runtimeRole.PermissionList);

        var access = new GroupAccessService(
            new EfGroupStore(runtimeDb),
            new EfGroupRoleStore(runtimeDb),
            new EfResourceGrantStore(runtimeDb),
            databaseScope: scope);
        var handler = new ListGroupResourcesHandler(
            access,
            new EfResourceStore(runtimeDb),
            new EfArrangementStore(runtimeDb),
            new EfSongStore(runtimeDb));

        var visible = await handler.HandleAsync(
            new ListGroupResourcesQuery(memberId, group.Id),
            CancellationToken.None);

        var item = Assert.Single(visible);
        Assert.Equal(grantedResource.Id, item.Id);
        Assert.NotEqual(restrictedResource.Id, item.Id);
        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task Runtime_role_cannot_distinguish_cross_group_event_from_missing_event_by_rsvp_insert()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(ownerConnectionString), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtimeConnectionString), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");

        var now = DateTimeOffset.UtcNow;
        var userId = Guid.NewGuid();
        var memberGroup = Group.Create($"RLS FK member {Guid.NewGuid():N}", now);
        var foreignGroup = Group.Create($"RLS FK foreign {Guid.NewGuid():N}", now);
        var foreignEvent = Event.Create(foreignGroup.Id, "Foreign event", EventTypes.Other, now.AddDays(1), now);
        var ownerOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(ownerConnectionString)
            .Options;
        await using (var ownerDb = new SonivoDbContext(ownerOptions))
        {
            await ownerDb.Database.MigrateAsync();
            ownerDb.Users.Add(User(userId));
            ownerDb.Groups.AddRange(memberGroup, foreignGroup);
            ownerDb.Memberships.Add(Membership.CreateOwner(memberGroup.Id, userId, now));
            ownerDb.Events.Add(foreignEvent);
            await ownerDb.SaveChangesAsync();
        }

        await using var runtime = new NpgsqlConnection(runtimeConnectionString);
        await runtime.OpenAsync();

        async Task<PostgresException> AttemptRsvpAsync(Guid eventId)
        {
            await using var transaction = await runtime.BeginTransactionAsync();
            await SetScopeAsync(runtime, transaction, userId, memberGroup.Id);
            await using var insert = new NpgsqlCommand("""
                INSERT INTO public."Rsvps" ("Id", "EventId", "UserId", "Response", "UpdatedAt")
                VALUES (@id, @event_id, @user_id, 'yes', @updated_at)
                """, runtime, transaction);
            insert.Parameters.AddWithValue("id", Guid.NewGuid());
            insert.Parameters.AddWithValue("event_id", eventId);
            insert.Parameters.AddWithValue("user_id", userId);
            insert.Parameters.AddWithValue("updated_at", now);
            var error = await Assert.ThrowsAsync<PostgresException>(() => insert.ExecuteNonQueryAsync());
            await transaction.RollbackAsync();
            return error;
        }

        var foreignEventError = await AttemptRsvpAsync(foreignEvent.Id);
        var missingEventError = await AttemptRsvpAsync(Guid.NewGuid());
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, foreignEventError.SqlState);
        Assert.Equal(foreignEventError.SqlState, missingEventError.SqlState);
        Assert.Equal(foreignEventError.Message, missingEventError.Message);
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
