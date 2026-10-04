using System.Diagnostics;
using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tasks;
using Sonivo.Application.Tenancy;
using Sonivo.Api.Realtime;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Api.Auth;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Blobs;
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
builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme = IdentityConstants.ApplicationScheme;
        options.DefaultSignInScheme = IdentityConstants.ExternalScheme;
    })
    .AddIdentityCookies();
builder.Services.AddGoogleExternalLogin(builder.Configuration);
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
    // L1 (SECURITY-AUDIT-2026-09): absolute session cap. Record the original
    // sign-in instant exactly once — sliding renewal re-issues the cookie (and
    // re-raises OnSigningIn), but it must never refresh this stamp.
    options.Events.OnSigningIn = context =>
    {
        if (!context.Properties.Items.ContainsKey(SessionAbsolutePolicy.IssuedUtcProperty))
        {
            context.Properties.Items[SessionAbsolutePolicy.IssuedUtcProperty] =
                DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);
        }

        return Task.CompletedTask;
    };
    options.Events.OnValidatePrincipal = context =>
    {
        // Reject (and clear) sessions that have outlived the 30-day absolute
        // cap measured from the original sign-in. Sliding renewal still
        // extends ExpireTimeSpan (14 days) as long as the cap has not passed.
        if (context.Properties.Items.TryGetValue(
                SessionAbsolutePolicy.IssuedUtcProperty, out var issuedRaw)
            && DateTimeOffset.TryParse(
                issuedRaw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var issuedUtc)
            && SessionAbsolutePolicy.IsExpired(issuedUtc, DateTimeOffset.UtcNow))
        {
            context.RejectPrincipal();
            return context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
        }

        return Task.CompletedTask;
    };
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

// T-AU-01: fixed-window rate limits on register + verification endpoints
// (modest per-IP budgets; absolute session cap implemented separately per L1).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    static RateLimitPartition<string> PerIp(HttpContext http, int permits) =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ClientIpPartitionKey.Normalize(http.Connection.RemoteIpAddress),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permits,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            });

    // SECURITY-AUDIT-2026-09 M2 (residual): per-IP partition key hardening
    // (IPv6 /64 truncation, IPv4-mapped normalization) lives in
    // ClientIpPartitionKey; trusted-proxy pinning remains a follow-up.
    options.AddPolicy("auth-register", http => PerIp(http, 30));
    options.AddPolicy("auth-login", http => PerIp(http, 30));
    // ADR-0047: handle logins are rate-limited per (slug, IP) so a single group
    // cannot be brute-forced from one address without affecting other groups.
    options.AddPolicy("auth-login-handle", http =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"{http.Request.RouteValues["slug"]}|{ClientIpPartitionKey.Normalize(http.Connection.RemoteIpAddress)}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            }));
    options.AddPolicy("auth-confirm", http => PerIp(http, 30));
    options.AddPolicy("auth-resend", http => PerIp(http, 10));
    options.AddPolicy("auth-forgot", http => PerIp(http, 10));
    options.AddPolicy("auth-reset", http => PerIp(http, 30));
    options.AddPolicy("auth-change-password", http => PerIp(http, 20));
    // T-AU-02: TOTP codes are 6 digits (brute-forceable) — the challenge
    // endpoints get the strictest budget; management is session-authed.
    options.AddPolicy("auth-2fa-challenge", http => PerIp(http, 10));
    options.AddPolicy("auth-2fa-manage", http => PerIp(http, 30));
    // T-AU-03: Passkeys / WebAuthn challenge & management rate limits
    options.AddPolicy("auth-passkeys-challenge", http => PerIp(http, 10));
    options.AddPolicy("auth-passkeys-manage", http => PerIp(http, 30));
});
builder.Services.AddSingleton<VerificationThrottle>();

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
// ADR-0036: self-hosted in-process SignalR (shared framework, no vendor).
// The global antiforgery middleware above requires X-CSRF-TOKEN on the
// /negotiate POST (Q9-Q3); GET/WebSocket hub traffic needs only the cookie.
builder.Services.AddSignalR();

var app = builder.Build();

// ADR-0035: log which blob backend is active at startup (backend name only — never values).
// T-R2-04: R2 when configured, else the filesystem fallback (local dev, CI).
app.Logger.LogInformation(
    "Blob storage backend: {Backend}",
    R2Options.IsConfigured(app.Configuration) ? "R2" : "FileSystem");

// Gmail From guard (S1 follow-up): Gmail silently rewrites the From header to
// the OAuth account unless Gmail:From is a verified SendAs alias with an exact
// match. Best-effort posture — warn HIGH severity, never throw at startup.
try
{
    var gmailConfigured =
        !string.IsNullOrWhiteSpace(app.Configuration["Gmail:ClientId"])
        && !string.IsNullOrWhiteSpace(app.Configuration["Gmail:ClientSecret"])
        && !string.IsNullOrWhiteSpace(app.Configuration["Gmail:RefreshToken"])
        && !string.IsNullOrWhiteSpace(app.Configuration["Gmail:From"]);
    if (gmailConfigured && !GmailFromValidator.IsValid(app.Configuration["Gmail:From"]))
    {
        app.Logger.LogWarning(
            "HIGH severity: Gmail:From '{From}' is not a valid addr@domain shape. "
            + "Gmail requires a verified SendAs alias with an exact address match — "
            + "otherwise it silently rewrites the sender to the OAuth account. "
            + "Verification mail will still send best-effort, but the From header cannot be trusted.",
            app.Configuration["Gmail:From"]);
    }
}
catch (Exception ex)
{
    app.Logger.LogWarning(ex, "Gmail From startup check failed (best-effort).");
}

if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders();
    // T-AU-01 quick win: HSTS in non-dev (standard placement, early).
    app.UseHsts();
}

if (!app.Configuration.GetValue("UseInMemoryDatabase", false) && app.Configuration.GetValue("SONIVO_MIGRATE_ON_START", false))
{
    using var migrateScope = app.Services.CreateScope();
    var db = migrateScope.ServiceProvider.GetRequiredService<SonivoDbContext>();
    // Use EnsureCreated to avoid PendingModelChangesWarning loop
    db.Database.EnsureCreated();
}

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();

// ADR-0047: while MustChangePassword is set, block all API calls except the
// minimum needed to change it (me / logout / change-password / csrf).
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? string.Empty;
    var guarded = path.StartsWith("/api", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/hubs", StringComparison.OrdinalIgnoreCase);
    if (context.User?.Identity?.IsAuthenticated == true
        && guarded
        && !IsMustChangeAllowed(path))
    {
        var users = context.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
        var current = await users.GetUserAsync(context.User);
        if (current is { MustChangePassword: true })
        {
            await Results.Problem(
                    detail: "Password change required.",
                    statusCode: StatusCodes.Status403Forbidden,
                    title: "Forbidden",
                    extensions: new Dictionary<string, object?> { ["code"] = "must_change_password" })
                .ExecuteAsync(context);
            return;
        }
    }

    await next();
});

static bool IsMustChangeAllowed(string path) =>
    path.Equals("/api/auth/me", StringComparison.OrdinalIgnoreCase)
    || path.Equals("/api/auth/logout", StringComparison.OrdinalIgnoreCase)
    || path.Equals("/api/auth/change-password", StringComparison.OrdinalIgnoreCase)
    || path.Equals("/api/auth/csrf", StringComparison.OrdinalIgnoreCase);
app.UseRateLimiter();

app.Use(async (context, next) =>
{
    context.Response.Headers.TryAdd("X-Request-Id", context.TraceIdentifier);
    context.Response.Headers.TryAdd("X-Content-Type-Options", "nosniff");
    context.Response.Headers.TryAdd("X-Frame-Options", "DENY");
    await next();
});

