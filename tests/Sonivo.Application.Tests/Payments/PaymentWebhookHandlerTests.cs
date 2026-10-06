using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing.Payments;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Billing.Payments;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests.Payments;

public sealed class PaymentWebhookHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 6, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Applies_an_active_subscription_to_the_group()
    {
        var group = Group.Create("Band", Now);
        var store = new FakeGroupStore(group);
        var provider = new FakePaymentProvider(
            new VerifiedWebhook("evt_1", "subscription.updated", group.Id, PlanCatalog.Pro, BillingStatuses.Active, null, false));
        var handler = new ProcessPaymentWebhookHandler(provider, new FakeWebhookEventStore(), store, new FixedClock(Now));

        var result = await handler.HandleAsync("{}", "sha256=ok", CancellationToken.None);

        Assert.True(result.Accepted);
        Assert.False(result.Duplicate);
        Assert.Equal(PlanCatalog.Pro, group.PlanId);
        Assert.Equal(store.Updates, 1);
    }

    [Fact]
    public async Task Replayed_events_are_idempotent()
    {
        var group = Group.Create("Band", Now);
        var store = new FakeGroupStore(group);
        var provider = new FakePaymentProvider(
            new VerifiedWebhook("evt_dup", "subscription.updated", group.Id, PlanCatalog.Starter, BillingStatuses.Active, null, false));
        var handler = new ProcessPaymentWebhookHandler(provider, new FakeWebhookEventStore(), store, new FixedClock(Now));

        await handler.HandleAsync("{}", "sig", CancellationToken.None);
        var applied = store.Updates;
        var second = await handler.HandleAsync("{}", "sig", CancellationToken.None);

        Assert.True(second.Accepted);
        Assert.True(second.Duplicate);
        Assert.Equal(applied, store.Updates); // no second application
    }

    [Fact]
    public async Task Rejects_an_unverified_webhook_without_touching_the_group()
    {
        var group = Group.Create("Band", Now);
        var store = new FakeGroupStore(group);
        var handler = new ProcessPaymentWebhookHandler(
            new FakePaymentProvider(null), new FakeWebhookEventStore(), store, new FixedClock(Now));

        var result = await handler.HandleAsync("{}", signatureHeader: null, CancellationToken.None);

        Assert.False(result.Accepted);
        Assert.Equal("invalid-signature", result.Reason);
        Assert.Equal(PlanCatalog.DefaultPlanId, group.PlanId);
        Assert.Equal(store.Updates, 0);
    }

    [Fact]
    public async Task Cancellation_at_period_end_schedules_a_downgrade_to_starter()
    {
        var group = Group.Create("Band", Now);
        group.AssignPlan(PlanCatalog.Pro, Now);
        var store = new FakeGroupStore(group);
        var provider = new FakePaymentProvider(
            new VerifiedWebhook("evt_cancel", "subscription.updated", group.Id, PlanCatalog.Pro, BillingStatuses.Active, null, true));
        var handler = new ProcessPaymentWebhookHandler(provider, new FakeWebhookEventStore(), store, new FixedClock(Now));

        await handler.HandleAsync("{}", "sig", CancellationToken.None);

        Assert.Equal(PlanCatalog.Starter, group.ScheduledPlanId);
        Assert.Equal(PlanCatalog.Pro, group.PlanId);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow => now;
    }

    private sealed class FakePaymentProvider(VerifiedWebhook? webhook) : IPaymentProvider
    {
        public PaymentProviderKind Kind => PaymentProviderKind.Sandbox;

        public bool IsConfigured => true;

        public CheckoutSession CreateCheckoutSession(CheckoutRequest request) =>
            new("session", "https://example.test/checkout");

        public VerifiedWebhook? VerifyWebhook(string payload, string? signatureHeader) =>
            string.IsNullOrEmpty(signatureHeader) ? null : webhook;
    }

    private sealed class FakeWebhookEventStore : IWebhookEventStore
    {
        private readonly HashSet<string> _seen = [];

        public Task<bool> ExistsAsync(string eventId, CancellationToken cancellationToken) =>
            Task.FromResult(_seen.Contains(eventId));

        public Task RecordAsync(string eventId, string eventType, DateTimeOffset receivedAt, CancellationToken cancellationToken)
        {
            _seen.Add(eventId);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeGroupStore(Group group) : IGroupStore
    {
        public int Updates { get; private set; }

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken) =>
            Task.FromResult(group.Id == groupId ? group : null);

        public Task UpdateAsync(Group updated, CancellationToken cancellationToken)
        {
            Updates += 1;
            return Task.CompletedTask;
        }

        public Task AddAsync(Group newGroup, Membership ownerMembership, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
