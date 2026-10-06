using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record GroupBrandingDto(
    Guid GroupId,
    string? DisplayName,
    string? AccentHex,
    string? SecondaryHex,
    string? AccentColorHex,
    string? SuccessHex,
    string? WarningHex,
    string? ErrorHex,
    string? Typography,
    string? OnPrimary,
    string? OnSecondary,
    string? OnAccent,
    string? CoverKind,
    string? CoverValue,
    string? ThemeDefault,
    string? DefaultLocale,
    string? WelcomeText,
    string? LoginHeadline,
    string? Tagline,
    string? Verse,
    bool HasLogo,
    bool HasBanner,
    bool HasFavicon,
    bool ShowSonivoCredit,
    int Version);

public sealed record UpdateGroupBrandingCommand(
    Guid UserId,
    Guid GroupId,
    int ExpectedVersion,
    string? DisplayName,
    string? AccentHex,
    string? SecondaryHex,
    string? AccentColorHex,
    string? SuccessHex,
    string? WarningHex,
    string? ErrorHex,
    string? Typography,
    string? CoverKind,
    string? CoverValue,
    string? ThemeDefault,
    string? DefaultLocale,
    string? WelcomeText,
    string? LoginHeadline,
    string? Tagline,
    string? Verse,
    bool ShowSonivoCredit);

public sealed record SetGroupLogoCommand(
    Guid UserId,
    Guid GroupId,
    string ContentType,
    long ByteSize,
    Stream Content);

public sealed record SetGroupBannerCommand(
    Guid UserId,
    Guid GroupId,
    string ContentType,
    long ByteSize,
    Stream Content);

public sealed record SetGroupFaviconCommand(
    Guid UserId,
    Guid GroupId,
    string ContentType,
    long ByteSize,
    Stream Content);

public sealed record PublicBrandingDto(
    string? Name,
    string? LogoUrl,
    string? AccentHex,
    string? LoginHeadline,
    string? SecondaryHex = null,
    string? BannerUrl = null);

/// <summary>Logo upload limits: size cap + content-type allowlist (no re-encode yet).</summary>
public static class BrandLogoConstraints
{
    public const long MaxByteSize = 2 * 1024 * 1024;

    public static readonly IReadOnlyList<string> AllowedContentTypes =
    [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif"
    ];

    public static bool IsAllowed(string? contentType) =>
        contentType is not null && AllowedContentTypes.Contains(contentType.ToLowerInvariant());
}

public sealed class GetGroupBrandingHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;

    public GetGroupBrandingHandler(GroupAccessService access, IGroupBrandingStore store)
    {
        _access = access;
        _store = store;
    }

    public async Task<GroupBrandingDto> HandleAsync(Guid userId, Guid groupId, CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var branding = await _store.GetAsync(groupId, cancellationToken);
        return ToDto(groupId, branding);
    }

    internal static GroupBrandingDto ToDto(Guid groupId, GroupBranding? branding) =>
        branding is null
            ? new GroupBrandingDto(groupId, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, false, false, false, true, 0)
            : new GroupBrandingDto(
                groupId,
                branding.DisplayName,
                branding.AccentHex,
                branding.SecondaryHex,
                branding.AccentColorHex,
                branding.SuccessHex,
                branding.WarningHex,
                branding.ErrorHex,
                branding.Typography,
                branding.AccentHex is null ? null : BrandAccent.OnColor(branding.AccentHex),
                branding.SecondaryHex is null ? null : BrandAccent.OnColor(branding.SecondaryHex),
                branding.AccentColorHex is null ? null : BrandAccent.OnColor(branding.AccentColorHex),
                branding.CoverKind,
                branding.CoverValue,
                branding.ThemeDefault,
                branding.DefaultLocale,
                branding.WelcomeText,
                branding.LoginHeadline,
                branding.Tagline,
                branding.Verse,
                branding.LogoBlobKey is not null,
                branding.BannerBlobKey is not null,
                branding.FaviconBlobKey is not null,
                branding.ShowSonivoCredit,
                branding.Version);
}

