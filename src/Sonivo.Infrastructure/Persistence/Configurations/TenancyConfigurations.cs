using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
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
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasQueryFilter(x => x.DeletedAt == null);
        builder.HasMany(x => x.Memberships)
            .WithOne(x => x.Group)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class MembershipConfiguration : IEntityTypeConfiguration<Membership>
{
    public void Configure(EntityTypeBuilder<Membership> builder)
    {
        builder.ToTable("Memberships");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Role).IsRequired();
        builder.HasIndex(x => new { x.UserId, x.GroupId }).IsUnique();
        builder.HasIndex(x => x.GroupId);
        builder.HasIndex(x => x.UserId);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Memberships_Role",
            $"\"Role\" IN ('{MembershipRoles.Owner}', '{MembershipRoles.Member}')"));
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
