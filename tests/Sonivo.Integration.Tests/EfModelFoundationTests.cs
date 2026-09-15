using Microsoft.EntityFrameworkCore;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

public class EfModelFoundationTests
{
    [Fact]
    public void DbContext_model_includes_tenant_entities_and_composite_keys()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-model-{Guid.NewGuid()}")
            .Options;

        using var db = new SonivoDbContext(options);
        var model = db.Model;

        Assert.NotNull(model.FindEntityType(typeof(Group)));
        Assert.NotNull(model.FindEntityType(typeof(Membership)));
        Assert.NotNull(model.FindEntityType(typeof(Song)));
        Assert.NotNull(model.FindEntityType(typeof(Arrangement)));
        Assert.NotNull(model.FindEntityType(typeof(Resource)));
        Assert.NotNull(model.FindEntityType(typeof(Setlist)));
        Assert.NotNull(model.FindEntityType(typeof(SetlistItem)));
        Assert.NotNull(model.FindEntityType(typeof(Event)));
        Assert.NotNull(model.FindEntityType(typeof(EventSetlistItem)));
        Assert.NotNull(model.FindEntityType(typeof(Rsvp)));

        var arrangement = model.FindEntityType(typeof(Arrangement))!;
        var songFk = arrangement.GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Song));
        Assert.Equal(
            new[] { nameof(Arrangement.GroupId), nameof(Arrangement.SongId) },
            songFk.Properties.Select(p => p.Name).ToArray());
        Assert.Equal(DeleteBehavior.Restrict, songFk.DeleteBehavior);

        var setlistItem = model.FindEntityType(typeof(SetlistItem))!;
        var setlistArrFk = setlistItem.GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Arrangement));
        Assert.Equal(
            new[] { nameof(SetlistItem.GroupId), nameof(SetlistItem.ArrangementId) },
            setlistArrFk.Properties.Select(p => p.Name).ToArray());
        Assert.Equal(DeleteBehavior.Restrict, setlistArrFk.DeleteBehavior);

        var eventItem = model.FindEntityType(typeof(EventSetlistItem))!;
        Assert.Null(eventItem.FindNavigation(nameof(Arrangement)));
        var eventArrFk = eventItem.GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Arrangement));
        Assert.Equal(DeleteBehavior.Restrict, eventArrFk.DeleteBehavior);

        Assert.NotNull(model.FindEntityType(typeof(Group))!.GetQueryFilter());
        Assert.NotNull(model.FindEntityType(typeof(Song))!.GetQueryFilter());
        Assert.NotNull(model.FindEntityType(typeof(Arrangement))!.GetQueryFilter());
        Assert.Null(model.FindEntityType(typeof(Event))!.GetQueryFilter());
        Assert.Null(model.FindEntityType(typeof(EventSetlistItem))!.GetQueryFilter());
    }

    [Fact]
    public void Version_is_concurrency_token_on_aggregate_roots()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-version-{Guid.NewGuid()}")
            .Options;

        using var db = new SonivoDbContext(options);
        foreach (var type in new[]
                 {
                     typeof(Group), typeof(Song), typeof(Arrangement), typeof(Setlist), typeof(Event)
                 })
        {
            var entity = db.Model.FindEntityType(type)!;
            var version = entity.FindProperty("Version")!;
            Assert.True(version.IsConcurrencyToken);
        }
    }

    [Fact]
    public void Repertoire_model_matches_adr_0024_and_0025()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-repertoire-{Guid.NewGuid()}")
            .Options;

        using var db = new SonivoDbContext(options);

        var song = db.Model.FindEntityType(typeof(Song))!;
        Assert.NotNull(song.FindProperty(nameof(Song.OriginKind)));
        Assert.Null(song.FindProperty("IsOriginal"));
        Assert.True(song.FindProperty(nameof(Song.Version))!.IsConcurrencyToken);
        Assert.NotNull(song.GetQueryFilter());

        var arrangement = db.Model.FindEntityType(typeof(Arrangement))!;
        Assert.Null(arrangement.FindProperty("IsDefault"));
        Assert.Equal(typeof(int?), arrangement.FindProperty(nameof(Arrangement.DefaultBpm))!.ClrType);
        Assert.True(arrangement.FindProperty(nameof(Arrangement.Version))!.IsConcurrencyToken);
        Assert.NotNull(arrangement.GetQueryFilter());

        var resource = db.Model.FindEntityType(typeof(Resource))!;
        Assert.NotNull(resource.FindProperty(nameof(Resource.Kind)));
        Assert.NotNull(resource.FindProperty(nameof(Resource.Label)));
        Assert.NotNull(resource.FindProperty(nameof(Resource.Part)));
        Assert.NotNull(resource.FindProperty(nameof(Resource.Url)));
        Assert.Null(resource.FindProperty("Version"));
        Assert.Null(resource.FindProperty("DeletedAt"));
        Assert.Null(resource.FindProperty("GroupId"));
        Assert.True(resource.FindProperty(nameof(Resource.ContentType))!.IsNullable);
        Assert.True(resource.FindProperty(nameof(Resource.ObjectKey))!.IsNullable);
        Assert.True(resource.FindProperty(nameof(Resource.ByteSize))!.IsNullable);
        Assert.Null(resource.GetQueryFilter());

        var resourceFk = resource.GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Arrangement));
        Assert.Equal(DeleteBehavior.Restrict, resourceFk.DeleteBehavior);
    }
}
