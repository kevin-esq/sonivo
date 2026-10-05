using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Sonivo.Migration.Api.Contracts;
using Sonivo.Migration.Api.Contracts.Serialization;
using Sonivo.Migration.Api.Features.Branding;
using Sonivo.Migration.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

var brandingCacheOptions = builder.Configuration
    .GetSection(BrandingCacheOptions.SectionName)
    .Get<BrandingCacheOptions>() ?? new BrandingCacheOptions();

// System.Text.Json: source-generated contracts first so reflection stays out of
// the request hot path (trim/AOT friendly, lower alloc, faster startup warmup).
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, ApiJsonContext.Default);
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// RFC 7807 problem responses with a correlation id on every error.
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = static context =>
        context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
});

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi();

// Read-side seam: the in-memory store is the sandbox default. Swap for an
// EF Core implementation without touching the endpoint or the contracts.
builder.Services.AddSingleton<IBrandingReader, InMemoryBrandingReader>();

builder.Services.AddResponseCompression(static options => options.EnableForHttps = true);

// Output cache keyed per tenant + locale, with evictable tags.
builder.Services.AddOutputCache(options =>
{
    options.AddPolicy(BrandingCachePolicy.Name, new TenantBrandingCachePolicy(brandingCacheOptions));
});

// Public endpoint: coarse per-IP fixed window as a first line of defence.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("branding-read", static http =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: static _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0,
            }));
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseResponseCompression();
app.UseOutputCache();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapGet("/health", static () => TypedResults.Ok(new HealthResponse("ok")))
    .WithName("Health")
    .AllowAnonymous();

app.MapGet("/health/ready", static () => TypedResults.Ok(new HealthResponse("ready")))
    .WithName("HealthReady")
    .AllowAnonymous();

app.MapBrandingEndpoints();

app.Run();

/// <summary>Exposed for WebApplicationFactory-based integration tests.</summary>
public partial class Program
{
}
