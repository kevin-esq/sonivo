using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class GroupBrandingConfiguration : IEntityTypeConfiguration<GroupBranding>
{
    public void Configure(EntityTypeBuilder<GroupBranding> builder)
    {
        builder.ToTable("GroupBranding");
        builder.HasKey(x => x.GroupId);
        builder.Property(x => x.DisplayName).HasMaxLength(GroupBranding.MaxDisplayNameLength);
        builder.Property(x => x.AccentHex).HasMaxLength(7);
        builder.Property(x => x.SecondaryHex).HasMaxLength(7);
        builder.Property(x => x.CoverKind).HasMaxLength(16);
        builder.Property(x => x.CoverValue).HasMaxLength(GroupBranding.MaxCoverValueLength);
        builder.Property(x => x.ThemeDefault).HasMaxLength(16);
        builder.Property(x => x.DefaultLocale).HasMaxLength(8);
        builder.Property(x => x.WelcomeText).HasMaxLength(GroupBranding.MaxTextLength);
        builder.Property(x => x.LoginHeadline).HasMaxLength(GroupBranding.MaxTextLength);
        builder.Property(x => x.LogoBlobKey).HasMaxLength(256);
        builder.Property(x => x.LogoContentType).HasMaxLength(128);
        builder.Property(x => x.BannerBlobKey).HasMaxLength(256);
        builder.Property(x => x.BannerContentType).HasMaxLength(128);
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasOne<Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
