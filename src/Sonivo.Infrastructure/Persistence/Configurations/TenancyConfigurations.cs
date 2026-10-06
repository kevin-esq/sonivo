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
        builder.Property(x => x.DisplayName).HasMaxLength(Membership.DisplayNameMaxLength);
        builder.Property(x => x.Handle).HasMaxLength(MembershipHandles.MaxLength);
        builder.Property(x => x.MusicalRole).HasMaxLength(Membership.MusicalRoleMaxLength);
        builder.HasIndex(x => new { x.UserId, x.GroupId }).IsUnique().HasFilter("\"UserId\" IS NOT NULL");
        builder.HasIndex(x => new { x.GroupId, x.Handle }).IsUnique().HasFilter("\"Handle\" IS NOT NULL");
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
}
