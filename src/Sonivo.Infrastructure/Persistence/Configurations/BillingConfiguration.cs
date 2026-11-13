using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Payments;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class BillingOrganizationConfiguration : IEntityTypeConfiguration<BillingOrganization>
{
    public void Configure(EntityTypeBuilder<BillingOrganization> b)
    {
        b.ToTable("BillingOrganizations"); b.HasKey(x => x.Id);
        b.Property(x => x.Provider).HasMaxLength(20);
        b.Property(x => x.Environment).HasMaxLength(16);
        b.Property(x => x.CustomerId).HasMaxLength(200);
        b.Property(x => x.SubscriptionId).HasMaxLength(200);
        b.Property(x => x.PlanId).HasMaxLength(16);
        b.Property(x => x.Interval).HasMaxLength(8);
        b.Property(x => x.Status).HasMaxLength(32);
        b.Property(x => x.ScheduledPlanId).HasMaxLength(16);
        b.Property(x => x.ScheduledInterval).HasMaxLength(8);
        b.Property(x => x.Version).IsConcurrencyToken();
        b.Property(x => x.PrimaryGroupId).IsRequired(false);
        b.HasIndex(x => new { x.Environment, x.CustomerId }).IsUnique();
        b.HasIndex(x => new { x.Environment, x.SubscriptionId }).IsUnique();
        b.HasIndex(x => x.OwnerUserId);
    }
}

public sealed class BillingAccessGrantConfiguration : IEntityTypeConfiguration<BillingAccessGrant>
{
    public void Configure(EntityTypeBuilder<BillingAccessGrant> b)
    {
        b.ToTable("BillingAccessGrants"); b.HasKey(x => x.Id);
        b.Property(x => x.PlanId).HasMaxLength(16);
        b.Property(x => x.RequestFingerprint).HasMaxLength(64);
        b.Property(x => x.Reason).HasMaxLength(500);
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => x.OperationId).IsUnique();
        b.HasIndex(x => new { x.OrganizationId, x.StartsAt, x.ExpiresAt, x.RevokedAt });
    }
}

