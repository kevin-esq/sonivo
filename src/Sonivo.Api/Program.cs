using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

var listenPort = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(listenPort))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{listenPort}");
}

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddApplication();
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies();
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "sonivo.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.SlidingExpiration = true;
    options.ExpireTimeSpan = TimeSpan.FromDays(14);
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});

builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "sonivo.csrf";
    options.Cookie.HttpOnly = false;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
});

if (!builder.Environment.IsDevelopment())
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
    });
}

builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions["traceId"] =
            context.HttpContext.TraceIdentifier;
    };
});

builder.Services.AddExceptionHandler<AppExceptionHandler>();
builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders();
}

if (app.Configuration.GetValue("SONIVO_MIGRATE_ON_START", false))
{
    using var migrateScope = app.Services.CreateScope();
    var db = migrateScope.ServiceProvider.GetRequiredService<SonivoDbContext>();
    db.Database.Migrate();
}

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();

app.Use(async (context, next) =>
{
    context.Response.Headers.TryAdd("X-Request-Id", context.TraceIdentifier);
    await next();
});

app.Use(async (context, next) =>
{
    var method = context.Request.Method;
    if (HttpMethods.IsPost(method)
        || HttpMethods.IsPut(method)
        || HttpMethods.IsPatch(method)
        || HttpMethods.IsDelete(method))
    {
        var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
        try
        {
            await antiforgery.ValidateRequestAsync(context);
        }
        catch (AntiforgeryValidationException)
        {
            await Results.Problem(
                    detail: "Invalid or missing CSRF token.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request")
                .ExecuteAsync(context);
            return;
        }
    }

    await next();
});

if (!app.Environment.IsDevelopment())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }))
    .WithName("Health")
    .AllowAnonymous();

app.MapGet("/api/auth/csrf", (HttpContext http, IAntiforgery antiforgery) =>
{
    var tokens = antiforgery.GetAndStoreTokens(http);
    return Results.Ok(new { token = tokens.RequestToken });
})
.WithName("GetCsrfToken")
.AllowAnonymous();

app.MapPost("/api/auth/register", async (
    RegisterRequest request,
    UserManager<ApplicationUser> users) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.Problem(
            detail: "Email and password are required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    var user = new ApplicationUser
    {
        Id = Guid.NewGuid(),
        UserName = request.Email.Trim(),
        Email = request.Email.Trim(),
        DisplayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? null
            : request.DisplayName.Trim()
    };

    var result = await users.CreateAsync(user, request.Password);
    if (!result.Succeeded)
    {
        var duplicate = result.Errors.Any(e =>
            e.Code is "DuplicateUserName" or "DuplicateEmail");
        return Results.Problem(
            detail: string.Join(" ", result.Errors.Select(e => e.Description)),
            statusCode: duplicate ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest,
            title: duplicate ? "Conflict" : "Validation failed");
    }

    return Results.Created($"/api/auth/me", new
    {
        id = user.Id,
        email = user.Email,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed
    });
})
.WithName("Register")
.AllowAnonymous()
.DisableAntiforgery();

