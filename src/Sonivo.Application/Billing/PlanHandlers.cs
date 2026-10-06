using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Billing;

namespace Sonivo.Application.Billing;

public sealed record GroupPlanStateDto(
    string PlanId,
    string BillingStatus,
    DateTimeOffset? TrialEndsAt,
    string? ScheduledPlanId);

/// <summary>
/// Manual plan management (ADR-0071/0073). Placeholder until a payment provider is
/// wired: the Owner (or admin tooling) assigns plans, starts the trial, schedules a
/// downgrade, or marks the group read-only. No gateway is involved.
/// </summary>
public sealed record UpdateGroupPlanCommand(Guid UserId, Guid GroupId, string Action, string? PlanId);

public sealed class UpdateGroupPlanHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupStore _groups;
    private readonly IClock _clock;

    public UpdateGroupPlanHandler(GroupAccessService access, IGroupStore groups, IClock clock)
    {
        _access = access;
        _groups = groups;
        _clock = clock;
    }

    public async Task<GroupPlanStateDto> HandleAsync(UpdateGroupPlanCommand command, CancellationToken cancellationToken)
    {
        var (group, _) = await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        var now = _clock.UtcNow;

        try
        {
            switch (command.Action)
            {
                case "assign":
                    group.AssignPlan(RequirePlanId(command.PlanId), now);
                    break;
                case "trial":
                    group.StartTrial(RequirePlanId(command.PlanId), now);
                    break;
                case "schedule":
                    group.SchedulePlanChange(RequirePlanId(command.PlanId), now);
                    break;
                case "apply":
                    group.ApplyScheduledPlan(now);
                    break;
                case "read_only":
                    group.EnterReadOnly(now);
                    break;
                default:
                    throw new ValidationException("Unknown plan action.");
            }
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _groups.UpdateAsync(group, cancellationToken);
        await _groups.SaveChangesAsync(cancellationToken);

        return new GroupPlanStateDto(group.PlanId, group.BillingStatus, group.TrialEndsAt, group.ScheduledPlanId);
    }

    private static string RequirePlanId(string? planId)
    {
        if (string.IsNullOrWhiteSpace(planId) || !PlanCatalog.IsKnown(planId))
        {
            throw new ValidationException("A valid planId is required.");
        }

        return planId;
    }
}
