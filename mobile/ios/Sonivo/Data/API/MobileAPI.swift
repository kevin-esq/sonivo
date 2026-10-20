import AuthenticationServices
import Combine
import CryptoKit
import Foundation
import Security
import UIKit
import UniformTypeIdentifiers

struct MobileGroup: Decodable, Identifiable, Equatable {
    let id: UUID
    let name: String
    let role: String
    let slug: String
}

struct MobileUsageMetric: Decodable {
    let used: Int
    let limit: Int?
}

struct MobileGroupUsage: Decodable {
    let planId: String
    let billingStatus: String
    let trialEndsAt: String?
    let scheduledPlanId: String?
    let members: MobileUsageMetric
    let songs: MobileUsageMetric
    let setlists: MobileUsageMetric
    let eventsThisMonth: MobileUsageMetric
    let storageBytes: MobileUsageMetric
}

struct MobilePlanOption: Decodable, Identifiable {
    let id: String
    var name: String { id }
}

struct MobilePlanCatalog: Decodable {
    let plans: [MobilePlanOption]
}

struct MobilePaymentProvider: Decodable {
    let provider: String
    let configured: Bool
}

struct MobileCalendarEvent: Decodable, Identifiable {
    let groupId: UUID
    let groupName: String
    let eventId: UUID
    let title: String
    let type: String
    let startsAt: Date
    let myResponse: String?
    var id: UUID { eventId }
}

struct MobileEvent: Decodable, Identifiable {
    let id: UUID
    let title: String
    let type: String
    let startsAt: Date
    let status: String
    let version: Int
}

struct MobileEventPlanItem: Decodable, Identifiable {
    let id: UUID
    let arrangementId: UUID
    let displaySongTitle: String
    let displayArrangementLabel: String
}

struct MobileEventRsvp: Decodable, Identifiable {
    let userId: UUID
    let displayName: String
    let response: String
    var id: UUID { userId }
}

struct MobileEventDetail: Decodable, Identifiable {
    let id: UUID
    let items: [MobileEventPlanItem]
}

struct MobileSetlistItem: Decodable, Identifiable {
    let id: UUID
    let arrangementId: UUID
    let sortOrder: Int
    let songTitle: String?
    let arrangementLabel: String?
}

struct MobileSetlist: Decodable, Identifiable {
    let id: UUID
    let name: String
    let version: Int
    let itemCount: Int?
    let items: [MobileSetlistItem]?
}

struct MobileGroupNotificationPreferences: Codable, Equatable {
    var notifyRoleChanges: Bool
    var notifyTaskAssignments: Bool
}

struct MobileArrangementSummary: Decodable, Identifiable {
    let id: UUID
    let songId: UUID
    let label: String
    let defaultKey: String?
    let defaultBpm: Int?
    let version: Int
    var songTitle: String?
}

struct MobileResource: Decodable, Identifiable {
    let id: UUID
    let kind: String
    let purpose: String
    let label: String
    let contentType: String?
}

struct MobileResourceAccessRow: Identifiable, Equatable {
    let id: String
    let resourceType: String
    let resourceId: UUID
    let granted: Bool?
    let label: String
}

private struct MemberResourceGrant: Decodable {
    let resourceType: String
    let resourceId: UUID
    let granted: Bool
}

private struct MemberResourceGrantList: Decodable { let items: [MemberResourceGrant] }

struct MobileArrangement: Decodable, Identifiable {
    let id: UUID
    let songId: UUID
    let label: String
    let defaultKey: String?
    let defaultBpm: Int?
    let version: Int
    let lyrics: String?
    let chords: String?
    let structure: String?
    let notes: String?
    let chordTimingJson: String?
    let resources: [MobileResource]
}

struct MobileVersionProblem: Decodable {
    let code: String?
    let minimumVersion: String?
    let storeUrl: String?
}

struct MobileDataItem: Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String
    let status: String?
    let version: Int?
    let isEnabled: Bool?
    let notes: String?
    let type: String?
    let startsAt: String?
    let url: String?
    let isSystem: Bool?
    let groupRoleID: String?
    let dueAt: String?
    let assigneeUserID: String?
    let arrangementID: String?
    let kind: String?
    let originalFileName: String?
    let attribution: String?
    let rightsNotes: String?
    let tags: [String]
    let part: String?

    init(id: String, title: String, detail: String, status: String?, version: Int?, isEnabled: Bool?, notes: String?, type: String?, startsAt: String?, url: String? = nil, isSystem: Bool? = nil, groupRoleID: String? = nil, dueAt: String? = nil, assigneeUserID: String? = nil, arrangementID: String? = nil, kind: String? = nil, originalFileName: String? = nil, attribution: String? = nil, rightsNotes: String? = nil, tags: [String] = [], part: String? = nil) {
        self.id = id
        self.title = title
        self.detail = detail
        self.status = status
        self.version = version
        self.isEnabled = isEnabled
        self.notes = notes
        self.type = type
        self.startsAt = startsAt
        self.url = url
        self.isSystem = isSystem
        self.groupRoleID = groupRoleID
        self.dueAt = dueAt
        self.assigneeUserID = assigneeUserID
        self.arrangementID = arrangementID
        self.kind = kind
        self.originalFileName = originalFileName
        self.attribution = attribution
        self.rightsNotes = rightsNotes
        self.tags = tags
        self.part = part
    }
}

struct MobileTwoFactorStatus: Decodable {
    let enabled: Bool
    let hasPassword: Bool
}

private struct PasskeyRegistrationOptions: Decodable {
    struct User: Decodable {
        let id: String
        let name: String
        let displayName: String
    }
    let challenge: String
    let rpId: String
    let rpName: String
    let user: User
}

private struct AuthenticatorEnrollment: Decodable {
    let manualKey: String
}

private struct MobileSongSummary: Decodable, Identifiable {
    let id: UUID
    let title: String
}

private struct RecoveryCodeResponse: Decodable {
    let recoveryCodes: [String]
}

private struct InvitationCreated: Decodable {
    let token: String
}

enum MobileAPIError: Error {
    case notConfigured
    case invalidResponse
    case updateRequired(String?, URL?)
    case requestFailed
}

@MainActor
final class MobileAPI: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding, ASAuthorizationControllerPresentationContextProviding, ASAuthorizationControllerDelegate {
    @Published private(set) var groups: [MobileGroup] = []
    @Published private(set) var pendingGroupSlug: String? = UserDefaults.standard.string(forKey: "sonivo.pendingGroupSlug")
    @Published private(set) var events: [MobileEvent] = []
    @Published private(set) var setlists: [MobileSetlist] = []
    @Published private(set) var groupHomeSongs: [MobileDataItem] = []
    @Published private(set) var resourceAccessRows: [MobileResourceAccessRow] = []
    @Published private(set) var selectedSetlist: MobileSetlist?
    @Published private(set) var availableSetlistArrangements: [MobileArrangementSummary] = []
    @Published private(set) var songArrangements: [MobileArrangementSummary] = []
    @Published private(set) var selectedEvent: MobileEventDetail?
    @Published private(set) var selectedEventRsvps: [MobileEventRsvp] = []
    @Published private(set) var selectedArrangement: MobileArrangement?
    @Published private(set) var selectedGroup: MobileGroup?
    @Published private(set) var selectedGroupVersion: Int?
    @Published private(set) var joinedEventID: UUID?
    @Published private(set) var conductorPosition: MobileConductorPosition?
    @Published private(set) var isSharingPlayhead = false
    @Published private(set) var isSignedIn = false
    @Published private(set) var isLoading = false
    @Published private(set) var requiredVersion: String?
    @Published private(set) var updateURL: URL?
    @Published private(set) var lastErrorKey: String?
    @Published private(set) var destinationItems: [MobileDataItem] = []
    @Published private(set) var groupUsageItems: [MobileDataItem] = []
    @Published private(set) var planUsageByGroup: [UUID: MobileGroupUsage] = [:]
    @Published private(set) var planOptions: [MobilePlanOption] = []
    @Published private(set) var paymentProvider: MobilePaymentProvider?
    @Published private(set) var globalCalendarEvents: [MobileCalendarEvent] = []
    @Published private(set) var downloadedResourceURL: URL?
    @Published private(set) var passkeyItems: [MobileDataItem] = []
    @Published private(set) var groupNotificationPreferences: MobileGroupNotificationPreferences?
    @Published private(set) var twoFactorStatus: MobileTwoFactorStatus?
    @Published private(set) var authenticatorManualKey: String?
    @Published private(set) var recoveryCodes: [String] = []
    @Published private(set) var invitationItems: [MobileDataItem] = []
    @Published private(set) var groupRoleItems: [MobileDataItem] = []
    @Published private(set) var taskAssignees: [MobileDataItem] = []
    @Published private(set) var createdInvitationToken: String?
    @Published private(set) var reportCSV = ""
    @Published private(set) var calendarICS = ""

