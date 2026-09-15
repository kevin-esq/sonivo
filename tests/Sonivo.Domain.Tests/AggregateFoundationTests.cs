using Sonivo.Domain.Common;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class AggregateFoundationTests
{
    [Fact]
    public void Versioned_roots_initialize_version_to_one()
    {
        var now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");
        IVersionedEntity[] roots =
        [
            Group.Create("Band", now),
            new Domain.Repertoire.Song { Title = "Song" },
            new Domain.Repertoire.Arrangement { Label = "Default" },
            new Setlist { Name = "Template" },
            new Event { Type = EventTypes.Rehearsal, Title = "Thu", Status = EventStatuses.Scheduled }
        ];

        Assert.All(roots, r => Assert.Equal(1, r.Version));
    }

    [Fact]
    public void Membership_roles_are_owner_and_member_only()
    {
        Assert.Equal("Owner", MembershipRoles.Owner);
        Assert.Equal("Member", MembershipRoles.Member);
    }

    [Fact]
    public void Event_setlist_item_requires_display_identity_fields()
    {
        var item = new EventSetlistItem
        {
            DisplaySongTitle = "Amazing Grace",
            DisplayArrangementLabel = "Default"
        };

        Assert.Equal("Amazing Grace", item.DisplaySongTitle);
        Assert.Equal("Default", item.DisplayArrangementLabel);
    }
}
