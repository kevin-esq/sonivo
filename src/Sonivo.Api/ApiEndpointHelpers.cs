using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

internal static class ApiEndpointHelpers
{
    // SECURITY-AUDIT-2026-10 (B2): the user id comes from the NameIdentifier claim
    // — the must-change-password middleware already loaded and validated the user
    // once per request (and the SecurityStampValidator runs on the same pass), so
    // endpoints must not issue a second GetUserAsync round-trip for the id alone.
    internal static Task<Guid?> RequireUserIdAsync(ClaimsPrincipal principal, UserManager<ApplicationUser> users)
    {
        if (principal.Identity?.IsAuthenticated != true)
        {
            return Task.FromResult<Guid?>(null);
        }

        var claim = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Task.FromResult(Guid.TryParse(claim, out var id) ? (Guid?)id : null);
    }

    // SECURITY-AUDIT-2026-10 (A7): single projection for every authenticated-user
    // response. Managed-account synthetic emails (@managed.invalid) are never
    // exposed, and mustChangePassword/managedByGroupId travel on EVERY login path
    // (password, handle, 2FA challenge/recover, passkey) so the SPA can gate
    // managed sessions uniformly.
    internal static object ToUserResponse(ApplicationUser user, string? handle = null) => new
    {
        id = user.Id,
        email = user.Email is { } mail && mail.EndsWith("@managed.invalid", StringComparison.Ordinal) ? null : user.Email,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed,
        mustChangePassword = user.MustChangePassword,
        managedByGroupId = user.ManagedByGroupId,
        handle
    };

    // SECURITY-AUDIT-2026-10 (B6): branding image uploads must match their magic
    // bytes — the client-supplied Content-Type alone is not trustworthy. Returns
    // the validated bytes and null error, or null bytes and the rejection result.
    internal static async Task<(MemoryStream? Stream, IResult? Error)> ReadValidatedBrandingImageAsync(
        IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length <= 0 || file.Length > BrandLogoConstraints.MaxByteSize)
        {
            return (null, Results.Problem(
                detail: $"Image must be 1 byte to {BrandLogoConstraints.MaxByteSize} bytes.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Bad Request"));
        }

        await using var raw = file.OpenReadStream();
        using var buffer = new MemoryStream();
        var copyBuffer = new byte[81920];
        var total = 0;
        int read;
        while ((read = await raw.ReadAsync(copyBuffer, cancellationToken)) > 0)
        {
            total += read;
            if (total > BrandLogoConstraints.MaxByteSize)
            {
                return (null, Results.Problem(
                    detail: $"Image must be {BrandLogoConstraints.MaxByteSize} bytes or fewer.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request"));
            }
            await buffer.WriteAsync(copyBuffer.AsMemory(0, read), cancellationToken);
        }

        var bytes = buffer.ToArray();
        if (!IsKnownImageSignature(bytes))
        {
            return (null, Results.Problem(
                detail: "Image content does not match its declared type.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Bad Request"));
        }