// ADR-0037 T-FX-02 + L2 (SECURITY-AUDIT-2026-09): defense-in-depth CSP.
// YouTube reference iframes (nocookie player) and thumbnails stay allowlisted.
// style-src keeps 'unsafe-inline' because React inline style attributes and
// Vite dev style injection require it; fonts.googleapis.com/fonts.gstatic.com
// are the only external origins actually used by the SPA (web/sonivo-web/index.html).
// connect-src 'self' covers the same-origin API + SignalR /hubs WebSocket.
app.Use(async (context, next) =>
{
    context.Response.Headers.TryAdd("Content-Security-Policy",
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https://i.ytimg.com; " +
        "frame-src 'self' https://www.youtube-nocookie.com; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "object-src 'none'");
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
    UserManager<ApplicationUser> users,
    IEmailSender email,
    IPublicOrigin origin,
    CancellationToken cancellationToken) =>
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

    // T-AU-01: register never signs in; it mails a confirmation link
    // best-effort (mailed=false degrades to the login resend affordance).
    // Register-409 contract UNCHANGED (ADR-0038).
    var mailed = false;
    try
    {
        var token = await users.GenerateEmailConfirmationTokenAsync(user);
        mailed = await VerificationMail.TrySendConfirmationAsync(
            email, origin, app.Logger, user.Email!, token, cancellationToken);
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Verification email could not be sent (best-effort).");
    }

    return Results.Created($"/api/auth/me", new
    {
        id = user.Id,
        email = user.Email,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed,
        mailed
    });
})
.WithName("Register")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-register");

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

    // T-AU-02 (ADR-0038 S2): PasswordSignInAsync signs the app session
    // itself, except when 2FA is enabled — then it stores only the temp 2FA
    // cookie (TwoFactorUserIdScheme, NOT the app cookie) and reports
    // RequiresTwoFactor. The second step completes the session.
    var result = await signInManager.PasswordSignInAsync(
        user,
        request.Password,
        isPersistent: request.RememberMe,
        lockoutOnFailure: true);

    if (result.IsLockedOut)
    {
        app.Logger.LogWarning(
            "Security event: account lockout (login). UserId: {UserId}",
            user.Id);
        return Results.Problem(
            detail: "Account temporarily locked.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    if (result.IsNotAllowed)
    {
        // T-AU-01 (Q-AU-1): unverified mailbox denied with the IDENTICAL
        // 401 shape as bad credentials — no new oracle. The Spanish
        // unconfirmed copy + resend affordance live as PERMANENT
        // unconditional elements on the login screen, never conditioned
        // on this response.
        return Results.Problem(
            detail: "Invalid email or password.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    if (result.RequiresTwoFactor)
    {
        // 2FA presence is visible only AFTER a correct password (standard,
        // documented S2 decision — no oracle for unauthenticated callers).
        return Results.Ok(new { requiresTwoFactor = true });
    }

    if (!result.Succeeded)
    {
        return Results.Problem(
            detail: "Invalid email or password.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    return Results.Ok(new
    {
        id = user.Id,
        email = user.Email,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed,
        mustChangePassword = user.MustChangePassword,
        managedByGroupId = user.ManagedByGroupId
    });
})
.WithName("Login")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-login");

// ADR-0047: members without an email sign in as handle@slug. The handle and the
// group id are resolved separately; this endpoint never consults the email column,
// so a handle can never collide with a real address. Unknown slug/handle and wrong
// password return the same 401, and an unknown identifier burns a password hash so
// the response time does not reveal whether the account exists.
app.MapPost("/api/auth/login/handle/{slug}", async (
    string slug,
    HandleLoginRequest request,
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signInManager,
    IGroupStore groups,
    IMembershipStore memberships,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:ManagedAccounts", false))
    {
        return Results.NotFound();
    }

    if (string.IsNullOrWhiteSpace(request.Handle) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.Problem(
            detail: "Identificador y contraseña son obligatorios.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    var normalized = MembershipHandles.Normalize(request.Handle);
    var group = string.IsNullOrWhiteSpace(slug) ? null : await groups.GetBySlugAsync(slug.Trim(), cancellationToken);
    ApplicationUser? user = null;
    if (group is not null && normalized is not null)
    {
        var membership = await memberships.GetByHandleAsync(group.Id, normalized, cancellationToken);
        if (membership?.UserId is { } userId)
        {
            user = await users.FindByIdAsync(userId.ToString("D"));
        }
    }

    if (user is null)
    {
        AuthUniformity.BurnPasswordVerification(users, request.Password);
        return AuthUniformity.InvalidLogin();
    }

    var result = await signInManager.PasswordSignInAsync(
        user,
        request.Password,
        isPersistent: request.RememberMe,
        lockoutOnFailure: true);

    if (result.IsLockedOut)
    {
        app.Logger.LogWarning(
            "Security event: account lockout (handle login). UserId: {UserId}", user.Id);
        return Results.Problem(
            detail: "Account temporarily locked.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    if (result.RequiresTwoFactor)
    {
        return Results.Ok(new { requiresTwoFactor = true });
    }

    if (!result.Succeeded)
    {
        app.Logger.LogWarning(
            "Security event: failed handle login. GroupId: {GroupId}", group!.Id);
        return AuthUniformity.InvalidLogin();
    }

    return Results.Ok(new
    {
        id = user.Id,
        email = (string?)null,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed,
        mustChangePassword = user.MustChangePassword,
        managedByGroupId = user.ManagedByGroupId,
        handle = normalized
    });
})
.WithName("HandleLogin")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-login-handle");


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
        email = appUser.Email is { } mail && mail.EndsWith("@managed.invalid", StringComparison.Ordinal) ? null : appUser.Email,
        displayName = appUser.DisplayName,
        emailConfirmed = appUser.EmailConfirmed,
        mustChangePassword = appUser.MustChangePassword,
        managedByGroupId = appUser.ManagedByGroupId
    });
})
.WithName("GetCurrentUser")
.RequireAuthorization();

// ADR-0053 addendum: profile display name edit ("Editar perfil"). Cookie + antiforgery
// (unsafe method, so the global CSRF middleware applies); no AuthZ/session change.
app.MapPatch("/api/auth/me", async (
    UpdateProfileRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users) =>
{
    var appUser = await users.GetUserAsync(principal);
    if (appUser is null)
    {
        return Results.Unauthorized();
    }

    var displayName = request.DisplayName?.Trim();
    if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 200)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["displayName"] = new[] { "Display name is required and must be 200 characters or fewer." }
        });
    }

    appUser.DisplayName = displayName;
    var result = await users.UpdateAsync(appUser);
    if (!result.Succeeded)
    {
        return Results.ValidationProblem(
            result.Errors.ToDictionary(e => e.Code, e => new[] { e.Description }));
    }

    return Results.Ok(new
    {
        id = appUser.Id,
        email = appUser.Email is { } mail && mail.EndsWith("@managed.invalid", StringComparison.Ordinal) ? null : appUser.Email,
        displayName = appUser.DisplayName,
        emailConfirmed = appUser.EmailConfirmed,
        mustChangePassword = appUser.MustChangePassword,
        managedByGroupId = appUser.ManagedByGroupId
    });
})
.WithName("UpdateCurrentUser")
.RequireAuthorization();

// ADR-0047: a temporary credential must be replaced before any other API call.
app.MapPost("/api/auth/change-password", async (
    ChangePasswordRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signInManager,
    IAccountAuditStore audit,
    IClock clock,
    CancellationToken cancellationToken) =>
{
    var appUser = await users.GetUserAsync(principal);
    if (appUser is null)
    {
        return Results.Unauthorized();
    }

    var newPassword = request.NewPassword ?? string.Empty;
    var result = await users.ChangePasswordAsync(appUser, request.CurrentPassword ?? string.Empty, newPassword);
    if (!result.Succeeded)
    {
        return Results.ValidationProblem(
            result.Errors.ToDictionary(e => e.Code, e => new[] { e.Description }));
    }

    if (appUser.MustChangePassword)
    {
        appUser.MustChangePassword = false;
        await users.UpdateAsync(appUser);
    }

    await audit.AddAsync(
        AccountAudit.Create(AccountAudit.ActionPasswordChanged, clock.UtcNow, actorUserId: appUser.Id),
        cancellationToken);
    await audit.SaveChangesAsync(cancellationToken);

    // Rotate the session cookie so the new security stamp is honoured.
    await signInManager.RefreshSignInAsync(appUser);

    return Results.Ok(new { ok = true });
})
.WithName("ChangePassword")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-change-password");

app.MapPost("/api/auth/logout", async (SignInManager<ApplicationUser> signInManager) =>
{
    await signInManager.SignOutAsync();
    return Results.NoContent();
})
.WithName("Logout")
.RequireAuthorization()
.DisableAntiforgery();

