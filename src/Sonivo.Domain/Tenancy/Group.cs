using Sonivo.Domain.Billing;
using Sonivo.Domain.Common;

namespace Sonivo.Domain.Tenancy;

public sealed class Group : IVersionedEntity
{
    public Guid Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    /// <summary>
    /// Entitlements plan id (ADR-0071). Placeholder default keeps existing groups on
    /// the full-capability plan until billing assigns a real one.
    /// </summary>
    public string PlanId { get; private set; } = PlanCatalog.DefaultPlanId;
    /// <summary>
    /// Billing lifecycle (ADR-0071/0073, PHASE-PLANS-SPEC §4). Placeholder model
    /// until a payment provider is wired; managed manually.
    /// </summary>
    public string BillingStatus { get; private set; } = BillingStatuses.Active;
    /// <summary>End of the 14-day trial, when <see cref="BillingStatus"/> is Trialing.</summary>
    public DateTimeOffset? TrialEndsAt { get; private set; }
    /// <summary>Plan to apply at the end of the paid period (downgrade/extra-group).</summary>
    public string? ScheduledPlanId { get; private set; }
    /// <summary>Current path slug (ADR-0048 D1). Null only for rows awaiting backfill.</summary>
    public string? Slug { get; private set; }
    /// <summary>
    /// Set the first (and only) time the Owner changes the slug. Null means the
    /// auto-generated slug is still changeable; non-null means the slug is final.
    /// </summary>
    public DateTimeOffset? SlugConfirmedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }
    public int Version { get; private set; }

    public ICollection<Membership> Memberships { get; private set; } = new List<Membership>();

    private Group()
    {
    }

    public static Group Create(string name, DateTimeOffset now, Guid? id = null, string? slug = null)
    {
        var trimmed = NormalizeName(name);
        var resolvedSlug = slug ?? GroupSlug.Slugify(trimmed);
        if (!GroupSlug.IsValid(resolvedSlug))
        {
            throw new ArgumentException("Slug is invalid.", nameof(slug));
        }

        return new Group
        {
            Id = id ?? Guid.NewGuid(),
            Name = trimmed,
            Slug = resolvedSlug,
            PlanId = PlanCatalog.DefaultPlanId,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
    }

    /// <summary>Assigns the entitlements plan (billing/admin). Validates against the catalog.</summary>
    public void AssignPlan(string planId, DateTimeOffset now)
    {
        EnsureKnownPlan(planId);
        ScheduledPlanId = null;
        BillingStatus = BillingStatuses.Active;
        TrialEndsAt = null;
        if (string.Equals(PlanId, planId, StringComparison.Ordinal))
        {
            return;
        }

        PlanId = planId;
        Touch(now);
    }

    /// <summary>Starts the plan's trial (14 days by default). One trial per group (placeholder).</summary>
    public void StartTrial(string planId, DateTimeOffset now)
    {
        EnsureKnownPlan(planId);
        var days = PlanCatalog.Get(planId).TrialDays;
        PlanId = planId;
        BillingStatus = BillingStatuses.Trialing;
        TrialEndsAt = now.AddDays(days);
        ScheduledPlanId = null;
        Touch(now);
    }

    /// <summary>Schedules a plan change (downgrade) to apply at the end of the period.</summary>
    public void SchedulePlanChange(string planId, DateTimeOffset now)
    {
        EnsureKnownPlan(planId);
        ScheduledPlanId = string.Equals(planId, PlanId, StringComparison.Ordinal) ? null : planId;
        Touch(now);
    }

    /// <summary>Applies a scheduled plan change once the trial/period has elapsed.</summary>
    public void ApplyScheduledPlan(DateTimeOffset now)
    {
        if (ScheduledPlanId is null)
        {
            return;
        }

        PlanId = ScheduledPlanId;
        ScheduledPlanId = null;
        BillingStatus = BillingStatuses.Active;
        TrialEndsAt = null;
        Touch(now);
    }

    /// <summary>Marks the group read-only (non-payment after grace). Nothing is deleted.</summary>
    public void EnterReadOnly(DateTimeOffset now)
    {
        BillingStatus = BillingStatuses.ReadOnly;
        Touch(now);
    }

    /// <summary>Marks the subscription past due (grace period; nothing is deleted).</summary>
    public void MarkPastDue(DateTimeOffset now)
    {
        BillingStatus = BillingStatuses.PastDue;
        Touch(now);
    }

    private static void EnsureKnownPlan(string planId)
    {
        if (!PlanCatalog.IsKnown(planId))
        {
            throw new ArgumentException($"Unknown plan '{planId}'.", nameof(planId));
        }
    }

    /// <summary>Assigns the slug once (used by the migration backfill). Never overwrites.</summary>
    public void AssignSlug(string slug)
    {
        if (Slug is { Length: > 0 })
        {
            return;
        }

        if (!GroupSlug.IsValid(slug))
        {
            throw new ArgumentException("Slug is invalid.", nameof(slug));
        }

        Slug = slug;
    }

    /// <summary>True while the auto-generated slug can still be changed once.</summary>
    public bool CanChangeSlug => SlugConfirmedAt is null;

    /// <summary>
    /// Changes the slug once. Returns the previous slug so the caller can keep it
    /// reserved in <see cref="GroupSlugHistory"/> (permanent redirect, no reuse).
    /// </summary>
    public string ChangeSlug(string newSlug, DateTimeOffset now)
    {
        EnsureNotDeleted();
        if (SlugConfirmedAt is not null)
        {
            throw new InvalidOperationException("Slug already confirmed.");
        }

        if (!GroupSlug.IsValid(newSlug))
        {
            throw new ArgumentException("Slug is invalid.", nameof(newSlug));
        }

        if (string.Equals(Slug, newSlug, StringComparison.Ordinal))
        {
            throw new ArgumentException("New slug must differ from the current slug.", nameof(newSlug));
        }

        var previous = Slug ?? string.Empty;
        Slug = newSlug;
        SlugConfirmedAt = now;
        Touch(now);
        return previous;
    }

    public void Rename(string name, int expectedVersion, DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        Name = NormalizeName(name);
        Touch(now);
    }

    public void SoftDelete(int expectedVersion, DateTimeOffset now)
    {
        EnsureNotDeleted();
        EnsureExpectedVersion(expectedVersion);
        DeletedAt = now;
        Touch(now);
    }

    public bool IsDeleted => DeletedAt is not null;

    private void Touch(DateTimeOffset now)
    {
        UpdatedAt = now;
        Version += 1;
    }

    private void EnsureNotDeleted()
    {
        if (IsDeleted)
        {
            throw new InvalidOperationException("Group is deleted.");
        }
    }

    private void EnsureExpectedVersion(int expectedVersion)
    {
        if (Version != expectedVersion)
        {
            throw new ConcurrencyConflictException(
                $"Group version mismatch. Expected {expectedVersion}, actual {Version}.");
        }
    }

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Group name is required.", nameof(name));
        }

        var trimmed = name.Trim();
        if (trimmed.Length > 200)
        {
            throw new ArgumentException("Group name must be 200 characters or fewer.", nameof(name));
        }

        return trimmed;
    }
}
