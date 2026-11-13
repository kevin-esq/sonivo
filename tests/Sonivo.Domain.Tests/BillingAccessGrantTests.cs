using Sonivo.Domain.Billing;

namespace Sonivo.Domain.Tests;

public sealed class BillingAccessGrantTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-05T12:00:00Z");

    [Fact]
    public void Grant_requires_known_plan_reason_and_future_expiry()
    {
        var owner = Guid.NewGuid();
        var organization = Guid.NewGuid();
        Assert.Throws<ArgumentException>(() => BillingAccessGrant.Create(Guid.NewGuid(), new string('a', 64), organization,
            "unknown", Now, Now.AddDays(1), "support", owner, Now));
        Assert.Throws<ArgumentException>(() => BillingAccessGrant.Create(Guid.NewGuid(), new string('a', 64), organization,
            PlanCatalog.Pro, Now, Now.AddDays(1), " ", owner, Now));
        Assert.Throws<ArgumentException>(() => BillingAccessGrant.Create(Guid.NewGuid(), new string('a', 64), organization,
            PlanCatalog.Pro, Now, Now, "support", owner, Now));
    }

    [Fact]
    public void Grant_expires_at_boundary_and_revocation_is_idempotent()
    {
        var admin = Guid.NewGuid();
        var grant = BillingAccessGrant.Create(Guid.NewGuid(), new string('a', 64), Guid.NewGuid(),
            PlanCatalog.Pro, Now, Now.AddDays(1), "support case 12", admin, Now);

        Assert.True(grant.IsActive(Now));
        Assert.False(grant.IsActive(Now.AddDays(1)));
        grant.Revoke(admin, Now.AddHours(1));
        grant.Revoke(Guid.NewGuid(), Now.AddHours(2));

        Assert.False(grant.IsActive(Now.AddMinutes(30)));
        Assert.Equal(Now.AddHours(1), grant.RevokedAt);
        Assert.Equal(admin, grant.RevokedByUserId);
    }
}