public sealed class UpdateGroupBrandingHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;
    private readonly IGroupStore _groups;
    private readonly IClock _clock;

    public UpdateGroupBrandingHandler(
        GroupAccessService access,
        IGroupBrandingStore store,
        IGroupStore groups,
        IClock clock)
    {
        _access = access;
        _store = store;
        _groups = groups;
        _clock = clock;
    }

    public async Task<GroupBrandingDto> HandleAsync(
        UpdateGroupBrandingCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        // Plan gating (ADR-0071): the server is authoritative — reject fields the
        // group's plan does not include. The default plan keeps every capability.
        var group = await _groups.GetByIdAsync(command.GroupId, cancellationToken)
            ?? throw new NotFoundException("Group not found.");
        BrandingGating.EnsureAllowed(PlanCatalog.BrandingCapabilitiesFor(group.PlanId), command);

        var branding = await _store.GetAsync(command.GroupId, cancellationToken);
        var now = _clock.UtcNow;

        if (branding is null)
        {
            if (command.ExpectedVersion != 0)
            {
                throw new ConflictException("Branding version mismatch.");
            }

            branding = GroupBranding.Create(command.GroupId, now);
            await _store.AddAsync(branding, cancellationToken);
        }
        else if (branding.Version != command.ExpectedVersion)
        {
            throw new ConflictException("Branding version mismatch.");
        }

        try
        {
            branding.Update(
                command.DisplayName,
                command.AccentHex,
                command.SecondaryHex,
                command.AccentColorHex,
                command.SuccessHex,
                command.WarningHex,
                command.ErrorHex,
                command.Typography,
                command.CoverKind,
                command.CoverValue,
                command.ThemeDefault,
                command.DefaultLocale,
                command.WelcomeText,
                command.LoginHeadline,
                command.Tagline,
                command.Verse,
                command.ShowSonivoCredit,
                now);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _store.SaveChangesAsync(cancellationToken);
        return GetGroupBrandingHandler.ToDto(command.GroupId, branding);
    }
}

public sealed class SetGroupLogoHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;
    private readonly IBlobStore _blobs;
    private readonly IClock _clock;

    public SetGroupLogoHandler(
        GroupAccessService access,
        IGroupBrandingStore store,
        IBlobStore blobs,
        IClock clock)
    {
        _access = access;
        _store = store;
        _blobs = blobs;
        _clock = clock;
    }

    public async Task<GroupBrandingDto> HandleAsync(SetGroupLogoCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        if (command.ByteSize <= 0 || command.ByteSize > BrandLogoConstraints.MaxByteSize)
        {
            throw new ValidationException($"Logo must be 1 byte to {BrandLogoConstraints.MaxByteSize} bytes.");
        }

        var contentType = command.ContentType.ToLowerInvariant();
        if (!BrandLogoConstraints.IsAllowed(contentType))
        {
            throw new ValidationException("Logo must be a PNG, JPEG, WebP or GIF image.");
        }

        var branding = await _store.GetAsync(command.GroupId, cancellationToken);
        var now = _clock.UtcNow;
        if (branding is null)
        {
            branding = GroupBranding.Create(command.GroupId, now);
            await _store.AddAsync(branding, cancellationToken);
        }

        var previousKey = branding.LogoBlobKey;
        var key = $"group-branding/{command.GroupId}/logo-{Guid.NewGuid():N}";
        await _blobs.PutAsync(key, command.Content, contentType, command.ByteSize, cancellationToken);

        if (previousKey is not null && previousKey != key)
        {
            await _blobs.DeleteAsync(previousKey, cancellationToken);
        }

        branding.SetLogo(key, contentType, now);
        await _store.SaveChangesAsync(cancellationToken);
        return GetGroupBrandingHandler.ToDto(command.GroupId, branding);
    }
}

public sealed class GetGroupLogoHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;
    private readonly IBlobStore _blobs;

    public GetGroupLogoHandler(GroupAccessService access, IGroupBrandingStore store, IBlobStore blobs)
    {
        _access = access;
        _store = store;
        _blobs = blobs;
    }

    public async Task<BlobContent?> HandleAsync(Guid userId, Guid groupId, CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var branding = await _store.GetAsync(groupId, cancellationToken);
        return branding?.LogoBlobKey is { } key
            ? await _blobs.GetAsync(key, cancellationToken)
            : null;
    }
}

