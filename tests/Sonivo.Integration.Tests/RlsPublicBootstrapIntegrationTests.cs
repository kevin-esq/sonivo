using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

[Collection(PostgresMigrationCollection.Name)]
public sealed class RlsPublicBootstrapIntegrationTests
{
    [Fact]
    public async Task Runtime_public_branding_returns_only_public_fields_and_unknown_slug_is_uniform()
    {
        var (ownerConnectionString, runtimeConnectionString) = RequiredConnectionStrings();
        var now = DateTimeOffset.UtcNow;
        var group = Group.Create("Public branding group", now, slug: $"public-{Guid.NewGuid():N}");
        var previousSlug = $"former-{Guid.NewGuid():N}";

        try
        {
            await using (var ownerDb = CreateDbContext(ownerConnectionString))
            {
                await ownerDb.Database.MigrateAsync();
                var branding = GroupBranding.Create(group.Id, now);
                branding.Update(
                    "Public name", "#112233", "#445566", null, null, null, null,
                    "system", "sonivo", "medium", null, null, null, null, "es",
                    "PRIVATE_WELCOME_MARKER", "Public headline", "PRIVATE_TAGLINE_MARKER",
                    "PRIVATE_VERSE_MARKER", false, now);
                ownerDb.Groups.Add(group);
                ownerDb.GroupBrandings.Add(branding);
                ownerDb.GroupSlugHistory.Add(GroupSlugHistory.Create(group.Id, previousSlug, now));
                await ownerDb.SaveChangesAsync();
            }

            await using var runtimeDb = CreateDbContext(runtimeConnectionString);
            var scope = new EfGroupDatabaseScope(runtimeDb);
            var handler = new GetPublicBrandingHandler(
                new EfGroupStore(runtimeDb),
                new EfGroupBrandingStore(runtimeDb),
                scope,
                new EfGroupDataOperation(runtimeDb, scope));

            var publicResult = await handler.HandleAsync(group.Slug!, CancellationToken.None);
            Assert.Equal("Public name", publicResult.Name);
            Assert.Equal("#112233", publicResult.AccentHex);
            Assert.Equal("#445566", publicResult.SecondaryHex);
            Assert.Equal("Public headline", publicResult.LoginHeadline);

            var historicalResult = await handler.HandleAsync(previousSlug, CancellationToken.None);
            Assert.Equal(publicResult, historicalResult);

            var json = JsonSerializer.SerializeToElement(publicResult, JsonSerializerOptions.Web);
            Assert.Equal(
                new[] { "accentHex", "bannerUrl", "loginHeadline", "logoUrl", "name", "secondaryHex" },
                json.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
            var serialized = json.GetRawText();
            Assert.DoesNotContain("PRIVATE_WELCOME_MARKER", serialized, StringComparison.Ordinal);
            Assert.DoesNotContain("PRIVATE_TAGLINE_MARKER", serialized, StringComparison.Ordinal);
            Assert.DoesNotContain("PRIVATE_VERSE_MARKER", serialized, StringComparison.Ordinal);

            var unknown = await handler.HandleAsync($"missing-{Guid.NewGuid():N}", CancellationToken.None);
            Assert.Equal(new PublicBrandingDto(null, null, null, null), unknown);
            Assert.Equal(
                JsonSerializer.Serialize(new PublicBrandingDto(null, null, null, null), JsonSerializerOptions.Web),
                JsonSerializer.Serialize(unknown, JsonSerializerOptions.Web));
        }
        finally
        {
            await DeleteSeededRowsAsync(ownerConnectionString, [group.Id], []);
        }
    }

    [Fact]
    public async Task Runtime_bootstrap_rejects_owner_for_another_user_or_group()
    {
        var (ownerConnectionString, runtimeConnectionString) = RequiredConnectionStrings();
        var now = DateTimeOffset.UtcNow;
        var authenticatedUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var unrelatedGroup = Group.Create($"Bootstrap unrelated {Guid.NewGuid():N}", now);

        var wrongUserGroup = Group.Create($"Bootstrap wrong user {Guid.NewGuid():N}", now);
        var mismatchedBootstrapGroup = Group.Create($"Bootstrap target {Guid.NewGuid():N}", now);
        try
        {
            await using (var ownerDb = CreateDbContext(ownerConnectionString))
            {
                await ownerDb.Database.MigrateAsync();
                ownerDb.Users.AddRange(User(authenticatedUserId), User(otherUserId));
                ownerDb.Groups.Add(unrelatedGroup);
                ownerDb.Memberships.Add(Membership.CreateOwner(unrelatedGroup.Id, otherUserId, now));
                await ownerDb.SaveChangesAsync();
            }

            await AssertBootstrapRejectedAsync(
                runtimeConnectionString, wrongUserGroup, authenticatedUserId, otherUserId, wrongUserGroup.Id);
            await AssertAbsentAsync(ownerConnectionString, wrongUserGroup.Id, unrelatedGroup.Id, otherUserId);

            await AssertBootstrapRejectedAsync(
                runtimeConnectionString, mismatchedBootstrapGroup, authenticatedUserId, authenticatedUserId, unrelatedGroup.Id);
            await AssertAbsentAsync(ownerConnectionString, mismatchedBootstrapGroup.Id, unrelatedGroup.Id, otherUserId);
        }
        finally
        {
            await DeleteSeededRowsAsync(ownerConnectionString,
                [unrelatedGroup.Id, wrongUserGroup.Id, mismatchedBootstrapGroup.Id],
                [authenticatedUserId, otherUserId]);
        }
    }

    [Fact]
    public async Task Runtime_invitation_selects_one_group_and_invalid_or_expired_tokens_do_not_mutate_memberships()
    {
        var (ownerConnectionString, runtimeConnectionString) = RequiredConnectionStrings();
        var now = DateTimeOffset.UtcNow;
        var ownerId = Guid.NewGuid();
        var inviteeId = Guid.NewGuid();
        var acceptedGroup = Group.Create($"Invitation target {Guid.NewGuid():N}", now);
        var expiredGroup = Group.Create($"Invitation expired {Guid.NewGuid():N}", now);
        var unrelatedGroup = Group.Create($"Invitation unrelated {Guid.NewGuid():N}", now);
        var validToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(CreateInvitationHandler.TokenByteCount)).ToLowerInvariant();
        var expiredToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(CreateInvitationHandler.TokenByteCount)).ToLowerInvariant();

