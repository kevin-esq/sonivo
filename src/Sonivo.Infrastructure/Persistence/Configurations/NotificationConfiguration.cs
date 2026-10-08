using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Notifications;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("Notifications");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Kind).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Metadata).HasMaxLength(200);
        builder.Property(x => x.Scope).HasConversion<int>();
        // One inbox query per (recipient, scope, group), newest first.
        builder.HasIndex(x => new { x.UserId, x.Scope, x.GroupId, x.CreatedAt });
        builder.HasIndex(x => new { x.UserId, x.ReadAt });
        builder.HasOne<Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