        return (new MemoryStream(bytes, writable: false), null);
    }

    internal static bool IsKnownImageSignature(ReadOnlySpan<byte> b) =>
        // PNG
        (b.Length >= 4 && b[0] == 0x89 && b[1] == (byte)'P' && b[2] == (byte)'N' && b[3] == (byte)'G') ||
        // JPEG
        (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) ||
        // GIF87a / GIF89a
        (b.Length >= 4 && b[0] == (byte)'G' && b[1] == (byte)'I' && b[2] == (byte)'F' && b[3] == (byte)'8') ||
        // WebP (RIFF....WEBP)
        (b.Length >= 12 && b[0] == (byte)'R' && b[1] == (byte)'I' && b[2] == (byte)'F' && b[3] == (byte)'F'
         && b[8] == (byte)'W' && b[9] == (byte)'E' && b[10] == (byte)'B' && b[11] == (byte)'P');

    internal static bool IsSongCoverImageSignature(ReadOnlySpan<byte> bytes, string contentType) => contentType switch
    {
        "image/jpeg" => bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
        "image/png" => bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47
            && bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A,
        "image/webp" => bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8),
        _ => false
    };

    // SECURITY-AUDIT-2026-10 (B8): the EF InMemory provider does not support
    // transactions (tests use UseInMemoryDatabase=true) — explicit transactions
    // only against the real PostgreSQL provider.
    internal static async Task<IDbContextTransaction?> BeginTransactionIfSupportedAsync(
        SonivoDbContext db, IConfiguration configuration, CancellationToken cancellationToken) =>
        configuration.GetValue("UseInMemoryDatabase", false)
            || db.Database.CurrentTransaction is not null
            ? null
            : await db.Database.BeginTransactionAsync(cancellationToken);

    // SECURITY-AUDIT-2026-10 (C7): text-element truncation so a 12-char cut can
    // never split a UTF-16 surrogate pair.
    internal static string TruncateByTextElements(string value, int maxElements)
    {
        if (value.Length <= maxElements)
        {
            return value;
        }

        var count = 0;
        var enumerator = StringInfo.GetTextElementEnumerator(value);
        var end = 0;
        while (enumerator.MoveNext())
        {
            count++;
            if (count == maxElements)
            {
                end = enumerator.ElementIndex + enumerator.GetTextElement().Length;
                break;
            }
        }

        return end > 0 ? value[..end] : value;
    }

    internal static object ToGroupResponse(GroupDto group) => new
    {
        id = group.Id,
        name = group.Name,
        slug = group.Slug,
        version = group.Version,
        role = group.Role,
        createdAt = group.CreatedAt,
        updatedAt = group.UpdatedAt,
        planId = group.PlanId,
        capabilities = group.Capabilities
    };

    internal static object ToGroupBySlugResponse(GroupBySlugResult result) => new
    {
        id = result.Group.Id,
        name = result.Group.Name,
        slug = result.Group.Slug,
        moved = result.Moved,
        version = result.Group.Version,
        role = result.Group.Role,
        createdAt = result.Group.CreatedAt,
        updatedAt = result.Group.UpdatedAt,
        planId = result.Group.PlanId,
        capabilities = result.Group.Capabilities
    };

    internal static object ToPlanCatalogResponse(PlanCatalogDto catalog) => new
    {
        defaultPlanId = catalog.DefaultPlanId,
        extraGroupMonthlyMxn = catalog.ExtraGroupMonthlyMxn,
        extraGroupAnnualMxn = catalog.ExtraGroupAnnualMxn,
        plans = catalog.Plans.Select(plan => new
        {
            id = plan.Id,
            priceMonthlyMxn = plan.PriceMonthlyMxn,
            priceAnnualMxn = plan.PriceAnnualMxn,
            trialDays = plan.TrialDays,
            trialRequiresCard = plan.TrialRequiresCard,
            limits = plan.Limits,
            features = plan.Features,
            capabilities = plan.Capabilities
        })
    };

    internal static object ToUsageResponse(GroupUsageDto usage) => new
    {
        planId = usage.PlanId,
        billingStatus = usage.BillingStatus,
        trialEndsAt = usage.TrialEndsAt,
        scheduledPlanId = usage.ScheduledPlanId,
        members = new { used = usage.Members.Used, limit = usage.Members.Limit },
        songs = new { used = usage.Songs.Used, limit = usage.Songs.Limit },
        setlists = new { used = usage.Setlists.Used, limit = usage.Setlists.Limit },
        eventsThisMonth = new { used = usage.EventsThisMonth.Used, limit = usage.EventsThisMonth.Limit },
        storageBytes = new { used = usage.StorageBytes.Used, limit = usage.StorageBytes.Limit }
    };

    internal static object ToPlanStateResponse(GroupPlanStateDto state) => new
    {
        planId = state.PlanId,
        billingStatus = state.BillingStatus,
        trialEndsAt = state.TrialEndsAt,
        scheduledPlanId = state.ScheduledPlanId
    };

    internal static object ToBrandingResponse(GroupBrandingDto branding) => new
    {
        groupId = branding.GroupId,
        displayName = branding.DisplayName,
        accentHex = branding.AccentHex,
        secondaryHex = branding.SecondaryHex,
        accentColorHex = branding.AccentColorHex,
        successHex = branding.SuccessHex,
        warningHex = branding.WarningHex,
        errorHex = branding.ErrorHex,
        typography = branding.Typography,
        themeId = branding.ThemeId,
        intensity = branding.Intensity,
        gradientStyle = branding.GradientStyle,
        onPrimary = branding.OnPrimary,
        onSecondary = branding.OnSecondary,
        onAccent = branding.OnAccent,
        coverKind = branding.CoverKind,
        coverValue = branding.CoverValue,
        themeDefault = branding.ThemeDefault,
        defaultLocale = branding.DefaultLocale,
        welcomeText = branding.WelcomeText,
        loginHeadline = branding.LoginHeadline,
        tagline = branding.Tagline,
        verse = branding.Verse,
        hasLogo = branding.HasLogo,
        logoUrl = branding.HasLogo ? $"/api/groups/{branding.GroupId}/branding/logo" : null,
        hasBanner = branding.HasBanner,
        bannerUrl = branding.HasBanner ? $"/api/groups/{branding.GroupId}/branding/banner" : null,
        hasFavicon = branding.HasFavicon,
        faviconUrl = branding.HasFavicon ? $"/api/groups/{branding.GroupId}/branding/favicon" : null,
        showSonivoCredit = branding.ShowSonivoCredit,
        version = branding.Version
    };

    internal static object ToGroupListResponse(GroupListItem item) => new
    {
        id = item.Id,
        name = item.Name,
        slug = item.Slug,
        role = item.Role,
        version = item.Version,
        createdAt = item.CreatedAt,
        memberCount = item.MemberCount,
        nextEventAt = item.NextEventAt,
        lastActivityAt = item.LastActivityAt
    };

    internal static object ToUpcomingActivityResponse(UpcomingActivityItem item) => new
    {
        groupId = item.GroupId,
        groupName = item.GroupName,
        eventId = item.EventId,
        title = item.Title,
        type = item.Type,
        startsAt = item.StartsAt,
        myResponse = item.MyResponse
    };

    internal static object ToInvitationCreatedResponse(InvitationCreatedDto invitation) => new
    {
        id = invitation.Id,
        token = invitation.Token,
        expiresAt = invitation.ExpiresAt,
        emailed = invitation.Emailed
    };

    internal static object ToInvitationAcceptedResponse(InvitationAcceptedDto accepted) => new
    {
        groupId = accepted.GroupId,
        role = accepted.Role
    };

    internal static object ToSongListResponse(SongListItemDto song) => new
    {
        id = song.Id,
        title = song.Title,
        attribution = song.Attribution,
        originKind = song.OriginKind,
        genre = song.Genre,
        album = song.Album,
        releaseYear = song.ReleaseYear,
        hasCoverImage = song.HasCoverImage,
        version = song.Version,
        createdAt = song.CreatedAt,
        updatedAt = song.UpdatedAt,
        tags = song.Tags,
        isFavorite = song.IsFavorite
    };

    internal static object ToSongDetailResponse(SongDetailDto song) => new
    {
        id = song.Id,
        title = song.Title,
        attribution = song.Attribution,
        originKind = song.OriginKind,
        genre = song.Genre,
        album = song.Album,
        releaseYear = song.ReleaseYear,
        hasCoverImage = song.HasCoverImage,
        rightsNotes = song.RightsNotes,
        version = song.Version,
        createdAt = song.CreatedAt,
        updatedAt = song.UpdatedAt,
        arrangementCount = song.ArrangementCount,
        tags = song.Tags,
        isFavorite = song.IsFavorite
    };

    internal static object ToArrangementListResponse(ArrangementListItemDto arrangement) => new
    {
        id = arrangement.Id,
        songId = arrangement.SongId,
        label = arrangement.Label,
        defaultKey = arrangement.DefaultKey,
        defaultBpm = arrangement.DefaultBpm,
        version = arrangement.Version,
        createdAt = arrangement.CreatedAt,
        updatedAt = arrangement.UpdatedAt,
        isDefault = arrangement.IsDefault
    };

    internal static object ToArrangementDetailResponse(ArrangementDetailDto arrangement) => new
    {
        id = arrangement.Id,
        songId = arrangement.SongId,
        label = arrangement.Label,
        defaultKey = arrangement.DefaultKey,
        defaultBpm = arrangement.DefaultBpm,
        lyrics = arrangement.Lyrics,
        chords = arrangement.Chords,
        structure = arrangement.Structure,
        notes = arrangement.Notes,
        chordTimingJson = arrangement.ChordTimingJson,
        harmonyJson = arrangement.HarmonyJson,
        version = arrangement.Version,
        createdAt = arrangement.CreatedAt,
        updatedAt = arrangement.UpdatedAt,
        resources = arrangement.Resources.Select(r => new
        {
            id = r.Id,
            arrangementId = r.ArrangementId,
            kind = r.Kind,
            purpose = r.Purpose,
            label = r.Label,
            part = r.Part,
            note = r.Note,
            url = r.Url,
            originalFileName = r.OriginalFileName,
            contentType = r.ContentType,
            byteSize = r.ByteSize,
            createdAt = r.CreatedAt
        })
    };

    internal static object ToGroupResourceResponse(GroupResourceListItemDto resource) => new
    {
        id = resource.Id,
        arrangementId = resource.ArrangementId,
        songId = resource.SongId,
        songTitle = resource.SongTitle,
        arrangementLabel = resource.ArrangementLabel,
        kind = resource.Kind,
        purpose = resource.Purpose,
        label = resource.Label,
        part = resource.Part,
        note = resource.Note,
        url = resource.Url,
        originalFileName = resource.OriginalFileName,
        contentType = resource.ContentType,
        byteSize = resource.ByteSize,
        createdAt = resource.CreatedAt
    };

    internal static object ToResourceSummaryResponse(ResourceSummaryDto resource) => new
    {
        id = resource.Id,
        arrangementId = resource.ArrangementId,
        kind = resource.Kind,
        purpose = resource.Purpose,
        label = resource.Label,
        part = resource.Part,
        note = resource.Note,
        url = resource.Url,
        originalFileName = resource.OriginalFileName,
        contentType = resource.ContentType,
        byteSize = resource.ByteSize,
        createdAt = resource.CreatedAt
    };

    internal static object ToResourceDetailResponse(ResourceDetailDto resource) => new
    {
        id = resource.Id,
        arrangementId = resource.ArrangementId,
        kind = resource.Kind,
        purpose = resource.Purpose,
        label = resource.Label,
        part = resource.Part,
        note = resource.Note,
        url = resource.Url,
        originalFileName = resource.OriginalFileName,
        contentType = resource.ContentType,
        byteSize = resource.ByteSize,
        createdAt = resource.CreatedAt
    };

    internal static string? NullIfWhiteSpace(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value;

    /// <summary>
    /// Browsers often send empty or application/octet-stream for .txt uploads; infer from extension.
    /// </summary>
    internal static string ResolveUploadContentType(string? declaredContentType, string? fileName)
    {
        var mediaType = declaredContentType?.Split(';', 2)[0].Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(mediaType)
            && !string.Equals(mediaType, "application/octet-stream", StringComparison.OrdinalIgnoreCase)
            && ResourceFileConstraints.IsAllowedContentType(mediaType))
        {
            return mediaType;
        }

        var ext = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();
        return ext switch
        {
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".mp3" => "audio/mpeg",
            ".flac" => "audio/flac",
            ".aac" => "audio/aac",
            ".ogg" => "audio/ogg",
            ".wav" => "audio/wav",
            ".m4a" or ".mp4" => "audio/mp4",
            ".txt" => "text/plain",
            _ => mediaType
        };
    }

    internal static object ToSetlistListResponse(SetlistListItemDto setlist) => new
    {
        id = setlist.Id,
        name = setlist.Name,
        version = setlist.Version,
        itemCount = setlist.ItemCount,
        createdAt = setlist.CreatedAt,
        updatedAt = setlist.UpdatedAt
    };

    internal static object ToSetlistDetailResponse(SetlistDetailDto setlist) => new
    {
        id = setlist.Id,
        name = setlist.Name,
        version = setlist.Version,
        createdAt = setlist.CreatedAt,
        updatedAt = setlist.UpdatedAt,
        items = setlist.Items.Select(i => new
        {
            id = i.Id,
            arrangementId = i.ArrangementId,
            sortOrder = i.SortOrder,
            songTitle = i.SongTitle,
            arrangementLabel = i.ArrangementLabel
        })
    };

    internal static object ToEventListResponse(EventListItemDto musicalEvent) => new
    {
        id = musicalEvent.Id,
        title = musicalEvent.Title,
        type = musicalEvent.Type,
        startsAt = musicalEvent.StartsAt,
        status = musicalEvent.Status,
        version = musicalEvent.Version,
        createdAt = musicalEvent.CreatedAt,
        updatedAt = musicalEvent.UpdatedAt
    };

    internal static object ToEventDetailResponse(EventDetailDto musicalEvent) => new
    {
        id = musicalEvent.Id,
        title = musicalEvent.Title,
        type = musicalEvent.Type,
        startsAt = musicalEvent.StartsAt,
        status = musicalEvent.Status,
        version = musicalEvent.Version,
        createdAt = musicalEvent.CreatedAt,
        updatedAt = musicalEvent.UpdatedAt,
        sourceSetlistId = musicalEvent.SourceSetlistId,
        items = musicalEvent.Items.Select(i => new
        {
            id = i.Id,
            arrangementId = i.ArrangementId,
            sortOrder = i.SortOrder,
            displaySongTitle = i.DisplaySongTitle,
            displayArrangementLabel = i.DisplayArrangementLabel
        })
    };

    internal static IResult CreateResourceContentResult(ResourceContentDto content, HttpContext httpContext)
    {
        var response = httpContext.Response;
        if (content.RangeStart is long start && content.RangeEnd is long end)
        {
            response.StatusCode = StatusCodes.Status206PartialContent;
            response.Headers.ContentRange = $"bytes {start}-{end}/{content.ByteSize}";
            response.Headers.AcceptRanges = "bytes";
            response.ContentLength = end - start + 1;
            return Results.Stream(content.Content, content.ContentType, content.DownloadFileName);
        }

        if (content.SupportsByteRanges)
        {
            response.Headers.AcceptRanges = "bytes";
        }

        if (!content.Content.CanSeek)
        {
            response.ContentLength = content.ByteSize;
        }

        return Results.File(
            content.Content,
            content.ContentType,
            fileDownloadName: content.DownloadFileName,
            enableRangeProcessing: content.Content.CanSeek);
    }
}
