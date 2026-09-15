using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class SongConfiguration : IEntityTypeConfiguration<Song>
{
    public void Configure(EntityTypeBuilder<Song> builder)
    {
        builder.ToTable("Songs");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Title).IsRequired();
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasIndex(x => new { x.GroupId, x.Id }).IsUnique();
        builder.HasIndex(x => x.GroupId);
        builder.HasQueryFilter(x => x.DeletedAt == null);
        builder.HasOne<Domain.Tenancy.Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class ArrangementConfiguration : IEntityTypeConfiguration<Arrangement>
{
    public void Configure(EntityTypeBuilder<Arrangement> builder)
    {
        builder.ToTable("Arrangements");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Label).IsRequired();
        builder.Property(x => x.DefaultBpm).HasPrecision(6, 2);
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasIndex(x => new { x.GroupId, x.Id }).IsUnique();
        builder.HasIndex(x => x.GroupId);
        builder.HasIndex(x => x.SongId);
        builder.HasIndex(x => new { x.GroupId, x.SongId });
        builder.HasQueryFilter(x => x.DeletedAt == null);

        builder.HasOne<Song>()
            .WithMany()
            .HasForeignKey(x => new { x.GroupId, x.SongId })
            .HasPrincipalKey(x => new { x.GroupId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(x => x.Resources)
            .WithOne()
            .HasForeignKey(x => x.ArrangementId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class ResourceConfiguration : IEntityTypeConfiguration<Resource>
{
    public void Configure(EntityTypeBuilder<Resource> builder)
    {
        builder.ToTable("Resources");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Purpose).IsRequired();
        builder.Property(x => x.ContentType).IsRequired();
        builder.Property(x => x.ObjectKey).IsRequired();
        builder.HasIndex(x => x.ArrangementId);
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Resources_Purpose",
            "\"Purpose\" IN ('chart', 'lyrics', 'audio', 'click', 'reference', 'other')"));
    }
}
