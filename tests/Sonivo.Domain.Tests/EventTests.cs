using Sonivo.Domain.Scheduling;

namespace Sonivo.Domain.Tests;

public class EventTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-16T12:00:00Z");
    private static readonly DateTimeOffset Starts = DateTimeOffset.Parse("2026-09-20T18:00:00Z");

    [Fact]
    public void Create_requires_title_type_and_starts_scheduled()
    {
        var ev = Event.Create(Guid.NewGuid(), " Thursday rehearsal ", EventTypes.Rehearsal, Starts, Now);

        Assert.Equal("Thursday rehearsal", ev.Title);
        Assert.Equal(EventTypes.Rehearsal, ev.Type);
        Assert.Equal(Starts, ev.StartsAt);
        Assert.Equal(EventStatuses.Scheduled, ev.Status);
        Assert.False(ev.IsHidden);
        Assert.Equal(1, ev.Version);
        Assert.Empty(ev.Items);
    }

    [Fact]
    public void Create_rejects_blank_title()
    {
        Assert.Throws<ArgumentException>(() =>
            Event.Create(Guid.NewGuid(), "  ", EventTypes.Rehearsal, Starts, Now));
    }

    [Fact]
    public void Create_rejects_invalid_type()
    {
        Assert.Throws<ArgumentException>(() =>
            Event.Create(Guid.NewGuid(), "Gig", "party", Starts, Now));
    }
}
