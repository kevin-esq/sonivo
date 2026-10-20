namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Canonical permission keys (ADR-0080).
///
/// A group role holds an explicit capability set. New roles replace a non-owner
/// membership's base capability preset; migrated legacy roles may extend that
/// preset until an Owner explicitly converts them. Owner-only permissions
/// remain impossible to assign, and Owner access is resolved independently
/// (ADR-0082).
///
/// Granularity follows the Discord model: one key per ACTION, not per area.
/// "Manage songs" is deliberately NOT a single switch — a group that wants a
/// member who can add songs but never delete one can express that here, which is
/// the whole point of custom roles.
/// </summary>
public static class GroupPermissions
{
    // ---- Group administration -------------------------------------------
    /// <summary>Group settings, rename, slug, plan selection.</summary>
    public const string ManageGroup = "manage_group";
    /// <summary>Brand identity: logo, banner, colours, theme default, copy.</summary>
    public const string ManageBranding = "manage_branding";
    /// <summary>Invite, change base role, remove members.</summary>
    public const string ManageMembers = "manage_members";
    /// <summary>Create, edit and delete custom roles and assign them.</summary>
    public const string ManageRoles = "manage_roles";
    /// <summary>Change descriptive member profile fields, never membership or access.</summary>
    public const string ManageMemberProfiles = "manage_member_profiles";
    /// <summary>Billing, plan checkout, subscription.</summary>
    public const string ManageBilling = "manage_billing";
    /// <summary>Export the group's data.</summary>
    public const string ExportGroup = "export_group";
    /// <summary>Soft-delete the group. Owner-only by domain, see <see cref="IsOwnerOnly"/>.</summary>
    public const string DeleteGroup = "delete_group";

    // ---- Repertoire: songs ----------------------------------------------
    public const string SongView = "song.view";
    public const string SongCreate = "song.create";
    public const string SongEdit = "song.edit";
    public const string SongDelete = "song.delete";

    // ---- Repertoire: arrangements ---------------------------------------
    public const string ArrangementView = "arrangement.view";
    public const string ArrangementCreate = "arrangement.create";
    public const string ArrangementEdit = "arrangement.edit";
    public const string ArrangementDelete = "arrangement.delete";

    // ---- Repertoire: resources ------------------------------------------
    public const string ResourceView = "resource.view";
    public const string ResourceUpload = "resource.upload";
    public const string ResourceEdit = "resource.edit";
    public const string ResourceDelete = "resource.delete";
    public const string ResourceDigitize = "resource.digitize";

    // ---- Setlists --------------------------------------------------------
    public const string SetlistView = "setlist.view";
    public const string SetlistCreate = "setlist.create";
    public const string SetlistEdit = "setlist.edit";
    public const string SetlistDelete = "setlist.delete";
    /// <summary>Apply a setlist as an Event plan (replaces the current plan).</summary>
    public const string SetlistApply = "setlist.apply";

    // ---- Events ----------------------------------------------------------
    public const string EventView = "event.view";
    public const string EventCreate = "event.create";
    public const string EventEdit = "event.edit";
    public const string EventCancel = "event.cancel";
    public const string EventDelete = "event.delete";
    /// <summary>Answer yes/no/maybe for oneself.</summary>
    public const string EventRespondRsvp = "event.rsvp.respond";
    /// <summary>Read the whole attendance list, not just one's own answer.</summary>
    public const string EventViewRsvps = "event.rsvp.view";

    // Phase 3.6 has no Event hard-delete operation. Keep this key recognizable
    // for stored profiles, but do not allow new custom roles to assign it.
    public static readonly string[] Legacy = { EventDelete };

    // ---- Tasks -----------------------------------------------------------
    public const string TaskView = "task.view";
    public const string TaskCreate = "task.create";
    public const string TaskEdit = "task.edit";
    public const string TaskDelete = "task.delete";
    public const string TaskAssign = "task.assign";
    public const string TaskComplete = "task.complete";

    // ---- Participation ---------------------------------------------------
    public const string Practice = "practice";
    /// <summary>Broadcast position in the conductor room.</summary>
    public const string Conduct = "conduct";

