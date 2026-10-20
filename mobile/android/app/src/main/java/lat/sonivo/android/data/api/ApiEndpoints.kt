package lat.sonivo.android.data.api

import lat.sonivo.android.BuildConfig
import android.net.Uri

/** Canonical native API and protocol routes; keep server contract changes centralized here. */
internal object ApiEndpoints {
    const val PLATFORM_HEADER = "X-Sonivo-Platform"
    const val APP_VERSION_HEADER = "X-Sonivo-App-Version"
    const val PLATFORM = "android"
    const val CLIENT_ID = "sonivo-android"
    const val REDIRECT_URI = "lat.sonivo.android:/oauth2redirect"
    const val REDIRECT_SCHEME = "lat.sonivo.android"
    const val SCOPES = "openid profile email offline_access sonivo_api"
    const val DISCOVERY_PATH = ".well-known/openid-configuration"
    const val REVOCATION_PATH = "connect/revoke"
    const val PRACTICE_ROOM_HUB_PATH = "/hubs/practiceroom"
    const val GROUP_LINK_HOST = "go.sonivo.lat"
    private const val GROUP_DOMAIN = "sonivo.lat"

    fun practiceRoomHub(baseUrl: String) = baseUrl.trimEnd('/') + PRACTICE_ROOM_HUB_PATH

    fun groupSlugFromLink(uri: Uri?): String? {
        if (uri == null || uri.scheme != "https" || (uri.port != -1 && uri.port != 443) || uri.userInfo != null || uri.query != null || uri.fragment != null) return null
        val host = uri.host?.lowercase() ?: return null
        val slug = when {
            host == GROUP_LINK_HOST -> uri.pathSegments.let { segments ->
                if (segments.size == 2 && segments[0] == "g") segments[1] else null
            }
            host.endsWith(".$GROUP_DOMAIN") -> {
                val label = host.removeSuffix(".$GROUP_DOMAIN")
                if (label.isNotBlank() && '.' !in label && uri.path in listOf("", "/")) label else null
            }
            else -> null
        }?.lowercase() ?: return null
        val reserved = setOf(
            "account", "admin", "api", "app", "assets", "auth", "billing", "blog",
            "cdn", "cuenta", "dashboard", "dev", "docs", "error", "favicon", "g",
            "group", "groups", "health", "help", "internal", "join", "login", "logout",
            "mail", "manifest", "panel", "privacy", "register", "robots", "settings",
            "signup", "sitemap", "smtp", "staging", "static", "status", "support", "system",
            "terms", "test", "www",
        )
        if (slug in reserved || slug.length !in 3..40 || !slug.matches(Regex("^[a-z0-9]+(?:-[a-z0-9]+)*$"))) return null
        return slug
    }

    fun groups() = "/api/groups"
    fun group(groupId: String) = "/api/groups/$groupId"
    fun groupUsage(groupId: String) = "/api/groups/$groupId/usage"
    fun calendarActivity(from: String, to: String) = "/api/activity/calendar?from=${encode(from)}&to=${encode(to)}"
    fun groupPlan(groupId: String) = "/api/groups/$groupId/plan"
    fun groupCheckout(groupId: String) = "/api/groups/$groupId/billing/checkout"
    const val PLAN_CATALOG = "/api/plans"
    const val PAYMENT_PROVIDER = "/api/payments/provider"
    fun events(groupId: String) = "/api/groups/$groupId/events"
    fun event(groupId: String, eventId: String) = "/api/groups/$groupId/events/$eventId"
    fun eventCancel(groupId: String, eventId: String) = "/api/groups/$groupId/events/$eventId/cancel"
    fun eventDuplicate(groupId: String, eventId: String) = "/api/groups/$groupId/events/$eventId/duplicate"
    fun eventApplySetlist(groupId: String, eventId: String) = "/api/groups/$groupId/events/$eventId/apply-setlist"
    fun eventResponseReport(groupId: String, from: String, to: String) = "/api/groups/$groupId/reports/event-responses?from=${encode(from)}&to=${encode(to)}"
    fun eventResponseReportCsv(groupId: String, from: String, to: String) = "/api/groups/$groupId/reports/event-responses.csv?from=${encode(from)}&to=${encode(to)}"
    fun taskReport(groupId: String, from: String, to: String) = "/api/groups/$groupId/reports/tasks?from=${encode(from)}&to=${encode(to)}"
    fun setlistUsageReport(groupId: String) = "/api/groups/$groupId/reports/setlist-usage"
    fun calendarFeed(groupId: String) = "/api/groups/$groupId/calendar.ics"
    fun groupNotificationPreferences(groupId: String) = "/api/groups/$groupId/notification-preferences"
    fun rsvp(groupId: String, eventId: String) = "/api/groups/$groupId/events/$eventId/rsvp"
    fun eventRsvps(groupId: String, eventId: String) = "/api/groups/$groupId/events/$eventId/rsvps"
    fun setlists(groupId: String) = "/api/groups/$groupId/setlists"
    fun setlist(groupId: String, setlistId: String) = "/api/groups/$groupId/setlists/$setlistId"
    fun setlistItems(groupId: String, setlistId: String) = "/api/groups/$groupId/setlists/$setlistId/items"
    fun songs(groupId: String) = "/api/groups/$groupId/songs"
    fun song(groupId: String, songId: String) = "/api/groups/$groupId/songs/$songId"
    fun arrangements(groupId: String, songId: String) = "/api/groups/$groupId/songs/$songId/arrangements"
    fun arrangement(groupId: String, arrangementId: String) = "/api/groups/$groupId/arrangements/$arrangementId"
    fun arrangementResources(groupId: String, arrangementId: String) = "/api/groups/$groupId/arrangements/$arrangementId/resources"
    fun arrangementResource(groupId: String, arrangementId: String, resourceId: String) = "${arrangementResources(groupId, arrangementId)}/$resourceId"
    fun memberResourceGrants(groupId: String, userId: String) = "/api/groups/$groupId/members/$userId/resource-grants"
    fun arrangementResourceContent(groupId: String, arrangementId: String, resourceId: String) =
        "/api/groups/$groupId/arrangements/$arrangementId/resources/$resourceId/content"
    fun groupBrandingAsset(groupId: String, kind: String) = "/api/groups/$groupId/branding/$kind"