// T-AU-01 (Q-AU-2): single-use expiring DataProtection tokens via UserManager.
// Invalid/expired/unknown → 400 with the frozen Spanish copy.
app.MapPost("/api/auth/confirm-email", async (
    ConfirmEmailRequest request,
    UserManager<ApplicationUser> users) =>
{
    var email = request.Email?.Trim();
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Token))
    {
        return Results.Problem(
            detail: "Enlace expirado o inválido — solicita uno nuevo",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Bad Request");
    }

    var user = await users.FindByEmailAsync(email);
    if (user is null)
    {
        return Results.Problem(
            detail: "Enlace expirado o inválido — solicita uno nuevo",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Bad Request");
    }

    var result = await users.ConfirmEmailAsync(user, request.Token);
    if (!result.Succeeded)
    {
        return Results.Problem(
            detail: "Enlace expirado o inválido — solicita uno nuevo",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Bad Request");
    }

    // Rotate the stamp so the token is single-use (reuse → 400).
    await users.UpdateSecurityStampAsync(user);
    return Results.Ok(new { emailConfirmed = true });
})
.WithName("ConfirmEmail")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-confirm");

// T-AU-01 (Q-AU-2): ALWAYS 202 — silent for unknown/already-confirmed emails
// (no oracle), per-email 60 s cooldown, best-effort mail + mailed flag.
app.MapPost("/api/auth/resend-confirmation", async (
    ResendConfirmationRequest request,
    UserManager<ApplicationUser> users,
    IEmailSender email,
    IPublicOrigin origin,
    VerificationThrottle throttle,
    CancellationToken cancellationToken) =>
{
    var mailed = false;
    var normalized = request.Email?.Trim() ?? string.Empty;
    if (!string.IsNullOrWhiteSpace(normalized) && throttle.TryClaim("resend:" + normalized))
    {
        var user = await users.FindByEmailAsync(normalized);
        if (user is not null && !user.EmailConfirmed)
        {
            var token = await users.GenerateEmailConfirmationTokenAsync(user);
            mailed = await VerificationMail.TrySendConfirmationAsync(
                email, origin, app.Logger, user.Email!, token, cancellationToken);
        }
    }

    return Results.Accepted("/api/auth/resend-confirmation", new { accepted = true, mailed });
})
.WithName("ResendConfirmation")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-resend");

// T-AU-01 (Q-AU-2): ALWAYS 202 — silent for unknown emails (no oracle),
// best-effort mail + mailed flag. L4 (SECURITY-AUDIT-2026-09): per-email
// 60 s cooldown (distinct "forgot:" namespace so it never blocks resend).
app.MapPost("/api/auth/forgot-password", async (
    ForgotPasswordRequest request,
    UserManager<ApplicationUser> users,
    IEmailSender email,
    IPublicOrigin origin,
    VerificationThrottle throttle,
    CancellationToken cancellationToken) =>
{
    var mailed = false;
    var normalized = request.Email?.Trim() ?? string.Empty;
    if (!string.IsNullOrWhiteSpace(normalized) && throttle.TryClaim("forgot:" + normalized))
    {
        var user = await users.FindByEmailAsync(normalized);
        if (user is not null)
        {
            var token = await users.GeneratePasswordResetTokenAsync(user);
            mailed = await VerificationMail.TrySendPasswordResetAsync(
                email, origin, app.Logger, user.Email!, token, cancellationToken);
        }
    }

    return Results.Accepted("/api/auth/forgot-password", new { accepted = true, mailed });
})
.WithName("ForgotPassword")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-forgot");

// T-AU-01 (Q-AU-2): single-use reset via security-stamp rotation.
// Invalid/expired/unknown → 400 with the frozen Spanish copy.
app.MapPost("/api/auth/reset-password", async (
    ResetPasswordRequest request,
    UserManager<ApplicationUser> users,
    IAccountAuditStore audit,
    IClock clock,
    CancellationToken cancellationToken) =>
{
    var email = request.Email?.Trim();
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Token))
    {
        return Results.Problem(
            detail: "Enlace expirado o inválido — solicita uno nuevo",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Bad Request");
    }

    var user = await users.FindByEmailAsync(email);
    if (user is null)
    {
        return Results.Problem(
            detail: "Enlace expirado o inválido — solicita uno nuevo",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Bad Request");
    }

    var result = await users.ResetPasswordAsync(user, request.Token, request.NewPassword ?? string.Empty);
    if (!result.Succeeded)
    {
        if (result.Errors.All(e => e.Code == "InvalidToken"))
        {
            return Results.Problem(
                detail: "Enlace expirado o inválido — solicita uno nuevo",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Bad Request");
        }

        return Results.Problem(
            detail: string.Join(" ", result.Errors.Select(e => e.Description)),
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    // A successful reset proves control of the mailbox: mark it confirmed so the
    // account can sign in. ADR-0047: it also makes a managed account self-owned.
    var managed = user.ManagedByGroupId is not null || user.MustChangePassword;
    user.EmailConfirmed = true;
    if (managed)
    {
        user.ManagedByGroupId = null;
        user.MustChangePassword = false;
    }

    await users.UpdateAsync(user);

    if (managed)
    {
        await audit.AddAsync(
            AccountAudit.Create(AccountAudit.ActionLinked, clock.UtcNow, targetUserId: user.Id),
            cancellationToken);
        await audit.SaveChangesAsync(cancellationToken);
    }

    return Results.Ok(new { passwordReset = true });
})
.WithName("ResetPassword")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-reset");

// T-AU-02 (ADR-0038 S2): TOTP 2FA via the Identity authenticator provider.
// Recovery codes are Identity-hashed at rest, shown exactly once at enable
// (and on explicit regenerate), single-use enforced by UserManager.
// No new tables: AspNetUserTokens already stores the authenticator key +
// recovery codes (verified — no migration).
// Temporary password that satisfies the Identity password policy; shown once.
static string GenerateTemporaryPassword() => "Tmp1!" + Guid.NewGuid().ToString("N");

static string SanitizeTotpCode(string? code) =>
    (code ?? string.Empty).Replace(" ", string.Empty, StringComparison.Ordinal)
        .Replace("-", string.Empty, StringComparison.Ordinal);

static string BuildAuthenticatorUri(string issuer, string account, string key) =>
    string.Format(CultureInfo.InvariantCulture,
        "otpauth://totp/{0}:{1}?secret={2}&issuer={0}&digits=6",
        Uri.EscapeDataString(issuer),
        Uri.EscapeDataString(account),
        key);

app.MapGet("/api/auth/2fa/status", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(new
    {
        enabled = await users.GetTwoFactorEnabledAsync(user),
        hasPassword = await users.HasPasswordAsync(user)
    });
})
.WithName("TwoFactorStatus")
.RequireAuthorization();

app.MapPost("/api/auth/2fa/enroll-start", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (await users.GetTwoFactorEnabledAsync(user))
    {
        return Results.Problem(
            detail: "La verificación en dos pasos ya está activada",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    // S38-Q2 (b): Google-only (passwordless) accounts enroll with session
    // auth + CSRF only — no password hash exists to recheck (documented risk).
    var key = await users.GetAuthenticatorKeyAsync(user);
    if (string.IsNullOrEmpty(key))
    {
        await users.ResetAuthenticatorKeyAsync(user);
        key = await users.GetAuthenticatorKeyAsync(user);
    }

    return Results.Ok(new
    {
        uri = BuildAuthenticatorUri(
            "Sonivo", user.Email ?? user.UserName ?? string.Empty, key!),
        manualKey = key
    });
})
.WithName("TwoFactorEnrollStart")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-2fa-manage");

app.MapPost("/api/auth/2fa/enroll-verify", async (
    TwoFactorCodeRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (await users.GetTwoFactorEnabledAsync(user))
    {
        return Results.Problem(
            detail: "La verificación en dos pasos ya está activada",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    var valid = await users.VerifyTwoFactorTokenAsync(
        user,
        TokenOptions.DefaultAuthenticatorProvider,
        SanitizeTotpCode(request.Code));
    if (!valid)
    {
        return Results.Problem(
            detail: "Código de verificación incorrecto — inténtalo de nuevo",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    await users.SetTwoFactorEnabledAsync(user, true);
    var recoveryCodes = (await users.GenerateNewTwoFactorRecoveryCodesAsync(user, 10))?.ToList()
        ?? [];
    return Results.Ok(new { enabled = true, recoveryCodes });
})
.WithName("TwoFactorEnrollVerify")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-2fa-manage");

app.MapPost("/api/auth/2fa/disable", async (
    DisableTwoFactorRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (!await users.GetTwoFactorEnabledAsync(user))
    {
        return Results.Problem(
            detail: "La verificación en dos pasos no está activada",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    // Password recheck only when a password exists; passwordless
    // (Google-only) accounts skip it per S38-Q2 (b).
    if (await users.HasPasswordAsync(user))
    {
        var passwordOk = await users.CheckPasswordAsync(user, request.Password ?? string.Empty);
        if (!passwordOk)
        {
            return Results.Problem(
                detail: "La contraseña no es correcta",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Validation failed");
        }
    }

    await users.SetTwoFactorEnabledAsync(user, false);
    await users.ResetAuthenticatorKeyAsync(user);
    return Results.Ok(new { disabled = true });
})
.WithName("TwoFactorDisable")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-2fa-manage");

app.MapPost("/api/auth/2fa/challenge", async (
    TwoFactorChallengeRequest request,
    SignInManager<ApplicationUser> signInManager) =>
{
    var user = await signInManager.GetTwoFactorAuthenticationUserAsync();
    if (user is null)
    {
        return Results.Problem(
            detail: "No hay una verificación pendiente — inicia sesión de nuevo",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    // Strict brute-force posture: 6-digit codes + lockout counting.
    var result = await signInManager.TwoFactorAuthenticatorSignInAsync(
        SanitizeTotpCode(request.Code),
        isPersistent: request.RememberMe,
        rememberClient: false);

    if (result.IsLockedOut)
    {
        app.Logger.LogWarning(
            "Security event: account lockout (2fa). UserId: {UserId}",
            user.Id);
        return Results.Problem(
            detail: "Account temporarily locked.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    if (!result.Succeeded)
    {
        return Results.Problem(
            detail: "Código de verificación incorrecto",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    return Results.Ok(new
    {
        id = user.Id,
        email = user.Email,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed
    });
})
.WithName("TwoFactorChallenge")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-2fa-challenge");

app.MapPost("/api/auth/2fa/recover", async (
    TwoFactorChallengeRequest request,
    SignInManager<ApplicationUser> signInManager) =>
{
    var user = await signInManager.GetTwoFactorAuthenticationUserAsync();
    if (user is null)
    {
        return Results.Problem(
            detail: "No hay una verificación pendiente — inicia sesión de nuevo",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    // Same strict budget + lockout as the TOTP challenge; redemption is
    // single-use (Identity consumes the code on success).
    var code = (request.Code ?? string.Empty).Replace(" ", string.Empty, StringComparison.Ordinal);
    var result = await signInManager.TwoFactorRecoveryCodeSignInAsync(code);

    if (result.IsLockedOut)
    {
        app.Logger.LogWarning(
            "Security event: account lockout (2fa recovery). UserId: {UserId}",
            user.Id);
        return Results.Problem(
            detail: "Account temporarily locked.",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    if (!result.Succeeded)
    {
        return Results.Problem(
            detail: "Código de recuperación incorrecto",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    return Results.Ok(new
    {
        id = user.Id,
        email = user.Email,
        displayName = user.DisplayName,
        emailConfirmed = user.EmailConfirmed
    });
})
.WithName("TwoFactorRecover")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-2fa-challenge");

app.MapPost("/api/auth/2fa/recovery-codes/regenerate", async (
    RegenerateRecoveryCodesRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (!await users.GetTwoFactorEnabledAsync(user))
    {
        return Results.Problem(
            detail: "La verificación en dos pasos no está activada",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Validation failed");
    }

    if (await users.HasPasswordAsync(user))
    {
        var passwordOk = await users.CheckPasswordAsync(user, request.Password ?? string.Empty);
        if (!passwordOk)
        {
            return Results.Problem(
                detail: "La contraseña no es correcta",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Validation failed");
        }
    }

    // Old codes die here; the new set is shown exactly once in this response.
    var recoveryCodes = (await users.GenerateNewTwoFactorRecoveryCodesAsync(user, 10))?.ToList()
        ?? [];
    return Results.Ok(new { recoveryCodes });
})
.WithName("TwoFactorRegenerateRecoveryCodes")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-2fa-manage");

// T-AU-03 (ADR-0038 S3): Passkeys / WebAuthn API endpoints
static string GetRelyingPartyId(HttpContext http, IConfiguration config)
    => PasskeyOrigins.GetRelyingPartyId(http, config);

app.MapGet("/api/auth/passkeys", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SonivoDbContext db) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var tokens = await db.UserTokens
        .Where(t => t.UserId == user.Id && t.LoginProvider == "Passkeys")
        .ToListAsync();

    var list = new List<PasskeyDto>();
    foreach (var token in tokens)
    {
        if (token.Name.StartsWith("Credential_", StringComparison.Ordinal) && !string.IsNullOrWhiteSpace(token.Value))
        {
            try
            {
                var cred = System.Text.Json.JsonSerializer.Deserialize<PasskeyCredential>(token.Value);
                if (cred is not null)
                {
                    list.Add(new PasskeyDto(cred.CredentialId, cred.DeviceName, cred.CreatedAt));
                }
            }
            catch
            {
                var credId = token.Name.Substring("Credential_".Length);
                list.Add(new PasskeyDto(credId, "Llave de acceso", DateTimeOffset.UtcNow));
            }
        }
    }

    return Results.Ok(list);
})
.WithName("ListPasskeys")
.RequireAuthorization();

app.MapPost("/api/auth/passkeys/register-start", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    HttpContext http,
    IConfiguration config) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var challenge = PasskeyChallengeStore.CreateChallenge(user.Id);
    var rpId = GetRelyingPartyId(http, config);

    return Results.Ok(new PasskeyRegistrationStartResponse(
        challenge,
        rpId,
        "Sonivo",
        new PasskeyUserDto(user.Id.ToString(), user.Email ?? user.UserName!, user.DisplayName ?? user.Email ?? "Usuario")));
})
.WithName("PasskeysRegisterStart")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-passkeys-manage");

app.MapPost("/api/auth/passkeys/register-finish", async (
    PasskeyRegistrationFinishRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    IAccountAuditStore audit,
    IClock clock,
    IPublicOrigin origin,
    HttpContext http,
    IConfiguration config,
    CancellationToken cancellationToken) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var rpId = PasskeyOrigins.GetRelyingPartyId(http, config);
    try
    {
        var cd = PasskeyVerifier.ParseClientData(request.ClientData);
        // 1. type + origin allow-list + challenge single-use + user binding
        PasskeyVerifier.EnsureClientData(cd, "webauthn.create", cd.Challenge,
            PasskeyOrigins.Allowed(http, config, origin));
        if (!PasskeyChallengeStore.ConsumeChallenge(cd.Challenge, expectedUserId: user.Id))
        {
            app.Logger.LogWarning("Passkey registration: challenge was not issued for this user, expired, or already used.");
            return Results.Problem(detail: "La llave de acceso no es válida", statusCode: 401, title: "Unauthorized");
        }
        // 2. attestation: rpIdHash, UP/AT flags, credentialId + COSE key extracted
        // (attestation statement not verified — conveyance is "none"; see PasskeysAuth)
        var proof = PasskeyVerifier.ParseAttestation(request.AttestationObject, rpId);

        var cred = new PasskeyCredential(
            proof.CredentialId,
            PasskeyVerifier.Base64UrlEncode(proof.CoseKey),   // store the SERVER-EXTRACTED key
            string.IsNullOrWhiteSpace(request.DeviceName) ? "Llave de acceso" : request.DeviceName.Trim(),
            DateTimeOffset.UtcNow,
            proof.SignCount);
        await users.SetAuthenticationTokenAsync(user, "Passkeys",
            "Credential_" + cred.CredentialId, System.Text.Json.JsonSerializer.Serialize(cred));

        // ADR-0047 lifecycle: registering a passkey makes a group-managed account
        // self-owned (it is no longer resettable by the group).
        if (user.ManagedByGroupId is not null || user.MustChangePassword)
        {
            user.ManagedByGroupId = null;
            user.MustChangePassword = false;
            await users.UpdateAsync(user);
            await audit.AddAsync(
                AccountAudit.Create(AccountAudit.ActionLinked, clock.UtcNow, targetUserId: user.Id),
                cancellationToken);
            await audit.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(new { registered = true, credentialId = cred.CredentialId });
    }
    catch (PasskeyVerifier.PasskeyVerificationException ex)
    {
        // Diagnostics only: the verifier's fixed reason, never the payload or secrets.
        app.Logger.LogWarning("Passkey registration verification failed: {Reason}", ex.Message);
        return Results.Problem(detail: "La llave de acceso no es válida", statusCode: 401, title: "Unauthorized");
    }
})
.WithName("PasskeysRegisterFinish")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-passkeys-manage");

app.MapDelete("/api/auth/passkeys/{id}", async (
    string id,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var credId = id.Trim();
    await users.RemoveAuthenticationTokenAsync(user, "Passkeys", "Credential_" + credId);
    return Results.Ok(new { deleted = true });
})
.WithName("PasskeysDelete")
.RequireAuthorization()
.DisableAntiforgery()
.RequireRateLimiting("auth-passkeys-manage");

app.MapPost("/api/auth/passkeys/login-start", (
    HttpContext http,
    IConfiguration config) =>
{
    var challenge = PasskeyChallengeStore.CreateChallenge();
    var rpId = GetRelyingPartyId(http, config);
    return Results.Ok(new PasskeyLoginStartResponse(challenge, rpId));
})
.WithName("PasskeysLoginStart")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-passkeys-challenge");

app.MapPost("/api/auth/passkeys/login-finish", async (
    PasskeyLoginFinishRequest request,
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signInManager,
    SonivoDbContext db,
    IPublicOrigin origin,
    HttpContext http,
    IConfiguration config) =>
{
    var tokenName = "Credential_" + (request.CredentialId ?? "").Trim();
    var token = await db.UserTokens
        .FirstOrDefaultAsync(t => t.LoginProvider == "Passkeys" && t.Name == tokenName);

    if (token is null || string.IsNullOrWhiteSpace(token.Value))
    {
        app.Logger.LogWarning("Passkey login: credential not found (no stored credential for the presented id).");
        return Results.Problem(
            detail: "Llave de acceso no registrada",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    var stored = System.Text.Json.JsonSerializer.Deserialize<PasskeyCredential>(token.Value);
    var user = await users.FindByIdAsync(token.UserId.ToString());
    // SECURITY-AUDIT-2026-09 (C1, auditor): rows written before T-SEC-01 carry
    // the old shape (client-supplied PublicKey, no PublicKeyCose). They must
    // fail closed with the uniform 401 — never reach the verifier (or a 500).
    if (user is null || stored is null || string.IsNullOrWhiteSpace(stored.PublicKeyCose))
    {
        app.Logger.LogWarning("Passkey login: credential row is unusable (legacy pre-T-SEC-01 row or missing stored key).");
        return Results.Problem(
            detail: "Llave de acceso no registrada",
            statusCode: StatusCodes.Status401Unauthorized,
            title: "Unauthorized");
    }

    var rpId = PasskeyOrigins.GetRelyingPartyId(http, config);
    try
    {
        // 1. clientData: type=webauthn.get + origin allow-list + single-use challenge
        var cd = PasskeyVerifier.ParseClientData(request.ClientData);
        PasskeyVerifier.EnsureClientData(cd, "webauthn.get", cd.Challenge,
            PasskeyOrigins.Allowed(http, config, origin));
        if (!PasskeyChallengeStore.ConsumeChallenge(cd.Challenge))
        {
            app.Logger.LogWarning("Passkey login: challenge was not issued, expired, or already used.");
            return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");
        }
        // 2. authenticatorData: rpIdHash + UP; counter regression check (clone detection)
        var proof = PasskeyVerifier.ParseAssertionAuthenticatorData(request.AuthenticatorData, rpId);
        if (stored.SignCount > 0 && proof.SignCount > 0 && proof.SignCount <= stored.SignCount)
        {
            app.Logger.LogWarning("Passkey login: sign-counter regression (possible cloned authenticator).");
            return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");
        }
        // 3. the actual cryptographic proof — the missing line that C1 exists for
        var (assertionOk, assertionReason) = PasskeyVerifier.VerifyAssertion(
            PasskeyVerifier.Base64UrlDecode(stored.PublicKeyCose), request.AuthenticatorData,
            request.ClientData, request.Signature);
        if (!assertionOk)
        {
            app.Logger.LogWarning("Passkey login: assertion signature verification failed ({Reason}).", assertionReason);
            return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");
        }

        // 4. persist the advanced counter, then sign in
        stored = stored with { SignCount = proof.SignCount };
        await users.SetAuthenticationTokenAsync(user, "Passkeys", tokenName, System.Text.Json.JsonSerializer.Serialize(stored));
        await signInManager.SignInAsync(user, isPersistent: true);
        return Results.Ok(new
        {
            id = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            emailConfirmed = user.EmailConfirmed
        });
    }
    catch (PasskeyVerifier.PasskeyVerificationException ex)
    {
        // Diagnostics only: the verifier's fixed reason, never the payload or secrets.
        app.Logger.LogWarning("Passkey login verification failed: {Reason}", ex.Message);
        return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");
    }
})
.WithName("PasskeysLoginFinish")
.AllowAnonymous()
.DisableAntiforgery()
.RequireRateLimiting("auth-passkeys-challenge");

// T-AU-01 test hook (E2E only): marks a user confirmed without a mailbox.
// DOUBLE-GATED: Auth:EnableTestHook AND Development environment. The env gate
// is the backstop — a misconfigured prod flag alone can never enable it.
// Returns 404 when disabled.
var authTestHook = app.Configuration.GetValue("Auth:EnableTestHook", false);
if (authTestHook && app.Environment.IsDevelopment())
{
    app.MapPost("/api/auth/test/confirm", async (
        TestConfirmRequest request,
        UserManager<ApplicationUser> users) =>
    {
        var email = request.Email?.Trim();
        if (string.IsNullOrWhiteSpace(email))
        {
            return Results.Problem(
                detail: "Email is required.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Validation failed");
        }

        var user = await users.FindByEmailAsync(email);
        if (user is null)
        {
            return Results.NotFound();
        }

        user.EmailConfirmed = true;
        await users.UpdateAsync(user);
        return Results.Ok(new { emailConfirmed = true });
    })
    .WithName("TestConfirmUser")
    .AllowAnonymous()
    .DisableAntiforgery();
}

app.MapGoogleAuthEndpoints();

// ADR-0036: Q9 conductor room. Cookie-authorized; per-method Membership
// recheck inside the Hub (404 non-member/unknown, 403 non-Owner conduct).
app.MapHub<PracticeRoomHub>("/hubs/practiceroom").RequireAuthorization();

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

// ADR-0053: upcoming events across the caller's groups (Inicio dashboard).
app.MapGet("/api/activity/upcoming", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListUpcomingActivityHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var items = await handler.HandleAsync(userId.Value, cancellationToken);
    return Results.Ok(items.Select(ToUpcomingActivityResponse));
})
.WithName("ListUpcomingActivity")
.RequireAuthorization();

// ADR-0053 addendum: general calendar across the caller's groups (read-only).
app.MapGet("/api/activity/calendar", async (
    string? from,
    string? to,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListCalendarEventsHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    if (!DateTimeOffset.TryParse(
            from,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var fromValue)
        || !DateTimeOffset.TryParse(
            to,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var toValue))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["range"] = new[] { "A valid ISO-8601 'from' and 'to' are required." }
        });
    }

    if (fromValue >= toValue)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["range"] = new[] { "'from' must be earlier than 'to'." }
        });
    }

    if (toValue - fromValue > TimeSpan.FromDays(62))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["range"] = new[] { "The requested range must not exceed 62 days." }
        });
    }

    var items = await handler.HandleAsync(userId.Value, fromValue, toValue, cancellationToken);
    return Results.Ok(items.Select(ToUpcomingActivityResponse));
})
.WithName("ListCalendarEvents")
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

app.MapGet("/api/groups/by-slug/{slug}", async (
    string slug,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetGroupBySlugHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var result = await handler.HandleAsync(userId.Value, slug, cancellationToken);
    return Results.Ok(ToGroupBySlugResponse(result));
})
.WithName("GetGroupBySlug")
.RequireAuthorization();

app.MapPut("/api/groups/{groupId:guid}/slug", async (
    Guid groupId,
    ChangeGroupSlugRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ChangeGroupSlugHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    // Flag off → 404 even for the Owner (feature disabled).
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new ChangeGroupSlugCommand(userId.Value, groupId, request.Slug ?? string.Empty),
        cancellationToken);
    return Results.Ok(ToGroupResponse(updated));
})
.WithName("ChangeGroupSlug")
.RequireAuthorization()
.DisableAntiforgery();

// ---------- Per-group white label (ADR-0048). Flag: Features:GroupBranding (default off). ----------

app.MapGet("/api/groups/{groupId:guid}/branding", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetGroupBrandingHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(ToBrandingResponse(await handler.HandleAsync(userId.Value, groupId, cancellationToken)));
})
.WithName("GetGroupBranding")
.RequireAuthorization();

app.MapPut("/api/groups/{groupId:guid}/branding", async (
    Guid groupId,
    UpdateGroupBrandingRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateGroupBrandingHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateGroupBrandingCommand(
            userId.Value,
            groupId,
            request.ExpectedVersion,
            request.DisplayName,
            request.AccentHex,
            request.SecondaryHex,
            request.CoverKind,
            request.CoverValue,
            request.ThemeDefault,
            request.DefaultLocale,
            request.WelcomeText,
            request.LoginHeadline,
            request.Tagline,
            request.Verse,
            request.ShowSonivoCredit),
        cancellationToken);

    return Results.Ok(ToBrandingResponse(updated));
})
.WithName("UpdateGroupBranding")
.RequireAuthorization()
.DisableAntiforgery();

app.MapPost("/api/groups/{groupId:guid}/branding/logo", async (
    Guid groupId,
    HttpRequest httpRequest,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SetGroupLogoHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    if (!httpRequest.HasFormContentType)
    {
        return Results.Problem(detail: "Multipart form is required.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
    }

    var form = await httpRequest.ReadFormAsync(cancellationToken);
    var file = form.Files.GetFile("file");
    if (file is null || file.Length <= 0)
    {
        return Results.Problem(detail: "Logo file is required.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
    }

    await using var stream = file.OpenReadStream();
    var updated = await handler.HandleAsync(
        new SetGroupLogoCommand(userId.Value, groupId, file.ContentType, file.Length, stream),
        cancellationToken);
    return Results.Ok(ToBrandingResponse(updated));
})
.WithName("SetGroupLogo")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/branding/logo", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetGroupLogoHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var content = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
    return content is null
        ? Results.NotFound()
        : Results.File(content.Content, content.ContentType, enableRangeProcessing: true);
})
.WithName("GetGroupLogo")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/branding/banner", async (
    Guid groupId,
    HttpRequest httpRequest,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SetGroupBannerHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    if (!httpRequest.HasFormContentType)
    {
        return Results.Problem(detail: "Multipart form is required.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
    }

    var form = await httpRequest.ReadFormAsync(cancellationToken);
    var file = form.Files.GetFile("file");
    if (file is null || file.Length <= 0)
    {
        return Results.Problem(detail: "Banner file is required.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
    }

    await using var stream = file.OpenReadStream();
    var updated = await handler.HandleAsync(
        new SetGroupBannerCommand(userId.Value, groupId, file.ContentType, file.Length, stream),
        cancellationToken);
    return Results.Ok(ToBrandingResponse(updated));
})
.WithName("SetGroupBanner")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/branding/banner", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetGroupBannerHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var content = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
    return content is null
        ? Results.NotFound()
        : Results.File(content.Content, content.ContentType, enableRangeProcessing: true);
})
.WithName("GetGroupBanner")
.RequireAuthorization();

// Anonymous, uniform reads for the branded access screen (never leak existence).
app.MapGet("/api/groups/by-slug/{slug}/branding", async (
    string slug,
    GetPublicBrandingHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    return Results.Ok(await handler.HandleAsync(slug, cancellationToken));
})
.WithName("GetPublicGroupBranding")
.AllowAnonymous();

app.MapGet("/api/groups/by-slug/{slug}/branding/logo", async (
    string slug,
    GetPublicBrandingLogoHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var content = await handler.HandleAsync(slug, cancellationToken);
    return content is null
        ? Results.NotFound()
        : Results.File(content.Content, content.ContentType, enableRangeProcessing: true);
})
.WithName("GetPublicGroupBrandingLogo")
.AllowAnonymous();

app.MapGet("/api/groups/by-slug/{slug}/branding/banner", async (
    string slug,
    GetPublicBrandingBannerHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var content = await handler.HandleAsync(slug, cancellationToken);
    return content is null
        ? Results.NotFound()
        : Results.File(content.Content, content.ContentType, enableRangeProcessing: true);
})
.WithName("GetPublicGroupBrandingBanner")
.AllowAnonymous();

// Dynamic per-group web app manifest (/g/{slug}/manifest.webmanifest), same origin.
app.MapGet("/g/{slug}/manifest.webmanifest", async (
    string slug,
    GetPublicBrandingHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:GroupBranding", true))
    {
        return Results.NotFound();
    }

    var branding = await handler.HandleAsync(slug, cancellationToken);
    var productName = configuration.GetValue("Brand:ProductName", "Sonivo") ?? "Sonivo";
    var name = branding.Name ?? productName;

    var manifest = new
    {
        name,
        short_name = name.Length > 12 ? name[..12] : name,
        start_url = $"/g/{slug}",
        scope = $"/g/{slug}",
        display = "standalone",
        background_color = "#0b1020",
        theme_color = branding.AccentHex ?? "#5b4bd6",
        icons = branding.LogoUrl is null
            ? Array.Empty<object>()
            : new object[]
            {
                new { src = branding.LogoUrl, sizes = "any", type = "image/png", purpose = "any" }
            }
    };

    return Results.Json(manifest, contentType: "application/manifest+json");
})
.WithName("GetGroupManifest")
.AllowAnonymous();

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
            musicalRole = i.MusicalRole,
            createdAt = i.CreatedAt,
            lastSeenAt = i.LastSeenAt,
            email = i.Email
        })
    });
})
.WithName("ListGroupMembers")
.RequireAuthorization();

// ADR-0055 W-E: best-effort presence heartbeat (throttled server-side, never authorizes).
app.MapPost("/api/presence/heartbeat", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    PresenceHeartbeatHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(new PresenceHeartbeatCommand(userId.Value, DateTimeOffset.UtcNow), cancellationToken);
    return Results.NoContent();
})
.WithName("PresenceHeartbeat")
.RequireAuthorization();

// ADR-0055 W-G: group tasks (Manager/Owner write, Member read, non-member 404).
app.MapGet("/api/groups/{groupId:guid}/tasks", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListTasksHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var items = await handler.HandleAsync(new ListTasksQuery(userId.Value, groupId), cancellationToken);
    return Results.Ok(items);
})
.WithName("ListGroupTasks")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/tasks", async (
    Guid groupId,
    CreateTaskRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateTaskHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var created = await handler.HandleAsync(
        new CreateTaskCommand(userId.Value, groupId, request.Title ?? string.Empty, request.Notes, request.DueAt, request.AssigneeUserId),
        cancellationToken);
    return Results.Created($"/api/groups/{groupId}/tasks/{created.Id}", ToTaskResponse(created));
})
.WithName("CreateGroupTask")
.RequireAuthorization();