app.MapPost("/api/auth/login", async (
    LoginRequest request,
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signInManager) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.Problem(
            detail: "Email and password are required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    var user = await users.FindByEmailAsync(request.Email.Trim());
    if (user is null)
    {
        return Results.Problem(
            detail: "Invalid email or password.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    var result = await signInManager.CheckPasswordSignInAsync(
        user,
        request.Password,
        lockoutOnFailure: true);

    if (result.IsLockedOut)
    {
        return Results.Problem(
            detail: "Account temporarily locked.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    if (!result.Succeeded)
    {
        return Results.Problem(
            detail: "Invalid email or password.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    await signInManager.SignInAsync(user, isPersistent: request.RememberMe);
    return Results.Ok(new
    {
        id = user.Id,
        email = user.Email,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed
    });
})
.WithName("Login")
.AllowAnonymous()
.DisableAntiforgery();

app.MapGet("/api/auth/me", async (ClaimsPrincipal principal, UserManager<ApplicationUser> users) =>
{
    if (principal.Identity?.IsAuthenticated != true)
    {
        return Results.Unauthorized();
    }

    var appUser = await users.GetUserAsync(principal);
    if (appUser is null)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(new
    {
        id = appUser.Id,
        email = appUser.Email,
        displayName = appUser.DisplayName,
        emailConfirmed = appUser.EmailConfirmed
    });
})
.WithName("GetCurrentUser")
.RequireAuthorization();

app.MapPost("/api/auth/logout", async (SignInManager<ApplicationUser> signInManager) =>
{
    await signInManager.SignOutAsync();
    return Results.NoContent();
})
.WithName("Logout")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListMyGroupsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var groups = await handler.HandleAsync(userId.Value, cancellationToken);
    return Results.Ok(groups.Select(ToGroupListResponse));
})
.WithName("ListMyGroups")
.RequireAuthorization();

app.MapPost("/api/groups", async (
    CreateGroupRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateGroupHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateGroupCommand(userId.Value, request.Name ?? string.Empty),
        cancellationToken);

    return Results.Created($"/api/groups/{created.Id}", ToGroupResponse(created));
})
.WithName("CreateGroup")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetGroupHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var group = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
    return Results.Ok(ToGroupResponse(group));
})
.WithName("GetGroup")
.RequireAuthorization();

app.MapPatch("/api/groups/{groupId:guid}", async (
    Guid groupId,
    UpdateGroupRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateGroupHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateGroupCommand(
            userId.Value,
            groupId,
            request.Name ?? string.Empty,
            request.ExpectedVersion),
        cancellationToken);

    return Results.Ok(ToGroupResponse(updated));
})
.WithName("UpdateGroup")
.RequireAuthorization()
.DisableAntiforgery();

app.MapDelete("/api/groups/{groupId:guid}", async (
    Guid groupId,
    [FromBody] SoftDeleteGroupRequest? request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SoftDeleteGroupHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new SoftDeleteGroupCommand(
            userId.Value,
            groupId,
            request?.ExpectedVersion ?? 0),
        cancellationToken);

    return Results.NoContent();
})
.WithName("SoftDeleteGroup")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/members", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListMembersHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var list = await handler.HandleAsync(new ListMembersQuery(userId.Value, groupId), cancellationToken);
    return Results.Ok(new
    {
        items = list.Items.Select(i => new
        {
            userId = i.UserId,
            displayName = i.DisplayName,
            role = i.Role,
            createdAt = i.CreatedAt
        })
    });
})
.WithName("ListGroupMembers")
.RequireAuthorization();

app.MapDelete("/api/groups/{groupId:guid}/members/{targetUserId:guid}", async (
    Guid groupId,
    Guid targetUserId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    RemoveMemberHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new RemoveMemberCommand(userId.Value, groupId, targetUserId),
        cancellationToken);
    return Results.NoContent();
})
.WithName("RemoveGroupMember")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPost("/api/groups/{groupId:guid}/members/{targetUserId:guid}/role", async (
    Guid groupId,
    Guid targetUserId,
    ChangeMemberRoleRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ChangeMemberRoleHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new ChangeMemberRoleCommand(userId.Value, groupId, targetUserId, request.Role),
        cancellationToken);
    return Results.NoContent();
})
.WithName("ChangeGroupMemberRole")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPost("/api/groups/{groupId:guid}/leave", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    LeaveGroupHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(new LeaveGroupCommand(userId.Value, groupId), cancellationToken);
    return Results.NoContent();
})
.WithName("LeaveGroup")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPost("/api/groups/{groupId:guid}/invitations", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateInvitationHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateInvitationCommand(userId.Value, groupId),
        cancellationToken);

    return Results.Created(
        $"/api/groups/{groupId}/invitations/{created.Id}",
        ToInvitationCreatedResponse(created));
})
.WithName("CreateInvitation")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/invitations", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListInvitationsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var list = await handler.HandleAsync(new ListInvitationsQuery(userId.Value, groupId), cancellationToken);
    return Results.Ok(new
    {
        items = list.Items.Select(i => new
        {
            id = i.Id,
            createdAt = i.CreatedAt,
            expiresAt = i.ExpiresAt
        })
    });
})
.WithName("ListGroupInvitations")
.RequireAuthorization();