    /// <summary>
    /// Permissions a custom role may be granted. Administrative, ownership, and
    /// retired legacy capabilities are excluded from new profiles.
    /// </summary>
    public static readonly string[] Assignable =
    {
        // songs
        SongView, SongCreate, SongEdit, SongDelete,
        // arrangements
        ArrangementView, ArrangementCreate, ArrangementEdit, ArrangementDelete,
        // resources
        ResourceView, ResourceUpload, ResourceEdit, ResourceDelete, ResourceDigitize,
        // setlists
        SetlistView, SetlistCreate, SetlistEdit, SetlistDelete, SetlistApply,
        // events
        EventView, EventCreate, EventEdit, EventCancel,
        EventRespondRsvp, EventViewRsvps,
        // tasks
        TaskView, TaskCreate, TaskEdit, TaskDelete, TaskAssign, TaskComplete,
        // participation
        Practice, Conduct, ManageMemberProfiles,
    };

    /// <summary>
    /// Capabilities only the Owner holds, and which no custom role can ever be
    /// granted to anyone else. Enforced in <see cref="GroupRole"/> on write and
    /// never granted to another member through a custom profile.
    /// </summary>
    public static readonly string[] OwnerOnly =
    {
        ManageGroup,
        ManageBranding,
        ManageMembers,
        ManageRoles,
        ManageBilling,
        ExportGroup,
        DeleteGroup,
    };

    public static readonly string[] All = Assignable.Concat(OwnerOnly).Concat(Legacy).ToArray();

    public static bool IsKnown(string? value) => All.Contains(value);

    /// <summary>
    /// Whether an Owner may put this permission on a custom role. The
    /// administrative permissions are intentionally excluded — see
    /// <see cref="Assignable"/> for the full reasoning (ADR-0082).
    /// </summary>
    public static bool IsAssignable(string? value) => Assignable.Contains(value);

    /// <summary>Only the Owner may hold this, and no custom role may grant it.</summary>
    public static bool IsOwnerOnly(string? value) => OwnerOnly.Contains(value);

    /// <summary>
    /// The permission set a base membership role holds on its own. This is the
    /// single source of truth for "what can this role do"; the client mirror in
    /// <c>web/apps/app/src/groups/roles/permissions.ts</c> is presentation only.
    ///
    /// Behaviour is preserved from the previous role-only model: content CRUD
    /// (songs, arrangements, resources, setlists, events, tasks) needs Manager
    /// or Owner; a Member can view and participate; a Viewer can only practise.
    /// </summary>
    public static IReadOnlySet<string> BaseRolePermissions(string role) => role switch
    {
        GroupRole.SystemOwner => new HashSet<string>(All, StringComparer.Ordinal),
        GroupRole.SystemManager => new HashSet<string>(
            new[]
            {
                SongView, SongCreate, SongEdit, SongDelete,
                ArrangementView, ArrangementCreate, ArrangementEdit, ArrangementDelete,
                ResourceView, ResourceUpload, ResourceEdit, ResourceDelete, ResourceDigitize,
                SetlistView, SetlistCreate, SetlistEdit, SetlistDelete, SetlistApply,
                EventView, EventCreate, EventEdit, EventCancel,
                EventRespondRsvp, EventViewRsvps,
                TaskView, TaskCreate, TaskEdit, TaskDelete, TaskAssign, TaskComplete,
                ManageMemberProfiles,
                Practice,
                Conduct,
            },
            StringComparer.Ordinal),
        GroupRole.SystemMember => new HashSet<string>(
            new[]
            {
                SongView,
                ArrangementView,
                ResourceView,
                SetlistView,
                EventView,
                EventRespondRsvp,
                TaskView,
                TaskComplete,
                Practice,
            },
            StringComparer.Ordinal),
        GroupRole.SystemViewer => new HashSet<string>(
            new[] { SongView, ArrangementView, ResourceView, SetlistView, EventView, Practice },
            StringComparer.Ordinal),
        _ => new HashSet<string>(StringComparer.Ordinal),
    };

    /// <summary>
    /// The permission a legacy role check maps onto. <c>RequireManagerAsync</c>
    /// historically guarded CONTENT mutation, so the closest single permission
    /// is the ability to edit songs — the narrowest content-write capability a
    /// Manager has and a Member does not.
    /// </summary>
    public static string ManagerCapability => SongEdit;