app.MapPatch("/api/groups/{groupId:guid}/tasks/{taskId:guid}", async (
    Guid groupId,
    Guid taskId,
    UpdateTaskRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    UpdateTaskHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new UpdateTaskCommand(userId.Value, groupId, taskId, request.Title ?? string.Empty, request.Notes, request.DueAt, request.AssigneeUserId, request.ExpectedVersion),
        cancellationToken);
    return Results.Ok(ToTaskResponse(updated));
})
.WithName("UpdateGroupTask")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/tasks/{taskId:guid}/status", async (
    Guid groupId,
    Guid taskId,
    SetTaskStatusRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SetTaskStatusHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var updated = await handler.HandleAsync(
        new SetTaskStatusCommand(userId.Value, groupId, taskId, request.Status ?? string.Empty, request.ExpectedVersion),
        cancellationToken);
    return Results.Ok(ToTaskResponse(updated));
})
.WithName("SetGroupTaskStatus")
.RequireAuthorization();

app.MapDelete("/api/groups/{groupId:guid}/tasks/{taskId:guid}", async (
    Guid groupId,
    Guid taskId,
    [FromBody] DeleteTaskRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    DeleteTaskHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(new DeleteTaskCommand(userId.Value, groupId, taskId, request.ExpectedVersion), cancellationToken);
    return Results.NoContent();
})
.WithName("DeleteGroupTask")
.RequireAuthorization();

