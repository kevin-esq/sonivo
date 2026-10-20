using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class GroupConfiguration : IEntityTypeConfiguration<Group>
{
    public void Configure(EntityTypeBuilder<Group> builder)
    {
        builder.ToTable("Groups");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired();
        builder.Property(x => x.Slug).HasMaxLength(GroupSlug.MaxLength);
        builder.Property(x => x.PlanId).IsRequired().HasMaxLength(16).HasDefaultValue(PlanCatalog.DefaultPlanId);
        builder.Property(x => x.BillingStatus).IsRequired().HasMaxLength(16).HasDefaultValue(BillingStatuses.Active);
        builder.Property(x => x.ScheduledPlanId).HasMaxLength(16);
        builder.HasIndex(x => x.Slug).IsUnique().HasFilter("\"Slug\" IS NOT NULL");
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasQueryFilter(x => x.DeletedAt == null);
        builder.HasMany(x => x.Memberships)
            .WithOne(x => x.Group)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class GroupSlugHistoryConfiguration : IEntityTypeConfiguration<GroupSlugHistory>
{
    public void Configure(EntityTypeBuilder<GroupSlugHistory> builder)
    {
        builder.ToTable("GroupSlugHistory");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Slug).IsRequired().HasMaxLength(GroupSlug.MaxLength);
        builder.HasIndex(x => x.Slug).IsUnique();
        builder.HasIndex(x => x.GroupId);
        builder.HasOne<Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class MembershipConfiguration : IEntityTypeConfiguration<Membership>{
    public void Configure(EntityTypeBuilder<Membership> builder)
    {
        builder.ToTable("Memberships");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Role).IsRequired();
        builder.Property(x => x.NotifyRoleChanges).IsRequired().HasDefaultValue(true);
        builder.Property(x => x.NotifyTaskAssignments).IsRequired().HasDefaultValue(true);
        builder.Property(x => x.AccessDisabledAt);
        builder.Property(x => x.DisplayName).HasMaxLength(Membership.DisplayNameMaxLength);
        builder.Property(x => x.Handle).HasMaxLength(MembershipHandles.MaxLength);
        builder.Property(x => x.MusicalRole).HasMaxLength(Membership.MusicalRoleMaxLength);
        builder.Property(x => x.Description).HasMaxLength(Membership.DescriptionMaxLength);
        builder.HasIndex(x => new { x.UserId, x.GroupId }).IsUnique().HasFilter("\"UserId\" IS NOT NULL");
        builder.HasIndex(x => new { x.GroupId, x.Handle }).IsUnique().HasFilter("\"Handle\" IS NOT NULL");
        builder.Property(x => x.GroupRoleId);
        builder.HasOne<GroupRole>()
            .WithMany()
            .HasForeignKey(x => new { x.GroupId, x.GroupRoleId })
            .HasPrincipalKey(x => new { x.GroupId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(x => x.GroupId);
        builder.HasIndex(x => x.UserId);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Memberships_Role",
            $"\"Role\" IN ('{MembershipRoles.Owner}', '{MembershipRoles.Manager}', '{MembershipRoles.Member}', '{MembershipRoles.Viewer}')"));
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Memberships_OwnerHasUser",
            "\"Role\" <> 'Owner' OR \"UserId\" IS NOT NULL"));
    }
}

public sealed class GroupAuditEntryConfiguration : IEntityTypeConfiguration<GroupAuditEntry>
{
    public void Configure(EntityTypeBuilder<GroupAuditEntry> builder)
    {
        builder.ToTable("GroupAuditLog");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Action).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Metadata).HasMaxLength(200);
        builder.HasIndex(x => new { x.GroupId, x.CreatedAt });
        builder.HasOne<Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class GroupRoleConfiguration : IEntityTypeConfiguration<GroupRole>
{
    public void Configure(EntityTypeBuilder<GroupRole> builder)
    {
        builder.ToTable("GroupRoles");
        builder.HasKey(x => x.Id);
        builder.HasAlternateKey(x => new { x.GroupId, x.Id });
        builder.Property(x => x.Name).IsRequired().HasMaxLength(60);
        builder.Property(x => x.Description).HasMaxLength(200);
        builder.Property(x => x.Permissions).IsRequired().HasMaxLength(500);
        builder.Property(x => x.ExtendsBaseRole).IsRequired().HasDefaultValue(false);
        builder.HasIndex(x => new { x.GroupId, x.Name }).IsUnique();
        builder.HasIndex(x => x.GroupId);
        builder.HasOne<Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class InvitationConfiguration : IEntityTypeConfiguration<Invitation>
{
    public void Configure(EntityTypeBuilder<Invitation> builder)
    {
        builder.ToTable("Invitations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.TokenHash).IsRequired().HasMaxLength(64);
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => x.GroupId);
        builder.HasOne<Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.AcceptedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    /// <summary>
    /// ADR-0080: one row per (group, member, item). The unique index is what
    /// makes "allow" and "deny" the same flip rather than two competing rows.
    /// </summary>
    private static void ConfigureResourceGrant(EntityTypeBuilder<ResourceGrant> builder)
    {
        builder.ToTable("ResourceGrants");
        builder.HasKey(x => x.Id);
        builder.HasIndex(x => new { x.GroupId, x.UserId, x.ResourceType, x.ResourceId }).IsUnique();
        builder.HasIndex(x => new { x.GroupId, x.UserId });
        builder.Property(x => x.ResourceType).HasMaxLength(32).IsRequired();
        builder.HasOne<Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.GrantedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
