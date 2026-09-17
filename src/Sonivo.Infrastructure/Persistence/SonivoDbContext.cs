using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Infrastructure.Persistence;

public sealed class SonivoDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public SonivoDbContext(DbContextOptions<SonivoDbContext> options)
        : base(options)
    {
    }

    public DbSet<Group> Groups => Set<Group>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<Song> Songs => Set<Song>();
    public DbSet<Arrangement> Arrangements => Set<Arrangement>();
    public DbSet<Resource> Resources => Set<Resource>();
    public DbSet<Setlist> Setlists => Set<Setlist>();
    public DbSet<SetlistItem> SetlistItems => Set<SetlistItem>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventSetlistItem> EventSetlistItems => Set<EventSetlistItem>();
    public DbSet<Rsvp> Rsvps => Set<Rsvp>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(SonivoDbContext).Assembly);
    }
}
