using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class ResourceBlobConfiguration : IEntityTypeConfiguration<ResourceBlob>
{
    public void Configure(EntityTypeBuilder<ResourceBlob> builder)
    {
        builder.ToTable("ResourceBlobs");
        builder.HasKey(x => x.ObjectKey);
        builder.Property(x => x.ObjectKey).HasMaxLength(200);
        builder.Property(x => x.Bytes).IsRequired();
        builder.Property(x => x.ContentType).IsRequired().HasMaxLength(100);
        builder.Property(x => x.ByteSize).IsRequired();
        builder.Property(x => x.CreatedAt).IsRequired();
    }
}