app.MapDelete("/api/groups/{groupId:guid}/invitations/{invitationId:guid}", async (
    Guid groupId,
    Guid invitationId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    RevokeInvitationHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new RevokeInvitationCommand(userId.Value, groupId, invitationId),
        cancellationToken);
    return Results.NoContent();
})
.WithName("RevokeGroupInvitation")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPost("/api/invitations/{token}/accept", async (
    string token,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    AcceptInvitationHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var accepted = await handler.HandleAsync(
        new AcceptInvitationCommand(userId.Value, token),
        cancellationToken);

    return Results.Ok(ToInvitationAcceptedResponse(accepted));
})
.WithName("AcceptInvitation")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/songs", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListSongsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var songs = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
    return Results.Ok(songs.Select(ToSongListResponse));
})
.WithName("ListSongs")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/songs", async (
    Guid groupId,
    CreateSongRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateSongHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateSongCommand(
            userId.Value,
            groupId,
            request.Title ?? string.Empty,
            request.Attribution,
            request.OriginKind ?? string.Empty,
            request.RightsNotes),
        cancellationToken);

    return Results.Created($"/api/groups/{groupId}/songs/{created.Id}", ToSongDetailResponse(created));
})
.WithName("CreateSong")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/songs/{songId:guid}", async (
    Guid groupId,
    Guid songId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetSongHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var song = await handler.HandleAsync(userId.Value, groupId, songId, cancellationToken);
    return Results.Ok(ToSongDetailResponse(song));
})
.WithName("GetSong")
.RequireAuthorization();

app.MapPatch("/api/groups/{groupId:guid}/songs/{songId:guid}", async (
    Guid groupId,
    Guid songId,
    UpdateSongRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateSongHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateSongCommand(
            userId.Value,
            groupId,
            songId,
            request.Title,
            request.Attribution,
            request.OriginKind,
            request.RightsNotes,
            request.ExpectedVersion),
        cancellationToken);

    return Results.Ok(ToSongDetailResponse(updated));
})
.WithName("UpdateSong")
.RequireAuthorization()
.DisableAntiforgery();

app.MapDelete("/api/groups/{groupId:guid}/songs/{songId:guid}", async (
    Guid groupId,
    Guid songId,
    [FromBody] SoftDeleteSongRequest? request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SoftDeleteSongHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new SoftDeleteSongCommand(
            userId.Value,
            groupId,
            songId,
            request?.ExpectedVersion ?? 0),
        cancellationToken);

    return Results.NoContent();
})
.WithName("SoftDeleteSong")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/songs/{songId:guid}/arrangements", async (
    Guid groupId,
    Guid songId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListArrangementsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var arrangements = await handler.HandleAsync(userId.Value, groupId, songId, cancellationToken);
    return Results.Ok(arrangements.Select(ToArrangementListResponse));
})
.WithName("ListArrangements")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/songs/{songId:guid}/arrangements", async (
    Guid groupId,
    Guid songId,
    CreateArrangementRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateArrangementHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateArrangementCommand(
            userId.Value,
            groupId,
            songId,
            request.Label ?? string.Empty,
            request.DefaultKey,
            request.DefaultBpm,
            request.Lyrics,
            request.Chords,
            request.Structure,
            request.Notes),
        cancellationToken);

    return Results.Created(
        $"/api/groups/{groupId}/arrangements/{created.Id}",
        ToArrangementDetailResponse(created));
})
.WithName("CreateArrangement")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}", async (
    Guid groupId,
    Guid arrangementId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetArrangementHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var arrangement = await handler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);
    return Results.Ok(ToArrangementDetailResponse(arrangement));
})
.WithName("GetArrangement")
.RequireAuthorization();

