using Microsoft.AspNetCore.Http;
using Sonivo.Application.Abstractions;

namespace Sonivo.Api.Observability;

internal static class ApiErrorSupport
{
    internal const string SupportIdHeader = "X-Support-Id";
    private const string SupportIdItemKey = "Sonivo.Api.SupportId";

    internal static string GetSupportId(HttpContext context)
    {
        if (context.Items.TryGetValue(SupportIdItemKey, out var value) && value is string supportId)
        {
            return supportId;
        }

        supportId = Guid.NewGuid().ToString("N");
        context.Items[SupportIdItemKey] = supportId;
        return supportId;
    }

    internal static string? GetCode(int statusCode) => statusCode switch
    {
        StatusCodes.Status400BadRequest => "validation_failed",
        StatusCodes.Status401Unauthorized => "unauthorized",
        StatusCodes.Status405MethodNotAllowed => "method_not_allowed",
        StatusCodes.Status403Forbidden => "forbidden",
        StatusCodes.Status404NotFound => "not_found",
        StatusCodes.Status409Conflict => "conflict",
        StatusCodes.Status413PayloadTooLarge => "payload_too_large",
        StatusCodes.Status429TooManyRequests => "rate_limited",
        >= StatusCodes.Status500InternalServerError => "internal_error",
        _ => null
    };

    internal static string GetCode(AppException exception) => exception switch
    {
        ValidationException => "validation_failed",
        NotFoundException => "not_found",
        ForbiddenException or PlanLimitException => "forbidden",
        UploadLimitException => "payload_too_large",
        ConflictException { Message: "billing-active-plan-required" } => "billing_active_plan_required",
        ConflictException => "conflict",
        _ => "internal_error"
    };
}
