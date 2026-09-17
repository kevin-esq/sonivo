using Sonivo.Domain.Common;
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

    [Fact]
    public void BeginReplacePlan_sets_source_and_bumps_version()
    {
        var setlistId = Guid.NewGuid();
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);

        ev.BeginReplacePlan(1, setlistId, Now.AddMinutes(5));

        Assert.Equal(setlistId, ev.SourceSetlistId);
        Assert.Equal(2, ev.Version);
        Assert.Equal(Now.AddMinutes(5), ev.UpdatedAt);
    }

    [Fact]
    public void BeginReplacePlan_rejects_stale_version()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);

        Assert.Throws<ConcurrencyConflictException>(() =>
            ev.BeginReplacePlan(99, Guid.NewGuid(), Now));
        Assert.Null(ev.SourceSetlistId);
        Assert.Equal(1, ev.Version);
    }

    [Fact]
    public void BeginReplacePlan_rejects_cancelled_event()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);
        ev.Cancel(1, Now.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() =>
            ev.BeginReplacePlan(2, Guid.NewGuid(), Now.AddMinutes(2)));
    }

    [Fact]
    public void UpdateMetadata_changes_title_type_starts_and_bumps_version()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);
        var later = Now.AddMinutes(5);
        var newStart = Starts.AddHours(1);

        ev.UpdateMetadata(" Thursday rehearsal ", EventTypes.Rehearsal, newStart, 1, later);

        Assert.Equal("Thursday rehearsal", ev.Title);
        Assert.Equal(EventTypes.Rehearsal, ev.Type);
        Assert.Equal(newStart, ev.StartsAt);
        Assert.Equal(2, ev.Version);
        Assert.Equal(later, ev.UpdatedAt);
        Assert.Null(ev.Location);
        Assert.Null(ev.Notes);
        Assert.Equal(EventStatuses.Scheduled, ev.Status);
    }

    [Fact]
    public void UpdateMetadata_rejects_cancelled_event()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);
        ev.Cancel(1, Now.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() =>
            ev.UpdateMetadata("Nope", EventTypes.Rehearsal, Starts, 2, Now.AddMinutes(2)));
        Assert.Equal("Gig", ev.Title);
        Assert.Equal(2, ev.Version);
    }

    [Fact]
    public void UpdateMetadata_rejects_stale_version()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);

        Assert.Throws<ConcurrencyConflictException>(() =>
            ev.UpdateMetadata("Nope", EventTypes.Rehearsal, Starts, 99, Now));
        Assert.Equal("Gig", ev.Title);
        Assert.Equal(1, ev.Version);
        Assert.Equal(Now, ev.UpdatedAt);
    }

    [Fact]
    public void Cancel_soft_hides_and_bumps_version_keeping_items_and_rsvps()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);
        ev.SetRsvp(Guid.NewGuid(), RsvpResponses.Yes, Now);
        ev.Items.Add(EventSetlistItem.Create(
            ev.Id, ev.GroupId, Guid.NewGuid(), "Song", "Live", 1, Now));
        var later = Now.AddMinutes(8);

        ev.Cancel(1, later);

        Assert.Equal(EventStatuses.Cancelled, ev.Status);
        Assert.True(ev.IsHidden);
        Assert.Equal(later, ev.CancelledAt);
        Assert.Equal(2, ev.Version);
        Assert.Equal(later, ev.UpdatedAt);
        Assert.Single(ev.Items);
        Assert.Single(ev.Rsvps);
    }

    [Fact]
    public void Cancel_rejects_already_cancelled()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);
        ev.Cancel(1, Now.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() =>
            ev.Cancel(2, Now.AddMinutes(2)));
        Assert.Equal(2, ev.Version);
        Assert.Equal(Now.AddMinutes(1), ev.CancelledAt);
    }

    [Fact]
    public void Cancel_rejects_stale_version()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);

        Assert.Throws<ConcurrencyConflictException>(() =>
            ev.Cancel(99, Now.AddMinutes(1)));
        Assert.Equal(EventStatuses.Scheduled, ev.Status);
        Assert.False(ev.IsHidden);
        Assert.Null(ev.CancelledAt);
        Assert.Equal(1, ev.Version);
    }

    [Fact]
    public void SetRsvp_inserts_without_bumping_event_version_or_updated_at()
    {
        var userId = Guid.NewGuid();
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);

        ev.SetRsvp(userId, RsvpResponses.Yes, Now.AddMinutes(10));

        var rsvp = Assert.Single(ev.Rsvps);
        Assert.Equal(userId, rsvp.UserId);
        Assert.Equal(ev.Id, rsvp.EventId);
        Assert.Equal(RsvpResponses.Yes, rsvp.Response);
        Assert.Equal(Now.AddMinutes(10), rsvp.UpdatedAt);
        Assert.NotEqual(Guid.Empty, rsvp.Id);
        Assert.Equal(1, ev.Version);
        Assert.Equal(Now, ev.UpdatedAt);
    }

    [Fact]
    public void SetRsvp_updates_same_row_when_response_changes()
    {
        var userId = Guid.NewGuid();
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);
        ev.SetRsvp(userId, RsvpResponses.Yes, Now);
        var existingId = ev.Rsvps.Single().Id;

        ev.SetRsvp(userId, RsvpResponses.No, Now.AddMinutes(3));

        var rsvp = Assert.Single(ev.Rsvps);
        Assert.Equal(existingId, rsvp.Id);
        Assert.Equal(RsvpResponses.No, rsvp.Response);
        Assert.Equal(Now.AddMinutes(3), rsvp.UpdatedAt);
        Assert.Equal(1, ev.Version);
        Assert.Equal(Now, ev.UpdatedAt);
    }

    [Fact]
    public void SetRsvp_rejects_invalid_response()
    {
        var ev = Event.Create(Guid.NewGuid(), "Gig", EventTypes.Performance, Starts, Now);

        Assert.Throws<ArgumentException>(() =>
            ev.SetRsvp(Guid.NewGuid(), "going", Now));
        Assert.Empty(ev.Rsvps);
        Assert.Equal(1, ev.Version);
        Assert.Equal(Now, ev.UpdatedAt);
    }

    [Fact]
    public void EventSetlistItem_Create_copies_display_labels()
    {
        var item = EventSetlistItem.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            " Amazing Grace ",
            " Acoustic ",
            2,
            Now);

        Assert.Equal("Amazing Grace", item.DisplaySongTitle);
        Assert.Equal("Acoustic", item.DisplayArrangementLabel);
        Assert.Equal(2, item.SortOrder);
        Assert.Null(item.OverrideKey);
    }
}