app.MapPatch("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}", async (
    Guid groupId,
    Guid arrangementId,
    UpdateArrangementRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateArrangementHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateArrangementCommand(
            userId.Value,
            groupId,
            arrangementId,
            request.Label,
            request.DefaultKey,
            request.DefaultBpm,
            request.Lyrics,
            request.Chords,
            request.Structure,
            request.Notes,
            request.ExpectedVersion),
        cancellationToken);

    return Results.Ok(ToArrangementDetailResponse(updated));
})
.WithName("UpdateArrangement")
.RequireAuthorization()
.DisableAntiforgery();

app.MapDelete("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}", async (
    Guid groupId,
    Guid arrangementId,
    [FromBody] SoftDeleteArrangementRequest? request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SoftDeleteArrangementHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new SoftDeleteArrangementCommand(
            userId.Value,
            groupId,
            arrangementId,
            request?.ExpectedVersion ?? 0),
        cancellationToken);

    return Results.NoContent();
})
.WithName("SoftDeleteArrangement")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources", async (
    Guid groupId,
    Guid arrangementId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListResourcesHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var resources = await handler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);
    return Results.Ok(resources.Select(ToResourceSummaryResponse));
})
.WithName("ListResources")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources", async (
    Guid groupId,
    Guid arrangementId,
    CreateLinkResourceRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateLinkResourceHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateLinkResourceCommand(
            userId.Value,
            groupId,
            arrangementId,
            request.Kind,
            request.Purpose ?? string.Empty,
            request.Label ?? string.Empty,
            request.Part,
            request.Note,
            request.Url ?? string.Empty),
        cancellationToken);

    return Results.Created(
        $"/api/groups/{groupId}/arrangements/{arrangementId}/resources/{created.Id}",
        ToResourceDetailResponse(created));
})
.WithName("CreateLinkResource")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}", async (
    Guid groupId,
    Guid arrangementId,
    Guid resourceId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetResourceHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var resource = await handler.HandleAsync(userId.Value, groupId, arrangementId, resourceId, cancellationToken);
    return Results.Ok(ToResourceDetailResponse(resource));
})
.WithName("GetResource")
.RequireAuthorization();

app.MapPatch("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}", async (
    Guid groupId,
    Guid arrangementId,
    Guid resourceId,
    UpdateLinkResourceRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateLinkResourceHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateLinkResourceCommand(
            userId.Value,
            groupId,
            arrangementId,
            resourceId,
            request.Purpose,
            request.Label,
            request.Part,
            request.Note),
        cancellationToken);

    return Results.Ok(ToResourceDetailResponse(updated));
})
.WithName("UpdateLinkResource")
.RequireAuthorization()
.DisableAntiforgery();

app.MapDelete("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}", async (
    Guid groupId,
    Guid arrangementId,
    Guid resourceId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    DeleteResourceHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(userId.Value, groupId, arrangementId, resourceId, cancellationToken);
    return Results.NoContent();
})
.WithName("DeleteResource")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/setlists", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListSetlistsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var setlists = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
    return Results.Ok(setlists.Select(ToSetlistListResponse));
})
.WithName("ListSetlists")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/setlists", async (
    Guid groupId,
    CreateSetlistRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateSetlistHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateSetlistCommand(userId.Value, groupId, request.Name ?? string.Empty),
        cancellationToken);

    return Results.Created($"/api/groups/{groupId}/setlists/{created.Id}", ToSetlistDetailResponse(created));
})
.WithName("CreateSetlist")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/setlists/{setlistId:guid}", async (
    Guid groupId,
    Guid setlistId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetSetlistHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var setlist = await handler.HandleAsync(userId.Value, groupId, setlistId, cancellationToken);
    return Results.Ok(ToSetlistDetailResponse(setlist));
})
.WithName("GetSetlist")
.RequireAuthorization();

