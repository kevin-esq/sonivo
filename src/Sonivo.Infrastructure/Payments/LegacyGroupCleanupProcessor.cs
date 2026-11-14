using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Infrastructure.Payments;

public sealed class LegacyGroupCleanupProcessor(
    SonivoDbContext db,
    IClock clock,
    IEmailSender emailSender,
    IPublicOrigin publicOrigin,
    UserManager<ApplicationUser> users,
    IOptions<PurgeSafetyOptions> safety,
    IGroupPurger purger)
{
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        if (!purger.IsRetentionEnabled || !safety.Value.LegacyGroupCleanupEnabled
            || safety.Value.LegacyGroupCreatedBeforeUtc is not { } cutoff) return;
        var now = clock.UtcNow;
        var candidates = await db.Groups.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.DeletedAt == null && x.CreatedAt <= cutoff
                && !db.BillingLegacyGroupNotices.Any(n => n.GroupId == x.Id))
            .Select(x => x.Id).Take(100).ToListAsync(cancellationToken);
        foreach (var groupId in candidates)
        {
            if (await HasCoverageAsync(groupId, now, cancellationToken)) continue;
            db.BillingLegacyGroupNotices.Add(new() { GroupId = groupId, CreatedAt = now, NextAttemptAt = now });
        }
        await db.SaveChangesAsync(cancellationToken);

        var pending = await db.BillingLegacyGroupNotices.Where(x => x.SentAt == null && x.ExemptedAt == null
                && x.NextAttemptAt <= now)
            .OrderBy(x => x.NextAttemptAt).Take(100).ToListAsync(cancellationToken);
        foreach (var notice in pending)
        {
            if (await HasCoverageAsync(notice.GroupId, now, cancellationToken))
            {
                notice.ExemptedAt = now;
                continue;
            }
            await NotifyOwnerAsync(notice, now, cancellationToken);
        }
        await db.SaveChangesAsync(cancellationToken);

        var due = await db.BillingLegacyGroupNotices.Where(x => x.SentAt != null && x.ExemptedAt == null
                && x.PurgeAt <= now)
            .OrderBy(x => x.PurgeAt).Take(100).Select(x => x.GroupId).ToListAsync(cancellationToken);
        foreach (var groupId in due)
        {
            if (await HasCoverageAsync(groupId, now, cancellationToken))
            {
                var notice = await db.BillingLegacyGroupNotices.SingleAsync(x => x.GroupId == groupId, cancellationToken);
                notice.ExemptedAt = now;
                await db.SaveChangesAsync(cancellationToken);
                continue;
            }
            await purger.PurgeAsync(groupId, null, null, cancellationToken);
        }
    }

    private async Task NotifyOwnerAsync(BillingLegacyGroupNotice notice, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var groupName = await db.Groups.IgnoreQueryFilters().Where(x => x.Id == notice.GroupId)
            .Select(x => x.Name).SingleOrDefaultAsync(cancellationToken);
        var ownerId = await db.Memberships.Where(x => x.GroupId == notice.GroupId && x.IsOwner && x.AccessDisabledAt == null)
            .Select(x => x.UserId).SingleOrDefaultAsync(cancellationToken);
        var owner = ownerId is null ? null : await users.FindByIdAsync(ownerId.Value.ToString());
        var origin = publicOrigin.GetOrigin()?.TrimEnd('/');
        var sent = false;
        if (!string.IsNullOrWhiteSpace(groupName) && owner?.EmailConfirmed == true
            && !string.IsNullOrWhiteSpace(owner.Email) && emailSender.IsConfigured && origin is not null)
        {
            var purgeDate = now.AddDays(5);
            var encodedOrigin = System.Net.WebUtility.HtmlEncode(origin);
            var encodedName = System.Net.WebUtility.HtmlEncode(groupName);
            sent = await emailSender.TrySendAsync(new OutboundEmail(owner.Email,
                "Activa un plan para conservar tu grupo en Sonivo",
                $"El grupo «{groupName}» no tiene una suscripción activa. Activa un plan o la prueba Banda antes del {purgeDate:yyyy-MM-dd} para conservarlo. Después de esa fecha, el grupo y sus archivos se eliminarán permanentemente. Consulta y exporta tus datos desde {origin}/app/account/membership.",
                $"<p>El grupo <strong>{encodedName}</strong> no tiene una suscripción activa.</p><p>Activa un plan o la prueba Banda antes del <strong>{purgeDate:yyyy-MM-dd}</strong> para conservarlo.</p><p>Después de esa fecha, el grupo y sus archivos se eliminarán permanentemente.</p><p><a href=\"{encodedOrigin}/app/account/membership\">Revisar membresía y exportar datos</a></p>"),
                cancellationToken);
        }

        notice.Attempts++;
        if (sent)
        {
            notice.SentAt = now;
            notice.PurgeAt = now.AddDays(5);
        }
        else
        {
            notice.NextAttemptAt = now.AddHours(6);
        }
    }

    private async Task<bool> HasCoverageAsync(Guid groupId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var organizationId = await db.BillingGroups.Where(x => x.GroupId == groupId)
            .Select(x => (Guid?)x.OrganizationId).SingleOrDefaultAsync(cancellationToken);
        if (organizationId is null) return false;
        var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == organizationId, cancellationToken);
        return organization.CanCreate(now)
            || await BillingProjection.ActiveGrantAsync(db, organization.Id, now, cancellationToken) is not null;
    }
}
