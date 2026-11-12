using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Payments;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

public sealed class BillingCreationGuardTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-03T12:00:00Z");

    [Fact]
    public async Task Expired_billing_blocks_new_content_and_deletion_until_reactivation()
    {
        var clock = new FixedClock();
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"billing-guard-{Guid.NewGuid():N}")
            .AddInterceptors(new BillingWriteInterceptor(clock)).Options;
        await using var db = new SonivoDbContext(options);
        var ownerId = Guid.NewGuid();
        var group = Group.Create("Billing Guard", Now);
        var organization = BillingOrganization.Create(ownerId, group.Id, Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Starter, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        db.Groups.Add(group);
        db.Memberships.Add(Membership.CreateOwner(group.Id, ownerId, Now));
        db.BillingOrganizations.Add(organization);
        db.BillingGroups.Add(new BillingGroup { GroupId = group.Id, OrganizationId = organization.Id });
        await db.SaveChangesAsync();

        organization.ApplySubscription("sub_1", PlanCatalog.Starter, "month", "canceled", Now, null, false, 0, Now);
        await db.SaveChangesAsync();
        var song = Song.Create(group.Id, "Existing content", SongOriginKinds.Original, Now);
        db.Songs.Add(song);
        await Assert.ThrowsAsync<ConflictException>(() => db.SaveChangesAsync());
        db.Entry(song).State = EntityState.Detached;

        organization.ApplySubscription("sub_1", PlanCatalog.Starter, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        await db.SaveChangesAsync();
        db.Songs.Add(song);
        await db.SaveChangesAsync();

        organization.ApplySubscription("sub_1", PlanCatalog.Starter, "month", "canceled", Now, null, false, 0, Now);
        db.Songs.Remove(song);
        await Assert.ThrowsAsync<ConflictException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task New_group_creation_obeys_account_plan_capacity()
    {
        var clock = new FixedClock();
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"billing-groups-{Guid.NewGuid():N}")
            .AddInterceptors(new BillingWriteInterceptor(clock)).Options;
        await using var db = new SonivoDbContext(options);
        var ownerId = Guid.NewGuid();
        var primary = Group.Create("Primary", Now);
        var organization = BillingOrganization.Create(ownerId, primary.Id, Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Starter, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        db.Groups.Add(primary);
        db.Memberships.Add(Membership.CreateOwner(primary.Id, ownerId, Now));
        db.BillingOrganizations.Add(organization);
        db.BillingGroups.Add(new BillingGroup { GroupId = primary.Id, OrganizationId = organization.Id });
        await db.SaveChangesAsync();

        var second = Group.Create("Second", Now);
        db.Groups.Add(second);
        db.BillingGroups.Add(new BillingGroup { GroupId = second.Id, OrganizationId = organization.Id });
        db.Memberships.Add(Membership.CreateOwner(second.Id, ownerId, Now));

        await Assert.ThrowsAsync<ConflictException>(() => db.SaveChangesAsync());
    }

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow => Now;
    }
}
