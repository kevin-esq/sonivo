using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Identity;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddApplication();
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies();
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "sonivo.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
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
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
});

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

internal sealed record RegisterRequest(string? Email, string? Password, string? DisplayName);
internal sealed record LoginRequest(string? Email, string? Password, bool RememberMe = false);
internal sealed record CreateGroupRequest(string? Name);
internal sealed record UpdateGroupRequest(string? Name, int ExpectedVersion);
internal sealed record SoftDeleteGroupRequest(int ExpectedVersion);

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