static object ToTaskResponse(TaskItemDto task) => new
{
    id = task.Id,
    title = task.Title,
    notes = task.Notes,
    status = task.Status,
    dueAt = task.DueAt,
    assigneeUserId = task.AssigneeUserId,
    createdByUserId = task.CreatedByUserId,
    createdAt = task.CreatedAt,
    updatedAt = task.UpdatedAt,
    version = task.Version
};
// Phase 4.1: roster incl. people without an account behind Features:ManagedAccounts.
app.MapGet("/api/groups/{groupId:guid}/roster", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListRosterHandler handler,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:ManagedAccounts", false))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var roster = await handler.HandleAsync(new ListRosterQuery(userId.Value, groupId), cancellationToken);
    return Results.Ok(new
    {
        items = roster.Items.Select(i => new
        {
            memberId = i.MemberId,
            userId = i.UserId,
            displayName = i.DisplayName,
            role = i.Role,
            hasAccess = i.HasAccess,
            handle = i.Handle,
            createdAt = i.CreatedAt
        })
    });
})
.WithName("ListGroupRoster")
.RequireAuthorization();

// Phase 4.1: Owner provisions access. With email → single-use activation link
// (the Owner never sees a password); without email → one-use temporary password
// shown exactly once (never logged). Anti-pre-hijacking: an existing account is
// never taken over (409) and only accounts created by this group are resettable.
app.MapPost("/api/groups/{groupId:guid}/roster", async (
    Guid groupId,
    CreateRosterMemberRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GroupAccessService access,
    IGroupStore groups,
    IMembershipStore memberships,
    IAccountAuditStore audit,
    IEmailSender email,
    IPublicOrigin origin,
    IClock clock,
    IConfiguration configuration,
    ILoggerFactory loggerFactory,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:ManagedAccounts", false))
    {
        return Results.NotFound();
    }

    var actorId = await RequireUserIdAsync(principal, users);
    if (actorId is null)
    {
        return Results.Unauthorized();
    }

    await access.RequireOwnerAsync(groupId, actorId.Value, cancellationToken);

    var displayName = request.DisplayName?.Trim();
    if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 200)
    {
        return Results.Problem(detail: "Display name is required (200 chars max).", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
    }

    var now = clock.UtcNow;
    ApplicationUser? account = null;
    string credential = "none";
    var mailed = false;
    string? temporaryPassword = null;
    string? handle = null;

    if (request.GrantAccess)
    {
        var emailAddress = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        var provisioned = await ManagedAccountProvisioner.CreateForGroupAsync(
            users,
            memberships,
            email,
            origin,
            loggerFactory.CreateLogger("ManagedAccounts"),
            groupId,
            displayName,
            emailAddress,
            request.Handle,
            cancellationToken);
        account = provisioned.Account;
        credential = provisioned.Credential;
        mailed = provisioned.Mailed;
        temporaryPassword = provisioned.TemporaryPassword;
        handle = provisioned.Handle;
    }

    var membership = Membership.CreatePerson(groupId, displayName, now);
    if (account is not null)
    {
        membership.ClaimAccount(account.Id);
    }

    if (handle is not null)
    {
        membership.AssignHandle(handle);
    }

    await groups.AddMembershipAsync(membership, cancellationToken);
    await groups.SaveChangesAsync(cancellationToken);

    await audit.AddAsync(
        AccountAudit.Create(AccountAudit.ActionAccessCreated, now, actorId, account?.Id, groupId),
        cancellationToken);
    await audit.SaveChangesAsync(cancellationToken);

    return Results.Created($"/api/groups/{groupId}/roster/{membership.Id}", new
    {
        memberId = membership.Id,
        userId = account?.Id,
        credential,
        mailed,
        temporaryPassword,
        handle
    });
})
.WithName("CreateRosterMember")
.RequireAuthorization()
.DisableAntiforgery();