    /// <summary>
    /// Permission dependencies: a capability implies the ones it builds on.
    ///
    /// ADR-0082. The rule is the obvious one — nobody may act on a thing they
    /// cannot see. Editing an arrangement requires seeing the song it belongs
    /// to; uploading a resource requires seeing resources; applying a setlist to
    /// an event requires seeing the setlist. Anything not listed here is a root.
    ///
    /// Expansion is transitive and only ever ADDS required parent capabilities;
    /// an exact role profile may still restrict the base membership preset.
    ///
    /// Honest limitation: expansion is group-wide, not scoped to the specific
    /// parent. Granting `arrangement.view` implies `song.view` on every song,
    /// which is the right default for a group role but is not per-item
    /// authorisation — the API still re-checks membership on every request.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string[]> Dependencies =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            // Songs
            [SongEdit] = new[] { SongView },
            [SongDelete] = new[] { SongView },

            // Arrangements live under a song.
            [ArrangementView] = new[] { SongView },
            [ArrangementCreate] = new[] { SongView },
            [ArrangementEdit] = new[] { SongView },
            [ArrangementDelete] = new[] { SongView },

            // Resources: you may only act on what you can open.
            [ResourceView] = Array.Empty<string>(),
            [ResourceUpload] = new[] { ResourceView },
            [ResourceEdit] = new[] { ResourceView },
            [ResourceDelete] = new[] { ResourceView },
            [ResourceDigitize] = new[] { ResourceView },

            // Setlists
            [SetlistView] = Array.Empty<string>(),
            [SetlistCreate] = Array.Empty<string>(),
            [SetlistEdit] = new[] { SetlistView },
            [SetlistDelete] = new[] { SetlistView },
            [SetlistApply] = new[] { SetlistView, EventView },

            // Events
            [EventView] = Array.Empty<string>(),
            [EventCreate] = Array.Empty<string>(),
            [EventEdit] = new[] { EventView },
            [EventCancel] = new[] { EventView },
            [EventDelete] = new[] { EventView },
            [EventRespondRsvp] = new[] { EventView },
            [EventViewRsvps] = new[] { EventView },

            // Tasks
            [TaskView] = Array.Empty<string>(),
            [TaskCreate] = Array.Empty<string>(),
            [TaskEdit] = new[] { TaskView },
            [TaskDelete] = new[] { TaskView },
            [TaskAssign] = new[] { TaskView },
            [TaskComplete] = new[] { TaskView },

            // Conducting happens inside an event's practice room.
            [Conduct] = new[] { EventView },
            [ManageMemberProfiles] = Array.Empty<string>(),
        };

    /// <summary>
    /// Expands a permission set with everything its members imply, transitively.
    /// The input set is never modified.
    /// </summary>
    public static IReadOnlySet<string> Expand(IEnumerable<string> permissions)
    {
        var expanded = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<string>();
        foreach (var permission in permissions)
        {
            if (!string.IsNullOrWhiteSpace(permission)) queue.Enqueue(permission);
        }

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!expanded.Add(current)) continue;
            if (!Dependencies.TryGetValue(current, out var parents)) continue;
            foreach (var parent in parents)
            {
                if (!expanded.Contains(parent)) queue.Enqueue(parent);
            }
        }

        return expanded;
    }

    /// <summary>True when the set grants the capability, honouring dependencies.</summary>
    public static bool Grants(
        this IReadOnlySet<string> granted,
        string permission)
        => granted.Contains(permission);

    /// <summary>
    /// Capabilities whose per-resource override may ADD access (ADR-0082).
    ///
    /// Only the `*.view` capabilities qualify: they are pure reads, they are what
    /// a group actually needs to hand out individually ("this person may see
    /// these three songs"), and they are idempotent — being able to read one item
    /// says nothing about any other.
    ///
    /// Every other capability (create/edit/delete/apply/assign/conduct) may only
    /// be REMOVED per resource, never added. Adding one by hand would be an
    /// escalation path, since it bypasses the role that was supposed to grant it.
    /// </summary>
    public static bool IsReadCapability(string? permission)
        => permission is not null
            && permission.EndsWith(".view", StringComparison.Ordinal);
}