    /** Canonical read paths for authenticated native destinations; UI code never assembles API routes. */
    fun destination(id: String, groupId: String?): String? {
        val group = groupId?.let { "/api/groups/$it" }
        return when (id) {
            "home" -> "/api/activity/upcoming"
            "groups" -> groups()
            "groupHome" -> group?.plus("")
            "profile" -> "/api/auth/me"
            "notifications" -> "/api/notifications"
            "membership" -> groups()
            "plans" -> PLAN_CATALOG
            "calendar" -> "/api/activity/calendar"
            "security" -> "/api/auth/sessions"
            "songs" -> group?.plus("/songs")
            "setlists" -> group?.plus("/setlists")
            "groupCalendar", "events" -> group?.plus("/events")
            "tasks" -> group?.plus("/tasks")
            "people" -> group?.plus("/members")
            "groupHelp" -> group?.plus("")
            "roles" -> group?.plus("/roles")
            "reports" -> group?.plus("/reports/repertoire")
            "resources" -> group?.plus("/resources")
            "audit" -> group?.plus("/audit")
            "settings" -> group?.plus("/branding")
            else -> null
        }
    }

    fun acceptInvitation(token: String) = "/api/invitations/${java.net.URLEncoder.encode(token, Charsets.UTF_8.name())}/accept"
    fun updateProfile() = "/api/auth/me"
    fun notificationRead(id: String) = "/api/notifications/$id/read"
    fun taskStatus(groupId: String, taskId: String) = "/api/groups/$groupId/tasks/$taskId/status"
    fun tasks(groupId: String) = "/api/groups/$groupId/tasks"
    fun task(groupId: String, taskId: String) = "/api/groups/$groupId/tasks/$taskId"
    fun revokeSession(sessionKey: String) = "/api/auth/sessions/${java.net.URLEncoder.encode(sessionKey, Charsets.UTF_8.name())}/revoke"
    fun twoFactorStatus() = "/api/auth/2fa/status"
    fun twoFactorEnrollStart() = "/api/auth/2fa/enroll-start"
    fun twoFactorEnrollVerify() = "/api/auth/2fa/enroll-verify"
    fun twoFactorDisable() = "/api/auth/2fa/disable"
    fun changePassword() = "/api/auth/change-password"
    fun passkeys() = "/api/auth/passkeys"
    fun passkeyRegistrationStart() = "/api/auth/passkeys/register-start"
    fun passkeyRegistrationFinish() = "/api/auth/passkeys/register-finish"
    fun passkey(id: String) = "/api/auth/passkeys/${java.net.URLEncoder.encode(id, Charsets.UTF_8.name())}"
    fun invitations(groupId: String) = "/api/groups/$groupId/invitations"
    fun invitation(groupId: String, invitationId: String) = "/api/groups/$groupId/invitations/$invitationId"
    fun groupRole(groupId: String, roleId: String) = "/api/groups/$groupId/roles/$roleId"
    fun memberGroupRole(groupId: String, userId: String) = "/api/groups/$groupId/members/$userId/group-role"
    fun memberRole(groupId: String, userId: String) = "/api/groups/$groupId/members/$userId/role"
    fun memberAccess(groupId: String, userId: String) = "/api/groups/$groupId/members/$userId/access"
    fun memberMusicalRole(groupId: String, userId: String) = "/api/groups/$groupId/members/$userId/musical-role"
    fun memberDescription(groupId: String, userId: String) = "/api/groups/$groupId/members/$userId/description"
    fun member(groupId: String, userId: String) = "/api/groups/$groupId/members/$userId"

    fun versionHeaders() = mapOf(
        PLATFORM_HEADER to PLATFORM,
        APP_VERSION_HEADER to BuildConfig.VERSION_NAME,
    )

    private fun encode(value: String) = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())

    fun requestHeaders(accessToken: String) = versionHeaders() + ("Authorization" to "Bearer $accessToken")
}
