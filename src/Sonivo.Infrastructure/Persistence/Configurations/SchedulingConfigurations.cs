using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class SetlistConfiguration : IEntityTypeConfiguration<Setlist>
{
    public void Configure(EntityTypeBuilder<Setlist> builder)
    {
        builder.ToTable("Setlists");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired();
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasIndex(x => x.GroupId);
        builder.HasOne<Domain.Tenancy.Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(x => x.SetlistId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class SetlistItemConfiguration : IEntityTypeConfiguration<SetlistItem>
{
    public void Configure(EntityTypeBuilder<SetlistItem> builder)
    {
        builder.ToTable("SetlistItems");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.OverrideBpm).HasPrecision(6, 2);
        builder.HasIndex(x => new { x.SetlistId, x.SortOrder });

        // No Arrangement navigation — FK only (ADR-0023).
        builder.HasOne<Arrangement>()
            .WithMany()
            .HasForeignKey(x => new { x.GroupId, x.ArrangementId })
            .HasPrincipalKey(x => new { x.GroupId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class EventConfiguration : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> builder)
    {
        builder.ToTable("Events");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Type).IsRequired();
        builder.Property(x => x.Title).IsRequired();
        builder.Property(x => x.Status).IsRequired();
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasIndex(x => new { x.GroupId, x.StartsAt });
        builder.ToTable(t =>
        {
            t.HasCheckConstraint("CK_Events_Type", "\"Type\" IN ('rehearsal', 'performance', 'other')");
            t.HasCheckConstraint("CK_Events_Status", "\"Status\" IN ('scheduled', 'cancelled')");
        });

        builder.HasOne<Domain.Tenancy.Group>()
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Setlist>()
            .WithMany()
            .HasForeignKey(x => x.SourceSetlistId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(x => x.Rsvps)
            .WithOne()
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class EventSetlistItemConfiguration : IEntityTypeConfiguration<EventSetlistItem>
{
    public void Configure(EntityTypeBuilder<EventSetlistItem> builder)
    {
        builder.ToTable("EventSetlistItems");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.DisplaySongTitle).IsRequired();
        builder.Property(x => x.DisplayArrangementLabel).IsRequired();
        builder.Property(x => x.OverrideBpm).HasPrecision(6, 2);
        builder.HasIndex(x => new { x.EventId, x.SortOrder });

        // No Arrangement navigation — FK only (ADR-0023).
        builder.HasOne<Arrangement>()
            .WithMany()
            .HasForeignKey(x => new { x.GroupId, x.ArrangementId })
            .HasPrincipalKey(x => new { x.GroupId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class RsvpConfiguration : IEntityTypeConfiguration<Rsvp>
{
    public void Configure(EntityTypeBuilder<Rsvp> builder)
    {
        builder.ToTable("Rsvps");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Response).IsRequired();
        builder.HasIndex(x => new { x.EventId, x.UserId }).IsUnique();
        builder.HasIndex(x => x.EventId);
        builder.HasIndex(x => x.UserId);
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Rsvps_Response",
            "\"Response\" IN ('yes', 'no', 'maybe')"));
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
