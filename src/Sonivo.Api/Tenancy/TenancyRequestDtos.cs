internal sealed record CreateGroupRequest(string? Name);
internal sealed record ChangeGroupSlugRequest(string? Slug);
internal sealed record CreateRosterMemberRequest(string? DisplayName, string? Email, bool GrantAccess, string? Handle = null);
internal sealed record ImportRosterCsvRequest(string? Csv);
internal sealed record UpdateGroupBrandingRequest(
    int ExpectedVersion,
    string? DisplayName,
    string? AccentHex,
    string? SecondaryHex,
    string? AccentColorHex,
    string? SuccessHex,
    string? WarningHex,
    string? ErrorHex,
    string? Typography,
    string? ThemeId,
    string? Intensity,
    string? GradientStyle,
    string? CoverKind,
    string? CoverValue,
    string? ThemeDefault,
    string? DefaultLocale,
    string? WelcomeText,
    string? LoginHeadline,
    string? Tagline,
    string? Verse,
    bool ShowSonivoCredit);
internal sealed record CreateInvitationRequest(string? Email);
internal sealed record UpdateGroupRequest(string? Name, int ExpectedVersion);
internal sealed record UpdateGroupSongTagsRequest(int ExpectedVersion, string[]? Tags);
internal sealed record ChangeMemberRoleRequest(string? Role);
internal sealed record SetMemberAccessRequest(bool? Enabled);
internal sealed record SetMusicalRoleRequest(string? MusicalRole);
internal sealed record SetMemberDescriptionRequest(string? Description);
internal sealed record SoftDeleteGroupRequest(int ExpectedVersion);
internal sealed record GroupLifecycleRequest(int ExpectedVersion, bool ConfirmPermanentDeletion = false);
internal sealed record UpdateGroupNotificationPreferencesRequest(
    bool? NotifyRoleChanges,
    bool? NotifyTaskAssignments);
internal sealed record CreateGroupRoleRequest(string? Name, string? Description, string[]? Permissions, bool? ExtendsBaseRole);
internal sealed record UpdateGroupRoleRequest(string? Name, string? Description, string[]? Permissions, bool? ExtendsBaseRole);

internal sealed record SetMemberGroupRoleRequest(Guid? GroupRoleId);


internal sealed record SetResourceGrantRequest(string? ResourceType, Guid ResourceId, bool? Granted);
