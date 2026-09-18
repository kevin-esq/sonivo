using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Infrastructure.Persistence;

public sealed class SonivoDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>, IDataProtectionKeyContext
{
    public SonivoDbContext(DbContextOptions<SonivoDbContext> options)
        : base(options)
    {
    }

    public DbSet<Group> Groups => Set<Group>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<Song> Songs => Set<Song>();
    public DbSet<Arrangement> Arrangements => Set<Arrangement>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<ResourceBlob> ResourceBlobs => Set<ResourceBlob>();
    public DbSet<Setlist> Setlists => Set<Setlist>();
    public DbSet<SetlistItem> SetlistItems => Set<SetlistItem>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventSetlistItem> EventSetlistItems => Set<EventSetlistItem>();
    public DbSet<Rsvp> Rsvps => Set<Rsvp>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(SonivoDbContext).Assembly);
    }
}