    private let configuration = APIConfiguration()
    var isConfigured: Bool { configuration.baseURL != nil && configuration.issuerURL != nil }
    private let clientId = MobileEndpoints.clientID
    private let redirectURI = MobileEndpoints.redirectURI
    private let keychain = MobileTokenKeychain()
    private var token: TokenSet?
    private var webSession: ASWebAuthenticationSession?
    private var passkeyAuthorizationController: ASAuthorizationController?
    private var passkeyContinuation: CheckedContinuation<(String, String), Error>?
    private var practiceRoom: PracticeRoomClient?

    func signIn() async {
        lastErrorKey = nil
        do {
            try await authorize()
            try await loadGroups()
        } catch {
            apply(error)
        }
    }

    func restoreSession() async {
        token = keychain.read()
        guard token != nil else { return }
        do { try await loadGroups() } catch { apply(error) }
    }

    func signOut() async {
        await leavePracticeRoom()
        if let token, let issuer = configuration.issuerURL {
            let data = try? await URLSession.shared.data(from: issuer.appending(path: MobileEndpoints.discoveryPath)).0
            if let data, let discovery = try? JSONDecoder().decode(OIDCDiscovery.self, from: data),
               let endpoint = discovery.revocationEndpoint, let url = URL(string: endpoint) {
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
                MobileEndpoints.versionHeaders(version: appVersion).forEach { request.setValue($1, forHTTPHeaderField: $0) }
                request.httpBody = TokenExchange(grantType: "", clientId: clientId, refreshToken: token.refreshToken).revocationEncoded.data(using: .utf8)
                _ = try? await URLSession.shared.data(for: request)
            }
        }
        token = nil
        keychain.clear()
        groups = []
        events = []
        setlists = []
        selectedGroup = nil
        selectedGroupVersion = nil
        selectedEvent = nil
        selectedSetlist = nil
        selectedArrangement = nil
        isSignedIn = false
        pendingGroupSlug = nil
        UserDefaults.standard.removeObject(forKey: "sonivo.pendingGroupSlug")
    }

    func handleGroupLink(_ url: URL) {
        guard let slug = MobileEndpoints.groupSlug(from: url) else { return }
        pendingGroupSlug = slug
        lastErrorKey = nil
        UserDefaults.standard.set(slug, forKey: "sonivo.pendingGroupSlug")
        selectedGroup = nil
        selectedGroupVersion = nil
        events = []
        setlists = []
        selectedEvent = nil
        selectedSetlist = nil
        selectedArrangement = nil
        groupHomeSongs = []
        if isSignedIn { Task { await resolvePendingGroup() } }
    }