// Phase 4.1 (F3b): bulk add via CSV. Strict header/row validation, a hard row
// limit, and a per-row error report. Valid rows are created (with access); each
// invalid row is reported without aborting the batch.
app.MapPost("/api/groups/{groupId:guid}/roster/import", async (
    Guid groupId,
    ImportRosterCsvRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GroupAccessService access,
    IGroupStore groups,
    IMembershipStore memberships,
    IAccountAuditStore audit,
    IEmailSender email,
    IPublicOrigin origin,
    IClock clock,
    IConfiguration configuration,
    ILoggerFactory loggerFactory,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:ManagedAccounts", false))
    {
        return Results.NotFound();
    }

    var actorId = await RequireUserIdAsync(principal, users);
    if (actorId is null)
    {
        return Results.Unauthorized();
    }

    await access.RequireOwnerAsync(groupId, actorId.Value, cancellationToken);

    RosterCsvParseResult parsed;
    try
    {
        parsed = RosterCsvParser.Parse(request.Csv);
    }
    catch (ValidationException ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
    }

    var now = clock.UtcNow;
    var seenEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var seenHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var rows = new List<object>();
    var created = 0;
    var failed = 0;

    foreach (var row in parsed.Rows)
    {
        try
        {
            var displayName = row.DisplayName?.Trim();
            if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 200)
            {
                throw new ValidationException("El nombre es obligatorio (máx. 200).");
            }

            var emailAddress = string.IsNullOrWhiteSpace(row.Email) ? null : row.Email.Trim();
            if (emailAddress is not null && !seenEmails.Add(emailAddress))
            {
                throw new ValidationException("Correo duplicado en el archivo.");
            }

            var requestedHandle = string.IsNullOrWhiteSpace(row.Handle) ? null : row.Handle.Trim();
            if (requestedHandle is not null
                && MembershipHandles.Normalize(requestedHandle) is { } normalized
                && !seenHandles.Add(normalized))
            {
                throw new ValidationException("Identificador duplicado en el archivo.");
            }

            var provisioned = await ManagedAccountProvisioner.CreateForGroupAsync(
                users,
                memberships,
                email,
                origin,
                loggerFactory.CreateLogger("ManagedAccounts"),
                groupId,
                displayName,
                emailAddress,
                requestedHandle,
                cancellationToken);

            var membership = Membership.CreatePerson(groupId, displayName, now);
            membership.ClaimAccount(provisioned.Account.Id);
            if (provisioned.Handle is not null)
            {
                membership.AssignHandle(provisioned.Handle);
            }

            await groups.AddMembershipAsync(membership, cancellationToken);
            await groups.SaveChangesAsync(cancellationToken);
            await audit.AddAsync(
                AccountAudit.Create(AccountAudit.ActionAccessCreated, now, actorId, provisioned.Account.Id, groupId),
                cancellationToken);
            await audit.SaveChangesAsync(cancellationToken);

            created++;
            rows.Add(new
            {
                row = row.RowNumber,
                status = "created",
                memberId = membership.Id,
                userId = provisioned.Account.Id,
                credential = provisioned.Credential,
                handle = provisioned.Handle,
                mailed = provisioned.Mailed,
                temporaryPassword = provisioned.TemporaryPassword
            });
        }
        catch (AppException ex)
        {
            failed++;
            rows.Add(new { row = row.RowNumber, status = "error", error = ex.Message });
        }
    }

    return Results.Ok(new { created, failed, rows });
})
.WithName("ImportRosterCsv")
.RequireAuthorization()
.DisableAntiforgery();


app.MapPost("/api/groups/{groupId:guid}/roster/{memberId:guid}/reset-access", async (
    Guid groupId,
    Guid memberId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GroupAccessService access,
    IMembershipStore memberships,
    IAccountAuditStore audit,
    IEmailSender email,
    IPublicOrigin origin,
    IClock clock,
    IConfiguration configuration,
    ILoggerFactory loggerFactory,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:ManagedAccounts", false))
    {
        return Results.NotFound();
    }

    var actorId = await RequireUserIdAsync(principal, users);
    if (actorId is null)
    {
        return Results.Unauthorized();
    }

    await access.RequireOwnerAsync(groupId, actorId.Value, cancellationToken);

    var target = (await memberships.ListByGroupAsync(groupId, cancellationToken))
        .FirstOrDefault(m => m.Id == memberId);
    if (target?.UserId is null)
    {
        return Results.NotFound();
    }

    var account = await users.FindByIdAsync(target.UserId.Value.ToString("D"));
    if (account is null)
    {
        return Results.NotFound();
    }

    // Only accounts this group created can be reset by its Owner.
    if (account.ManagedByGroupId != groupId)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var now = clock.UtcNow;
    var mailed = false;
    string credential;
    string? temporaryPassword = null;

    if (!string.IsNullOrWhiteSpace(account.Email)
        && !account.Email.EndsWith("@managed.invalid", StringComparison.Ordinal))
    {
        var token = await users.GeneratePasswordResetTokenAsync(account);
        mailed = await VerificationMail.TrySendPasswordResetAsync(
            email, origin, loggerFactory.CreateLogger("ManagedAccounts"), account.Email!, token, cancellationToken);
        credential = "activation_link";
    }
    else
    {
        var resetToken = await users.GeneratePasswordResetTokenAsync(account);
        temporaryPassword = GenerateTemporaryPassword();
        var result = await users.ResetPasswordAsync(account, resetToken, temporaryPassword);
        if (!result.Succeeded)
        {
            return Results.ValidationProblem(result.Errors.ToDictionary(e => e.Code, e => new[] { e.Description }));
        }

        account.MustChangePassword = true;
        await users.UpdateAsync(account);
        credential = "temporary_password";
    }

    await audit.AddAsync(
        AccountAudit.Create(AccountAudit.ActionAccessReset, now, actorId, account.Id, groupId),
        cancellationToken);
    await audit.SaveChangesAsync(cancellationToken);

    return Results.Ok(new { memberId, userId = account.Id, credential, mailed, temporaryPassword, handle = target.Handle });
})
.WithName("ResetRosterAccess")
.RequireAuthorization()
.DisableAntiforgery();

