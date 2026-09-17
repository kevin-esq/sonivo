using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class SongConfiguration : IEntityTypeConfiguration<Song>
{
    public void Configure(EntityTypeBuilder<Song> builder)
    {
        builder.ToTable("Songs", t => t.HasCheckConstraint(
            "CK_Songs_OriginKind",
            "\"OriginKind\" IN ('original', 'cover', 'other')"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Title).IsRequired().HasMaxLength(200);
        builder.Property(x => x.Attribution).HasMaxLength(300);
        builder.Property(x => x.OriginKind).IsRequired().HasMaxLength(32);
        builder.Property(x => x.RightsNotes).HasMaxLength(2000);
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
        builder.Property(x => x.Label).IsRequired().HasMaxLength(200);
        builder.Property(x => x.DefaultKey).HasMaxLength(32);
        builder.Property(x => x.DefaultBpm);
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
        builder.ToTable("Resources", t =>
        {
            t.HasCheckConstraint(
                "CK_Resources_Purpose",
                "\"Purpose\" IN ('chart', 'lyrics', 'audio', 'click', 'reference', 'practice', 'other')");
            t.HasCheckConstraint(
                "CK_Resources_Kind",
                "\"Kind\" IN ('file', 'link')");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Kind).IsRequired().HasMaxLength(16);
        builder.Property(x => x.Purpose).IsRequired().HasMaxLength(32);
        builder.Property(x => x.Label).IsRequired().HasMaxLength(200);
        builder.Property(x => x.Part).HasMaxLength(100);
        builder.Property(x => x.Note).HasMaxLength(2000);
        builder.Property(x => x.Url).HasMaxLength(2000);
        builder.Property(x => x.ContentType);
        builder.Property(x => x.ObjectKey);
        builder.Property(x => x.ByteSize);
        builder.Property(x => x.OriginalFileName);
        builder.HasIndex(x => x.ArrangementId);
    }
}
