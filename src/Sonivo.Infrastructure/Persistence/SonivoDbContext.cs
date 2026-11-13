using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using OpenIddict.EntityFrameworkCore;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tasks;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Domain.Billing;
using Sonivo.Infrastructure.Payments;

namespace Sonivo.Infrastructure.Persistence;

public sealed class SonivoDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>, IDataProtectionKeyContext
{
    public SonivoDbContext(DbContextOptions<SonivoDbContext> options)
        : base(options)
    {
    }

    public DbSet<Group> Groups => Set<Group>();
    public DbSet<GroupSlugHistory> GroupSlugHistory => Set<GroupSlugHistory>();
    public DbSet<GroupBranding> GroupBrandings => Set<GroupBranding>();
    public DbSet<AccountAudit> AccountAudits => Set<AccountAudit>();
    public DbSet<GroupAuditEntry> GroupAuditLog => Set<GroupAuditEntry>();
    public DbSet<Sonivo.Domain.Notifications.Notification> Notifications => Set<Sonivo.Domain.Notifications.Notification>();
    public DbSet<GroupRole> GroupRoles => Set<GroupRole>();
public DbSet<ResourceGrant> ResourceGrants => Set<ResourceGrant>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<Song> Songs => Set<Song>();
    public DbSet<SongFavorite> SongFavorites => Set<SongFavorite>();
    public DbSet<Arrangement> Arrangements => Set<Arrangement>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<Setlist> Setlists => Set<Setlist>();
    public DbSet<SetlistItem> SetlistItems => Set<SetlistItem>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventSetlistItem> EventSetlistItems => Set<EventSetlistItem>();
    public DbSet<Rsvp> Rsvps => Set<Rsvp>();
    public DbSet<GroupTask> Tasks => Set<GroupTask>();
    public DbSet<WebhookEvent> WebhookEvents => Set<WebhookEvent>();
    public DbSet<BillingOrganization> BillingOrganizations => Set<BillingOrganization>();
    public DbSet<BillingAccessGrant> BillingAccessGrants => Set<BillingAccessGrant>();
    public DbSet<BillingReferralCode> BillingReferralCodes => Set<BillingReferralCode>();
    public DbSet<BillingReferralAttribution> BillingReferralAttributions => Set<BillingReferralAttribution>();
    public DbSet<BillingReferralReward> BillingReferralRewards => Set<BillingReferralReward>();
    public DbSet<BillingFinancialEvent> BillingFinancialEvents => Set<BillingFinancialEvent>();
    public DbSet<BillingAccountingOutbox> BillingAccountingOutbox => Set<BillingAccountingOutbox>();
    public DbSet<BillingGroup> BillingGroups => Set<BillingGroup>();
    public DbSet<BillingTrial> BillingTrials => Set<BillingTrial>();
    public DbSet<GroupOwnershipTransfer> GroupOwnershipTransfers => Set<GroupOwnershipTransfer>();
    public DbSet<BillingOperation> BillingOperations => Set<BillingOperation>();
    public DbSet<BillingInboxEvent> BillingInbox => Set<BillingInboxEvent>();
    public DbSet<BillingAudit> BillingAudit => Set<BillingAudit>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.UseOpenIddict<Guid>();
        builder.ApplyConfigurationsFromAssembly(typeof(SonivoDbContext).Assembly);
    }
}