// Phase 4.1: delete a roster row. A managed account created by this group and used
// only here is deleted with it; otherwise the managed mark is cleared.
app.MapDelete("/api/groups/{groupId:guid}/roster/{memberId:guid}", async (
    Guid groupId,
    Guid memberId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GroupAccessService access,
    IMembershipStore memberships,
    IGroupStore groups,
    IUnitOfWork unitOfWork,
    IAccountAuditStore audit,
    IClock clock,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:ManagedAccounts", false))
    {
        return Results.NotFound();
    }

    var actorId = await RequireUserIdAsync(principal, users);
    if (actorId is null)
    {
        return Results.Unauthorized();
    }

    await access.RequireOwnerAsync(groupId, actorId.Value, cancellationToken);

    var target = (await memberships.ListByGroupAsync(groupId, cancellationToken))
        .FirstOrDefault(m => m.Id == memberId);
    if (target is null)
    {
        return Results.NotFound();
    }

    if (target.IsOwner)
    {
        return Results.Conflict(new { detail = "Cannot delete the Owner." });
    }

    if (target.UserId is { } targetUserId)
    {
        var account = await users.FindByIdAsync(targetUserId.ToString("D"));
        if (account is not null && account.ManagedByGroupId == groupId)
        {
            var belongsElsewhere = (await groups.ListForUserAsync(targetUserId, cancellationToken))
                .Any(g => g.Id != groupId);
            if (!belongsElsewhere)
            {
                await users.DeleteAsync(account);
            }
            else
            {
                account.ManagedByGroupId = null;
                await users.UpdateAsync(account);
            }
        }
    }

    await memberships.RemoveAsync(target, cancellationToken);
    await unitOfWork.SaveChangesAsync(cancellationToken);
    await audit.AddAsync(
        AccountAudit.Create(AccountAudit.ActionRemoved, clock.UtcNow, actorId, target.UserId, groupId),
        cancellationToken);
    await audit.SaveChangesAsync(cancellationToken);

    return Results.NoContent();
})
.WithName("DeleteRosterMember")
.RequireAuthorization()
.DisableAntiforgery();

// Phase 4.1 GDPR-style group export (Owner only): roster + repertoire as a
// downloadable JSON document. No binaries, no cross-group data.
app.MapGet("/api/groups/{groupId:guid}/export", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ExportGroupHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var export = await handler.HandleAsync(new ExportGroupQuery(userId.Value, groupId), cancellationToken);
    var bytes = JsonSerializer.SerializeToUtf8Bytes(
        export, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true });
    return Results.File(bytes, "application/json", $"sonivo-grupo-{groupId:D}.json");
})
.WithName("ExportGroup")
.RequireAuthorization();

// Phase 4.1 GDPR-style own-data export: profile + memberships + account audit.
app.MapGet("/api/auth/export", async (
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ExportOwnDataHandler handler,
    CancellationToken cancellationToken) =>
{
    var appUser = await users.GetUserAsync(principal);
    if (appUser is null)
    {
        return Results.Unauthorized();
    }

    var email = appUser.Email is { } mail && mail.EndsWith("@managed.invalid", StringComparison.Ordinal)
        ? null
        : appUser.Email;
    var export = await handler.HandleAsync(
        new ExportOwnDataQuery(
            appUser.Id,
            email,
            appUser.DisplayName,
            appUser.EmailConfirmed,
            appUser.MustChangePassword,
            appUser.ManagedByGroupId),
        cancellationToken);
    var bytes = JsonSerializer.SerializeToUtf8Bytes(
        export, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true });
    return Results.File(bytes, "application/json", "sonivo-mis-datos.json");
})
.WithName("ExportOwnData")
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

// ADR-0051: Owner or Manager sets a member's descriptive musical role.
app.MapPut("/api/groups/{groupId:guid}/members/{targetUserId:guid}/musical-role", async (
    Guid groupId,
    Guid targetUserId,
    SetMusicalRoleRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    SetMusicalRoleHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await handler.HandleAsync(
        new SetMusicalRoleCommand(userId.Value, groupId, targetUserId, request.MusicalRole),
        cancellationToken);
    return Results.NoContent();
})
.WithName("SetGroupMemberMusicalRole")
.RequireAuthorization()
.DisableAntiforgery();

// ADR-0051: per-group audit log (ids + short action metadata). Owner only.
app.MapGet("/api/groups/{groupId:guid}/audit", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GroupAccessService access,
    IGroupAuditStore audit,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await access.RequireOwnerAsync(groupId, userId.Value, cancellationToken);
    var entries = await audit.ListByGroupAsync(groupId, 200, cancellationToken);
    return Results.Ok(new
    {
        items = entries.Select(e => new
        {
            id = e.Id,
            action = e.Action,
            actorUserId = e.ActorUserId,
            targetUserId = e.TargetUserId,
            metadata = e.Metadata,
            createdAt = e.CreatedAt
        })
    });
})
.WithName("ListGroupAudit")
.RequireAuthorization();

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
    CreateInvitationRequest? request,
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
        new CreateInvitationCommand(userId.Value, groupId, request?.Email),
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

    // ADR-0047: joining another group drops the managed-account mark.
    var account = await users.GetUserAsync(principal);
    if (account is not null
        && account.ManagedByGroupId is not null
        && account.ManagedByGroupId != accepted.GroupId)
    {
        account.ManagedByGroupId = null;
        await users.UpdateAsync(account);
    }

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
            request.RightsNotes,
            request.Tags is null ? null : string.Join(',', request.Tags)),
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
            request.ExpectedVersion,
            request.Tags is null ? null : string.Join(',', request.Tags)),
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
            request.ChordTimingJson,
            request.ExpectedVersion),
        cancellationToken);

    return Results.Ok(ToArrangementDetailResponse(updated));
})
.WithName("UpdateArrangement")
.RequireAuthorization()
.DisableAntiforgery();

// ---------- .lrc import / export (ADR-0050). Flag: Features:Lrc (default off). ----------
app.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/import-lrc", async (
    Guid groupId,
    Guid arrangementId,
    ImportLrcRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetArrangementHandler arrangementHandler,
    IGroupStore groupStore,
    CancellationToken cancellationToken) =>
{
    if (!app.Configuration.GetValue("Features:Lrc", false))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    // Membership first: a non-member must see 404, never 403 (no existence leak).
    await arrangementHandler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);

    var membership = await groupStore.GetMembershipAsync(groupId, userId.Value, cancellationToken);
    if (membership is null || !membership.IsOwner)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    byte[] bytes;
    if (!string.IsNullOrEmpty(request.ContentBase64))
    {
        try
        {
            bytes = Convert.FromBase64String(request.ContentBase64);
        }
        catch (FormatException)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["contentBase64"] = ["must be valid base64"]
            });
        }
    }
    else if (request.Content is not null)
    {
        bytes = System.Text.Encoding.UTF8.GetBytes(request.Content);
    }
    else
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["content"] = ["content or contentBase64 is required"]
        });
    }

    var parsed = LrcParser.Parse(bytes);

    // Limit violations (line 0) are a hard 400 with the errors[{ line, reason }] contract.
    if (parsed.Errors.Any(e => e.Line == 0))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["errors"] = parsed.Errors.Select(e => e.Reason).ToArray()
        });
    }

    // Preview only: convert, but never persist here.
    var conversion = LrcConverter.ToChordPro(parsed, request.OffsetMs ?? 0);

    return Results.Ok(new
    {
        encoding = parsed.Encoding,
        lyrics = conversion.Lyrics,
        chordTimingJson = conversion.ChordTimingJson,
        markCount = conversion.MarkCount,
        metadata = parsed.Metadata,
        warnings = parsed.Warnings,
        errors = parsed.Errors.Select(e => new { line = e.Line, reason = e.Reason })
    });
})
.WithName("ImportArrangementLyricsLrc")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/export.lrc", async (
    Guid groupId,
    Guid arrangementId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetArrangementHandler arrangementHandler,
    CancellationToken cancellationToken) =>
{
    if (!app.Configuration.GetValue("Features:Lrc", false))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    // Read-only export: any member may export; a non-member gets 404 from the handler.
    var arrangement = await arrangementHandler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);

    try
    {
        var lrc = LrcConverter.ToLrc(arrangement.Lyrics, arrangement.ChordTimingJson);
        return Results.Text(lrc, "text/plain; charset=utf-8");
    }
    catch (ValidationException ex)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["lyrics"] = [ex.Message]
        });
    }
})
.WithName("ExportArrangementLyricsLrc")
.RequireAuthorization();

// Anonymous feature flags: lets the SPA hide unfinished surfaces instead of guessing.
app.MapGet("/api/features", (IConfiguration configuration) => Results.Ok(new
{
    lrc = configuration.GetValue("Features:Lrc", false),
    stageMode = configuration.GetValue("Features:StageMode", false),
    groupBranding = configuration.GetValue("Features:GroupBranding", true),
    notifications = configuration.GetValue("Features:Notifications", false),
    managedAccounts = configuration.GetValue("Features:ManagedAccounts", false)
}))
.WithName("GetFeatures")
.AllowAnonymous();

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

app.MapGet("/api/groups/{groupId:guid}/resources", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    ListGroupResourcesHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var items = await handler.HandleAsync(new ListGroupResourcesQuery(userId.Value, groupId), cancellationToken);
    return Results.Ok(items.Select(ToGroupResourceResponse));
})
.WithName("ListGroupResources")
.RequireAuthorization();