        try
        {
            await using (var ownerDb = CreateDbContext(ownerConnectionString))
            {
                await ownerDb.Database.MigrateAsync();
                ownerDb.Users.AddRange(User(ownerId), User(inviteeId));
                ownerDb.Groups.AddRange(acceptedGroup, expiredGroup, unrelatedGroup);
                ownerDb.Memberships.AddRange(
                    Membership.CreateOwner(acceptedGroup.Id, ownerId, now),
                    Membership.CreateOwner(expiredGroup.Id, ownerId, now),
                    Membership.CreateOwner(unrelatedGroup.Id, ownerId, now));
                ownerDb.Invitations.AddRange(
                    Invitation.Create(acceptedGroup.Id, HashToken(validToken), ownerId, now, now.AddDays(1)),
                    Invitation.Create(expiredGroup.Id, HashToken(expiredToken), ownerId, now.AddDays(-2), now.AddDays(-1)));
                await ownerDb.SaveChangesAsync();
            }

            await using var runtimeDb = CreateDbContext(runtimeConnectionString);
            await using var transaction = await runtimeDb.Database.BeginTransactionAsync();
            var scope = new EfGroupDatabaseScope(runtimeDb);
            await scope.SetAuthenticatedUserAsync(inviteeId, CancellationToken.None);
            var handler = new AcceptInvitationHandler(
                new EfGroupStore(runtimeDb), new EfInvitationStore(runtimeDb),
                new EfUnitOfWork(runtimeDb), new SystemClock(), scope);

            await Assert.ThrowsAsync<ValidationException>(() =>
                handler.HandleAsync(new AcceptInvitationCommand(inviteeId, "not-a-valid-token"), CancellationToken.None));
            await Assert.ThrowsAsync<ValidationException>(() =>
                handler.HandleAsync(new AcceptInvitationCommand(inviteeId, expiredToken), CancellationToken.None));

            var accepted = await handler.HandleAsync(new AcceptInvitationCommand(inviteeId, validToken), CancellationToken.None);
            Assert.Equal(acceptedGroup.Id, accepted.GroupId);
            Assert.NotNull(await new EfGroupStore(runtimeDb).GetMembershipAsync(acceptedGroup.Id, inviteeId, CancellationToken.None));
            Assert.Null(await new EfGroupStore(runtimeDb).GetMembershipAsync(unrelatedGroup.Id, inviteeId, CancellationToken.None));
            await transaction.RollbackAsync();

            await using var verifyDb = CreateDbContext(ownerConnectionString);
            Assert.Null(await verifyDb.Memberships.SingleOrDefaultAsync(m => m.GroupId == acceptedGroup.Id && m.UserId == inviteeId));
            Assert.Null(await verifyDb.Memberships.SingleOrDefaultAsync(m => m.GroupId == expiredGroup.Id && m.UserId == inviteeId));
            Assert.Null(await verifyDb.Memberships.SingleOrDefaultAsync(m => m.GroupId == unrelatedGroup.Id && m.UserId == inviteeId));
        }
        finally
        {
            await DeleteSeededRowsAsync(ownerConnectionString,
                [acceptedGroup.Id, expiredGroup.Id, unrelatedGroup.Id], [ownerId, inviteeId]);
        }
    }

    private static async Task AssertBootstrapRejectedAsync(
        string runtimeConnectionString,
        Group insertedGroup,
        Guid authenticatedUserId,
        Guid ownerUserId,
        Guid membershipGroupId)
    {
        await using var db = CreateDbContext(runtimeConnectionString);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var scope = new EfGroupDatabaseScope(db);
        await scope.SetAuthenticatedUserAsync(authenticatedUserId, CancellationToken.None);
        await scope.SetGroupForBootstrapAsync(insertedGroup.Id, CancellationToken.None);
        db.Groups.Add(insertedGroup);
        db.Memberships.Add(Membership.CreateOwner(membershipGroupId, ownerUserId, DateTimeOffset.UtcNow));

        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains(FindPostgresException(exception), error => error.SqlState == "42501");
        await transaction.RollbackAsync();
    }

    private static async Task AssertAbsentAsync(
        string ownerConnectionString,
        Guid insertedGroupId,
        Guid unrelatedGroupId,
        Guid otherUserId)
    {
        await using var db = CreateDbContext(ownerConnectionString);
        Assert.Null(await db.Groups.SingleOrDefaultAsync(group => group.Id == insertedGroupId));
        Assert.NotNull(await db.Groups.SingleOrDefaultAsync(group => group.Id == unrelatedGroupId));
        Assert.NotNull(await db.Memberships.SingleOrDefaultAsync(membership =>
            membership.GroupId == unrelatedGroupId && membership.UserId == otherUserId && membership.Role == MembershipRoles.Owner));
    }

    private static async Task DeleteSeededRowsAsync(
        string ownerConnectionString,
        Guid[] groupIds,
        Guid[] userIds)
    {
        await using var db = CreateDbContext(ownerConnectionString);
        await db.Invitations.Where(invitation => groupIds.Contains(invitation.GroupId)).ExecuteDeleteAsync();
        await db.Memberships.Where(membership => groupIds.Contains(membership.GroupId)).ExecuteDeleteAsync();
        await db.GroupBrandings.Where(branding => groupIds.Contains(branding.GroupId)).ExecuteDeleteAsync();
        await db.GroupSlugHistory.Where(history => groupIds.Contains(history.GroupId)).ExecuteDeleteAsync();
        await db.Groups.Where(group => groupIds.Contains(group.Id)).ExecuteDeleteAsync();
        await db.Users.Where(user => userIds.Contains(user.Id)).ExecuteDeleteAsync();
    }

    private static IEnumerable<PostgresException> FindPostgresException(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgresException)
            {
                yield return postgresException;
            }
        }
    }

    private static (string Owner, string Runtime) RequiredConnectionStrings()
    {
        var owner = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtime = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        Assert.False(string.IsNullOrWhiteSpace(owner), "SONIVO_TEST_PG must point to an isolated PostgreSQL test database.");
        Assert.False(string.IsNullOrWhiteSpace(runtime), "SONIVO_RLS_TEST_PG must point to the constrained runtime login on the isolated PostgreSQL test database.");
        return (owner!, runtime!);
    }

    private static SonivoDbContext CreateDbContext(string connectionString)
        => new(new DbContextOptionsBuilder<SonivoDbContext>().UseNpgsql(connectionString).Options);

    private static string HashToken(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

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