    func select(_ group: MobileGroup) async {
        await leavePracticeRoom()
        selectedGroup = group
        selectedGroupVersion = nil
        events = []
        setlists = []
        selectedEvent = nil
        selectedSetlist = nil
        selectedArrangement = nil
        events = []
        setlists = []
        lastErrorKey = nil
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await request(MobileEndpoints.events(group.id))
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let nextEvents = try decoder.decode([MobileEvent].self, from: data)
            let setlistData = try await request(MobileEndpoints.setlists(group.id))
            let nextSetlists = try decoder.decode([MobileSetlist].self, from: setlistData)
            events = nextEvents
            setlists = nextSetlists
        } catch { apply(error) }
    }

    func openSetlist(_ setlist: MobileSetlist) async {
        guard let group = selectedGroup else { return }
        do {
            let data = try await request(MobileEndpoints.setlist(group.id, setlist.id))
            selectedSetlist = try JSONDecoder().decode(MobileSetlist.self, from: data)
            await loadSetlistArrangementChoices()
        } catch { apply(error) }
    }

    func loadSetlistArrangementChoices() async {
        guard let group = selectedGroup else { return }
        do {
            let songsData = try await request(MobileEndpoints.destination("songs", groupID: group.id) ?? MobileEndpoints.groups)
            let songs = try JSONDecoder().decode([MobileSongSummary].self, from: songsData)
            var choices: [MobileArrangementSummary] = []
            for song in songs {
                let data = try await request(MobileEndpoints.arrangements(group.id, song.id))
                let arrangements = try JSONDecoder().decode([MobileArrangementSummary].self, from: data)
                choices += arrangements.map { MobileArrangementSummary(id: $0.id, songId: $0.songId, label: $0.label, defaultKey: $0.defaultKey, defaultBpm: $0.defaultBpm, version: $0.version, songTitle: song.title) }
            }
            availableSetlistArrangements = choices
        } catch { apply(error) }
    }

    func replaceSetlistItems(_ arrangementIDs: [UUID]) async {
        guard let group = selectedGroup, let setlist = selectedSetlist,
              let items = try? JSONSerialization.data(withJSONObject: ["expectedVersion": setlist.version, "items": arrangementIDs.enumerated().map { ["arrangementId": $0.element.uuidString, "sortOrder": $0.offset] as [String: Any] }]) else { return }
        do {
            _ = try await request(MobileEndpoints.setlistItems(group.id, setlist.id), method: "PUT", body: items)
            await openSetlist(setlist)
            await loadDestination("setlists")
        } catch { apply(error) }
    }

    func openEvent(_ event: MobileEvent) async {
        guard let group = selectedGroup else { return }
        await openEvent(groupID: group.id, eventID: event.id)
    }

    func openEvent(groupID: UUID, eventID: UUID) async {
        do {
            let data = try await request(MobileEndpoints.event(groupID, eventID))
            selectedEvent = try JSONDecoder().decode(MobileEventDetail.self, from: data)
            let rsvpData = try await request(MobileEndpoints.eventRsvps(groupID, eventID))
            struct RsvpEnvelope: Decodable { let items: [MobileEventRsvp] }
            selectedEventRsvps = try JSONDecoder().decode(RsvpEnvelope.self, from: rsvpData).items
        } catch { apply(error) }
    }

    func loadPlanOverview() async {
        isLoading = true
        defer { isLoading = false }
        do {
            if groups.isEmpty { try await loadGroups() }
            let catalogData = try await request(MobileEndpoints.planCatalog)
            let providerData = try await request(MobileEndpoints.paymentProvider)
            let catalog = try JSONDecoder().decode(MobilePlanCatalog.self, from: catalogData)
            let provider = try JSONDecoder().decode(MobilePaymentProvider.self, from: providerData)
            var usage: [UUID: MobileGroupUsage] = [:]
            for group in groups {
                if let data = try? await request(MobileEndpoints.groupUsage(group.id)),
                   let value = try? JSONDecoder().decode(MobileGroupUsage.self, from: data) {
                    usage[group.id] = value
                }
            }
            planOptions = catalog.plans
            paymentProvider = provider
            planUsageByGroup = usage
            lastErrorKey = nil
        } catch { apply(error) }
    }

    func updatePlan(groupID: UUID, planID: String) async {
        guard let body = try? JSONSerialization.data(withJSONObject: ["action": "assign", "planId": planID]) else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await request(MobileEndpoints.groupPlan(groupID), method: "PUT", body: body)
            let data = try await request(MobileEndpoints.groupUsage(groupID))
            if let value = try? JSONDecoder().decode(MobileGroupUsage.self, from: data) {
                planUsageByGroup[groupID] = value
            }
            lastErrorKey = nil
        } catch { apply(error) }
    }

    func startGroupCheckout(groupID: UUID, planID: String) async -> URL? {
        guard let webBase = configuration.webBaseURL,
              let successURL = URL(string: "app/plans", relativeTo: webBase)?.appending(queryItems: [URLQueryItem(name: "checkout", value: "success")]),
              let cancelURL = URL(string: "app/plans", relativeTo: webBase)?.appending(queryItems: [URLQueryItem(name: "checkout", value: "cancelled")]),
              let body = try? JSONSerialization.data(withJSONObject: [
                "planId": planID,
                "successUrl": successURL.absoluteString,
                "cancelUrl": cancelURL.absoluteString,
              ]) else {
            lastErrorKey = "plans.web_configuration_required"
            return nil
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await request(MobileEndpoints.groupCheckout(groupID), method: "POST", body: body)
            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let rawURL = payload?["url"] as? String,
                  let url = URL(string: rawURL), url.scheme == "https" else {
                throw MobileAPIError.invalidResponse
            }
            lastErrorKey = nil
            return url
        } catch {
            apply(error)
            return nil
        }
    }

    func loadGlobalCalendar(from: Date, to: Date) async {
        let formatter = ISO8601DateFormatter()
        do {
            let data = try await request(MobileEndpoints.calendarActivity(from: formatter.string(from: from), to: formatter.string(from: to)))
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            globalCalendarEvents = try decoder.decode([MobileCalendarEvent].self, from: data)
            lastErrorKey = nil
        } catch { apply(error) }
    }

    func joinPracticeRoom(for event: MobileEvent) async {
        guard let baseURL = configuration.baseURL else {
            lastErrorKey = "api.not_configured"
            return
        }
        await leavePracticeRoom()
        do {
            let room = PracticeRoomClient()
            let hubURL = baseURL.appending(path: MobileEndpoints.practiceRoomHubPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))).absoluteString
            try await room.connect(
                url: hubURL,
                eventID: event.id,
                accessTokenProvider: { [weak self] in
                    guard let self else { throw MobileAPIError.requestFailed }
                    return try await self.freshAccessToken()
                },
                headers: MobileEndpoints.versionHeaders(version: appVersion),
                onPosition: { [weak self] position in
                    self?.conductorPosition = position
                },
                onClosed: { [weak self] _ in
                    self?.practiceRoom = nil
                    self?.joinedEventID = nil
                    self?.conductorPosition = nil
                    self?.isSharingPlayhead = false
                    self?.lastErrorKey = "practice.room_failed"
                }
            )
            practiceRoom = room
            joinedEventID = event.id
            conductorPosition = nil
            lastErrorKey = nil
        } catch {
            lastErrorKey = "practice.room_failed"
        }
    }

    func leavePracticeRoom() async {
        let room = practiceRoom
        practiceRoom = nil
        joinedEventID = nil
        conductorPosition = nil
        isSharingPlayhead = false
        await room?.close()
    }

    func togglePlayheadSharing() {
        guard joinedEventID != nil else { return }
        isSharingPlayhead.toggle()
    }

    func broadcastPlayhead(arrangementID: UUID, positionMs: Int64, playing: Bool) async {
        guard isSharingPlayhead, let eventID = joinedEventID, let practiceRoom else { return }
        do {
            try await practiceRoom.broadcast(eventID: eventID, arrangementID: arrangementID, positionMs: positionMs, playing: playing)
        } catch {
            isSharingPlayhead = false
            lastErrorKey = "practice.room_failed"
        }
    }

    func openArrangement(_ arrangementId: UUID) async {
        guard let group = selectedGroup else { return }
        do {
            let data = try await request(MobileEndpoints.arrangement(group.id, arrangementId))
            selectedArrangement = try JSONDecoder().decode(MobileArrangement.self, from: data)
        } catch { apply(error) }
    }

    func loadSongArrangements(_ songID: UUID) async {
        guard let group = selectedGroup else { return }
        do {
            let data = try await request(MobileEndpoints.arrangements(group.id, songID))
            songArrangements = try JSONDecoder().decode([MobileArrangementSummary].self, from: data)
        }
        catch { apply(error) }
    }

    func loadMemberResourceAccess(_ userID: UUID) async {
        guard let group = selectedGroup else { return }
        do {
            let songs = try JSONDecoder().decode([MobileSongSummary].self, from: await request(MobileEndpoints.songs(group.id)))
            let grants = try JSONDecoder().decode(MemberResourceGrantList.self, from: await request(MobileEndpoints.memberResourceGrants(group.id, userID))).items
            var rows: [MobileResourceAccessRow] = []
            for song in songs {
                rows.append(MobileResourceAccessRow(id: "song:\(song.id)", resourceType: "song", resourceId: song.id, granted: grants.first { $0.resourceType == "song" && $0.resourceId == song.id }?.granted, label: song.title))
                let arrangements = try JSONDecoder().decode([MobileArrangementSummary].self, from: await request(MobileEndpoints.arrangements(group.id, song.id)))
                for arrangement in arrangements {
                    rows.append(MobileResourceAccessRow(id: "arrangement:\(arrangement.id)", resourceType: "arrangement", resourceId: arrangement.id, granted: grants.first { $0.resourceType == "arrangement" && $0.resourceId == arrangement.id }?.granted, label: "\(song.title) · \(arrangement.label)"))
                    let resources = try JSONDecoder().decode([MobileResource].self, from: await request(MobileEndpoints.arrangementResources(group.id, arrangement.id)))
                    for resource in resources {
                        rows.append(MobileResourceAccessRow(id: "resource:\(resource.id)", resourceType: "resource", resourceId: resource.id, granted: grants.first { $0.resourceType == "resource" && $0.resourceId == resource.id }?.granted, label: "\(arrangement.label) · \(resource.label)"))
                    }
                }
            }
            resourceAccessRows = rows
        } catch { apply(error) }
    }

    func setMemberResourceAccess(_ userID: UUID, row: MobileResourceAccessRow, granted: Bool?) async {
        guard let group = selectedGroup else { return }
        do {
            let body = try JSONSerialization.data(withJSONObject: ["resourceType": row.resourceType, "resourceId": row.resourceId.uuidString, "granted": granted as Any? ?? NSNull()])
            _ = try await request(MobileEndpoints.memberResourceGrants(group.id, userID), method: "PUT", body: body)
            resourceAccessRows = resourceAccessRows.map { $0.id == row.id ? MobileResourceAccessRow(id: row.id, resourceType: row.resourceType, resourceId: row.resourceId, granted: granted, label: row.label) : $0 }
        } catch { apply(error) }
    }

    func createArrangement(songID: UUID, label: String, defaultKey: String, defaultBpm: Int?, lyrics: String, chords: String, structure: String, notes: String) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["label": label, "defaultKey": defaultKey, "defaultBpm": defaultBpm as Any? ?? NSNull(), "lyrics": lyrics, "chords": chords, "structure": structure, "notes": notes]) else { return }
        do { _ = try await request(MobileEndpoints.arrangementCollection(group.id, songID), method: "POST", body: body); await loadSongArrangements(songID) }
        catch { apply(error) }
    }

    func updateArrangement(_ arrangement: MobileArrangementSummary, label: String, defaultKey: String, defaultBpm: Int?) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["label": label, "defaultKey": defaultKey, "defaultBpm": defaultBpm as Any? ?? NSNull(), "expectedVersion": arrangement.version]) else { return }
        do { _ = try await request(MobileEndpoints.arrangement(group.id, arrangement.id), method: "PATCH", body: body); await loadSongArrangements(arrangement.songId) }
        catch { apply(error) }
    }

    func arrangementForEditing(_ id: UUID) async -> MobileArrangement? {
        guard let group = selectedGroup else { return nil }
        do { return try JSONDecoder().decode(MobileArrangement.self, from: await request(MobileEndpoints.arrangement(group.id, id))) }
        catch { apply(error); return nil }
    }

    func updateArrangement(_ arrangement: MobileArrangement, label: String, defaultKey: String, defaultBpm: Int?, lyrics: String, chords: String, structure: String, notes: String) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["label": label, "defaultKey": defaultKey, "defaultBpm": defaultBpm as Any? ?? NSNull(), "lyrics": lyrics, "chords": chords, "structure": structure, "notes": notes, "chordTimingJson": arrangement.chordTimingJson as Any? ?? NSNull(), "expectedVersion": arrangement.version]) else { return }
        do { _ = try await request(MobileEndpoints.arrangement(group.id, arrangement.id), method: "PATCH", body: body); await openArrangement(arrangement.id); await loadSongArrangements(arrangement.songId) }
        catch { apply(error) }
    }

    func deleteArrangement(_ arrangement: MobileArrangementSummary) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["expectedVersion": arrangement.version]) else { return }
        do { _ = try await request(MobileEndpoints.arrangement(group.id, arrangement.id), method: "DELETE", body: body); await loadSongArrangements(arrangement.songId) }
        catch { apply(error) }
    }

    func mediaRequest(for resource: MobileResource) async throws -> (URL, [String: String]) {
        guard let group = selectedGroup, let arrangement = selectedArrangement,
              let baseURL = configuration.baseURL else { throw MobileAPIError.notConfigured }
        let accessToken = try await freshAccessToken()
        let path = MobileEndpoints.resourceContent(group.id, arrangement.id, resource.id).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let url = baseURL.appending(path: path)
        let headers = [
            "Authorization": "Bearer \(accessToken)"
        ].merging(MobileEndpoints.versionHeaders(version: appVersion)) { _, new in new }
        return (url, headers)
    }

    func submitRsvp(for event: MobileEvent, response: String) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["response": response]) else { return }
        do {
            _ = try await request(MobileEndpoints.rsvp(group.id, event.id), method: "PUT", body: body)
            lastErrorKey = nil
        } catch { apply(error) }
    }

    func acceptInvitation(_ invitationToken: String) async {
        do {
            _ = try await request(MobileEndpoints.acceptInvitation(invitationToken), method: "POST", body: Data("{}".utf8))
            try await loadGroups()
            lastErrorKey = nil
        } catch { apply(error) }
    }

    func updateProfile(displayName: String) async {
        guard let body = try? JSONSerialization.data(withJSONObject: ["displayName": displayName]) else { return }
        do { _ = try await request(MobileEndpoints.updateProfile, method: "PATCH", body: body); lastErrorKey = nil }
        catch { apply(error) }
    }

    func renameSelectedGroup(_ name: String) async {
        guard let group = selectedGroup, let version = selectedGroupVersion,
              let body = try? JSONSerialization.data(withJSONObject: ["name": name, "expectedVersion": version]) else { return }
        do {
            _ = try await request(MobileEndpoints.group(group.id), method: "PATCH", body: body)
            try await loadGroups()
            selectedGroup = groups.first(where: { $0.id == group.id })
            await loadDestination("settings")
        } catch { apply(error) }
    }

    func deleteSelectedGroup() async {
        guard let group = selectedGroup, let version = selectedGroupVersion,
              let body = try? JSONSerialization.data(withJSONObject: ["expectedVersion": version]) else { return }
        do {
            _ = try await request(MobileEndpoints.group(group.id), method: "DELETE", body: body)
            await leavePracticeRoom()
            selectedGroup = nil
            selectedGroupVersion = nil
            try await loadGroups()
        } catch { apply(error) }
    }

    func updateBranding(displayName: String, accentHex: String, secondaryHex: String, expectedVersion: Int, additionalFields: [String: String] = [:]) async {
        guard let group = selectedGroup else { return }
        var payload: [String: Any] = ["displayName": displayName, "accentHex": accentHex, "secondaryHex": secondaryHex, "expectedVersion": expectedVersion]
        additionalFields.forEach { key, value in
            if key == "showSonivoCredit" {
                payload[key] = (value as NSString).boolValue
            } else {
                payload[key] = value.isEmpty ? NSNull() : value as Any
            }
        }
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        do { _ = try await request(MobileEndpoints.destination("settings", groupID: group.id) ?? MobileEndpoints.groups, method: "PUT", body: body); await loadDestination("settings") }
        catch { apply(error) }
    }

    func uploadBrandingAsset(kind: String, fileURL: URL) async {
        guard ["logo", "banner", "favicon"].contains(kind), let group = selectedGroup, let baseURL = configuration.baseURL else { return }
        let boundary = "Sonivo-\(UUID().uuidString)"
        let originalName = fileURL.lastPathComponent
        let contentType = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let bodyURL = FileManager.default.temporaryDirectory.appending(path: "sonivo-branding-\(UUID().uuidString).multipart")
        do {
            try await Task.detached {
                FileManager.default.createFile(atPath: bodyURL.path, contents: nil)
                let output = try FileHandle(forWritingTo: bodyURL)
                let input = try FileHandle(forReadingFrom: fileURL)
                defer { try? output.close(); try? input.close() }
                let safeName = String(originalName.map { $0 == "\\" || $0 == "\"" || $0 == "\r" || $0 == "\n" ? "_" : $0 })
                output.write(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: \(contentType)\r\n\r\n".utf8))
                while let chunk = try input.read(upToCount: 64 * 1024), !chunk.isEmpty { output.write(chunk) }
                output.write(Data("\r\n--\(boundary)--\r\n".utf8))
            }.value
            var credential = try await freshAccessToken()
            func makeRequest(_ token: String) -> URLRequest {
                var request = URLRequest(url: baseURL.appending(path: MobileEndpoints.groupBrandingAsset(group.id, kind).trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
                request.httpMethod = "POST"
                request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                request.setValue("application/json", forHTTPHeaderField: "Accept")
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                MobileEndpoints.versionHeaders(version: appVersion).forEach { request.setValue($1, forHTTPHeaderField: $0) }
                return request
            }
            var (data, response) = try await URLSession.shared.upload(for: makeRequest(credential), fromFile: bodyURL)
            if (response as? HTTPURLResponse)?.statusCode == 401 {
                credential = try await refreshAccessToken()
                (data, response) = try await URLSession.shared.upload(for: makeRequest(credential), fromFile: bodyURL)
            }
            guard let http = response as? HTTPURLResponse else { throw MobileAPIError.invalidResponse }
            if http.statusCode == 426 {
                let problem = try? JSONDecoder().decode(MobileVersionProblem.self, from: data)
                requiredVersion = problem?.minimumVersion
                updateURL = problem?.storeUrl.flatMap(URL.init(string:))
                throw MobileAPIError.updateRequired(problem?.minimumVersion, updateURL)
            }
            guard (200..<300).contains(http.statusCode) else { throw MobileAPIError.requestFailed }
            await loadDestination("settings")
        } catch { apply(error) }
        try? FileManager.default.removeItem(at: bodyURL)
    }

    func markNotificationRead(_ id: UUID) async {
        do { _ = try await request(MobileEndpoints.notificationRead(id), method: "POST"); await loadDestination("notifications") }
        catch { apply(error) }
    }

    func updateGroupNotificationPreferences(_ preferences: MobileGroupNotificationPreferences) async {
        guard let group = selectedGroup,
              let body = try? JSONEncoder().encode(preferences) else { return }
        do {
            _ = try await request(MobileEndpoints.groupNotificationPreferences(group.id), method: "PUT", body: body)
            groupNotificationPreferences = preferences
            lastErrorKey = nil
        } catch { apply(error) }
    }

    func updateTaskStatus(_ id: UUID, status: String, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["status": status, "expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.taskStatus(group.id, id), method: "POST", body: body); await loadDestination("tasks") }
        catch { apply(error) }
    }

    func createTask(title: String, notes: String?, dueAt: Date? = nil, assigneeUserID: UUID? = nil) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["title": title, "notes": notes as Any? ?? NSNull(), "dueAt": dueAt.map { ISO8601DateFormatter().string(from: $0) } as Any? ?? NSNull(), "assigneeUserId": assigneeUserID?.uuidString as Any? ?? NSNull()]) else { return }
        do { _ = try await request(MobileEndpoints.tasks(group.id), method: "POST", body: body); await loadDestination("tasks") }
        catch { apply(error) }
    }

    func updateTask(_ id: UUID, title: String, notes: String?, expectedVersion: Int, dueAt: Date? = nil, assigneeUserID: UUID? = nil) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["title": title, "notes": notes as Any? ?? NSNull(), "dueAt": dueAt.map { ISO8601DateFormatter().string(from: $0) } as Any? ?? NSNull(), "assigneeUserId": assigneeUserID?.uuidString as Any? ?? NSNull(), "expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.task(group.id, id), method: "PATCH", body: body); await loadDestination("tasks") }
        catch { apply(error) }
    }

    func deleteTask(_ id: UUID, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.task(group.id, id), method: "DELETE", body: body); await loadDestination("tasks") }
        catch { apply(error) }
    }

    func createEvent(title: String, type: String, startsAt: Date) async {
        guard let group = selectedGroup else { return }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let body = try? JSONSerialization.data(withJSONObject: ["title": title, "type": type, "startsAt": formatter.string(from: startsAt)]) else { return }
        do { _ = try await request(MobileEndpoints.events(group.id), method: "POST", body: body); await loadDestination("events") }
        catch { apply(error) }
    }

    func updateEvent(_ id: UUID, title: String, type: String, startsAt: String, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["title": title, "type": type, "startsAt": startsAt, "expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.event(group.id, id), method: "PATCH", body: body); await loadDestination("events") }
        catch { apply(error) }
    }

    func cancelEvent(_ id: UUID, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.eventCancel(group.id, id), method: "POST", body: body); await loadDestination("events") }
        catch { apply(error) }
    }

    func duplicateEvent(_ id: UUID, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.eventDuplicate(group.id, id), method: "POST", body: body); await loadDestination("events") }
        catch { apply(error) }
    }

    func applySetlist(_ setlistID: UUID, to eventID: UUID, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["setlistId": setlistID.uuidString, "expectedVersion": expectedVersion, "confirmReplace": true]) else { return }
        do { _ = try await request(MobileEndpoints.eventApplySetlist(group.id, eventID), method: "POST", body: body); await loadDestination("events") }
        catch { apply(error) }
    }

    func createSetlist(name: String) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["name": name]) else { return }
        do { _ = try await request(MobileEndpoints.setlists(group.id), method: "POST", body: body); await loadDestination("setlists") }
        catch { apply(error) }
    }

    func renameSetlist(_ id: UUID, name: String, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["name": name, "expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.setlist(group.id, id), method: "PATCH", body: body); await loadDestination("setlists") }
        catch { apply(error) }
    }

    func createSong(title: String, originKind: String, attribution: String, rightsNotes: String, tags: [String]) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["title": title, "originKind": originKind, "attribution": attribution, "rightsNotes": rightsNotes, "tags": tags]) else { return }
        do { _ = try await request(MobileEndpoints.destination("songs", groupID: group.id) ?? MobileEndpoints.groups, method: "POST", body: body); await loadDestination("songs") }
        catch { apply(error) }
    }

    func updateSong(_ id: UUID, title: String, expectedVersion: Int, originKind: String, attribution: String, rightsNotes: String, tags: [String]) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["title": title, "expectedVersion": expectedVersion, "originKind": originKind, "attribution": attribution, "rightsNotes": rightsNotes, "tags": tags]) else { return }
        do { _ = try await request(MobileEndpoints.song(group.id, id), method: "PATCH", body: body); await loadDestination("songs") }
        catch { apply(error) }
    }

    func songForEditing(_ id: UUID) async -> MobileDataItem? {
        guard let group = selectedGroup else { return nil }
        do { return Self.displayItems(try await request(MobileEndpoints.song(group.id, id)), page: "songs").first }
        catch { apply(error); return nil }
    }

    func deleteSong(_ id: UUID, expectedVersion: Int) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["expectedVersion": expectedVersion]) else { return }
        do { _ = try await request(MobileEndpoints.song(group.id, id), method: "DELETE", body: body); await loadDestination("songs") }
        catch { apply(error) }
    }

    func createLinkResource(arrangementID: UUID, label: String, url: String, purpose: String, part: String = "", note: String = "") async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["kind": "link", "label": label, "url": url, "purpose": purpose, "part": part.isEmpty ? NSNull() : part as Any, "note": note.isEmpty ? NSNull() : note as Any]) else { return }
        do { _ = try await request(MobileEndpoints.arrangementResources(group.id, arrangementID), method: "POST", body: body); await loadDestination("resources") }
        catch { apply(error) }
    }

    func updateLinkResource(arrangementID: UUID, resourceID: UUID, label: String, part: String, note: String) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["label": label, "part": part.isEmpty ? NSNull() : part as Any, "note": note.isEmpty ? NSNull() : note as Any]) else { return }
        do { _ = try await request(MobileEndpoints.arrangementResource(group.id, arrangementID, resourceID), method: "PATCH", body: body); await loadDestination("resources") }
        catch { apply(error) }
    }

    func deleteResource(arrangementID: UUID, resourceID: UUID) async {
        guard let group = selectedGroup else { return }
        do { _ = try await request(MobileEndpoints.arrangementResource(group.id, arrangementID, resourceID), method: "DELETE"); await loadDestination("resources") }
        catch { apply(error) }
    }

    func downloadResource(arrangementID: UUID, resourceID: UUID, fileName: String) async {
        guard let group = selectedGroup else { return }
        do {
            let data = try await request(MobileEndpoints.resourceContent(group.id, arrangementID, resourceID))
            let safeName = URL(fileURLWithPath: fileName).lastPathComponent
            let url = FileManager.default.temporaryDirectory.appending(path: safeName.isEmpty ? resourceID.uuidString : safeName)
            try data.write(to: url, options: .atomic)
            downloadedResourceURL = url
        } catch { apply(error) }
    }

    func uploadResourceFile(arrangementID: UUID, label: String, purpose: String, fileURL: URL, part: String = "", note: String = "") async {
        guard let group = selectedGroup, let baseURL = configuration.baseURL else { return }
        let boundary = "Sonivo-\(UUID().uuidString)"
        let originalName = fileURL.lastPathComponent
        let contentType = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let bodyURL = FileManager.default.temporaryDirectory.appending(path: "sonivo-upload-\(UUID().uuidString).multipart")
        do {
            try await Task.detached {
                FileManager.default.createFile(atPath: bodyURL.path, contents: nil)
                let output = try FileHandle(forWritingTo: bodyURL)
                let input = try FileHandle(forReadingFrom: fileURL)
                defer { try? output.close(); try? input.close() }
                func write(_ text: String) { output.write(Data(text.utf8)) }
                write("--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\n\(purpose)\r\n")
                write("--\(boundary)\r\nContent-Disposition: form-data; name=\"label\"\r\n\r\n\(label)\r\n")
                if !part.isEmpty { write("--\(boundary)\r\nContent-Disposition: form-data; name=\"part\"\r\n\r\n\(part)\r\n") }
                if !note.isEmpty { write("--\(boundary)\r\nContent-Disposition: form-data; name=\"note\"\r\n\r\n\(note)\r\n") }
                let safeName = String(originalName.map { $0 == "\\" || $0 == "\"" || $0 == "\r" || $0 == "\n" ? "_" : $0 })
                write("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: \(contentType)\r\n\r\n")
                while let chunk = try input.read(upToCount: 64 * 1024), !chunk.isEmpty { output.write(chunk) }
                write("\r\n--\(boundary)--\r\n")
            }.value
            var credential = try await freshAccessToken()
            func makeRequest(_ token: String) -> URLRequest {
                var request = URLRequest(url: baseURL.appending(path: MobileEndpoints.arrangementResources(group.id, arrangementID).trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
                request.httpMethod = "POST"
                request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                request.setValue("application/json", forHTTPHeaderField: "Accept")
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                MobileEndpoints.versionHeaders(version: appVersion).forEach { request.setValue($1, forHTTPHeaderField: $0) }
                return request
            }
            var (data, response) = try await URLSession.shared.upload(for: makeRequest(credential), fromFile: bodyURL)
            if (response as? HTTPURLResponse)?.statusCode == 401 {
                credential = try await refreshAccessToken()
                (data, response) = try await URLSession.shared.upload(for: makeRequest(credential), fromFile: bodyURL)
            }
            guard let http = response as? HTTPURLResponse else { throw MobileAPIError.invalidResponse }
            if http.statusCode == 426 {
                let problem = try? JSONDecoder().decode(MobileVersionProblem.self, from: data)
                requiredVersion = problem?.minimumVersion
                updateURL = problem?.storeUrl.flatMap(URL.init(string:))
                throw MobileAPIError.updateRequired(problem?.minimumVersion, updateURL)
            }
            guard (200..<300).contains(http.statusCode) else { throw MobileAPIError.requestFailed }
            await loadDestination("resources")
        } catch { apply(error) }
        try? FileManager.default.removeItem(at: bodyURL)
    }

    func createGroupRole(name: String, permissionKeys: [String]) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["name": name, "permissions": permissionKeys, "extendsBaseRole": false]) else { return }
        do { _ = try await request(MobileEndpoints.groupRoles(group.id), method: "POST", body: body); await loadDestination("roles") }
        catch { apply(error) }
    }

    func deleteGroupRole(_ id: UUID) async {
        guard let group = selectedGroup else { return }
        do { _ = try await request(MobileEndpoints.groupRole(group.id, id), method: "DELETE"); await loadDestination("roles") }
        catch { apply(error) }
    }

    func updateGroupRole(_ id: UUID, name: String, permissionKeys: [String]) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["name": name, "permissions": permissionKeys]) else { return }
        do { _ = try await request(MobileEndpoints.groupRole(group.id, id), method: "PATCH", body: body); await loadDestination("roles") }
        catch { apply(error) }
    }

    func assignGroupRole(_ roleID: UUID, to userID: UUID) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["groupRoleId": roleID.uuidString]) else { return }
        do { _ = try await request(MobileEndpoints.memberGroupRole(group.id, userID), method: "PUT", body: body); await loadDestination("people") }
        catch { apply(error) }
    }

    func loadReportCSV() async {
        guard let group = selectedGroup else { return }
        let now = Date()
        let future = now.addingTimeInterval(180 * 24 * 60 * 60)
        let formatter = ISO8601DateFormatter()
        do {
            let data = try await request(MobileEndpoints.eventResponseReportCSV(group.id, from: formatter.string(from: now), to: formatter.string(from: future)))
            reportCSV = String(data: data, encoding: .utf8) ?? ""
        } catch { apply(error) }
    }

    func loadCalendarFeed() async {
        guard let group = selectedGroup else { return }
        do {
            let data = try await request(MobileEndpoints.calendarFeed(group.id))
            calendarICS = String(data: data, encoding: .utf8) ?? ""
        } catch { apply(error) }
    }

    func startTwoFactorEnrollment() async {
        do {
            let data = try await request(MobileEndpoints.twoFactorEnrollStart, method: "POST", body: Data("{}".utf8))
            authenticatorManualKey = try JSONDecoder().decode(AuthenticatorEnrollment.self, from: data).manualKey
            lastErrorKey = nil
        } catch { apply(error) }
    }

    func verifyTwoFactorEnrollment(code: String) async {
        guard let body = try? JSONSerialization.data(withJSONObject: ["code": code]) else { return }
        do {
            let data = try await request(MobileEndpoints.twoFactorEnrollVerify, method: "POST", body: body)
            recoveryCodes = (try? JSONDecoder().decode(RecoveryCodeResponse.self, from: data).recoveryCodes) ?? []
            authenticatorManualKey = nil
            await loadDestination("security")
        } catch { apply(error) }
    }

    func disableTwoFactor(password: String) async {
        guard let body = try? JSONSerialization.data(withJSONObject: ["password": password]) else { return }
        do {
            _ = try await request(MobileEndpoints.twoFactorDisable, method: "POST", body: body)
            recoveryCodes = []
            await loadDestination("security")
        } catch { apply(error) }
    }

    func changePassword(currentPassword: String, newPassword: String) async {
        guard let body = try? JSONSerialization.data(withJSONObject: ["currentPassword": currentPassword, "newPassword": newPassword]) else { return }
        do { _ = try await request(MobileEndpoints.changePassword, method: "POST", body: body); await loadDestination("security") }
        catch { apply(error) }
    }

    func deletePasskey(_ id: String) async {
        do { _ = try await request(MobileEndpoints.passkey(id), method: "DELETE"); await loadDestination("security") }
        catch { apply(error) }
    }

    func createInvitation(email: String) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["email": email.isEmpty ? NSNull() : email as Any]) else { return }
        do {
            let data = try await request(MobileEndpoints.invitations(group.id), method: "POST", body: body)
            createdInvitationToken = try JSONDecoder().decode(InvitationCreated.self, from: data).token
            await loadDestination("people")
        } catch { apply(error) }
    }

    func changeMemberRole(_ userID: UUID, role: String) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["role": role]) else { return }
        do { _ = try await request(MobileEndpoints.memberRole(group.id, userID), method: "POST", body: body); await loadDestination("people") }
        catch { apply(error) }
    }

    func setMemberAccess(_ userID: UUID, enabled: Bool) async {
        guard let group = selectedGroup,
              let body = try? JSONSerialization.data(withJSONObject: ["enabled": enabled]) else { return }
        do { _ = try await request(MobileEndpoints.memberAccess(group.id, userID), method: "PUT", body: body); await loadDestination("people") }
        catch { apply(error) }
    }

    func removeMember(_ userID: UUID) async {
        guard let group = selectedGroup else { return }
        do { _ = try await request(MobileEndpoints.member(group.id, userID), method: "DELETE"); await loadDestination("people") }
        catch { apply(error) }
    }

    func revokeInvitation(_ invitationID: UUID) async {
        guard let group = selectedGroup else { return }
        do { _ = try await request(MobileEndpoints.invitation(group.id, invitationID), method: "DELETE"); await loadDestination("people") }
        catch { apply(error) }
    }

    func registerPasskey(deviceName: String) async {
        do {
            let optionsData = try await request(MobileEndpoints.passkeyRegistrationStart, method: "POST", body: Data("{}".utf8))
            let options = try JSONDecoder().decode(PasskeyRegistrationOptions.self, from: optionsData)
            guard let challenge = Self.decodeBase64URL(options.challenge) else { throw MobileAPIError.invalidResponse }
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
            let registrationRequest = provider.createCredentialRegistrationRequest(challenge: challenge, name: options.user.name, userID: Data(options.user.id.utf8))
            registrationRequest.displayName = options.user.displayName
            let (attestation, clientData) = try await withCheckedThrowingContinuation { continuation in
                passkeyContinuation = continuation
                let controller = ASAuthorizationController(authorizationRequests: [registrationRequest])
                passkeyAuthorizationController = controller
                controller.delegate = self
                controller.presentationContextProvider = self
                controller.performRequests()
            }
            let body = try JSONSerialization.data(withJSONObject: [
                "attestationObject": attestation,
                "clientData": clientData,
                "deviceName": deviceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "iPhone" : deviceName,
            ])
            _ = try await request(MobileEndpoints.passkeyRegistrationFinish, method: "POST", body: body)
            await loadDestination("security")
        } catch { apply(error) }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let attestation = credential.rawAttestationObject else {
            passkeyContinuation?.resume(throwing: MobileAPIError.invalidResponse)
            passkeyContinuation = nil
            passkeyAuthorizationController = nil
            return
        }
        passkeyContinuation?.resume(returning: (attestation.base64URLString, credential.rawClientDataJSON.base64URLString))
        passkeyContinuation = nil
        passkeyAuthorizationController = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        passkeyContinuation?.resume(throwing: error)
        passkeyContinuation = nil
        passkeyAuthorizationController = nil
    }

    func revokeSession(_ key: String) async {
        do { _ = try await request(MobileEndpoints.revokeSession(key), method: "POST"); await loadDestination("security") }
        catch { apply(error) }
    }

    func loadDestination(_ id: String) async {
        guard let path = MobileEndpoints.destination(id, groupID: selectedGroup?.id) else {
            destinationItems = []
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            if id == "reports", let group = selectedGroup {
                let now = Date()
                let future = now.addingTimeInterval(180 * 24 * 60 * 60)
                let past = now.addingTimeInterval(-180 * 24 * 60 * 60)
                let formatter = ISO8601DateFormatter()
                let repertoire = try await request(path)
                let responses = try await request(MobileEndpoints.eventResponseReport(group.id, from: formatter.string(from: now), to: formatter.string(from: future)))
                let tasks = try await request(MobileEndpoints.taskReport(group.id, from: formatter.string(from: past), to: formatter.string(from: now)))
                let setlists = try await request(MobileEndpoints.setlistUsageReport(group.id))
                destinationItems = Self.reportItems([("repertoire", repertoire), ("responses", responses), ("tasks", tasks), ("setlists", setlists)])
            } else if id == "groupHome", let group = selectedGroup {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let eventsData = try await request(MobileEndpoints.events(group.id))
                let setlistsData = try await request(MobileEndpoints.setlists(group.id))
                let songsData = try await request(MobileEndpoints.destination("songs", groupID: group.id) ?? MobileEndpoints.groups)
                events = try decoder.decode([MobileEvent].self, from: eventsData)
                setlists = try decoder.decode([MobileSetlist].self, from: setlistsData)
                groupHomeSongs = Self.displayItems(songsData, page: "songs")
                let groupData = try await request(path)
                destinationItems = Self.displayItems(groupData, page: "groupHome")
            } else {
                let data = try await request(path)
                destinationItems = Self.displayItems(data, page: id)
            }
            if id == "settings", let group = selectedGroup {
                let groupData = try await request(MobileEndpoints.group(group.id))
                let groupObject = try JSONSerialization.jsonObject(with: groupData) as? [String: Any]
                selectedGroupVersion = groupObject?["version"] as? Int
                let usageData = try await request(MobileEndpoints.groupUsage(group.id))
                groupUsageItems = Self.displayItems(usageData, page: "membership")
            }
            if id == "people", let group = selectedGroup {
                let invitationsData = try await request(MobileEndpoints.invitations(group.id))
                invitationItems = Self.displayItems(invitationsData, page: "invitations")
                let rolesData = try await request(MobileEndpoints.groupRoles(group.id))
                groupRoleItems = Self.displayItems(rolesData, page: "roles")
            }
            if id == "tasks", let group = selectedGroup {
                let membersData = try await request(MobileEndpoints.destination("people", groupID: group.id) ?? MobileEndpoints.groups)
                taskAssignees = Self.displayItems(membersData, page: "people")
            }
            if id == "resources" { await loadSetlistArrangementChoices() }
            if id == "settings", let group = selectedGroup {
                let preferencesData = try await request(MobileEndpoints.groupNotificationPreferences(group.id))
                groupNotificationPreferences = try JSONDecoder().decode(MobileGroupNotificationPreferences.self, from: preferencesData)
            }
            if id == "security" {
                let statusData = try await request(MobileEndpoints.twoFactorStatus)
                twoFactorStatus = try JSONDecoder().decode(MobileTwoFactorStatus.self, from: statusData)
                let keyData = try await request(MobileEndpoints.passkeys)
                passkeyItems = Self.displayItems(keyData, page: "passkeys")
            }
            lastErrorKey = nil
        } catch {
            destinationItems = []
            apply(error)
        }
    }

    private func loadGroups() async throws {
        isLoading = true
        defer { isLoading = false }
        let data = try await request(MobileEndpoints.groups)
        groups = try JSONDecoder().decode([MobileGroup].self, from: data)
        isSignedIn = true
        if pendingGroupSlug != nil { Task { await resolvePendingGroup() } }
    }

    private func resolvePendingGroup() async {
        guard let slug = pendingGroupSlug else { return }
        guard let group = groups.first(where: { $0.slug.caseInsensitiveCompare(slug) == .orderedSame }) else {
            pendingGroupSlug = nil
            UserDefaults.standard.removeObject(forKey: "sonivo.pendingGroupSlug")
            lastErrorKey = "group_link.not_member"
            return
        }
        pendingGroupSlug = nil
        UserDefaults.standard.removeObject(forKey: "sonivo.pendingGroupSlug")
        selectedGroup = group
        await select(group)
    }

    private func authorize() async throws {
        guard let issuer = configuration.issuerURL,
              configuration.baseURL != nil else { throw MobileAPIError.notConfigured }
        let discoveryURL = issuer.appending(path: MobileEndpoints.discoveryPath)
        let discoveryData = try await URLSession.shared.data(from: discoveryURL).0
        let endpoints = try JSONDecoder().decode(OIDCDiscovery.self, from: discoveryData)
        guard endpoints.issuer == issuer.absoluteString,
              let authorizationEndpoint = URL(string: endpoints.authorizationEndpoint),
              let tokenEndpoint = URL(string: endpoints.tokenEndpoint),
              authorizationEndpoint.scheme == "https", tokenEndpoint.scheme == "https" else {
            throw MobileAPIError.invalidResponse
        }

        let state = Self.randomURLSafe(bytes: 32)
        let nonce = Self.randomURLSafe(bytes: 32)
        let verifier = Self.randomURLSafe(bytes: 32)
        var components = URLComponents(url: authorizationEndpoint, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: MobileEndpoints.scopes),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "code_challenge", value: Self.challenge(verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256")
        ]
        guard let authorizationURL = components.url else { throw MobileAPIError.invalidResponse }
        let callback = try await authenticate(url: authorizationURL)
        guard URL(string: redirectURI)?.scheme == callback.scheme,
              callback.path == "/oauth2redirect",
              URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "state" })?.value == state,
              let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw MobileAPIError.invalidResponse
        }

        let body = TokenExchange(grantType: "authorization_code", clientId: clientId, code: code, redirectUri: redirectURI, codeVerifier: verifier)
        token = try await exchange(body, endpoint: tokenEndpoint, expectedNonce: nonce)
        keychain.write(token)
    }

    private func authenticate(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            webSession = ASWebAuthenticationSession(url: url, callbackURLScheme: MobileEndpoints.redirectScheme) { callback, error in
                if let error { continuation.resume(throwing: error) }
                else if let callback { continuation.resume(returning: callback) }
                else { continuation.resume(throwing: MobileAPIError.invalidResponse) }
            }
            webSession?.presentationContextProvider = self
            webSession?.prefersEphemeralWebBrowserSession = false
            webSession?.start()
        }
    }

    private func request(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        guard let baseURL = configuration.baseURL else { throw MobileAPIError.notConfigured }
        var credential = try await freshAccessToken()
        var request = URLRequest(url: baseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
        request.httpMethod = method
        request.httpBody = body
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        MobileEndpoints.versionHeaders(version: appVersion).forEach { request.setValue($1, forHTTPHeaderField: $0) }
        var (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            credential = try await refreshAccessToken()
            request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
            (data, response) = try await URLSession.shared.data(for: request)
        }
        guard let http = response as? HTTPURLResponse else { throw MobileAPIError.invalidResponse }
        if http.statusCode == 426 {
            let problem = try? JSONDecoder().decode(MobileVersionProblem.self, from: data)
            let url = problem?.storeUrl.flatMap(URL.init(string:))
            requiredVersion = problem?.minimumVersion
            updateURL = url
            throw MobileAPIError.updateRequired(problem?.minimumVersion, url)
        }
        guard (200..<300).contains(http.statusCode) else { throw MobileAPIError.requestFailed }
        return data
    }

    private func freshAccessToken() async throws -> String {
        guard let token else { throw MobileAPIError.requestFailed }
        if token.expiresAt.timeIntervalSinceNow > 60 { return token.accessToken }
        return try await refreshAccessToken()
    }

    private func refreshAccessToken() async throws -> String {
        guard let token, let issuer = configuration.issuerURL,
              configuration.baseURL != nil else { throw MobileAPIError.requestFailed }
        let discoveryData = try await URLSession.shared.data(from: issuer.appending(path: MobileEndpoints.discoveryPath)).0
        let endpoint = try JSONDecoder().decode(OIDCDiscovery.self, from: discoveryData).tokenEndpoint
        guard let tokenURL = URL(string: endpoint) else { throw MobileAPIError.invalidResponse }
        let body = TokenExchange(grantType: "refresh_token", clientId: clientId, refreshToken: token.refreshToken)
        self.token = try await exchange(body, endpoint: tokenURL, prior: token)
        keychain.write(self.token)
        return self.token!.accessToken
    }

    private func exchange(_ value: TokenExchange, endpoint: URL, expectedNonce: String? = nil, prior: TokenSet? = nil) async throws -> TokenSet {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        MobileEndpoints.versionHeaders(version: appVersion).forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.httpBody = value.formEncoded.data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw MobileAPIError.invalidResponse }
        if http.statusCode == 426 {
            let problem = try? JSONDecoder().decode(MobileVersionProblem.self, from: data)
            let url = problem?.storeUrl.flatMap(URL.init(string:))
            throw MobileAPIError.updateRequired(problem?.minimumVersion, url)
        }
        guard (200..<300).contains(http.statusCode) else { throw MobileAPIError.requestFailed }
        let result = try JSONDecoder().decode(TokenResponse.self, from: data)
        if let expectedNonce {
            guard let idToken = result.idToken,
                  let payload = idToken.split(separator: ".").dropFirst().first,
                  let decoded = Data(base64Encoded: String(payload).paddingBase64URL),
                  let claims = try? JSONSerialization.jsonObject(with: decoded) as? [String: Any],
                  claims["nonce"] as? String == expectedNonce else { throw MobileAPIError.invalidResponse }
        }
        return TokenSet(accessToken: result.accessToken, refreshToken: result.refreshToken ?? prior?.refreshToken ?? "", expiresAt: Date().addingTimeInterval(TimeInterval(result.expiresIn)))
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    private func apply(_ error: Error) {
        if case let MobileAPIError.updateRequired(version, url) = error {
            requiredVersion = version
            updateURL = url
            lastErrorKey = "mobile.update.required"
        } else {
            lastErrorKey = "request.failed"
        }
    }

    private static func displayItems(_ data: Data, page: String) -> [MobileDataItem] {
        let titleKeys = page == "notifications" ? ["kind", "title", "name"] : ["title", "name", "displayName", "label", "songTitle", "planId"]
        let detailKeys = page == "notifications" ? ["createdAt"] : (page == "people" ? [] : ["role"]) + ["originKind", "attribution", "status", "type", "startsAt", "dueAt", "createdAt", "lastSeenAt", "expiresAt", "description", "permissions", "notes", "email", "itemCount"]
        func item(_ value: [String: Any], fallback: String) -> MobileDataItem {
            let title = titleKeys.compactMap { value[$0] as? String }.first(where: { !$0.isEmpty }) ?? fallback
            let details = detailKeys.compactMap { value[$0] as? String }.filter { !$0.isEmpty }
            let status: String?
            if page == "notifications" { status = value["readAt"] is NSNull || value["readAt"] == nil ? "unread" : "read" }
            else if page == "security" { status = (value["isCurrent"] as? Bool) == true ? "current" : "other" }
            else if page == "people" { status = value["role"] as? String }
            else { status = value["status"] as? String }
            let id = (value["id"] as? String) ?? (value["userId"] as? String) ?? (value["memberId"] as? String) ?? (value["sessionKey"] as? String) ?? fallback
            return MobileDataItem(id: id, title: title, detail: Array(details.prefix(2)).joined(separator: " · "), status: status, version: value["version"] as? Int, isEnabled: value["accessEnabled"] as? Bool, notes: value["note"] as? String ?? value["notes"] as? String, type: value["type"] as? String ?? value["originKind"] as? String, startsAt: value["startsAt"] as? String, url: value["url"] as? String, isSystem: value["isSystem"] as? Bool, groupRoleID: value["groupRoleId"] as? String, dueAt: value["dueAt"] as? String, assigneeUserID: value["assigneeUserId"] as? String, arrangementID: value["arrangementId"] as? String, kind: value["kind"] as? String, originalFileName: value["originalFileName"] as? String, attribution: value["attribution"] as? String, rightsNotes: value["rightsNotes"] as? String, tags: value["tags"] as? [String] ?? [], part: value["part"] as? String)
        }
        guard let root = try? JSONSerialization.jsonObject(with: data) else { return [] }
        if let values = root as? [[String: Any]] {
            return values.enumerated().map { item($0.element, fallback: "\($0.offset + 1)") }
        }
        if let dictionary = root as? [String: Any] {
            let nested = dictionary.flatMap { element -> [MobileDataItem] in
                guard let values = element.value as? [[String: Any]] else { return [] }
                return values.enumerated().map { item($0.element, fallback: "\(element.key)-\($0.offset + 1)") }
            }
            if !nested.isEmpty { return Array(nested.prefix(100)) }
            return dictionary.keys.sorted().compactMap { key in
                guard let value = dictionary[key], !(value is NSNull) else { return nil }
                let detail = String(describing: value)
                return MobileDataItem(id: key, title: key, detail: detail, status: nil, version: nil, isEnabled: nil, notes: nil, type: nil, startsAt: nil)
            }
        }
        return []
    }

    private static func reportItems(_ reports: [(String, Data)]) -> [MobileDataItem] {
        let labels: [String: String] = [
            "songs": "reports.songs", "arrangements": "reports.arrangements", "files": "reports.files",
            "links": "reports.links", "members": "reports.members", "total": "reports.total",
            "open": "reports.open", "inProgress": "reports.in_progress", "done": "reports.done",
            "unassigned": "reports.unassigned", "overdue": "reports.overdue", "setlists": "reports.setlists",
            "arrangementReferences": "reports.arrangement_references", "yes": "reports.yes", "no": "reports.no",
            "maybe": "reports.maybe", "noResponse": "reports.no_response",
        ]
        var result: [MobileDataItem] = []
        for (section, data) in reports {
            guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            func appendMetric(_ key: String) {
                guard let value = root[key], !(value is NSNull) else { return }
                result.append(MobileDataItem(id: "\(section)-\(key)", title: NSLocalizedString(labels[key] ?? key, comment: "Report metric"), detail: String(describing: value), status: nil, version: nil, isEnabled: nil, notes: nil, type: nil, startsAt: nil))
            }
            switch section {
            case "repertoire": ["songs", "arrangements", "files", "links"].forEach(appendMetric)
            case "responses":
                appendMetric("members")
                for (index, event) in (root["events"] as? [[String: Any]] ?? []).enumerated() {
                    let title = event["title"] as? String ?? NSLocalizedString("reports.event", comment: "Report event")
                    let details = ["startsAt", "yes", "no", "maybe", "noResponse"].compactMap { key -> String? in
                        guard let value = event[key] else { return nil }
                        return "\(NSLocalizedString(labels[key] ?? key, comment: "Report metric")): \(value)"
                    }.joined(separator: " · ")
                    result.append(MobileDataItem(id: "responses-event-\(event["eventId"] as? String ?? "\(index)")", title: title, detail: details, status: nil, version: nil, isEnabled: nil, notes: nil, type: nil, startsAt: nil))
                }
            case "tasks":
                ["total", "open", "inProgress", "done", "unassigned", "overdue"].forEach(appendMetric)
                for (index, person) in (root["byAssignee"] as? [[String: Any]] ?? []).enumerated() {
                    let name = person["displayName"] as? String ?? ""
                    let count = person["count"] ?? 0
                    result.append(MobileDataItem(id: "tasks-assignee-\(index)", title: name, detail: "\(NSLocalizedString("reports.total", comment: "Report metric")): \(count)", status: nil, version: nil, isEnabled: nil, notes: nil, type: nil, startsAt: nil))
                }
            case "setlists": ["setlists", "arrangementReferences"].forEach(appendMetric)
            default: break
            }
        }
        return Array(result.prefix(100))
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }

    private static func randomURLSafe(bytes: Int) -> String {
        var data = Data(count: bytes)
        _ = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, bytes, $0.baseAddress!) }
        return data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private static func challenge(_ verifier: String) -> String {
        SHA256.hash(data: Data(verifier.utf8)).withUnsafeBytes { Data($0).base64EncodedString() }
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func decodeBase64URL(_ value: String) -> Data? {
        var encoded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        return Data(base64Encoded: encoded)
    }
}

