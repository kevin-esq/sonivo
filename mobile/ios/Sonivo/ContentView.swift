import SwiftUI
import UIKit
import UniformTypeIdentifiers

private enum SonivoBrand {
    static let primary = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 185.0 / 255, green: 167.0 / 255, blue: 255.0 / 255, alpha: 1)
            : UIColor(red: 109.0 / 255, green: 78.0 / 255, blue: 224.0 / 255, alpha: 1)
    })
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let wash = Color(uiColor: .secondarySystemGroupedBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
    static let ink = Color(uiColor: .label)
}

private struct SonivoNavigationTitle: View {
    let titleKey: String

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 2) {
                ForEach([12.0, 21.0, 16.0, 9.0], id: \.self) { height in
                    Capsule().fill(SonivoBrand.primary).frame(width: 3, height: height)
                }
            }
            Text(LocalizedStringKey(titleKey)).font(.headline).foregroundStyle(SonivoBrand.ink)
        }
        .accessibilityElement(children: .combine)
    }
}

private enum AppTab: Hashable {
    case groups
    case events
    case practice
    case more
}

private struct SonivoTabIcon: View {
    let tab: AppTab
    let color: Color

    var body: some View {
        Canvas { context, size in
            let scale = size.width / 24
            let icon = Path { path in
                switch tab {
                case .groups:
                    path.move(to: CGPoint(x: 18, y: 21))
                    path.addCurve(to: CGPoint(x: 10, y: 13), control1: CGPoint(x: 18, y: 16.58), control2: CGPoint(x: 14.42, y: 13))
                    path.addCurve(to: CGPoint(x: 2, y: 21), control1: CGPoint(x: 5.58, y: 13), control2: CGPoint(x: 2, y: 16.58))
                    path.addEllipse(in: CGRect(x: 5, y: 3, width: 10, height: 10))
                    path.move(to: CGPoint(x: 22, y: 20))
                    path.addCurve(to: CGPoint(x: 18, y: 12), control1: CGPoint(x: 22, y: 16.63), control2: CGPoint(x: 20, y: 13.5))
                    path.addCurve(to: CGPoint(x: 17.55, y: 3.7), control1: CGPoint(x: 18.4, y: 10.3), control2: CGPoint(x: 17.55, y: 5.2))
                case .events:
                    path.addRoundedRect(in: CGRect(x: 3, y: 3, width: 18, height: 18), cornerSize: CGSize(width: 2, height: 2))
                    path.move(to: CGPoint(x: 8, y: 2)); path.addLine(to: CGPoint(x: 8, y: 5))
                    path.move(to: CGPoint(x: 16, y: 2)); path.addLine(to: CGPoint(x: 16, y: 5))
                    path.move(to: CGPoint(x: 3, y: 9)); path.addLine(to: CGPoint(x: 21, y: 9))
                    for y in [13.0, 17.0] {
                        for x in [8.0, 12.0, 16.0] {
                            path.move(to: CGPoint(x: x, y: y)); path.addLine(to: CGPoint(x: x + 0.01, y: y))
                        }
                    }
                case .practice:
                    path.move(to: CGPoint(x: 12, y: 18)); path.addLine(to: CGPoint(x: 12, y: 2)); path.addLine(to: CGPoint(x: 19, y: 6))
                    path.addEllipse(in: CGRect(x: 4, y: 14, width: 8, height: 8))
                case .more:
                    for x in [5.0, 12.0, 19.0] {
                        path.addEllipse(in: CGRect(x: x - 1.5, y: 10.5, width: 3, height: 3))
                    }
                }
            }
            context.stroke(
                icon.applying(CGAffineTransform(scaleX: scale, y: scale)),
                with: .color(color),
                style: StrokeStyle(lineWidth: 1.67, lineCap: .round, lineJoin: .round)
            )
        }
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
    }
}

private struct SonivoFloatingTabBar: View {
    @Binding var selection: AppTab

    private let tabs: [(AppTab, String)] = [
        (.groups, "nav.groups"), (.events, "nav.events"), (.practice, "nav.practice"), (.more, "nav.more"),
    ]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(tabs.enumerated()), id: \.offset) { _, item in
                let tab = item.0
                let title = item.1
                let isSelected = selection == tab
                Button { selection = tab } label: {
                    VStack(spacing: 3) {
                        SonivoTabIcon(tab: tab, color: isSelected ? SonivoBrand.primary : SonivoBrand.ink.opacity(0.62))
                            .frame(width: 44, height: 36)
                            .background(isSelected ? SonivoBrand.primary.opacity(0.12) : .clear, in: Capsule())
                        Text(LocalizedStringKey(title))
                            .font(.caption2.weight(isSelected ? .semibold : .medium))
                            .lineLimit(1)
                            .foregroundStyle(isSelected ? SonivoBrand.primary : SonivoBrand.ink.opacity(0.68))
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(SonivoBrand.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(SonivoBrand.ink.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.10), radius: 14, x: 0, y: 6)
    }
}

struct ContentView: View {
    @State private var selectedTab: AppTab = .groups
    @AppStorage("sonivo.language") private var preferredLanguage = "es"
    @AppStorage("sonivo.theme") private var preferredTheme = "system"
    @StateObject private var playback = PracticePlaybackEngine()
    @StateObject private var api = MobileAPI()

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                GroupListView(api: api)
                    .toolbar { ToolbarItem(placement: .principal) { SonivoNavigationTitle(titleKey: "groups.title") } }
                    .toolbarBackground(SonivoBrand.surface, for: .navigationBar)
            }
            .tabItem { Text("nav.groups") }
            .tag(AppTab.groups)
            NavigationStack {
                EventsListView(api: api)
                    .toolbar { ToolbarItem(placement: .principal) { SonivoNavigationTitle(titleKey: "nav.events") } }
                    .toolbarBackground(SonivoBrand.surface, for: .navigationBar)
            }
            .tabItem { Text("nav.events") }
            .tag(AppTab.events)
            NavigationStack {
                PracticeLandingView(api: api, playback: playback)
                    .toolbar { ToolbarItem(placement: .principal) { SonivoNavigationTitle(titleKey: "nav.practice") } }
                    .toolbarBackground(SonivoBrand.surface, for: .navigationBar)
            }
            .tabItem { Text("nav.practice") }
            .tag(AppTab.practice)
            NavigationStack {
                MoreDestinationsView(api: api, selectedTab: $selectedTab)
                    .toolbar { ToolbarItem(placement: .principal) { SonivoNavigationTitle(titleKey: "nav.more") } }
                    .toolbarBackground(SonivoBrand.surface, for: .navigationBar)
            }
            .tabItem { Text("nav.more") }
            .tag(AppTab.more)
        }
        .tint(SonivoBrand.primary)
        .environment(\.locale, Locale(identifier: preferredLanguage))
        .preferredColorScheme(preferredTheme == "system" ? nil : preferredTheme == "dark" ? .dark : .light)
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SonivoFloatingTabBar(selection: $selectedTab)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 8)
        }
        .task { await api.restoreSession() }
        .onOpenURL { api.handleGroupLink($0) }
        .onChange(of: api.selectedArrangement?.id) { _, arrangementID in
            if arrangementID != nil { selectedTab = .practice }
        }
        .overlay {
            if let version = api.requiredVersion {
                VStack(spacing: 20) {
                    LucideGlyph(name: "download", color: SonivoBrand.primary).frame(width: 48, height: 48)
                    Text("mobile.update.required \(version)").font(.title2.weight(.semibold)).multilineTextAlignment(.center)
                    if let url = api.updateURL {
                        Link("mobile.update.open_store", destination: url).buttonStyle(.borderedProminent)
                    }
                }
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
                .ignoresSafeArea()
                .accessibilityAddTraits(.isModal)
            }
        }
        .background(SonivoBrand.canvas.ignoresSafeArea())
    }
}

private struct NativeDestination: Identifiable {
    let id: String
    let titleKey: String
    let section: String
}

private let nativeDestinations = [
    NativeDestination(id: "home", titleKey: "destination.home", section: "account"),
    NativeDestination(id: "groups", titleKey: "destination.groups", section: "account"),
    NativeDestination(id: "join", titleKey: "destination.join", section: "account"),
    NativeDestination(id: "profile", titleKey: "destination.profile", section: "account"),
    NativeDestination(id: "notifications", titleKey: "destination.notifications", section: "account"),
    NativeDestination(id: "preferences", titleKey: "destination.preferences", section: "account"),
    NativeDestination(id: "membership", titleKey: "destination.membership", section: "account"),
    NativeDestination(id: "plans", titleKey: "destination.plans", section: "account"),
    NativeDestination(id: "calendar", titleKey: "destination.calendar", section: "account"),
    NativeDestination(id: "help", titleKey: "destination.help", section: "account"),
    NativeDestination(id: "groupHelp", titleKey: "destination.help", section: "group"),
    NativeDestination(id: "security", titleKey: "destination.security", section: "account"),
    NativeDestination(id: "songs", titleKey: "destination.songs", section: "group"),
    NativeDestination(id: "setlists", titleKey: "destination.setlists", section: "group"),
    NativeDestination(id: "groupCalendar", titleKey: "destination.group_calendar", section: "group"),
    NativeDestination(id: "events", titleKey: "destination.events", section: "group"),
    NativeDestination(id: "tasks", titleKey: "destination.tasks", section: "group"),
    NativeDestination(id: "people", titleKey: "destination.people", section: "group"),
    NativeDestination(id: "roles", titleKey: "destination.roles", section: "group"),
    NativeDestination(id: "reports", titleKey: "destination.reports", section: "group"),
    NativeDestination(id: "resources", titleKey: "destination.resources", section: "group"),
    NativeDestination(id: "audit", titleKey: "destination.audit", section: "group"),
    NativeDestination(id: "settings", titleKey: "destination.settings", section: "group"),
    NativeDestination(id: "groupHome", titleKey: "destination.group_home", section: "group"),
]

private struct MoreDestinationsView: View {
    @ObservedObject var api: MobileAPI
    @Binding var selectedTab: AppTab

