using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Tasks;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class TaskConfiguration : IEntityTypeConfiguration<GroupTask>
{
    public void Configure(EntityTypeBuilder<GroupTask> builder)
    {
        builder.ToTable("Tasks");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Title).HasMaxLength(GroupTask.MaxTitleLength);
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasIndex(x => new { x.GroupId, x.Id }).IsUnique();
        builder.HasIndex(x => x.GroupId);
        builder.HasQueryFilter(x => x.DeletedAt == null);
        builder.HasOne<Domain.Tenancy.Group>().WithMany()
            .HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Restrict);
    }
}