public sealed class SetGroupBannerHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;
    private readonly IBlobStore _blobs;
    private readonly IClock _clock;

    public SetGroupBannerHandler(
        GroupAccessService access,
        IGroupBrandingStore store,
        IBlobStore blobs,
        IClock clock)
    {
        _access = access;
        _store = store;
        _blobs = blobs;
        _clock = clock;
    }

    public async Task<GroupBrandingDto> HandleAsync(SetGroupBannerCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        if (command.ByteSize <= 0 || command.ByteSize > BrandLogoConstraints.MaxByteSize)
        {
            throw new ValidationException($"Banner must be 1 byte to {BrandLogoConstraints.MaxByteSize} bytes.");
        }

        var contentType = command.ContentType.ToLowerInvariant();
        if (!BrandLogoConstraints.IsAllowed(contentType))
        {
            throw new ValidationException("Banner must be a PNG, JPEG, WebP or GIF image.");
        }

        var branding = await _store.GetAsync(command.GroupId, cancellationToken);
        var now = _clock.UtcNow;
        if (branding is null)
        {
            branding = GroupBranding.Create(command.GroupId, now);
            await _store.AddAsync(branding, cancellationToken);
        }

        var previousKey = branding.BannerBlobKey;
        var key = $"group-branding/{command.GroupId}/banner-{Guid.NewGuid():N}";
        await _blobs.PutAsync(key, command.Content, contentType, command.ByteSize, cancellationToken);

        if (previousKey is not null && previousKey != key)
        {
            await _blobs.DeleteAsync(previousKey, cancellationToken);
        }

        branding.SetBanner(key, contentType, now);
        await _store.SaveChangesAsync(cancellationToken);
        return GetGroupBrandingHandler.ToDto(command.GroupId, branding);
    }
}

public sealed class GetGroupBannerHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;
    private readonly IBlobStore _blobs;

    public GetGroupBannerHandler(GroupAccessService access, IGroupBrandingStore store, IBlobStore blobs)
    {
        _access = access;
        _store = store;
        _blobs = blobs;
    }

    public async Task<BlobContent?> HandleAsync(Guid userId, Guid groupId, CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var branding = await _store.GetAsync(groupId, cancellationToken);
        return branding?.BannerBlobKey is { } key
            ? await _blobs.GetAsync(key, cancellationToken)
            : null;
    }
}

public sealed class SetGroupFaviconHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;
    private readonly IBlobStore _blobs;
    private readonly IClock _clock;

    public SetGroupFaviconHandler(
        GroupAccessService access,
        IGroupBrandingStore store,
        IBlobStore blobs,
        IClock clock)
    {
        _access = access;
        _store = store;
        _blobs = blobs;
        _clock = clock;
    }

    public async Task<GroupBrandingDto> HandleAsync(SetGroupFaviconCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        if (command.ByteSize <= 0 || command.ByteSize > BrandLogoConstraints.MaxByteSize)
        {
            throw new ValidationException($"Favicon must be 1 byte to {BrandLogoConstraints.MaxByteSize} bytes.");
        }

        var contentType = command.ContentType.ToLowerInvariant();
        if (!BrandLogoConstraints.IsAllowed(contentType))
        {
            throw new ValidationException("Favicon must be a PNG, JPEG, WebP or GIF image.");
        }

        var branding = await _store.GetAsync(command.GroupId, cancellationToken);
        var now = _clock.UtcNow;
        if (branding is null)
        {
            branding = GroupBranding.Create(command.GroupId, now);
            await _store.AddAsync(branding, cancellationToken);
        }

        var previousKey = branding.FaviconBlobKey;
        var key = $"group-branding/{command.GroupId}/favicon-{Guid.NewGuid():N}";
        await _blobs.PutAsync(key, command.Content, contentType, command.ByteSize, cancellationToken);

        if (previousKey is not null && previousKey != key)
        {
            await _blobs.DeleteAsync(previousKey, cancellationToken);
        }

        branding.SetFavicon(key, contentType, now);
        await _store.SaveChangesAsync(cancellationToken);
        return GetGroupBrandingHandler.ToDto(command.GroupId, branding);
    }
}