private extension Data {
    var base64URLString: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

private struct OIDCDiscovery: Decodable {
    let issuer: String
    let authorizationEndpoint: String
    let tokenEndpoint: String
    let revocationEndpoint: String?
    enum CodingKeys: String, CodingKey {
        case issuer
        case authorizationEndpoint = "authorization_endpoint"
        case tokenEndpoint = "token_endpoint"
        case revocationEndpoint = "revocation_endpoint"
    }
}

private struct TokenExchange {
    let grantType: String
    let clientId: String
    var code: String? = nil
    var redirectUri: String? = nil
    var codeVerifier: String? = nil
    var refreshToken: String? = nil
    var formEncoded: String {
        var fields = ["grant_type": grantType, "client_id": clientId]
        if let code { fields["code"] = code }
        if let redirectUri { fields["redirect_uri"] = redirectUri }
        if let codeVerifier { fields["code_verifier"] = codeVerifier }
        if let refreshToken { fields["refresh_token"] = refreshToken }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return fields.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }.joined(separator: "&")
    }
    var revocationEncoded: String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        let value = refreshToken?.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        return "client_id=\(clientId)&token_type_hint=refresh_token&token=\(value)"
    }
}

private struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int
    let idToken: String?
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case idToken = "id_token"
    }
}

private extension String {
    var paddingBase64URL: String {
        let normalized = replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        return normalized + String(repeating: "=", count: (4 - normalized.count % 4) % 4)
    }
}

private struct TokenSet: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}

private struct MobileTokenKeychain {
    private let service = "lat.sonivo.ios"
    private let account = "mobile-session"
    func read() -> TokenSet? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(TokenSet.self, from: data)
    }
    func write(_ token: TokenSet?) {
        guard let token, let data = try? JSONEncoder().encode(token) else { return }
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }
    func clear() { SecItemDelete(baseQuery as CFDictionary) }
    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
}
