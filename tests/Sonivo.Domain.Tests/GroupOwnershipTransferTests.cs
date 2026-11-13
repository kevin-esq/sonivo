using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public sealed class GroupOwnershipTransferTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-05T12:00:00Z");

    [Fact]
    public void Transfer_requires_recipient_acceptance_and_expires_after_seven_days()
    {
        var transfer = GroupOwnershipTransfer.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Now);

        Assert.True(transfer.IsPending);
        Assert.False(transfer.ExpireIfDue(Now.AddDays(6)));
        Assert.True(transfer.ExpireIfDue(Now.AddDays(7)));
        Assert.False(transfer.IsPending);
        Assert.Throws<InvalidOperationException>(() => transfer.Accept(transfer.ToUserId, Now.AddDays(7)));
    }

    [Fact]
    public void Only_recipient_can_accept_and_only_requesting_owner_can_cancel()
    {
        var transfer = GroupOwnershipTransfer.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Now);

        Assert.Throws<InvalidOperationException>(() => transfer.Accept(Guid.NewGuid(), Now));
        Assert.Throws<InvalidOperationException>(() => transfer.Cancel(Guid.NewGuid(), Now));
        transfer.Cancel(transfer.FromUserId, Now);
        Assert.False(transfer.IsPending);
    }
}
