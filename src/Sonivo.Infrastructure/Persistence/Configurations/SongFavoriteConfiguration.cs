using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Repertoire;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class SongFavoriteConfiguration : IEntityTypeConfiguration<SongFavorite>
{
    public void Configure(EntityTypeBuilder<SongFavorite> builder)
    {
        builder.ToTable("SongFavorites");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.CreatedAt).IsRequired();
        builder.HasIndex(x => new { x.GroupId, x.SongId, x.UserId }).IsUnique();
        builder.HasIndex(x => new { x.GroupId, x.UserId });
        builder.HasOne<Song>()
            .WithMany()
            .HasForeignKey(x => new { x.GroupId, x.SongId })
            .HasPrincipalKey(x => new { x.GroupId, x.Id })
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
