namespace Sonivo.Api.Observability;

internal static class ApiErrorDetails
{
    internal static string GetDetail(string? code) => code switch
    {
        "validation_failed" => "The request is invalid.",
        "unauthorized" => "Authentication is required.",
        "forbidden" => "You are not allowed to perform this action.",
        "not_found" => "The requested resource was not found.",
        "conflict" => "The request conflicts with the current state.",
        "payload_too_large" => "The request content exceeds the allowed size.",
        "rate_limited" => "Too many requests. Try again later.",
        "method_not_allowed" => "The HTTP method is not allowed for this resource.",
        "internal_error" => "An unexpected error occurred.",
        "billing_active_plan_required" => "An active plan is required for this action.",
        "mobile_platform_required" => "A valid X-Sonivo-Platform header is required for mobile bearer requests.",
        "mobile_version_invalid" => "A valid X-Sonivo-App-Version header is required.",
        "mobile_update_required" => "Update Sonivo to continue.",
        _ => "An error occurred."
    };
}
