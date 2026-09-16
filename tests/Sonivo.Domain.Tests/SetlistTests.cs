using Sonivo.Domain.Common;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Domain.Tests;

public class SetlistTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-16T12:00:00Z");

    [Fact]
    public void Create_requires_name_and_starts_at_version_1()
    {
        var setlist = Setlist.Create(Guid.NewGuid(), " Sunday Set ", Now);

        Assert.Equal("Sunday Set", setlist.Name);
        Assert.Equal(1, setlist.Version);
        Assert.Empty(setlist.Items);
    }

    [Fact]
    public void Create_rejects_blank_name()
    {
        Assert.Throws<ArgumentException>(() => Setlist.Create(Guid.NewGuid(), "  ", Now));
    }

    [Fact]
    public void Rename_increments_version_with_expected_match()
    {
        var setlist = Setlist.Create(Guid.NewGuid(), "A", Now);
        setlist.Rename("B", expectedVersion: 1, Now.AddMinutes(1));

        Assert.Equal("B", setlist.Name);
        Assert.Equal(2, setlist.Version);
    }

    [Fact]
    public void Rename_rejects_stale_version()
    {
        var setlist = Setlist.Create(Guid.NewGuid(), "A", Now);
        Assert.Throws<ConcurrencyConflictException>(() =>
            setlist.Rename("B", expectedVersion: 99, Now));
    }

    [Fact]
    public void BeginReplaceItems_increments_version()
    {
        var setlist = Setlist.Create(Guid.NewGuid(), "A", Now);
        setlist.BeginReplaceItems(expectedVersion: 1, Now.AddMinutes(1));
        Assert.Equal(2, setlist.Version);
    }

    [Fact]
    public void SetlistItem_Create_binds_ids_and_order()
    {
        var setlistId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var arrangementId = Guid.NewGuid();

        var item = SetlistItem.Create(setlistId, groupId, arrangementId, sortOrder: 3);

        Assert.Equal(setlistId, item.SetlistId);
        Assert.Equal(groupId, item.GroupId);
        Assert.Equal(arrangementId, item.ArrangementId);
        Assert.Equal(3, item.SortOrder);
    }
}