public sealed class GetGroupFaviconHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupBrandingStore _store;
    private readonly IBlobStore _blobs;

    public GetGroupFaviconHandler(GroupAccessService access, IGroupBrandingStore store, IBlobStore blobs)
    {
        _access = access;
        _store = store;
        _blobs = blobs;
    }

    public async Task<BlobContent?> HandleAsync(Guid userId, Guid groupId, CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(groupId, userId, cancellationToken);
        var branding = await _store.GetAsync(groupId, cancellationToken);
        return branding?.FaviconBlobKey is { } key
            ? await _blobs.GetAsync(key, cancellationToken)
            : null;
    }
}

/// <summary>
/// Anonymous, uniform branding read for the branded access screen (ADR-0048):
/// always 200; unknown slug and group without branding return the same empty
/// payload so the slug cannot be enumerated.
/// </summary>
public sealed class GetPublicBrandingHandler
{
    private readonly IGroupStore _groups;
    private readonly IGroupBrandingStore _branding;

    public GetPublicBrandingHandler(IGroupStore groups, IGroupBrandingStore branding)
    {
        _groups = groups;
        _branding = branding;
    }

    public async Task<PublicBrandingDto> HandleAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = (slug ?? string.Empty).Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalized))
        {
            return new PublicBrandingDto(null, null, null, null);
        }

        var group = await _groups.GetByAnySlugAsync(normalized, cancellationToken);
        if (group is null)
        {
            return new PublicBrandingDto(null, null, null, null);
        }

        var branding = await _branding.GetAsync(group.Id, cancellationToken);
        // Only an explicit display name makes a group distinguishable here; a group
        // without branding returns the same empty payload as an unknown slug (no
        // enumeration).
        var name = branding?.DisplayName;
        var logoUrl = branding?.LogoBlobKey is null
            ? null
            : $"/api/groups/by-slug/{group.Slug}/branding/logo";
        var bannerUrl = branding?.BannerBlobKey is null
            ? null
            : $"/api/groups/by-slug/{group.Slug}/branding/banner";

        return new PublicBrandingDto(
            name,
            logoUrl,
            branding?.AccentHex,
            branding?.LoginHeadline,
            branding?.SecondaryHex,
            bannerUrl);
    }
}

public sealed class GetPublicBrandingLogoHandler
{
    private readonly IGroupStore _groups;
    private readonly IGroupBrandingStore _branding;
    private readonly IBlobStore _blobs;

    public GetPublicBrandingLogoHandler(IGroupStore groups, IGroupBrandingStore branding, IBlobStore blobs)
    {
        _groups = groups;
        _branding = branding;
        _blobs = blobs;
    }

    public async Task<BlobContent?> HandleAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = (slug ?? string.Empty).Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalized))
        {
            return null;
        }

        var group = await _groups.GetByAnySlugAsync(normalized, cancellationToken);
        if (group is null)
        {
            return null;
        }

        var branding = await _branding.GetAsync(group.Id, cancellationToken);
        return branding?.LogoBlobKey is { } key
            ? await _blobs.GetAsync(key, cancellationToken)
            : null;
    }
}

public sealed class GetPublicBrandingBannerHandler
{
    private readonly IGroupStore _groups;
    private readonly IGroupBrandingStore _branding;
    private readonly IBlobStore _blobs;

    public GetPublicBrandingBannerHandler(IGroupStore groups, IGroupBrandingStore branding, IBlobStore blobs)
    {
        _groups = groups;
        _branding = branding;
        _blobs = blobs;
    }

    public async Task<BlobContent?> HandleAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = (slug ?? string.Empty).Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalized))
        {
            return null;
        }

        var group = await _groups.GetByAnySlugAsync(normalized, cancellationToken);
        if (group is null)
        {
            return null;
        }

        var branding = await _branding.GetAsync(group.Id, cancellationToken);
        return branding?.BannerBlobKey is { } key
            ? await _blobs.GetAsync(key, cancellationToken)
            : null;
    }
}
