import Foundation

/// Central API and OpenID Connect contract for the native iOS client.
enum MobileEndpoints {
    static let platform = "ios"
    static let clientID = "sonivo-ios"
    static let redirectURI = "lat.sonivo.ios:/oauth2redirect"
    static let redirectScheme = "lat.sonivo.ios"
    static let scopes = "openid profile email offline_access sonivo_api"
    static let discoveryPath = ".well-known/openid-configuration"
    static let practiceRoomHubPath = "/hubs/practiceroom"
    static let groupLinkHost = "go.sonivo.lat"
    private static let groupDomain = "sonivo.lat"
    static let groups = "/api/groups"
    static func group(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)" }
    static func groupUsage(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/usage" }
    static func calendarActivity(from: String, to: String) -> String { "/api/activity/calendar?from=\(queryValue(from))&to=\(queryValue(to))" }
    static func groupPlan(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/plan" }
    static func groupCheckout(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/billing/checkout" }
    static let planCatalog = "/api/plans"
    static let paymentProvider = "/api/payments/provider"
    static let changePassword = "/api/auth/change-password"
    static func setlists(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/setlists" }
    static func setlist(_ groupID: UUID, _ setlistID: UUID) -> String { "\(setlists(groupID))/\(setlistID.uuidString)" }
    static func setlistItems(_ groupID: UUID, _ setlistID: UUID) -> String { "\(setlist(groupID, setlistID))/items" }
    static func events(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/events" }
    static func eventCancel(_ groupID: UUID, _ eventID: UUID) -> String { "\(event(groupID, eventID))/cancel" }
    static func eventDuplicate(_ groupID: UUID, _ eventID: UUID) -> String { "\(event(groupID, eventID))/duplicate" }
    static func eventApplySetlist(_ groupID: UUID, _ eventID: UUID) -> String { "\(event(groupID, eventID))/apply-setlist" }
    static func eventResponseReport(_ groupID: UUID, from: String, to: String) -> String {
        "/api/groups/\(groupID.uuidString)/reports/event-responses?from=\(queryValue(from))&to=\(queryValue(to))"
    }
    static func eventResponseReportCSV(_ groupID: UUID, from: String, to: String) -> String {
        "/api/groups/\(groupID.uuidString)/reports/event-responses.csv?from=\(queryValue(from))&to=\(queryValue(to))"
    }
    static func taskReport(_ groupID: UUID, from: String, to: String) -> String {
        "/api/groups/\(groupID.uuidString)/reports/tasks?from=\(queryValue(from))&to=\(queryValue(to))"
    }
    static func setlistUsageReport(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/reports/setlist-usage" }
    static func calendarFeed(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/calendar.ics" }
    static func groupNotificationPreferences(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/notification-preferences" }
    static func event(_ groupID: UUID, _ eventID: UUID) -> String { "\(events(groupID))/\(eventID.uuidString)" }
    static func rsvp(_ groupID: UUID, _ eventID: UUID) -> String { "\(event(groupID, eventID))/rsvp" }
    static func eventRsvps(_ groupID: UUID, _ eventID: UUID) -> String { "\(event(groupID, eventID))/rsvps" }
    static func arrangement(_ groupID: UUID, _ arrangementID: UUID) -> String { "/api/groups/\(groupID.uuidString)/arrangements/\(arrangementID.uuidString)" }
    static func arrangements(_ groupID: UUID, _ songID: UUID) -> String { "/api/groups/\(groupID.uuidString)/songs/\(songID.uuidString)/arrangements" }
    static func songs(_ groupID: UUID) -> String { destination("songs", groupID: groupID) ?? "/api/groups/\(groupID.uuidString)/songs" }
    static func arrangementCollection(_ groupID: UUID, _ songID: UUID) -> String { arrangements(groupID, songID) }
    static func song(_ groupID: UUID, _ songID: UUID) -> String { "\(destination("songs", groupID: groupID) ?? "")/\(songID.uuidString)" }
    static func resourceContent(_ groupID: UUID, _ arrangementID: UUID, _ resourceID: UUID) -> String {
        "\(arrangement(groupID, arrangementID))/resources/\(resourceID.uuidString)/content"
    }
    static func arrangementResources(_ groupID: UUID, _ arrangementID: UUID) -> String { "\(arrangement(groupID, arrangementID))/resources" }
    static func arrangementResource(_ groupID: UUID, _ arrangementID: UUID, _ resourceID: UUID) -> String { "\(arrangementResources(groupID, arrangementID))/\(resourceID.uuidString)" }
    static func memberResourceGrants(_ groupID: UUID, _ userID: UUID) -> String { "/api/groups/\(groupID.uuidString)/members/\(userID.uuidString)/resource-grants" }
    static func groupBrandingAsset(_ groupID: UUID, _ kind: String) -> String { "/api/groups/\(groupID.uuidString)/branding/\(kind)" }
    /// Canonical read paths for authenticated native destinations; UI code never assembles API routes.
    static func destination(_ id: String, groupID: UUID?) -> String? {
        let group = groupID.map { "/api/groups/\($0.uuidString)" }
        switch id {
        case "home": return "/api/activity/upcoming"
        case "groups": return groups
        case "groupHome": return group
        case "profile": return "/api/auth/me"
        case "notifications": return "/api/notifications"
        case "membership": return groups
        case "plans": return planCatalog
        case "calendar": return "/api/activity/calendar"
        case "security": return "/api/auth/sessions"
        case "songs": return group.map { "\($0)/songs" }
        case "setlists": return group.map { "\($0)/setlists" }
        case "groupCalendar", "events": return group.map { "\($0)/events" }
        case "tasks": return group.map { "\($0)/tasks" }
        case "people": return group.map { "\($0)/members" }
        case "groupHelp": return group
        case "roles": return group.map { "\($0)/roles" }
        case "reports": return group.map { "\($0)/reports/repertoire" }
        case "resources": return group.map { "\($0)/resources" }
        case "audit": return group.map { "\($0)/audit" }
        case "settings": return group.map { "\($0)/branding" }
        default: return nil
        }
    }
    static func acceptInvitation(_ token: String) -> String { "/api/invitations/\(pathSegment(token))/accept" }
    static let updateProfile = "/api/auth/me"
    static func notificationRead(_ id: UUID) -> String { "/api/notifications/\(id.uuidString)/read" }
    static func taskStatus(_ groupID: UUID, _ taskID: UUID) -> String { "/api/groups/\(groupID.uuidString)/tasks/\(taskID.uuidString)/status" }
    static func tasks(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/tasks" }
    static func task(_ groupID: UUID, _ taskID: UUID) -> String { "\(tasks(groupID))/\(taskID.uuidString)" }
    static func revokeSession(_ key: String) -> String { "/api/auth/sessions/\(pathSegment(key))/revoke" }
    static let twoFactorStatus = "/api/auth/2fa/status"
    static let twoFactorEnrollStart = "/api/auth/2fa/enroll-start"
    static let twoFactorEnrollVerify = "/api/auth/2fa/enroll-verify"
    static let twoFactorDisable = "/api/auth/2fa/disable"
    static let passkeys = "/api/auth/passkeys"
    static let passkeyRegistrationStart = "/api/auth/passkeys/register-start"
    static let passkeyRegistrationFinish = "/api/auth/passkeys/register-finish"
    static func passkey(_ id: String) -> String { "\(passkeys)/\(pathSegment(id))" }
    static func invitations(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/invitations" }
    static func invitation(_ groupID: UUID, _ invitationID: UUID) -> String { "\(invitations(groupID))/\(invitationID.uuidString)" }
    static func groupRoles(_ groupID: UUID) -> String { "/api/groups/\(groupID.uuidString)/roles" }
    static func groupRole(_ groupID: UUID, _ roleID: UUID) -> String { "\(groupRoles(groupID))/\(roleID.uuidString)" }
    static func memberGroupRole(_ groupID: UUID, _ userID: UUID) -> String { "/api/groups/\(groupID.uuidString)/members/\(userID.uuidString)/group-role" }
    static func memberRole(_ groupID: UUID, _ userID: UUID) -> String { "/api/groups/\(groupID.uuidString)/members/\(userID.uuidString)/role" }
    static func memberAccess(_ groupID: UUID, _ userID: UUID) -> String { "/api/groups/\(groupID.uuidString)/members/\(userID.uuidString)/access" }
    static func member(_ groupID: UUID, _ userID: UUID) -> String { "/api/groups/\(groupID.uuidString)/members/\(userID.uuidString)" }
    private static func pathSegment(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
    private static func queryValue(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
    }
    static func groupSlug(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "https", url.port == nil || url.port == 443,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              let host = url.host?.lowercased() else { return nil }
        let candidate: String?
        if host == groupLinkHost {
            let segments = url.path.split(separator: "/").map(String.init)
            candidate = segments.count == 2 && segments[0] == "g" ? segments[1] : nil
        } else if host.hasSuffix(".\(groupDomain)") {
            let label = String(host.dropLast(groupDomain.count + 1))
            candidate = !label.isEmpty && !label.contains(".") && ["", "/"].contains(url.path) ? label : nil
        } else {
            candidate = nil
        }
        let reserved = [
            "account", "admin", "api", "app", "assets", "auth", "billing", "blog",
            "cdn", "cuenta", "dashboard", "dev", "docs", "error", "favicon", "g",
            "group", "groups", "health", "help", "internal", "join", "login", "logout",
            "mail", "manifest", "panel", "privacy", "register", "robots", "settings",
            "signup", "sitemap", "smtp", "staging", "static", "status", "support", "system",
            "terms", "test", "www"
        ]
        guard let slug = candidate?.lowercased(),
              !reserved.contains(slug),
              (3...40).contains(slug.count),
              slug.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil else { return nil }
        return slug
    }
    static func versionHeaders(version: String) -> [String: String] {
        ["X-Sonivo-Platform": platform, "X-Sonivo-App-Version": version]
    }
}

struct APIConfiguration {
    /// Environment-specific, non-secret base URL. Empty by default so no request can be sent.
    let baseURL: URL?
    let issuerURL: URL?
    let webBaseURL: URL?

    init(bundle: Bundle = .main) {
        let rawValue = bundle.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""
        baseURL = URL(string: rawValue).flatMap { $0.scheme == "https" ? $0 : nil }
        let configuredIssuer = bundle.object(forInfoDictionaryKey: "OIDC_ISSUER") as? String ?? ""
        let issuerValue = configuredIssuer.isEmpty ? rawValue : configuredIssuer
        issuerURL = URL(string: issuerValue).flatMap { $0.scheme == "https" ? $0 : nil }
        let configuredWebBase = bundle.object(forInfoDictionaryKey: "WEB_BASE_URL") as? String ?? ""
        webBaseURL = URL(string: configuredWebBase).flatMap { $0.scheme == "https" ? $0 : nil }
    }
}

enum LoadState<Value> {
    case idle
    case loading
    case empty
    case content(Value)
    case accessDenied
    case failure(code: String)
}
