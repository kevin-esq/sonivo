internal sealed record UpdateGroupPlanRequest(string? Action, string? PlanId);

internal sealed record CheckoutRequestDto(string? PlanId, string? SuccessUrl, string? CancelUrl,
    string? OperationId = null, string? Interval = null, int ExtraGroups = 0, bool RecurringConsent = false);