app.MapPatch("/api/groups/{groupId:guid}/setlists/{setlistId:guid}", async (
    Guid groupId,
    Guid setlistId,
    UpdateSetlistRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateSetlistHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateSetlistCommand(
            userId.Value,
            groupId,
            setlistId,
            request.Name ?? string.Empty,
            request.ExpectedVersion),
        cancellationToken);

    return Results.Ok(ToSetlistDetailResponse(updated));
})
.WithName("UpdateSetlist")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPut("/api/groups/{groupId:guid}/setlists/{setlistId:guid}/items", async (
    Guid groupId,
    Guid setlistId,
    ReplaceSetlistItemsRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ReplaceSetlistItemsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var items = (request.Items ?? [])
        .Select(i => new SetlistItemReplaceDto(i.ArrangementId, i.SortOrder))
        .ToList();

    var updated = await handler.HandleAsync(
        new ReplaceSetlistItemsCommand(
            userId.Value,
            groupId,
            setlistId,
            request.ExpectedVersion,
            items),
        cancellationToken);

    return Results.Ok(ToSetlistDetailResponse(updated));
})
.WithName("ReplaceSetlistItems")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/events", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListEventsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var events = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
    return Results.Ok(events.Select(ToEventListResponse));
})
.WithName("ListEvents")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/events", async (
    Guid groupId,
    CreateEventRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateEventHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateEventCommand(
            userId.Value,
            groupId,
            request.Title ?? string.Empty,
            request.Type ?? string.Empty,
            request.StartsAt),
        cancellationToken);

    return Results.Created($"/api/groups/{groupId}/events/{created.Id}", ToEventDetailResponse(created));
})
.WithName("CreateEvent")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/events/{eventId:guid}", async (
    Guid groupId,
    Guid eventId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetEventHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var musicalEvent = await handler.HandleAsync(userId.Value, groupId, eventId, cancellationToken);
    return Results.Ok(ToEventDetailResponse(musicalEvent));
})
.WithName("GetEvent")
.RequireAuthorization();

app.MapPatch("/api/groups/{groupId:guid}/events/{eventId:guid}", async (
    Guid groupId,
    Guid eventId,
    UpdateEventRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateEventHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateEventCommand(
            userId.Value,
            groupId,
            eventId,
            request.Title,
            request.Type,
            request.StartsAt,
            request.ExpectedVersion),
        cancellationToken);

    return Results.Ok(ToEventDetailResponse(updated));
})
.WithName("UpdateEvent")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPost("/api/groups/{groupId:guid}/events/{eventId:guid}/cancel", async (
    Guid groupId,
    Guid eventId,
    CancelEventRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CancelEventHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new CancelEventCommand(userId.Value, groupId, eventId, request.ExpectedVersion),
        cancellationToken);

    return Results.NoContent();
})
.WithName("CancelEvent")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPost("/api/groups/{groupId:guid}/events/{eventId:guid}/apply-setlist", async (
    Guid groupId,
    Guid eventId,
    ApplySetlistRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ReplaceEventPlanFromSetlistHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var musicalEvent = await handler.HandleAsync(
        new ReplaceEventPlanFromSetlistCommand(
            userId.Value,
            groupId,
            eventId,
            request.SetlistId,
            request.ExpectedVersion,
            request.ConfirmReplace),
        cancellationToken);

    return Results.Ok(ToEventDetailResponse(musicalEvent));
})
.WithName("ApplySetlistToEvent")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPut("/api/groups/{groupId:guid}/events/{eventId:guid}/rsvp", async (
    Guid groupId,
    Guid eventId,
    UpsertEventRsvpRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpsertEventRsvpHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var rsvp = await handler.HandleAsync(
        new UpsertEventRsvpCommand(userId.Value, groupId, eventId, request.Response),
        cancellationToken);

    return Results.Ok(new
    {
        userId = rsvp.UserId,
        response = rsvp.Response,
        updatedAt = rsvp.UpdatedAt
    });
})
.WithName("UpsertEventRsvp")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/events/{eventId:guid}/rsvps", async (
    Guid groupId,
    Guid eventId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListEventRsvpsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var list = await handler.HandleAsync(userId.Value, groupId, eventId, cancellationToken);
    return Results.Ok(new
    {
        items = list.Items.Select(i => new
        {
            userId = i.UserId,
            displayName = i.DisplayName,
            response = i.Response,
            updatedAt = i.UpdatedAt
        })
    });
})
.WithName("ListEventRsvps")
.RequireAuthorization();

