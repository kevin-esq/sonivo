namespace Sonivo.Domain.Tenancy;

public static class MembershipRoles
{
    public const string Owner = "Owner";
    public const string Manager = "Manager";
    public const string Member = "Member";
    public const string Viewer = "Viewer";

    /// <summary>All roles accepted by the database CHECK constraint (ADR-0051).</summary>
    public static readonly IReadOnlyList<string> All = [Owner, Manager, Member, Viewer];

    public static bool IsValid(string? role) => role is Owner or Manager or Member or Viewer;

    /// <summary>Owner or Manager: may create/update/delete repertoire, setlists and events.</summary>
    public static bool CanManageContent(string? role) => role is Owner or Manager;

    /// <summary>Owner, Manager or Member: may RSVP and take part in practice.</summary>
    public static bool CanParticipate(string? role) => role is Owner or Manager or Member;

    /// <summary>Only the Owner may manage membership, settings, branding and the group itself.</summary>
    public static bool CanManageGroup(string? role) => role is Owner;
}