public sealed class BillingReferralCodeConfiguration : IEntityTypeConfiguration<BillingReferralCode>
{
    public void Configure(EntityTypeBuilder<BillingReferralCode> b)
    {
        b.ToTable("BillingReferralCodes"); b.HasKey(x => x.OrganizationId);
        b.Property(x => x.Environment).HasMaxLength(16); b.Property(x => x.Code).HasMaxLength(32);
        b.HasIndex(x => new { x.Environment, x.Code }).IsUnique();
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class BillingReferralAttributionConfiguration : IEntityTypeConfiguration<BillingReferralAttribution>
{
    public void Configure(EntityTypeBuilder<BillingReferralAttribution> b)
    {
        b.ToTable("BillingReferralAttributions"); b.HasKey(x => x.ReferredOrganizationId);
        b.Property(x => x.Code).HasMaxLength(32); b.Property(x => x.QualifiedInvoiceId).HasMaxLength(200);
        b.Property(x => x.QualifiedEventId).HasMaxLength(200);
        b.HasIndex(x => x.QualifiedInvoiceId).IsUnique().HasFilter("\"QualifiedInvoiceId\" IS NOT NULL");
        b.HasIndex(x => x.QualifiedEventId).IsUnique().HasFilter("\"QualifiedEventId\" IS NOT NULL");
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.ReferredOrganizationId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.ReferrerOrganizationId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class BillingReferralRewardConfiguration : IEntityTypeConfiguration<BillingReferralReward>
{
    public void Configure(EntityTypeBuilder<BillingReferralReward> b)
    {
        b.ToTable("BillingReferralRewards"); b.HasKey(x => x.Id);
        b.Property(x => x.Environment).HasMaxLength(16); b.Property(x => x.InvoiceId).HasMaxLength(200);
        b.Property(x => x.EventId).HasMaxLength(200); b.Property(x => x.Status).HasMaxLength(16);
        b.Property(x => x.PendingReason).HasMaxLength(64);
        b.HasIndex(x => new { x.Environment, x.InvoiceId }).IsUnique();
        b.HasIndex(x => new { x.Environment, x.EventId }).IsUnique();
        b.HasIndex(x => x.ReferredOrganizationId).IsUnique();
        b.HasIndex(x => new { x.Status, x.NextAttemptAt });
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.ReferrerOrganizationId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.ReferredOrganizationId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class BillingFinancialEventConfiguration : IEntityTypeConfiguration<BillingFinancialEvent>
{
    public void Configure(EntityTypeBuilder<BillingFinancialEvent> b)
    {
        b.ToTable("BillingFinancialEvents"); b.HasKey(x => new { x.Environment, x.EventId });
        b.Property(x => x.Environment).HasMaxLength(16); b.Property(x => x.EventId).HasMaxLength(200);
        b.Property(x => x.EventType).HasMaxLength(100); b.Property(x => x.InvoiceId).HasMaxLength(200);
        b.Property(x => x.SubscriptionId).HasMaxLength(200);
        b.Property(x => x.PaymentIntentId).HasMaxLength(200); b.Property(x => x.RefundId).HasMaxLength(200);
        b.Property(x => x.DisputeId).HasMaxLength(200); b.Property(x => x.Currency).HasMaxLength(3);
        b.Property(x => x.Status).HasMaxLength(32);
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class BillingAccountingOutboxConfiguration : IEntityTypeConfiguration<BillingAccountingOutbox>
{
    public void Configure(EntityTypeBuilder<BillingAccountingOutbox> b)
    {
        b.ToTable("BillingAccountingOutbox"); b.HasKey(x => new { x.Environment, x.EventId });
        b.Property(x => x.Environment).HasMaxLength(16); b.Property(x => x.EventId).HasMaxLength(200);
        b.Property(x => x.Payload).HasMaxLength(16000);
        b.HasIndex(x => new { x.DeliveredAt, x.NextAttemptAt });
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class BillingGroupConfiguration : IEntityTypeConfiguration<BillingGroup>
{
    public void Configure(EntityTypeBuilder<BillingGroup> b)
    {
        b.ToTable("BillingGroups"); b.HasKey(x => x.GroupId);
        b.Property(x => x.LegacyPlanId).HasMaxLength(16);
        b.HasOne<Group>().WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<BillingOrganization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class BillingTrialConfiguration : IEntityTypeConfiguration<BillingTrial>
{
    public void Configure(EntityTypeBuilder<BillingTrial> b)
    { b.ToTable("BillingTrials"); b.HasKey(x => x.OrganizationId); }
}

public sealed class BillingOperationConfiguration : IEntityTypeConfiguration<BillingOperation>
{
    public void Configure(EntityTypeBuilder<BillingOperation> b)
    {
        b.ToTable("BillingOperations"); b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasMaxLength(120); b.Property(x => x.Kind).HasMaxLength(32);
        b.Property(x => x.Fingerprint).HasMaxLength(64); b.Property(x => x.Result).HasMaxLength(4096);
    }
}

public sealed class BillingInboxConfiguration : IEntityTypeConfiguration<BillingInboxEvent>
{
    public void Configure(EntityTypeBuilder<BillingInboxEvent> b)
    {
        b.ToTable("BillingInbox"); b.HasKey(x => new { x.Environment, x.Id });
        b.Property(x => x.Id).HasMaxLength(200); b.Property(x => x.Type).HasMaxLength(100);
        b.Property(x => x.Environment).HasMaxLength(16); b.Property(x => x.ErrorCode).HasMaxLength(64);
        b.Property(x => x.CustomerId).HasMaxLength(200); b.Property(x => x.SubscriptionId).HasMaxLength(200);
        b.Property(x => x.InvoiceId).HasMaxLength(200); b.Property(x => x.PaymentIntentId).HasMaxLength(200);
        b.Property(x => x.SetupIntentId).HasMaxLength(200); b.Property(x => x.PaymentMethodId).HasMaxLength(200);
        b.Property(x => x.Currency).HasMaxLength(3);
        b.HasIndex(x => new { x.ProcessedAt, x.NextAttemptAt });
    }
}

public sealed class BillingAuditConfiguration : IEntityTypeConfiguration<BillingAudit>
{
    public void Configure(EntityTypeBuilder<BillingAudit> b)
    {
        b.ToTable("BillingAudit"); b.HasKey(x => x.Id); b.Property(x => x.Action).HasMaxLength(100);
        b.HasIndex(x => new { x.OrganizationId, x.CreatedAt });
    }
}