if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();

static async Task<Guid?> RequireUserIdAsync(ClaimsPrincipal principal, UserManager<ApplicationUser> users)
{
    if (principal.Identity?.IsAuthenticated != true)
    {
        return null;
    }

    var user = await users.GetUserAsync(principal);
    return user?.Id;
}

static object ToGroupResponse(GroupDto group) => new
{
    id = group.Id,
    name = group.Name,
    version = group.Version,
    role = group.Role,
    createdAt = group.CreatedAt,
    updatedAt = group.UpdatedAt
};

static object ToGroupListResponse(GroupListItem item) => new
{
    id = item.Id,
    name = item.Name,
    role = item.Role,
    version = item.Version,
    createdAt = item.CreatedAt
};

static object ToInvitationCreatedResponse(InvitationCreatedDto invitation) => new
{
    id = invitation.Id,
    token = invitation.Token,
    expiresAt = invitation.ExpiresAt
};

static object ToInvitationAcceptedResponse(InvitationAcceptedDto accepted) => new
{
    groupId = accepted.GroupId,
    role = accepted.Role
};

static object ToSongListResponse(SongListItemDto song) => new
{
    id = song.Id,
    title = song.Title,
    attribution = song.Attribution,
    originKind = song.OriginKind,
    version = song.Version,
    createdAt = song.CreatedAt,
    updatedAt = song.UpdatedAt
};

static object ToSongDetailResponse(SongDetailDto song) => new
{
    id = song.Id,
    title = song.Title,
    attribution = song.Attribution,
    originKind = song.OriginKind,
    rightsNotes = song.RightsNotes,
    version = song.Version,
    createdAt = song.CreatedAt,
    updatedAt = song.UpdatedAt,
    arrangementCount = song.ArrangementCount
};

static object ToArrangementListResponse(ArrangementListItemDto arrangement) => new
{
    id = arrangement.Id,
    songId = arrangement.SongId,
    label = arrangement.Label,
    defaultKey = arrangement.DefaultKey,
    defaultBpm = arrangement.DefaultBpm,
    version = arrangement.Version,
    createdAt = arrangement.CreatedAt,
    updatedAt = arrangement.UpdatedAt
};

static object ToArrangementDetailResponse(ArrangementDetailDto arrangement) => new
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
        createdAt = r.CreatedAt
    })
};

static object ToResourceSummaryResponse(ResourceSummaryDto resource) => new
{
    id = resource.Id,
    arrangementId = resource.ArrangementId,
    kind = resource.Kind,
    purpose = resource.Purpose,
    label = resource.Label,
    part = resource.Part,
    note = resource.Note,
    url = resource.Url,
    createdAt = resource.CreatedAt
};

static object ToResourceDetailResponse(ResourceDetailDto resource) => new
{
    id = resource.Id,
    arrangementId = resource.ArrangementId,
    kind = resource.Kind,
    purpose = resource.Purpose,
    label = resource.Label,
    part = resource.Part,
    note = resource.Note,
    url = resource.Url,
    createdAt = resource.CreatedAt
};

static object ToSetlistListResponse(SetlistListItemDto setlist) => new
{
    id = setlist.Id,
    name = setlist.Name,
    version = setlist.Version,
    itemCount = setlist.ItemCount,
    createdAt = setlist.CreatedAt,
    updatedAt = setlist.UpdatedAt
};

static object ToSetlistDetailResponse(SetlistDetailDto setlist) => new
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