    var body: some View {
        List {
            Section("more.account") {
                ForEach(nativeDestinations.filter { $0.section == "account" }) { destination in
                    NavigationLink(value: destination.id) {
                        Text(LocalizedStringKey(destination.titleKey))
                    }
                }
            }
            if let group = api.selectedGroup {
                Section(String(format: NSLocalizedString("more.group", comment: ""), group.name)) {
                    ForEach(nativeDestinations.filter { $0.section == "group" }) { destination in
                        NavigationLink(value: destination.id) {
                            Text(LocalizedStringKey(destination.titleKey))
                        }
                    }
                }
            } else {
                Section {
                    ContentUnavailableView("more.choose_group", systemImage: "person.3")
                }
            }
            if api.isSignedIn {
                Section {
                    Button("auth.sign_out", systemImage: "rectangle.portrait.and.arrow.right") {
                        Task { await api.signOut() }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SonivoBrand.canvas)
        .navigationDestination(for: String.self) { id in
            NativeDestinationPage(id: id, api: api, selectedTab: $selectedTab)
        }
    }
}

private struct NativeDestinationPage: View {
    let id: String
    @ObservedObject var api: MobileAPI
    @Binding var selectedTab: AppTab
    @AppStorage("sonivo.language") private var preferredLanguage = "es"
    @AppStorage("sonivo.theme") private var preferredTheme = "system"
    @State private var invitationToken = ""
    @State private var newTaskTitle = ""
    @State private var newTaskNotes = ""
    @State private var newTaskDueEnabled = false
    @State private var newTaskDueAt = Date()
    @State private var newTaskAssigneeID: UUID?
    @State private var newSetlistName = ""
    @State private var newSongTitle = ""
    @State private var newSongOriginKind = "original"
    @State private var newSongAttribution = ""
    @State private var newSongRightsNotes = ""
    @State private var newSongTags = ""
    @State private var selectedSongForArrangements: UUID?
    @State private var newArrangementLabel = ""
    @State private var newArrangementKey = ""
    @State private var newArrangementBpm = ""
    @State private var newArrangementLyrics = ""
    @State private var newArrangementChords = ""
    @State private var newArrangementStructure = ""
    @State private var newArrangementNotes = ""
    @State private var editingSongID: UUID?
    @State private var editSongTitle = ""
    @State private var editSongAttribution = ""
    @State private var editSongRightsNotes = ""
    @State private var editSongTags = ""
    @State private var editSongOriginKind = "original"
    @State private var songToDelete: (id: UUID, version: Int)?
    @State private var newResourceLabel = ""
    @State private var newResourceURL = ""
    @State private var newResourcePart = ""
    @State private var newResourceNote = ""
    @State private var newResourcePurpose = "reference"
    @State private var newResourceArrangementID = ""
    @State private var importingResourceFile = false
    @State private var calendarCursor = Date()
    @State private var calendarPeriod = "month"
    @State private var newGroupRoleName = ""
    @State private var newGroupRolePermissions = ""
    @State private var editingGroupRoleID: UUID?
    @State private var editingSetlistID: UUID?
    @State private var editSetlistName = ""
    @State private var newEventTitle = ""
    @State private var newEventType = "rehearsal"
    @State private var newEventStartsAt = Calendar.current.date(bySettingHour: 19, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var twoFactorCode = ""
    @State private var passkeyDeviceName = ""
    @State private var invitationEmail = ""
    @State private var disablePassword = ""
    @State private var currentPassword = ""
    @State private var newPassword = ""

    private var destination: NativeDestination { nativeDestinations.first { $0.id == id }! }

    private var isSongDeleteConfirmationPresented: Binding<Bool> {
        Binding(get: { songToDelete != nil }, set: { if !$0 { songToDelete = nil } })
    }

    var body: some View {
        List {
            if !api.isSignedIn {
                ContentUnavailableView("auth.sign_in_required", systemImage: "person.crop.circle")
            } else if id == "plans" {
                PlansDestinationContent(api: api)
            } else if id == "calendar" {
                GlobalCalendarDestinationContent(api: api, selectedTab: $selectedTab)
            } else if id == "groupHome" {
                GroupHomeDestinationContent(api: api, selectedTab: $selectedTab)
            } else if id == "help" || id == "groupHelp" {
                Text("more.help.body")
            } else if id == "preferences" {
                Section("preferences.language") {
                    Picker("preferences.language", selection: $preferredLanguage) {
                        Text("language.spanish").tag("es")
                        Text("language.english").tag("en")
                        Text("language.portuguese").tag("pt")
                    }
                    .pickerStyle(.segmented)
                }
                Section("preferences.appearance") {
                    Picker("preferences.appearance", selection: $preferredTheme) {
                        Text("theme.system").tag("system")
                        Text("theme.light").tag("light")
                        Text("theme.dark").tag("dark")
                    }
                    .pickerStyle(.segmented)
                }
            } else if id == "join" {
                Section {
                    Text("more.join.body")
                    TextField("more.invite_token", text: $invitationToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("more.join_action") { Task { await api.acceptInvitation(invitationToken.trimmingCharacters(in: .whitespacesAndNewlines)) } }
                        .buttonStyle(.borderedProminent)
                        .disabled(invitationToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                }
            } else if id == "profile" {
                ProfileDestinationContent(api: api)
            } else if id == "settings" {
                GroupSettingsContent(api: api)
            } else if id == "security" {
                if api.twoFactorStatus?.hasPassword == true {
                    Section("security.change_password") {
                        SecureField("security.current_password", text: $currentPassword)
                        SecureField("security.new_password", text: $newPassword)
                        Button("security.save_password") {
                            Task { await api.changePassword(currentPassword: currentPassword, newPassword: newPassword); currentPassword = ""; newPassword = "" }
                        }
                        .disabled(currentPassword.isEmpty || newPassword.isEmpty || api.isLoading)
                    }
                }
                Section("security.two_factor") {
                    if let status = api.twoFactorStatus, status.enabled {
                        Text("security.two_factor_enabled")
                            .foregroundStyle(.green)
                        if status.hasPassword {
                            SecureField("security.password", text: $disablePassword)
                        }
                        Button("security.disable_two_factor", role: .destructive) {
                            Task { await api.disableTwoFactor(password: disablePassword); disablePassword = "" }
                        }
                        .disabled(api.isLoading || (status.hasPassword && disablePassword.isEmpty))
                    } else if let manualKey = api.authenticatorManualKey {
                        Text("security.manual_key_hint")
                        Text(manualKey).textSelection(.enabled).font(.system(.body, design: .monospaced))
                        TextField("security.authenticator_code", text: $twoFactorCode)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                        Button("security.confirm_two_factor") {
                            Task { await api.verifyTwoFactorEnrollment(code: twoFactorCode); twoFactorCode = "" }
                        }
                        .disabled(twoFactorCode.count < 6 || api.isLoading)
                    } else {
                        Text("security.two_factor_disabled")
                        Button("security.enable_two_factor") { Task { await api.startTwoFactorEnrollment() } }
                            .disabled(api.isLoading)
                    }
                }
                if !api.recoveryCodes.isEmpty {
                    Section("security.recovery_codes") {
                        Text("security.recovery_codes_hint")
                        ForEach(api.recoveryCodes, id: \.self) { Text($0).font(.system(.body, design: .monospaced)) }
                    }
                }
                Section("security.passkeys") {
                    TextField("security.device_name", text: $passkeyDeviceName)
                    Button("security.add_passkey") {
                        Task { await api.registerPasskey(deviceName: passkeyDeviceName); passkeyDeviceName = "" }
                    }
                    .disabled(api.isLoading)
                    if api.passkeyItems.isEmpty { Text("security.no_passkeys").foregroundStyle(.secondary) }
                    ForEach(api.passkeyItems) { item in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(item.title)
                                if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Button("security.remove_passkey", role: .destructive) { Task { await api.deletePasskey(item.id) } }
                        }
                    }
                }
                Section("security.sessions") {
                    ForEach(api.destinationItems) { item in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(item.title)
                                if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            if item.status == "other" {
                                Button("more.revoke_session", role: .destructive) { Task { await api.revokeSession(item.id) } }
                            }
                        }
                    }
                }
            } else if id == "people" {
                Section("people.invite") {
                    TextField("people.email_optional", text: $invitationEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    Button("people.create_invitation") {
                        let email = invitationEmail.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { await api.createInvitation(email: email); invitationEmail = "" }
                    }
                    .disabled(api.isLoading)
                    if let token = api.createdInvitationToken {
                        Text("people.invitation_created")
                        Text(token).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                    }
                }
                Section("people.members") {
                    ForEach(api.destinationItems) { item in
                        PeopleMemberRow(api: api, item: item)
                    }
                }
                Section("people.invitations") {
                    ForEach(api.invitationItems) { item in
                        HStack {
                            Text(item.detail.isEmpty ? item.title : item.detail).font(.caption)
                            Spacer()
                            if let invitationID = UUID(uuidString: item.id) {
                                Button("people.revoke_invitation", role: .destructive) { Task { await api.revokeInvitation(invitationID) } }
                            }
                        }
                    }
                }
            } else if destination.section == "group" && api.selectedGroup == nil {
                ContentUnavailableView("more.choose_group", systemImage: "person.3")
            } else if id == "roles" {
                if api.selectedGroup?.role == "Owner" {
                Section {
                    TextField("groupRole.name", text: $newGroupRoleName)
                    TextField("groupRole.permissions", text: $newGroupRolePermissions, axis: .vertical).lineLimit(2...5)
                    Text("groupRole.permissions_hint").font(.caption).foregroundStyle(.secondary)
                    Button(editingGroupRoleID == nil ? "groupRole.create" : "groupRole.save") {
                        let name = newGroupRoleName.trimmingCharacters(in: .whitespacesAndNewlines)
                        let permissions = newGroupRolePermissions.split(whereSeparator: { $0 == "," || $0.isNewline }).map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                        Task {
                            if let editingGroupRoleID { await api.updateGroupRole(editingGroupRoleID, name: name, permissionKeys: permissions) }
                            else { await api.createGroupRole(name: name, permissionKeys: permissions) }
                            newGroupRoleName = ""; newGroupRolePermissions = ""; editingGroupRoleID = nil
                        }
                    }
                    .disabled(newGroupRoleName.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || api.isLoading)
                }
                }
                ForEach(api.destinationItems) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title).font(.headline)
                        if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                        if item.isSystem == true { Text("groupRole.system").font(.caption).foregroundStyle(.secondary) }
                        else if api.selectedGroup?.role == "Owner", let roleID = UUID(uuidString: item.id) {
                            HStack {
                                Button("groupRole.edit") {
                                    editingGroupRoleID = roleID
                                    newGroupRoleName = item.title
                                    newGroupRolePermissions = item.detail.components(separatedBy: " · ").last ?? ""
                                }
                                Button("groupRole.delete", role: .destructive) { Task { await api.deleteGroupRole(roleID) } }
                            }
                        }
                    }
                }
            } else if id == "reports" {
                Section {
                    if api.reportCSV.isEmpty {
                        Button("reports.prepare_export") { Task { await api.loadReportCSV() } }
                    } else {
                        ShareLink(item: api.reportCSV) {
                            Label("reports.export_csv", systemImage: "square.and.arrow.up")
                        }
                    }
                }
                ForEach(api.destinationItems) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title).font(.headline)
                        Text(item.detail).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            } else if id == "resources" {
                Section {
                    TextField("resource.label", text: $newResourceLabel)
                    TextField("resource.url", text: $newResourceURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    TextField("resource.part", text: $newResourcePart)
                    TextField("resource.note", text: $newResourceNote, axis: .vertical).lineLimit(2...5)
                    Picker("resource.purpose", selection: $newResourcePurpose) {
                        Text("resource.purpose.chart").tag("chart")
                        Text("resource.purpose.lyrics").tag("lyrics")
                        Text("resource.purpose.audio").tag("audio")
                        Text("resource.purpose.click").tag("click")
                        Text("resource.purpose.reference").tag("reference")
                        Text("resource.purpose.practice").tag("practice")
                        Text("resource.purpose.other").tag("other")
                    }
                    Picker("resource.arrangement", selection: $newResourceArrangementID) {
                        Text("resource.choose_arrangement").tag("")
                        ForEach(api.availableSetlistArrangements) { arrangement in
                            Text("\(arrangement.songTitle ?? "") · \(arrangement.label)").tag(arrangement.id.uuidString)
                        }
                    }
                    Button("resource.create_link") {
                        guard let arrangementID = UUID(uuidString: newResourceArrangementID) else { return }
                        let label = newResourceLabel.trimmingCharacters(in: .whitespacesAndNewlines)
                        let url = newResourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { await api.createLinkResource(arrangementID: arrangementID, label: label, url: url, purpose: newResourcePurpose, part: newResourcePart.trimmingCharacters(in: .whitespacesAndNewlines), note: newResourceNote.trimmingCharacters(in: .whitespacesAndNewlines)); newResourceLabel = ""; newResourceURL = ""; newResourcePart = ""; newResourceNote = "" }
                    }
                    .disabled(newResourceLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || newResourceURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || UUID(uuidString: newResourceArrangementID) == nil || api.isLoading)
                    if api.selectedGroup?.role == "Owner" {
                        Button("resource.upload_file") { importingResourceFile = true }
                            .disabled(UUID(uuidString: newResourceArrangementID) == nil || api.isLoading)
                    }
                }
                ForEach(api.destinationItems) { item in
                    ResourceDestinationRow(api: api, item: item)
                }
            } else if id == "songs" {
                Section {
                    TextField("song.title", text: $newSongTitle)
                    TextField("song.attribution", text: $newSongAttribution)
                    TextField("song.rights_notes", text: $newSongRightsNotes)
                    TextField("song.tags", text: $newSongTags)
                    Text("song.tags_hint").font(.caption).foregroundStyle(.secondary)
                    Picker("song.origin", selection: $newSongOriginKind) {
                        Text("song.original").tag("original")
                        Text("song.cover").tag("cover")
                        Text("song.other").tag("other")
                    }
                    Button("song.create") {
                        let title = newSongTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                        let tags = newSongTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                        Task { await api.createSong(title: title, originKind: newSongOriginKind, attribution: newSongAttribution.trimmingCharacters(in: .whitespacesAndNewlines), rightsNotes: newSongRightsNotes.trimmingCharacters(in: .whitespacesAndNewlines), tags: tags); newSongTitle = ""; newSongAttribution = ""; newSongRightsNotes = ""; newSongTags = "" }
                    }
                    .disabled(newSongTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                }
                ForEach(api.destinationItems) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        if editingSongID == UUID(uuidString: item.id) {
                            TextField("song.title", text: $editSongTitle)
                            TextField("song.attribution", text: $editSongAttribution)
                            TextField("song.rights_notes", text: $editSongRightsNotes)
                            TextField("song.tags", text: $editSongTags)
                            Picker("song.origin", selection: $editSongOriginKind) {
                                Text("song.original").tag("original")
                                Text("song.cover").tag("cover")
                                Text("song.other").tag("other")
                            }
                            Button("more.save") {
                                guard let songID = editingSongID, let version = item.version else { return }
                                let title = editSongTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                                let tags = editSongTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                                Task { await api.updateSong(songID, title: title, expectedVersion: version, originKind: editSongOriginKind, attribution: editSongAttribution.trimmingCharacters(in: .whitespacesAndNewlines), rightsNotes: editSongRightsNotes.trimmingCharacters(in: .whitespacesAndNewlines), tags: tags); editingSongID = nil }
                            }
                            .disabled(editSongTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                        } else {
                            Text(item.title).font(.headline)
                            if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                            if let songID = UUID(uuidString: item.id), let version = item.version {
                                HStack {
                                    Button("song.edit") {
                                        Task {
                                            guard let detail = await api.songForEditing(songID) else { return }
                                            editingSongID = songID
                                            editSongTitle = detail.title
                                            editSongAttribution = detail.attribution ?? ""
                                            editSongRightsNotes = detail.rightsNotes ?? ""
                                            editSongTags = detail.tags.joined(separator: ", ")
                                            editSongOriginKind = detail.type ?? "original"
                                        }
                                    }
                                    Button("song.delete", role: .destructive) { songToDelete = (songID, version) }
                                }
                                .buttonStyle(.bordered)
                                Button(selectedSongForArrangements == songID ? "arrangement.hide" : "arrangement.manage") {
                                    if selectedSongForArrangements == songID { selectedSongForArrangements = nil }
                                    else { selectedSongForArrangements = songID; Task { await api.loadSongArrangements(songID) } }
                                }
                                if selectedSongForArrangements == songID {
                                    TextField("arrangement.label", text: $newArrangementLabel)
                                    TextField("arrangement.key", text: $newArrangementKey)
                                    TextField("arrangement.bpm", text: $newArrangementBpm).keyboardType(.numberPad)
                                    TextField("arrangement.lyrics", text: $newArrangementLyrics, axis: .vertical).lineLimit(3...8)
                                    TextField("arrangement.chords", text: $newArrangementChords, axis: .vertical).lineLimit(3...8)
                                    TextField("arrangement.structure", text: $newArrangementStructure)
                                    TextField("arrangement.notes", text: $newArrangementNotes, axis: .vertical).lineLimit(2...5)
                                    Button("arrangement.create") { createArrangement(songID: songID) }
                                    .disabled(newArrangementLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (Int(newArrangementBpm) != nil && !(1...400).contains(Int(newArrangementBpm)!)) || api.isLoading)
                                    ForEach(api.songArrangements) { arrangement in
                                        ArrangementManagerRow(api: api, arrangement: arrangement)
                                    }
                                }
                            }
                        }
                    }
                }
            } else if id == "setlists" {
                Section {
                    TextField("setlist.name", text: $newSetlistName)
                    Button("setlist.create") {
                        let name = newSetlistName.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { await api.createSetlist(name: name); newSetlistName = "" }
                    }
                    .disabled(newSetlistName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                }
                ForEach(api.destinationItems) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        if editingSetlistID == UUID(uuidString: item.id) {
                            TextField("setlist.name", text: $editSetlistName)
                            Button("more.save") {
                                guard let id = editingSetlistID, let version = item.version else { return }
                                let name = editSetlistName.trimmingCharacters(in: .whitespacesAndNewlines)
                                Task { await api.renameSetlist(id, name: name, expectedVersion: version); editingSetlistID = nil }
                            }
                            .disabled(editSetlistName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                        } else {
                            Text(item.title).font(.headline)
                            if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                            if UUID(uuidString: item.id) != nil, item.version != nil {
                                Button("setlist.rename") { editingSetlistID = UUID(uuidString: item.id); editSetlistName = item.title }
                                    .buttonStyle(.bordered)
                            }
                        }
                    }
                }
            } else if id == "tasks" {
                Section {
                    TextField("task.new_title", text: $newTaskTitle)
                    TextField("task.notes", text: $newTaskNotes, axis: .vertical).lineLimit(2...5)
                    Toggle("task.has_due_date", isOn: $newTaskDueEnabled)
                    if newTaskDueEnabled { DatePicker("task.due_date", selection: $newTaskDueAt) }
                    Picker("task.assignee", selection: $newTaskAssigneeID) {
                        Text("task.unassigned").tag(Optional<UUID>.none)
                        ForEach(api.taskAssignees) { member in
                            if let userID = UUID(uuidString: member.id) { Text(member.title).tag(Optional(userID)) }
                        }
                    }
                    Button("task.create") {
                        let title = newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                        let notes = newTaskNotes.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { await api.createTask(title: title, notes: notes.isEmpty ? nil : notes, dueAt: newTaskDueEnabled ? newTaskDueAt : nil, assigneeUserID: newTaskAssigneeID); newTaskTitle = ""; newTaskNotes = ""; newTaskDueEnabled = false; newTaskAssigneeID = nil }
                    }
                    .disabled(newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                }
                ForEach(api.destinationItems) { item in TaskDestinationRow(api: api, item: item) }
            } else if id == "events" || id == "groupCalendar" {
                if id == "groupCalendar" {
                    Section("calendar.period") {
                        HStack {
                            Button("calendar.prev") {
                                let component: Calendar.Component = calendarPeriod == "month" ? .month : calendarPeriod == "week" ? .weekOfYear : .day
                                if let next = Calendar.current.date(byAdding: component, value: -1, to: calendarCursor) { calendarCursor = next }
                            }
                            Spacer()
                            Text(calendarCursor.formatted(.dateTime.month(.wide).year())).font(.headline)
                            Spacer()
                            Button("calendar.next") {
                                let component: Calendar.Component = calendarPeriod == "month" ? .month : calendarPeriod == "week" ? .weekOfYear : .day
                                if let next = Calendar.current.date(byAdding: component, value: 1, to: calendarCursor) { calendarCursor = next }
                            }
                            Button("calendar.today") { calendarCursor = Date() }
                        }
                        Picker("calendar.period", selection: $calendarPeriod) {
                            Text("calendar.month").tag("month")
                            Text("calendar.week").tag("week")
                            Text("calendar.day").tag("day")
                        }
                        .pickerStyle(.segmented)
                    }
                    Section("calendar.feed") {
                        if api.calendarICS.isEmpty {
                            Button("calendar.prepare_feed") { Task { await api.loadCalendarFeed() } }
                        } else {
                            ShareLink(item: api.calendarICS) { Label("calendar.share_feed", systemImage: "square.and.arrow.up") }
                        }
                    }
                }
                Section("event.create") {
                    TextField("event.title", text: $newEventTitle)
                    Picker("event.type", selection: $newEventType) {
                        Text("event.rehearsal").tag("rehearsal")
                        Text("event.performance").tag("performance")
                        Text("event.other").tag("other")
                    }
                    DatePicker("event.starts_at", selection: $newEventStartsAt)
                    Button("event.create") {
                        let title = newEventTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { await api.createEvent(title: title, type: newEventType, startsAt: newEventStartsAt); newEventTitle = "" }
                    }
                    .disabled(newEventTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                }
                ForEach(calendarVisibleItems(api.destinationItems, enabled: id == "groupCalendar", period: calendarPeriod, cursor: calendarCursor)) { item in
                    EventDestinationRow(api: api, item: item)
                }
            } else if id == "groups" && api.groups.isEmpty {
                ContentUnavailableView("groups.empty", systemImage: "person.3")
            } else if id == "groups" {
                ForEach(api.groups) { group in
                    Button {
                        Task { await api.select(group) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(group.name).font(.headline)
                            Text(group.role).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            } else if api.isLoading {
                ProgressView("loading")
            } else if api.destinationItems.isEmpty {
                ContentUnavailableView("more.empty", systemImage: "tray")
            } else {
                ForEach(api.destinationItems) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(id == "notifications" ? LocalizedStringKey(notificationTitleKey(item.title)) : LocalizedStringKey(item.title)).font(.headline)
                        if !item.detail.isEmpty { Text(item.detail).font(.subheadline).foregroundStyle(.secondary) }
                        if id == "resources", let value = item.url, let url = URL(string: value), ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                            Link("resources.open_link", destination: url).buttonStyle(.bordered)
                        }
                        if id == "notifications", item.status == "unread", let notificationID = UUID(uuidString: item.id) {
                            Button("more.mark_read") { Task { await api.markNotificationRead(notificationID) } }
                                .buttonStyle(.bordered)
                        }
                        if id == "tasks", let taskID = UUID(uuidString: item.id), let version = item.version, let status = item.status {
                            Button("more.advance_task") {
                                let next = status == "open" ? "in_progress" : status == "in_progress" ? "done" : "open"
                                Task { await api.updateTaskStatus(taskID, status: next, expectedVersion: version) }
                            }
                            .buttonStyle(.bordered)
                        }
                        if id == "security", item.status == "other" {
                            Button("more.revoke_session", role: .destructive) { Task { await api.revokeSession(item.id) } }
                                .buttonStyle(.bordered)
                        }
                    }
                    .padding(.vertical, 3)
                }
            }
            if let key = api.lastErrorKey {
                Text(LocalizedStringKey(key)).foregroundStyle(.red)
            }
        }
        .navigationTitle(LocalizedStringKey(destination.titleKey))
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("song.confirm_delete", isPresented: isSongDeleteConfirmationPresented) {
            Button("song.delete", role: .destructive) {
                if let song = songToDelete { Task { await api.deleteSong(song.id, expectedVersion: song.version) } }
                songToDelete = nil
            }
            Button("people.cancel", role: .cancel) { songToDelete = nil }
        }
        .task(id: id) {
            if id != "calendar" && id != "plans" && id != "groupHelp" { await api.loadDestination(id) }
        }
        .fileImporter(isPresented: $importingResourceFile, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            guard case let .success(urls) = result,
                  let url = urls.first,
                  let arrangementID = UUID(uuidString: newResourceArrangementID),
                  url.startAccessingSecurityScopedResource() else { return }
            Task {
                defer { url.stopAccessingSecurityScopedResource() }
                let label = newResourceLabel.trimmingCharacters(in: .whitespacesAndNewlines)
                await api.uploadResourceFile(arrangementID: arrangementID, label: label.isEmpty ? url.deletingPathExtension().lastPathComponent : label, purpose: newResourcePurpose, fileURL: url, part: newResourcePart.trimmingCharacters(in: .whitespacesAndNewlines), note: newResourceNote.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }
    }

    private func createArrangement(songID: UUID) {
        let label = newArrangementLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = newArrangementKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let bpm = Int(newArrangementBpm)
        let lyrics = newArrangementLyrics
        let chords = newArrangementChords
        let structure = newArrangementStructure
        let notes = newArrangementNotes
        Task {
            await api.createArrangement(songID: songID, label: label, defaultKey: key, defaultBpm: bpm, lyrics: lyrics, chords: chords, structure: structure, notes: notes)
            newArrangementLabel = ""
            newArrangementKey = ""
            newArrangementBpm = ""
            newArrangementLyrics = ""
            newArrangementChords = ""
            newArrangementStructure = ""
            newArrangementNotes = ""
        }
    }
}

private func notificationTitleKey(_ kind: String) -> String {
    let known = ["role_changed", "invitation_created", "event_created", "task_assigned", "password_changed", "passkey_added", "passkey_removed"]
    return known.contains(kind) ? "notification.kind.\(kind)" : "notification.kind.unknown"
}

private func nativeRoleTitle(_ role: String) -> String {
    switch role {
    case "Owner": return "people.role.owner"
    case "Manager": return "people.role.manager"
    case "Member": return "people.role.member"
    case "Viewer": return "people.role.viewer"
    default: return "people.change_role"
    }
}

private let brandingTextFieldKeys = ["accentColorHex", "successHex", "warningHex", "errorHex", "typography", "themeDefault", "defaultLocale", "welcomeText", "loginHeadline", "tagline", "verse"]
private let brandingAppearanceFieldKeys = ["themeId", "intensity", "gradientStyle", "coverKind", "coverValue"]

private struct ProfileDestinationContent: View {
    @ObservedObject var api: MobileAPI
    @State private var displayName = ""
    @State private var groupName = ""

    var body: some View {
        Section {
            TextField("more.profile_name", text: $displayName)
            Button("more.save") {
                let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                Task { await api.updateProfile(displayName: name) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
        }
        .onChange(of: api.destinationItems) { _, items in
            if displayName.isEmpty, let current = items.first?.title { displayName = current }
        }
    }
}

private struct PlansDestinationContent: View {
    @ObservedObject var api: MobileAPI
    @State private var selectedPlanIDs: [UUID: String] = [:]

    var body: some View {
        List {
            Section("plans.billing_status") {
                if let provider = api.paymentProvider {
                    Text(LocalizedStringKey(provider.provider == "sandbox" ? "plans.provider.sandbox" : "plans.provider.manual"))
                    if provider.provider == "sandbox" && !provider.configured {
                        Text("plans.provider_unavailable").font(.caption).foregroundStyle(.secondary)
                    }
                } else if api.isLoading {
                    ProgressView("loading")
                }
            }
            Section("plans.groups_title") {
                if api.groups.isEmpty && !api.isLoading {
                    ContentUnavailableView("plans.no_groups", systemImage: "person.3")
                }
                ForEach(api.groups) { group in
                    if let usage = api.planUsageByGroup[group.id] {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(group.name).font(.headline)
                            LabeledContent("plans.plan", value: planName(usage.planId))
                            LabeledContent("plans.members", value: metricValue(usage.members))
                            LabeledContent("plans.songs", value: metricValue(usage.songs))
                            LabeledContent("plans.setlists", value: metricValue(usage.setlists))
                            LabeledContent("plans.events", value: metricValue(usage.eventsThisMonth))
                            LabeledContent("plans.storage", value: storageValue(usage.storageBytes))
                            LabeledContent("plans.billing_state", value: usage.billingStatus)
                            if let trialEndsAt = usage.trialEndsAt {
                                LabeledContent("plans.trial_ends", value: trialEndsAt)
                            }
                            if let scheduled = usage.scheduledPlanId {
                                LabeledContent("plans.scheduled_plan", value: planName(scheduled))
                            }
                            if group.role.lowercased() == "owner" {
                                Picker("plans.choose_plan", selection: planSelection(group.id, current: usage.planId)) {
                                    ForEach(api.planOptions) { plan in Text(LocalizedStringKey("plans.name.\(plan.id)")).tag(plan.id) }
                                }
                                Button("plans.assign_plan") {
                                    Task { await api.updatePlan(groupID: group.id, planID: selectedPlanIDs[group.id] ?? usage.planId) }
                                }
                                .disabled(api.isLoading || (selectedPlanIDs[group.id] ?? usage.planId) == usage.planId)
                                if api.paymentProvider?.provider == "sandbox", api.paymentProvider?.configured == true {
                                    Button("plans.checkout") {
                                        Task {
                                            guard let url = await api.startGroupCheckout(groupID: group.id, planID: selectedPlanIDs[group.id] ?? usage.planId) else { return }
                                            await UIApplication.shared.open(url)
                                        }
                                    }
                                    .disabled(api.isLoading)
                                }
                            } else {
                                Text("plans.read_only").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    } else if api.isLoading {
                        HStack { Text(group.name); Spacer(); ProgressView() }
                    }
                }
            }
            if let errorKey = api.lastErrorKey { Text(LocalizedStringKey(errorKey)).foregroundStyle(.red) }
            Section {
                Text("plans.provisional_note").font(.caption).foregroundStyle(.secondary)
            }
        }
        .task { await api.loadPlanOverview() }
    }

    private func planSelection(_ groupID: UUID, current: String) -> Binding<String> {
        Binding(get: { selectedPlanIDs[groupID] ?? current }, set: { selectedPlanIDs[groupID] = $0 })
    }

    private func planName(_ id: String) -> String {
        NSLocalizedString("plans.name.\(id)", comment: "Plan name")
    }

    private func metricValue(_ metric: MobileUsageMetric) -> String {
        guard let limit = metric.limit else { return "\(metric.used) · \(NSLocalizedString("plans.unlimited", comment: "Unlimited plan limit"))" }
        return "\(metric.used) / \(limit)"
    }

    private func storageValue(_ metric: MobileUsageMetric) -> String {
        let used = ByteCountFormatter.string(fromByteCount: Int64(metric.used), countStyle: .file)
        guard let limit = metric.limit else { return "\(used) · \(NSLocalizedString("plans.unlimited", comment: "Unlimited plan limit"))" }
        return "\(used) / \(ByteCountFormatter.string(fromByteCount: Int64(limit), countStyle: .file))"
    }
}

private struct GlobalCalendarDestinationContent: View {
    @ObservedObject var api: MobileAPI
    @Binding var selectedTab: AppTab
    @State private var period = "month"
    @State private var cursor = Date()
    @State private var selectedGroupIDs: Set<String> = []
    @State private var otherOnly = false
    @State private var onlyMine = false
    @State private var createGroupID = ""
    @State private var newTitle = ""
    @State private var newType = "rehearsal"
    @State private var newStartsAt = Date()

    private var dateInterval: DateInterval {
        let component: Calendar.Component = period == "month" ? .month : period == "week" ? .weekOfYear : .day
        return Calendar.current.dateInterval(of: component, for: cursor) ?? DateInterval(start: cursor, duration: 86_400)
    }

    private var visibleEvents: [MobileCalendarEvent] {
        api.globalCalendarEvents.filter { event in
            if !selectedGroupIDs.isEmpty, !selectedGroupIDs.contains(event.groupId.uuidString) { return false }
            if otherOnly, event.type != "other" { return false }
            if onlyMine, event.myResponse == nil { return false }
            return true
        }.sorted { $0.startsAt < $1.startsAt }
    }

    var body: some View {
        List {
            Section("calendar.period") {
                HStack {
                    Button("calendar.prev") { shift(-1) }
                    Spacer()
                    Text(cursor.formatted(.dateTime.month(.wide).year())).font(.headline)
                    Spacer()
                    Button("calendar.next") { shift(1) }
                    Button("calendar.today") { cursor = Date() }
                }
                Picker("calendar.period", selection: $period) {
                    Text("calendar.month").tag("month")
                    Text("calendar.week").tag("week")
                    Text("calendar.day").tag("day")
                }
                .pickerStyle(.segmented)
            }
            Section("calendar.filters") {
                Button("calendar.all_groups") { selectedGroupIDs.removeAll() }
                ForEach(api.groups) { group in
                    Toggle(group.name, isOn: Binding(
                        get: { selectedGroupIDs.contains(group.id.uuidString) },
                        set: { isSelected in
                            if isSelected { selectedGroupIDs.insert(group.id.uuidString) }
                            else { selectedGroupIDs.remove(group.id.uuidString) }
                        }
                    ))
                }
                Toggle("calendar.other_only", isOn: $otherOnly)
                Toggle("calendar.only_mine", isOn: $onlyMine)
            }
            Section("calendar.new_event") {
                Picker("calendar.group", selection: $createGroupID) {
                    ForEach(api.groups) { group in Text(group.name).tag(group.id.uuidString) }
                }
                TextField("calendar.title_field", text: $newTitle)
                    .textInputAutocapitalization(.sentences)
                Picker("calendar.type", selection: $newType) {
                    Text("calendar.type_rehearsal").tag("rehearsal")
                    Text("calendar.type_performance").tag("performance")
                    Text("calendar.type_other").tag("other")
                }
                DatePicker("calendar.date_time", selection: $newStartsAt)
                Button("calendar.create_event") {
                    guard let group = api.groups.first(where: { $0.id.uuidString == createGroupID }) ?? api.groups.first,
                          !newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                    Task {
                        await api.select(group)
                        await api.createEvent(title: newTitle.trimmingCharacters(in: .whitespacesAndNewlines), type: newType, startsAt: newStartsAt)
                        newTitle = ""
                        await api.loadGlobalCalendar(from: dateInterval.start, to: dateInterval.end)
                    }
                }
                .disabled(api.groups.isEmpty || newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
            }
            Section("calendar.events") {
                if visibleEvents.isEmpty && !api.isLoading { ContentUnavailableView("events.empty", systemImage: "calendar") }
                ForEach(visibleEvents) { event in
                    Button {
                        Task {
                            if let group = api.groups.first(where: { $0.id == event.groupId }) { await api.select(group) }
                            await api.openEvent(groupID: event.groupId, eventID: event.eventId)
                            selectedTab = .events
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(event.title).font(.headline)
                            Text(event.groupName).font(.subheadline)
                            Text(event.startsAt.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if api.isLoading { ProgressView("loading") }
            if let errorKey = api.lastErrorKey { Text(LocalizedStringKey(errorKey)).foregroundStyle(.red) }
        }
        .task(id: "\(period)-\(cursor.timeIntervalSince1970)") {
            createGroupID = api.groups.first?.id.uuidString ?? ""
            await api.loadGlobalCalendar(from: dateInterval.start, to: dateInterval.end)
        }
    }

    private func shift(_ offset: Int) {
        let component: Calendar.Component = period == "month" ? .month : period == "week" ? .weekOfYear : .day
        if let next = Calendar.current.date(byAdding: component, value: offset, to: cursor) { cursor = next }
    }
}

private struct GroupHomeDestinationContent: View {
    @ObservedObject var api: MobileAPI
    @Binding var selectedTab: AppTab

    private var upcomingEvents: [MobileEvent] {
        api.events.filter { $0.status == "scheduled" && $0.startsAt.timeIntervalSinceNow >= -12 * 60 * 60 }
            .sorted { $0.startsAt < $1.startsAt }
            .prefix(4)
            .map { $0 }
    }

    var body: some View {
        List {
            Section("group_home.overview") {
                LabeledContent("group_home.songs", value: "\(api.groupHomeSongs.count)")
                LabeledContent("group_home.setlists", value: "\(api.setlists.count)")
                LabeledContent("group_home.events", value: "\(api.events.count)")
            }
            Section("group_home.upcoming") {
                if upcomingEvents.isEmpty && !api.isLoading { ContentUnavailableView("group_home.no_upcoming", systemImage: "calendar") }
                ForEach(upcomingEvents) { event in
                    Button {
                        Task {
                            await api.openEvent(event)
                            selectedTab = .events
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(event.title).font(.headline)
                            Text(event.startsAt.formatted(date: .abbreviated, time: .shortened)).font(.subheadline).foregroundStyle(.secondary)
                            Text(LocalizedStringKey("event.\(event.type)")).font(.caption)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            Section("group_home.recent_songs") {
                if api.groupHomeSongs.isEmpty && !api.isLoading { ContentUnavailableView("group_home.no_songs", systemImage: "music.note") }
                ForEach(api.groupHomeSongs.prefix(4)) { song in
                    Text(song.title)
                }
            }
            Section("group_home.quick_actions") {
                NavigationLink(value: "songs") { Label("group_home.add_song", systemImage: "plus") }
                NavigationLink(value: "setlists") { Label("group_home.create_setlist", systemImage: "plus") }
                NavigationLink(value: "events") { Label("group_home.create_event", systemImage: "plus") }
                NavigationLink(value: "tasks") { Label("group_home.create_task", systemImage: "plus") }
                NavigationLink(value: "resources") { Label("group_home.add_resource", systemImage: "plus") }
            }
            if api.isLoading { ProgressView("loading") }
            if let errorKey = api.lastErrorKey { Text(LocalizedStringKey(errorKey)).foregroundStyle(.red) }
        }
    }
}

private struct GroupSettingsContent: View {
    @ObservedObject var api: MobileAPI
    @State private var groupName = ""
    @State private var displayName = ""
    @State private var accentHex = "#6558C7"
    @State private var secondaryHex = "#24304A"
    @State private var additionalFields: [String: String] = [:]
    @State private var showCredit = true
    @State private var notifyRoleChanges = true
    @State private var notifyTaskAssignments = true
    @State private var isImportingAsset = false
    @State private var assetKind = "logo"
    @State private var confirmingGroupDelete = false

    var body: some View {
        Group {
            if api.selectedGroup?.role == "Owner" {
                Section("settings.group_general") {
                    TextField("settings.group_name", text: $groupName)
                    Button("settings.rename_group") { Task { await api.renameSelectedGroup(groupName.trimmingCharacters(in: .whitespacesAndNewlines)) } }
                        .disabled(groupName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.selectedGroupVersion == nil || api.isLoading)
                    Button("settings.delete_group", role: .destructive) { confirmingGroupDelete = true }
                        .disabled(api.selectedGroupVersion == nil || api.isLoading)
                }
                Section("settings.branding") {
                    TextField("settings.display_name", text: $displayName)
                    TextField("settings.accent", text: $accentHex)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("settings.secondary", text: $secondaryHex)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    BrandingTextFields(fields: $additionalFields)
                    BrandingAppearanceFields(fields: $additionalFields, accentHex: $accentHex, secondaryHex: $secondaryHex)
                    Toggle("branding.show_credit", isOn: $showCredit)
                    HStack {
                        Button("branding.upload_logo") { chooseAsset("logo") }
                        Button("branding.upload_banner") { chooseAsset("banner") }
                        Button("branding.upload_favicon") { chooseAsset("favicon") }
                    }
                    Button("settings.save_branding", action: save)
                        .disabled(displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                }
            }
            Section("settings.tabPlan") {
                ForEach(api.groupUsageItems) { item in
                    LabeledContent(item.title, value: item.detail)
                }
                if api.groupUsageItems.isEmpty { ProgressView("loading") }
            }
            Section("settings.tabIntegrations") {
                Text("settings.calendarIntegrationTitle")
                Text("settings.calendarIntegrationHelp").font(.caption).foregroundStyle(.secondary)
                Button("calendar.share_feed") { Task { await api.loadCalendarFeed() } }
                    .disabled(api.isLoading)
                if !api.calendarICS.isEmpty { ShareLink(item: api.calendarICS) { Label("calendar.share_feed", systemImage: "square.and.arrow.up") } }
            }
            Section("settings.current_branding") {
                ForEach(api.destinationItems.filter { !["displayName", "accentHex", "secondaryHex", "version"].contains($0.id) }) { item in
                    LabeledContent(item.title, value: item.detail)
                }
            }
            Section("settings.group_notifications") {
                Toggle("settings.notify_role_changes", isOn: $notifyRoleChanges)
                Toggle("settings.notify_task_assignments", isOn: $notifyTaskAssignments)
                Button("settings.save_notifications") {
                    Task { await api.updateGroupNotificationPreferences(MobileGroupNotificationPreferences(notifyRoleChanges: notifyRoleChanges, notifyTaskAssignments: notifyTaskAssignments)) }
                }
            }
        }
        .onChange(of: api.destinationItems, initial: true) { _, items in apply(items) }
        .onChange(of: api.selectedGroup, initial: true) { _, group in groupName = group?.name ?? "" }
        .onChange(of: api.groupNotificationPreferences, initial: true) { _, preferences in
            guard let preferences else { return }
            notifyRoleChanges = preferences.notifyRoleChanges
            notifyTaskAssignments = preferences.notifyTaskAssignments
        }
        .fileImporter(isPresented: $isImportingAsset, allowedContentTypes: [.image], allowsMultipleSelection: false) { result in
            guard case let .success(urls) = result, let url = urls.first, url.startAccessingSecurityScopedResource() else { return }
            Task {
                defer { url.stopAccessingSecurityScopedResource() }
                await api.uploadBrandingAsset(kind: assetKind, fileURL: url)
            }
        }
        .confirmationDialog("settings.delete_group_confirm", isPresented: $confirmingGroupDelete) {
            Button("settings.delete_group", role: .destructive) { Task { await api.deleteSelectedGroup() } }
            Button("people.cancel", role: .cancel) { confirmingGroupDelete = false }
        } message: {
            Text("settings.delete_group_message")
        }
    }

    private func apply(_ items: [MobileDataItem]) {
        displayName = items.first(where: { $0.id == "displayName" }).map { $0.detail.isEmpty ? (api.selectedGroup?.name ?? "") : $0.detail } ?? api.selectedGroup?.name ?? ""
        accentHex = items.first(where: { $0.id == "accentHex" })?.detail ?? accentHex
        secondaryHex = items.first(where: { $0.id == "secondaryHex" })?.detail ?? secondaryHex
        additionalFields = Dictionary(uniqueKeysWithValues: (brandingTextFieldKeys + brandingAppearanceFieldKeys).map { key in (key, items.first(where: { $0.id == key })?.detail ?? "") })
        showCredit = items.first(where: { $0.id == "showSonivoCredit" })?.detail.lowercased() != "false"
    }

    private func save() {
        guard let version = api.destinationItems.first(where: { $0.id == "version" }).flatMap({ Int($0.detail) }) else { return }
        var fields = additionalFields
        fields["showSonivoCredit"] = showCredit ? "true" : "false"
        Task { await api.updateBranding(displayName: displayName, accentHex: accentHex, secondaryHex: secondaryHex, expectedVersion: version, additionalFields: fields) }
    }

    private func chooseAsset(_ kind: String) {
        assetKind = kind
        isImportingAsset = true
    }
}

private struct BrandingTextFields: View {
    @Binding var fields: [String: String]

    var body: some View {
        ForEach(brandingTextFieldKeys, id: \.self) { key in
            TextField(LocalizedStringKey(labelKey(for: key)), text: binding(for: key), axis: multiline(key) ? .vertical : .horizontal)
                .lineLimit(multiline(key) ? 2...5 : 1...1)
                .textInputAutocapitalization(key.hasSuffix("Hex") ? .never : .sentences)
                .autocorrectionDisabled(key.hasSuffix("Hex"))
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(get: { fields[key, default: ""] }, set: { fields[key] = $0 })
    }

    private func multiline(_ key: String) -> Bool {
        ["welcomeText", "tagline", "verse"].contains(key)
    }

    private func labelKey(for key: String) -> String {
        switch key {
        case "accentColorHex": return "branding.accent_color"
        case "successHex": return "branding.success_color"
        case "warningHex": return "branding.warning_color"
        case "errorHex": return "branding.error_color"
        case "typography": return "branding.typography"
        case "themeDefault": return "branding.default_theme"
        case "defaultLocale": return "branding.default_locale"
        case "welcomeText": return "branding.welcome_text"
        case "loginHeadline": return "branding.login_headline"
        case "tagline": return "branding.tagline"
        default: return "branding.verse"
        }
    }
}

private struct BrandingAppearanceFields: View {
    @Binding var fields: [String: String]
    @Binding var accentHex: String
    @Binding var secondaryHex: String

    private let themes: [(id: String, primary: String, secondary: String)] = [
        ("sonivo", "#8366F1", "#E8C4F6"), ("emerald", "#047857", "#0E7490"),
        ("ocean", "#0369A1", "#4338CA"), ("indigo", "#4338CA", "#BE185D"),
        ("violet", "#7C3AED", "#0369A1"), ("fuchsia", "#BE185D", "#7C3AED"),
        ("crimson", "#B91C1C", "#B45309"), ("amber", "#B45309", "#047857"),
        ("turquoise", "#0F766E", "#0369A1"), ("graphite", "#1F2937", "#64748B")
    ]

    var body: some View {
        Picker("branding.theme", selection: themeSelection) {
            ForEach(themes, id: \.id) { theme in
                Text(LocalizedStringKey("branding.theme.\(theme.id)")).tag(theme.id)
            }
        }
        Picker("branding.intensity", selection: binding(for: "intensity")) {
            Text("branding.intensity.subtle").tag("subtle")
            Text("branding.intensity.medium").tag("medium")
            Text("branding.intensity.intense").tag("intense")
        }
        Picker("branding.gradient_style", selection: binding(for: "gradientStyle")) {
            Text("branding.gradient.fixed").tag("fixed")
            Text("branding.gradient.liquid").tag("liquid")
        }
        Picker("branding.cover", selection: coverSelection) {
            Text("branding.cover.none").tag("")
            ForEach(["soundwave", "stage", "vinyl", "choir"], id: \.self) { value in
                Text(LocalizedStringKey("branding.cover.preset.\(value)")).tag("preset:\(value)")
            }
            ForEach(["violet", "ocean", "forest", "sunset"], id: \.self) { value in
                Text(LocalizedStringKey("branding.cover.gradient.\(value)")).tag("gradient:\(value)")
            }
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(get: { fields[key, default: defaultValue(for: key)] }, set: { fields[key] = $0 })
    }

    private var themeSelection: Binding<String> {
        Binding(get: { fields["themeId", default: "sonivo"] }, set: { value in
            fields["themeId"] = value
            if let theme = themes.first(where: { $0.id == value }) {
                accentHex = theme.primary
                secondaryHex = theme.secondary
            }
        })
    }

    private var coverSelection: Binding<String> {
        Binding(
            get: {
                let kind = fields["coverKind"] ?? ""
                let value = fields["coverValue"] ?? ""
                return kind.isEmpty ? "" : "\(kind):\(value)"
            },
            set: { selection in
                guard let separator = selection.firstIndex(of: ":") else {
                    fields["coverKind"] = ""
                    fields["coverValue"] = ""
                    return
                }
                fields["coverKind"] = String(selection[..<separator])
                fields["coverValue"] = String(selection[selection.index(after: separator)...])
            }
        )
    }

    private func defaultValue(for key: String) -> String {
        switch key {
        case "themeId": return "sonivo"
        case "intensity": return "medium"
        case "gradientStyle": return "fixed"
        default: return ""
        }
    }
}

private struct TaskDestinationRow: View {
    @ObservedObject var api: MobileAPI
    let item: MobileDataItem
    @State private var isEditing = false
    @State private var title = ""
    @State private var notes = ""
    @State private var dueEnabled = false
    @State private var dueAt = Date()
    @State private var assigneeID: UUID?
    @State private var deleteConfirmationPresented = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if isEditing {
                TextField("task.new_title", text: $title)
                TextField("task.notes", text: $notes, axis: .vertical).lineLimit(2...5)
                Toggle("task.has_due_date", isOn: $dueEnabled)
                if dueEnabled { DatePicker("task.due_date", selection: $dueAt) }
                assigneePicker
                Button("more.save", action: save)
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
            } else {
                Text(item.title).font(.headline)
                if !item.detail.isEmpty { Text(item.detail).font(.subheadline).foregroundStyle(.secondary) }
                if let assignee = item.assigneeUserID, let member = api.taskAssignees.first(where: { $0.id == assignee }) {
                    Text("task.assigned_to \(member.title)").font(.caption).foregroundStyle(.secondary)
                }
                taskActions
            }
        }
        .confirmationDialog("task.confirm_delete", isPresented: $deleteConfirmationPresented) {
            Button("task.delete", role: .destructive) { deleteTask() }
            Button("people.cancel", role: .cancel) { deleteConfirmationPresented = false }
        }
    }

    private var assigneePicker: some View {
        Picker("task.assignee", selection: $assigneeID) {
            Text("task.unassigned").tag(Optional<UUID>.none)
            ForEach(api.taskAssignees) { member in
                if let userID = UUID(uuidString: member.id) { Text(member.title).tag(Optional(userID)) }
            }
        }
    }

    @ViewBuilder
    private var taskActions: some View {
        if let taskID = UUID(uuidString: item.id), let version = item.version {
            HStack {
                Button("task.edit", action: beginEditing)
                if let status = item.status {
                    Button("more.advance_task") {
                        let next = status == "open" ? "in_progress" : status == "in_progress" ? "done" : "open"
                        Task { await api.updateTaskStatus(taskID, status: next, expectedVersion: version) }
                    }
                }
                Button("task.delete", role: .destructive) { deleteConfirmationPresented = true }
            }
            .buttonStyle(.bordered)
        }
    }

    private func beginEditing() {
        title = item.title
        notes = item.notes ?? ""
        if let raw = item.dueAt, let parsed = ISO8601DateFormatter().date(from: raw) {
            dueEnabled = true
            dueAt = parsed
        } else {
            dueEnabled = false
        }
        assigneeID = item.assigneeUserID.flatMap(UUID.init(uuidString:))
        isEditing = true
    }

    private func save() {
        guard let taskID = UUID(uuidString: item.id), let version = item.version else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await api.updateTask(taskID, title: trimmedTitle, notes: trimmedNotes.isEmpty ? nil : trimmedNotes, expectedVersion: version, dueAt: dueEnabled ? dueAt : nil, assigneeUserID: assigneeID)
            isEditing = false
        }
    }

    private func deleteTask() {
        if let taskID = UUID(uuidString: item.id), let version = item.version {
            Task { await api.deleteTask(taskID, expectedVersion: version) }
        }
        deleteConfirmationPresented = false
    }
}

private struct ResourceDestinationRow: View {
    @ObservedObject var api: MobileAPI
    let item: MobileDataItem
    @State private var isEditing = false
    @State private var label = ""
    @State private var part = ""
    @State private var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            if isEditing {
                TextField("resource.label", text: $label)
                TextField("resource.part", text: $part)
                TextField("resource.note", text: $note, axis: .vertical).lineLimit(2...5)
                HStack {
                    Button("people.cancel") { isEditing = false }.buttonStyle(.bordered)
                    Button("more.save", action: save).buttonStyle(.borderedProminent)
                        .disabled(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
                }
            } else {
                Text(item.title).font(.headline)
                if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                if let part = item.part, !part.isEmpty { Text(part).font(.caption).foregroundStyle(.secondary) }
                if let note = item.notes, !note.isEmpty { Text(note).font(.caption).foregroundStyle(.secondary) }
                if item.kind == "link", item.arrangementID != nil {
                    Button("resource.edit") {
                        label = item.title
                        part = item.part ?? ""
                        note = item.notes ?? ""
                        isEditing = true
                    }.buttonStyle(.bordered)
                }
                if let value = item.url, let url = URL(string: value), ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                    Link("resources.open_link", destination: url).buttonStyle(.bordered)
                }
                resourceFileActions
                if let resourceID = UUID(uuidString: item.id), let arrangementID = item.arrangementID.flatMap(UUID.init(uuidString:)) {
                    Button("resource.delete", role: .destructive) { Task { await api.deleteResource(arrangementID: arrangementID, resourceID: resourceID) } }
                }
            }
        }
    }

    @ViewBuilder
    private var resourceFileActions: some View {
        if item.kind == "file", let resourceID = UUID(uuidString: item.id), let arrangementID = item.arrangementID.flatMap(UUID.init(uuidString:)) {
            Button("resource.download") { Task { await api.downloadResource(arrangementID: arrangementID, resourceID: resourceID, fileName: item.originalFileName ?? item.title) } }
                .buttonStyle(.bordered)
            if let url = api.downloadedResourceURL {
                ShareLink(item: url) { Label("resource.share_file", systemImage: "square.and.arrow.up") }
            }
        }
    }

    private func save() {
        guard let resourceID = UUID(uuidString: item.id), let arrangementID = item.arrangementID.flatMap(UUID.init(uuidString:)) else { return }
        Task {
            await api.updateLinkResource(arrangementID: arrangementID, resourceID: resourceID, label: label.trimmingCharacters(in: .whitespacesAndNewlines), part: part.trimmingCharacters(in: .whitespacesAndNewlines), note: note.trimmingCharacters(in: .whitespacesAndNewlines))
            isEditing = false
        }
    }
}

private struct PeopleMemberRow: View {
    @ObservedObject var api: MobileAPI
    let item: MobileDataItem
    @State private var memberToRemove: UUID?
    @State private var showingResourceAccess = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(item.title).font(.headline)
            if !item.detail.isEmpty { Text(item.detail).font(.caption).foregroundStyle(.secondary) }
            memberActions
        }
        .confirmationDialog("people.confirm_remove_title", isPresented: isRemoveConfirmationPresented) {
            Button("people.remove_member", role: .destructive) { removeMember() }
            Button("people.cancel", role: .cancel) { memberToRemove = nil }
        }
        .sheet(isPresented: $showingResourceAccess) {
            NavigationStack {
                List(api.resourceAccessRows) { row in
                    HStack {
                        Text(row.label).font(.subheadline)
                        Spacer(minLength: 8)
                        Menu {
                            Button("resource_access.inherit") { setAccess(row, nil) }
                            Button("resource_access.allow") { setAccess(row, true) }
                            Button("resource_access.deny") { setAccess(row, false) }
                        } label: {
                            Text(row.granted == nil ? "resource_access.inherit" : row.granted == true ? "resource_access.allow" : "resource_access.deny")
                                .font(.caption)
                        }
                    }
                }
                .navigationTitle("resource_access.title")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("common.done") { showingResourceAccess = false } } }
            }
        }
    }

    @ViewBuilder
    private var memberActions: some View {
        HStack {
            if api.selectedGroup?.role == "Owner", let userID = UUID(uuidString: item.id) {
                Button("resource_access.manage") {
                    Task { await api.loadMemberResourceAccess(userID); showingResourceAccess = true }
                }
            }
            Menu {
                ForEach(["Owner", "Manager", "Member", "Viewer"], id: \.self) { role in
                    Button(LocalizedStringKey(nativeRoleTitle(role))) {
                        if let userID = UUID(uuidString: item.id) {
                            Task { await api.changeMemberRole(userID, role: role) }
                        }
                    }
                }
            } label: {
                Text(LocalizedStringKey(item.status.map(nativeRoleTitle) ?? "people.change_role"))
            }
            if let isEnabled = item.isEnabled, let userID = UUID(uuidString: item.id) {
                Button(isEnabled ? "people.disable_access" : "people.enable_access") {
                    Task { await api.setMemberAccess(userID, enabled: !isEnabled) }
                }
            }
            if api.selectedGroup?.role == "Owner", let userID = UUID(uuidString: item.id) {
                let customRoles = api.groupRoleItems.filter { $0.isSystem != true }
                if !customRoles.isEmpty {
                    Menu("groupRole.assign") {
                        ForEach(customRoles) { role in
                            if let roleID = UUID(uuidString: role.id) {
                                Button(role.title) { Task { await api.assignGroupRole(roleID, to: userID) } }
                            }
                        }
                    }
                }
            }
            if let userID = UUID(uuidString: item.id) {
                Button("people.remove_member", role: .destructive) { memberToRemove = userID }
            }
        }
    }

    private func setAccess(_ row: MobileResourceAccessRow, _ granted: Bool?) {
        guard let userID = UUID(uuidString: item.id) else { return }
        Task { await api.setMemberResourceAccess(userID, row: row, granted: granted) }
    }

    private var isRemoveConfirmationPresented: Binding<Bool> {
        Binding(get: { memberToRemove != nil }, set: { if !$0 { memberToRemove = nil } })
    }

    private func removeMember() {
        if let userID = memberToRemove { Task { await api.removeMember(userID) } }
        memberToRemove = nil
    }
}

private struct EventDestinationRow: View {
    @ObservedObject var api: MobileAPI
    let item: MobileDataItem

    @State private var isEditing = false
    @State private var title = ""
    @State private var eventType = "rehearsal"
    @State private var startsAt = Date()
    @State private var eventToCancel: (id: UUID, version: Int)?
    @State private var setlistApplication: (eventID: UUID, version: Int, setlistID: UUID)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isEditing {
                TextField("event.title", text: $title)
                Picker("event.type", selection: $eventType) {
                    Text("event.rehearsal").tag("rehearsal")
                    Text("event.performance").tag("performance")
                    Text("event.other").tag("other")
                }
                DatePicker("event.starts_at", selection: $startsAt)
                Button("more.save", action: save)
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || api.isLoading)
            } else {
                Text(item.title).font(.headline)
                if !item.detail.isEmpty {
                    Text(item.detail).font(.subheadline).foregroundStyle(.secondary)
                }
                eventActions
            }
        }
        .confirmationDialog("event.confirm_cancel", isPresented: isCancelConfirmationPresented) {
            Button("event.cancel_action", role: .destructive) { cancelEvent() }
            Button("people.cancel", role: .cancel) { eventToCancel = nil }
        }
        .confirmationDialog("event.confirm_apply_setlist", isPresented: isSetlistConfirmationPresented) {
            Button("event.apply_setlist", role: .destructive) { applySetlist() }
            Button("people.cancel", role: .cancel) { setlistApplication = nil }
        }
    }

    @ViewBuilder
    private var eventActions: some View {
        if let eventID = UUID(uuidString: item.id), let version = item.version, item.status != "cancelled" {
            HStack {
                Button("event.edit", action: beginEditing)
                Button("event.cancel_action", role: .destructive) { eventToCancel = (eventID, version) }
                setlistAction(eventID: eventID, version: version)
                Button("event.duplicate") { Task { await api.duplicateEvent(eventID, expectedVersion: version) } }
            }
            .buttonStyle(.bordered)
        }
    }

    @ViewBuilder
    private func setlistAction(eventID: UUID, version: Int) -> some View {
        if api.setlists.isEmpty {
            Text("event.no_setlists").font(.caption).foregroundStyle(.secondary)
        } else {
            Menu("event.apply_setlist") {
                ForEach(api.setlists) { setlist in
                    Button(setlist.name) { setlistApplication = (eventID, version, setlist.id) }
                }
            }
        }
    }

    private var isCancelConfirmationPresented: Binding<Bool> {
        Binding(get: { eventToCancel != nil }, set: { if !$0 { eventToCancel = nil } })
    }

    private var isSetlistConfirmationPresented: Binding<Bool> {
        Binding(get: { setlistApplication != nil }, set: { if !$0 { setlistApplication = nil } })
    }

    private func beginEditing() {
        title = item.title
        eventType = item.type ?? "rehearsal"
        if let value = item.startsAt, let parsed = ISO8601DateFormatter().date(from: value) {
            startsAt = parsed
        }
        isEditing = true
    }

    private func save() {
        guard let eventID = UUID(uuidString: item.id), let version = item.version else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let value = formatter.string(from: startsAt)
        Task {
            await api.updateEvent(eventID, title: trimmedTitle, type: eventType, startsAt: value, expectedVersion: version)
            isEditing = false
        }
    }

    private func cancelEvent() {
        if let event = eventToCancel {
            Task { await api.cancelEvent(event.id, expectedVersion: event.version) }
        }
        eventToCancel = nil
    }

    private func applySetlist() {
        if let application = setlistApplication {
            Task { await api.applySetlist(application.setlistID, to: application.eventID, expectedVersion: application.version) }
        }
        setlistApplication = nil
    }
}

private struct GroupListView: View {
    @ObservedObject var api: MobileAPI

    var body: some View {
        List {
            if !api.isConfigured {
                Section {
                    Label("api.not_configured", systemImage: "info.circle.fill")
                        .font(.body)
                        .foregroundStyle(SonivoBrand.ink)
                        .padding(.vertical, 8)
                }
            } else if !api.isSignedIn {
                Section {
                    Button {
                        Task { await api.signIn() }
                    } label: {
                        Label("auth.sign_in", systemImage: "person.crop.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(api.isLoading)
                    if api.pendingGroupSlug != nil {
                        Text("group_link.sign_in_to_continue")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Section {
                    ForEach(api.groups) { group in
                        Button {
                            Task { await api.select(group) }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(group.name).font(.headline).foregroundStyle(.primary)
                                Text(group.role).font(.subheadline).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    if api.groups.isEmpty && !api.isLoading {
                        ContentUnavailableView("groups.empty", systemImage: "person.3")
                    }
                } header: {
                    Text("groups.title")
                }
                Section {
                    Button("auth.sign_out", systemImage: "rectangle.portrait.and.arrow.right") {
                        Task { await api.signOut() }
                    }
                }
            }
            if api.isLoading { ProgressView("loading") }
            if let key = api.lastErrorKey { Text(LocalizedStringKey(key)).foregroundStyle(.red) }
            if let version = api.requiredVersion {
                Text("mobile.update.required \(version)").foregroundStyle(.orange)
            }
            if let url = api.updateURL { Link("mobile.update.open_store", destination: url) }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(LinearGradient(colors: [SonivoBrand.wash, SonivoBrand.canvas], startPoint: .topLeading, endPoint: .bottomTrailing))
        .listRowBackground(SonivoBrand.surface)
    }
}

private func calendarVisibleItems(_ items: [MobileDataItem], enabled: Bool, period: String, cursor: Date) -> [MobileDataItem] {
    guard enabled else { return items }
    let component: Calendar.Component
    switch period {
    case "week": component = .weekOfYear
    case "day": component = .day
    default: component = .month
    }
    guard let interval = Calendar.current.dateInterval(of: component, for: cursor) else { return [] }
    let formatter = ISO8601DateFormatter()
    return items.filter { item in
        guard let raw = item.startsAt, let date = formatter.date(from: raw) else { return false }
        return interval.contains(date)
    }
}

private struct ArrangementManagerRow: View {
    @ObservedObject var api: MobileAPI
    let arrangement: MobileArrangementSummary
    @State private var editing = false
    @State private var label: String
    @State private var key: String
    @State private var bpm: String
    @State private var lyrics = ""
    @State private var chords = ""
    @State private var structure = ""
    @State private var notes = ""
    @State private var detail: MobileArrangement?
    @State private var confirmingDelete = false

    init(api: MobileAPI, arrangement: MobileArrangementSummary) {
        self.api = api
        self.arrangement = arrangement
        _label = State(initialValue: arrangement.label)
        _key = State(initialValue: arrangement.defaultKey ?? "")
        _bpm = State(initialValue: arrangement.defaultBpm.map(String.init) ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if editing {
                TextField("arrangement.label", text: $label)
                TextField("arrangement.key", text: $key)
                TextField("arrangement.bpm", text: $bpm).keyboardType(.numberPad)
                TextField("arrangement.lyrics", text: $lyrics, axis: .vertical).lineLimit(3...8)
                TextField("arrangement.chords", text: $chords, axis: .vertical).lineLimit(3...8)
                TextField("arrangement.structure", text: $structure)
                TextField("arrangement.notes", text: $notes, axis: .vertical).lineLimit(2...5)
            } else {
                Button(arrangement.label) { Task { await api.openArrangement(arrangement.id) } }
                    .font(.subheadline.weight(.medium))
            }
            HStack {
                Button(editing ? "more.save" : "arrangement.edit") {
                    if editing {
                        guard let detail else { return }
                        Task { await api.updateArrangement(detail, label: label.trimmingCharacters(in: .whitespacesAndNewlines), defaultKey: key.trimmingCharacters(in: .whitespacesAndNewlines), defaultBpm: Int(bpm), lyrics: lyrics, chords: chords, structure: structure, notes: notes); editing = false }
                    } else {
                        Task {
                            guard let loaded = await api.arrangementForEditing(arrangement.id) else { return }
                            detail = loaded; label = loaded.label; key = loaded.defaultKey ?? ""; bpm = loaded.defaultBpm.map(String.init) ?? ""; lyrics = loaded.lyrics ?? ""; chords = loaded.chords ?? ""; structure = loaded.structure ?? ""; notes = loaded.notes ?? ""
                            editing = true
                        }
                    }
                }
                Button("arrangement.delete", role: .destructive) { confirmingDelete = true }
            }
            .buttonStyle(.bordered)
        }
        .confirmationDialog("arrangement.confirm_delete", isPresented: $confirmingDelete) {
            Button("arrangement.delete", role: .destructive) { Task { await api.deleteArrangement(arrangement) } }
            Button("people.cancel", role: .cancel) { }
        }
    }
}

private struct EventsListView: View {
    @ObservedObject var api: MobileAPI

    var body: some View {
        List {
            if let group = api.selectedGroup {
                Section("setlists.title") {
                    ForEach(api.setlists) { setlist in
                        Button {
                            Task { await api.openSetlist(setlist) }
                        } label: {
                            HStack {
                                Label(setlist.name, systemImage: "music.note.list")
                                Spacer()
                                Text("setlists.item_count \(setlist.itemCount ?? setlist.items?.count ?? 0)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        if api.selectedSetlist?.id == setlist.id {
                            ForEach(api.selectedSetlist?.items ?? []) { item in
                                VStack(alignment: .leading) {
                                    Button {
                                        Task { await api.openArrangement(item.arrangementId) }
                                    } label: {
                                        Label("\(item.songTitle ?? "") · \(item.arrangementLabel ?? "")", systemImage: "music.note")
                                    }
                                    HStack {
                                        if item.sortOrder > 0 {
                                            Button("setlist.move_up") {
                                                let ids = (api.selectedSetlist?.items ?? []).sorted { $0.sortOrder < $1.sortOrder }.map(\.arrangementId)
                                                var reordered = ids
                                                if let index = reordered.firstIndex(of: item.arrangementId) { reordered.swapAt(index, index - 1) }
                                                Task { await api.replaceSetlistItems(reordered) }
                                            }.buttonStyle(.bordered)
                                        }
                                        if item.sortOrder < (api.selectedSetlist?.items?.count ?? 0) - 1 {
                                            Button("setlist.move_down") {
                                                var reordered = (api.selectedSetlist?.items ?? []).sorted { $0.sortOrder < $1.sortOrder }.map(\.arrangementId)
                                                if let index = reordered.firstIndex(of: item.arrangementId) { reordered.swapAt(index, index + 1) }
                                                Task { await api.replaceSetlistItems(reordered) }
                                            }.buttonStyle(.bordered)
                                        }
                                        Button("setlist.remove_item", role: .destructive) {
                                            let ids = (api.selectedSetlist?.items ?? []).sorted { $0.sortOrder < $1.sortOrder }.map(\.arrangementId).filter { $0 != item.arrangementId }
                                            Task { await api.replaceSetlistItems(ids) }
                                        }.buttonStyle(.bordered)
                                    }
                                }
                            }
                            Section("setlist.add_arrangement") {
                                ForEach(api.availableSetlistArrangements.filter { choice in !(api.selectedSetlist?.items ?? []).contains(where: { $0.arrangementId == choice.id }) }) { choice in
                                    Button("\(choice.songTitle ?? "") · \(choice.label)") {
                                        let ids = (api.selectedSetlist?.items ?? []).sorted { $0.sortOrder < $1.sortOrder }.map(\.arrangementId) + [choice.id]
                                        Task { await api.replaceSetlistItems(ids) }
                                    }
                                }
                            }
                        }
                    }
                    if api.setlists.isEmpty && !api.isLoading {
                        ContentUnavailableView("setlists.empty", systemImage: "music.note.list")
                    }
                }
                Section(group.name) {
                    ForEach(api.events) { event in
                        VStack(alignment: .leading, spacing: 6) {
                            Button {
                                Task { await api.openEvent(event) }
                            } label: {
                                Text(event.title).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            Text(event.startsAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.subheadline).foregroundStyle(.secondary)
                            Text(event.type).font(.caption)
                            HStack {
                                Button("rsvp.yes") { Task { await api.submitRsvp(for: event, response: "yes") } }
                                Button("rsvp.maybe") { Task { await api.submitRsvp(for: event, response: "maybe") } }
                                Button("rsvp.no") { Task { await api.submitRsvp(for: event, response: "no") } }
                            }
                            .buttonStyle(.bordered)
                            Button(api.joinedEventID == event.id ? "events.leave_room" : "events.join_room") {
                                Task {
                                    if api.joinedEventID == event.id { await api.leavePracticeRoom() }
                                    else { await api.joinPracticeRoom(for: event) }
                                }
                            }
                            .buttonStyle(.bordered)
                            if api.selectedEvent?.id == event.id {
                                Text("event.responses").font(.subheadline.weight(.semibold))
                                if api.selectedEventRsvps.isEmpty {
                                    Text("event.no_rsvps").font(.caption).foregroundStyle(.secondary)
                                } else {
                                    ForEach(api.selectedEventRsvps) { rsvp in
                                        Text("\(rsvp.displayName) · \(NSLocalizedString("rsvp.\(rsvp.response)", comment: "RSVP response"))")
                                            .font(.caption)
                                    }
                                }
                                ForEach(api.selectedEvent?.items ?? []) { item in
                                    Button {
                                        Task { await api.openArrangement(item.arrangementId) }
                                    } label: {
                                        Label("\(item.displaySongTitle) · \(item.displayArrangementLabel)", systemImage: "music.note.list")
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    if api.events.isEmpty && !api.isLoading {
                        ContentUnavailableView("events.empty", systemImage: "calendar")
                    }
                }
            } else {
                ContentUnavailableView("events.choose_group", systemImage: "person.3")
            }
            if api.isLoading { ProgressView("loading") }
            if let key = api.lastErrorKey { Text(LocalizedStringKey(key)).foregroundStyle(.red) }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(LinearGradient(colors: [SonivoBrand.wash, SonivoBrand.canvas], startPoint: .topLeading, endPoint: .bottomTrailing))
        .listRowBackground(SonivoBrand.surface)
    }
}

private struct PracticeLandingView: View {
    @ObservedObject var api: MobileAPI
    @ObservedObject var playback: PracticePlaybackEngine
    @State private var karaokeOpen = false

    var body: some View {
        Group {
            if api.selectedGroup == nil {
                ContentUnavailableView("practice.choose_group", systemImage: "music.note")
            } else if let arrangement = api.selectedArrangement {
                let sharedPosition = api.conductorPosition?.arrangementId == arrangement.id ? api.conductorPosition : nil
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text(arrangement.label).font(.title2.weight(.semibold)).lineLimit(1)
                        Spacer()
                        Button {
                            karaokeOpen = true
                        } label: {
                            Label("practice.karaoke", systemImage: "mic.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityHint("practice.karaoke.hint")
                    }
                    .padding(.horizontal)
                    if api.joinedEventID != nil {
                        Button(api.isSharingPlayhead ? "practice.stop_sharing" : "practice.share_playhead") {
                            api.togglePlayheadSharing()
                        }
                        .buttonStyle(.bordered)
                        .padding(.horizontal)
                        if let sharedPosition {
                            Text(String(format: NSLocalizedString("practice.conductor_position", comment: ""), sharedPosition.conductorDisplayName))
                                .font(.caption).foregroundStyle(.secondary).padding(.horizontal)
                        }
                    }
                    PracticeChartView(lines: chartLines(for: arrangement), positionMs: sharedPosition?.positionMs ?? Int64(playback.position * 1000))
                    HStack {
                        Button(playback.state == .playing ? "practice.pause" : "practice.play") {
                            if playback.state == .playing { playback.pause() }
                            else { playback.play() }
                        }
                        .buttonStyle(.borderedProminent)
                        Text("\(Int(playback.position)) / \(Int(playback.duration))")
                            .monospacedDigit().foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                    if playback.duration > 0 {
                        Slider(value: Binding(
                            get: { playback.position },
                            set: { playback.seek(to: $0) }
                        ), in: 0...playback.duration)
                        .padding(.horizontal)
                        .accessibilityLabel("practice.seek")
                    }
                    if playback.state == .failed {
                        Text("playback.failed").foregroundStyle(.red).padding(.horizontal)
                    }
                    ForEach(arrangement.resources.filter { $0.kind == "file" && ["audio", "click"].contains($0.purpose) }) { resource in
                        Button {
                            Task {
                                do {
                                    let (url, headers) = try await api.mediaRequest(for: resource)
                                    try playback.load(authorizedURL: url, title: resource.label, headers: headers)
                                    playback.play()
                                } catch { }
                            }
                        } label: {
                            Label(resource.label, systemImage: "headphones")
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                        .padding(.horizontal)
                    }
                }
                .padding(.vertical)
                .fullScreenCover(isPresented: $karaokeOpen) {
                    PracticeKaraokeView(
                        playback: playback,
                        groupName: api.selectedGroup?.name ?? "",
                        title: arrangement.label,
                        lines: chartLines(for: arrangement),
                        conductorPosition: sharedPosition
                    )
                }
            } else {
                ContentUnavailableView("practice.choose_arrangement", systemImage: "music.note.list")
            }
        }
        .background(LinearGradient(colors: [SonivoBrand.wash, SonivoBrand.canvas], startPoint: .topLeading, endPoint: .bottomTrailing))
        .task(id: api.joinedEventID) {
            while !Task.isCancelled {
                if let arrangement = api.selectedArrangement {
                    await api.broadcastPlayhead(
                        arrangementID: arrangement.id,
                        positionMs: Int64(playback.position * 1000),
                        playing: playback.state == .playing
                    )
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    private func chartLines(for arrangement: MobileArrangement) -> [PracticeChartLine] {
        let timing = arrangement.chordTimingJson?.data(using: .utf8)
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [[String: Any]] } ?? []
        let positions = Dictionary(
            timing.compactMap { mark -> (Int, Int64)? in
                guard let lineIndex = (mark["lineIndex"] as? NSNumber)?.intValue,
                      let atMs = (mark["atMs"] as? NSNumber)?.int64Value else { return nil }
                return (lineIndex, atMs)
            },
            uniquingKeysWith: { first, _ in first }
        )
        let source = arrangement.chords?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? arrangement.chords!
            : (arrangement.lyrics ?? "")
        return source.components(separatedBy: .newlines).enumerated().map { index, text in
            PracticeChartLine(id: index, text: text, startPositionMs: positions[index])
        }
    }
}