app.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources", async (
    Guid groupId,
    Guid arrangementId,
    HttpRequest httpRequest,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    CreateLinkResourceHandler linkHandler,
    CreateFileResourceHandler fileHandler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    if (httpRequest.HasFormContentType)
    {
        var form = await httpRequest.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("file");
        if (file is null || file.Length <= 0)
        {
            return Results.Problem(
                detail: "File is required and must not be empty.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Bad Request");
        }

        if (file.Length > ResourceFileConstraints.MaxByteSize)
        {
            return Results.Problem(
                detail: $"File must be {ResourceFileConstraints.MaxByteSize} bytes or fewer.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Bad Request");
        }

        var contentType = ResolveUploadContentType(file.ContentType, file.FileName);
        await using var stream = file.OpenReadStream();
        var createdFile = await fileHandler.HandleAsync(
            new CreateFileResourceCommand(
                userId.Value,
                groupId,
                arrangementId,
                form["purpose"].ToString(),
                form["label"].ToString(),
                NullIfWhiteSpace(form["part"].ToString()),
                NullIfWhiteSpace(form["note"].ToString()),
                file.FileName,
                contentType,
                file.Length,
                stream),
            cancellationToken);

        return Results.Created(
            $"/api/groups/{groupId}/arrangements/{arrangementId}/resources/{createdFile.Id}",
            ToResourceDetailResponse(createdFile));
    }

    var request = await httpRequest.ReadFromJsonAsync<CreateLinkResourceRequest>(cancellationToken: cancellationToken);
    if (request is null)
    {
        return Results.Problem(
            detail: "Request body is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Bad Request");
    }

    var created = await linkHandler.HandleAsync(
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
.WithName("CreateResource")
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

app.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}/content", async (
    Guid groupId,
    Guid arrangementId,
    Guid resourceId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetResourceContentHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var content = await handler.HandleAsync(
        userId.Value,
        groupId,
        arrangementId,
        resourceId,
        cancellationToken);

    return Results.File(
        content.Content,
        content.ContentType,
        fileDownloadName: content.DownloadFileName,
        enableRangeProcessing: true);
})
.WithName("GetResourceContent")
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

// ADR-0032 Q-W32-4: async digitizer job. POST validates eligibility and
// returns 202; transcription runs in the background and never writes
// Arrangement fields — the Owner saves drafts via the existing PATCH.
app.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/digitize", async (
    Guid groupId,
    Guid arrangementId,
    DigitizeRequest request,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    StartDigitizeJobHandler handler,
    IServiceScopeFactory scopes,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var started = await handler.HandleAsync(
        new StartDigitizeJobCommand(userId.Value, groupId, arrangementId, request.ResourceId),
        cancellationToken);

    var jobId = started.JobId;
    _ = Task.Run(async () =>
    {
        using var scope = scopes.CreateScope();
        var runner = scope.ServiceProvider.GetRequiredService<DigitizeJobRunner>();
        await runner.ProcessAsync(jobId, CancellationToken.None);
    }, CancellationToken.None);

    return Results.Accepted(
        $"/api/groups/{groupId}/arrangements/{arrangementId}/digitize/{jobId}",
        new { jobId, status = started.Status });
})
.WithName("StartDigitize")
.RequireAuthorization()
.DisableAntiforgery();

app.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/digitize/{jobId:guid}", async (
    Guid groupId,
    Guid arrangementId,
    Guid jobId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GetDigitizeJobHandler handler,
    CancellationToken cancellationToken) =>
{
    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var job = await handler.HandleAsync(userId.Value, groupId, arrangementId, jobId, cancellationToken);
    return Results.Ok(new
    {
        jobId = job.JobId,
        status = job.Status,
        segments = job.Segments?.Select(s => new
        {
            startMs = s.StartMs,
            endMs = s.EndMs,
            text = s.Text
        }),
        error = job.Error
    });
})
.WithName("GetDigitizeJob")
.RequireAuthorization();

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

// ADR-0052: read-only per-group ICS feed. Behind Features:Notifications (default off).
app.MapGet("/api/groups/{groupId:guid}/calendar.ics", async (
    Guid groupId,
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    GroupAccessService access,
    IGroupStore groups,
    IEventStore events,
    IClock clock,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Features:Notifications", false))
    {
        return Results.NotFound();
    }

    var userId = await RequireUserIdAsync(principal, users);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    await access.RequireMemberAsync(groupId, userId.Value, cancellationToken);
    var group = await groups.GetByIdAsync(groupId, cancellationToken);
    var upcoming = (await events.ListActiveByGroupAsync(groupId, cancellationToken))
        .Where(e => e.Status != EventStatuses.Cancelled && !e.IsHidden)
        .OrderBy(e => e.StartsAt)
        .ToList();

    var ics = IcsCalendar.Build(group?.Name ?? "Sonivo", upcoming, clock.UtcNow);
    return Results.Text(ics, "text/calendar; charset=utf-8");
})
.WithName("GroupCalendarIcs")
.RequireAuthorization();

if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();

static async Task<Guid?> RequireUserIdAsync(ClaimsPrincipal principal, UserManager<ApplicationUser> users){
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
    slug = group.Slug,
    version = group.Version,
    role = group.Role,
    createdAt = group.CreatedAt,
    updatedAt = group.UpdatedAt
};

static object ToGroupBySlugResponse(GroupBySlugResult result) => new
{
    id = result.Group.Id,
    name = result.Group.Name,
    slug = result.Group.Slug,
    moved = result.Moved,
    version = result.Group.Version,
    role = result.Group.Role,
    createdAt = result.Group.CreatedAt,
    updatedAt = result.Group.UpdatedAt
};

static object ToBrandingResponse(GroupBrandingDto branding) => new
{
    groupId = branding.GroupId,
    displayName = branding.DisplayName,
    accentHex = branding.AccentHex,
    secondaryHex = branding.SecondaryHex,
    onPrimary = branding.OnPrimary,
    onSecondary = branding.OnSecondary,
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
    showSonivoCredit = branding.ShowSonivoCredit,
    version = branding.Version
};

static object ToGroupListResponse(GroupListItem item) => new
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

static object ToUpcomingActivityResponse(UpcomingActivityItem item) => new
{
    groupId = item.GroupId,
    groupName = item.GroupName,
    eventId = item.EventId,
    title = item.Title,
    type = item.Type,
    startsAt = item.StartsAt,
    myResponse = item.MyResponse
};

static object ToInvitationCreatedResponse(InvitationCreatedDto invitation) => new
{
    id = invitation.Id,
    token = invitation.Token,
    expiresAt = invitation.ExpiresAt,
    emailed = invitation.Emailed
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
    updatedAt = song.UpdatedAt,
    tags = song.Tags,
    isFavorite = song.IsFavorite
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
    arrangementCount = song.ArrangementCount,
    tags = song.Tags,
    isFavorite = song.IsFavorite
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
    chordTimingJson = arrangement.ChordTimingJson,
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

static object ToGroupResourceResponse(GroupResourceListItemDto resource) => new
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
    originalFileName = resource.OriginalFileName,
    contentType = resource.ContentType,
    byteSize = resource.ByteSize,
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
    originalFileName = resource.OriginalFileName,
    contentType = resource.ContentType,
    byteSize = resource.ByteSize,
    createdAt = resource.CreatedAt
};

static string? NullIfWhiteSpace(string? value)
    => string.IsNullOrWhiteSpace(value) ? null : value;

/// <summary>
/// Browsers often send empty or application/octet-stream for .txt uploads; infer from extension.
/// </summary>
static string ResolveUploadContentType(string? declaredContentType, string? fileName)
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
        ".wav" => "audio/wav",
        ".m4a" or ".mp4" => "audio/mp4",
        ".txt" => "text/plain",
        _ => mediaType
    };
}

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

/// <summary>LRC import payload. Send <c>contentBase64</c> to exercise BOM/encoding detection.</summary>
internal sealed record ImportLrcRequest(string? Content, string? ContentBase64, int? OffsetMs);
internal sealed record LoginRequest(string? Email, string? Password, bool RememberMe = false);
internal sealed record HandleLoginRequest(string? Handle, string? Password, bool RememberMe = false);
internal sealed record ConfirmEmailRequest(string? Email, string? Token);
internal sealed record ResendConfirmationRequest(string? Email);
internal sealed record ForgotPasswordRequest(string? Email);
internal sealed record ResetPasswordRequest(string? Email, string? Token, string? NewPassword);
internal sealed record TestConfirmRequest(string? Email);
internal sealed record TwoFactorCodeRequest(string? Code);
internal sealed record TwoFactorChallengeRequest(string? Code, bool RememberMe = false);
internal sealed record DisableTwoFactorRequest(string? Password);
internal sealed record RegenerateRecoveryCodesRequest(string? Password);
internal sealed record CreateGroupRequest(string? Name);
internal sealed record ChangeGroupSlugRequest(string? Slug);
internal sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
internal sealed record UpdateProfileRequest(string? DisplayName);
internal sealed record CreateRosterMemberRequest(string? DisplayName, string? Email, bool GrantAccess, string? Handle = null);
internal sealed record ImportRosterCsvRequest(string? Csv);
internal sealed record UpdateGroupBrandingRequest(
    int ExpectedVersion,
    string? DisplayName,
    string? AccentHex,
    string? SecondaryHex,
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
internal sealed record ChangeMemberRoleRequest(string? Role);
internal sealed record SetMusicalRoleRequest(string? MusicalRole);
internal sealed record SoftDeleteGroupRequest(int ExpectedVersion);
internal sealed record CreateSongRequest(
    string? Title,
    string? Attribution,
    string? OriginKind,
    string? RightsNotes,
    string[]? Tags = null);
internal sealed record UpdateSongRequest(
    string? Title,
    string? Attribution,
    string? OriginKind,
    string? RightsNotes,
    int ExpectedVersion,
    string[]? Tags = null);
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
    string? ChordTimingJson,
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
internal sealed record DigitizeRequest(Guid ResourceId);
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

internal sealed record CreateTaskRequest(string? Title, string? Notes, DateTimeOffset? DueAt, Guid? AssigneeUserId);
internal sealed record UpdateTaskRequest(string? Title, string? Notes, DateTimeOffset? DueAt, Guid? AssigneeUserId, int ExpectedVersion);
internal sealed record SetTaskStatusRequest(string? Status, int ExpectedVersion);
internal sealed record DeleteTaskRequest(int ExpectedVersion);