static object ToEventListResponse(EventListItemDto musicalEvent) => new
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

static object ToEventDetailResponse(EventDetailDto musicalEvent) => new
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

internal sealed record RegisterRequest(string? Email, string? Password, string? DisplayName);
internal sealed record LoginRequest(string? Email, string? Password, bool RememberMe = false);
internal sealed record CreateGroupRequest(string? Name);
internal sealed record UpdateGroupRequest(string? Name, int ExpectedVersion);
internal sealed record ChangeMemberRoleRequest(string? Role);
internal sealed record SoftDeleteGroupRequest(int ExpectedVersion);
internal sealed record CreateSongRequest(
    string? Title,
    string? Attribution,
    string? OriginKind,
    string? RightsNotes);
internal sealed record UpdateSongRequest(
    string? Title,
    string? Attribution,
    string? OriginKind,
    string? RightsNotes,
    int ExpectedVersion);
internal sealed record SoftDeleteSongRequest(int ExpectedVersion);
internal sealed record CreateArrangementRequest(
    string? Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes);
internal sealed record UpdateArrangementRequest(
    string? Label,
    string? DefaultKey,
    int? DefaultBpm,
    string? Lyrics,
    string? Chords,
    string? Structure,
    string? Notes,
    int ExpectedVersion);
internal sealed record SoftDeleteArrangementRequest(int ExpectedVersion);
internal sealed record CreateLinkResourceRequest(
    string? Kind,
    string? Purpose,
    string? Label,
    string? Part,
    string? Note,
    string? Url);
internal sealed record UpdateLinkResourceRequest(
    string? Purpose,
    string? Label,
    string? Part,
    string? Note);
internal sealed record CreateSetlistRequest(string? Name);
internal sealed record UpdateSetlistRequest(string? Name, int ExpectedVersion);
internal sealed record ReplaceSetlistItemsRequest(
    int ExpectedVersion,
    IReadOnlyList<ReplaceSetlistItemRequest>? Items);
internal sealed record ReplaceSetlistItemRequest(Guid ArrangementId, int SortOrder);
internal sealed record CreateEventRequest(string? Title, string? Type, DateTimeOffset StartsAt);
internal sealed record UpdateEventRequest(
    string? Title,
    string? Type,
    DateTimeOffset? StartsAt,
    int ExpectedVersion);
internal sealed record CancelEventRequest(int ExpectedVersion);
internal sealed record ApplySetlistRequest(Guid SetlistId, int ExpectedVersion, bool ConfirmReplace = false);
internal sealed record UpsertEventRsvpRequest(string? Response);

public sealed class AppExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetails;

    public AppExceptionHandler(IProblemDetailsService problemDetails)
    {
        _problemDetails = problemDetails;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is DbUpdateConcurrencyException)
        {
            httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
            return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
            {
                HttpContext = httpContext,
                ProblemDetails = new ProblemDetails
                {
                    Status = StatusCodes.Status409Conflict,
                    Title = "Conflict",
                    Detail = "The resource was modified by another request.",
                    Type = "https://httpstatuses.com/409",
                    Extensions = { ["traceId"] = Activity.Current?.Id ?? httpContext.TraceIdentifier }
                }
            });
        }

        if (exception is not AppException appException)
        {
            return false;
        }

        var status = appException switch
        {
            NotFoundException => StatusCodes.Status404NotFound,
            ForbiddenException => StatusCodes.Status403Forbidden,
            ConflictException => StatusCodes.Status409Conflict,
            ValidationException => StatusCodes.Status400BadRequest,
            _ => StatusCodes.Status500InternalServerError
        };

        httpContext.Response.StatusCode = status;
        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = status switch
                {
                    404 => "Not Found",
                    403 => "Forbidden",
                    409 => "Conflict",
                    400 => "Validation failed",
                    _ => "Error"
                },
                Detail = appException.Message,
                Extensions = { ["traceId"] = Activity.Current?.Id ?? httpContext.TraceIdentifier }
            }
        });
    }
}

public partial class Program;
