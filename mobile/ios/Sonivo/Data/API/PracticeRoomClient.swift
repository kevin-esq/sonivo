import Foundation
import SignalRClient

struct MobileConductorPosition: Decodable {
    let arrangementId: UUID
    let positionMs: Int64
    let playing: Bool
    let conductorUserId: UUID
    let conductorDisplayName: String
}

private struct MobilePositionBroadcast: Encodable {
    let eventId: UUID
    let arrangementId: UUID
    let positionMs: Int64
    let playing: Bool
}

@MainActor
final class PracticeRoomClient {
    private var connection: HubConnection?
    private var isClosing = false

    func connect(
        url: String,
        eventID: UUID,
        accessTokenProvider: @escaping @Sendable () async throws -> String?,
        headers: [String: String],
        onPosition: @escaping (MobileConductorPosition) -> Void,
        onClosed: @escaping (Error?) -> Void
    ) async throws {
        guard connection == nil else { return }

        var options = HttpConnectionOptions()
        options.accessTokenFactory = accessTokenProvider
        options.headers = headers
        let hub = HubConnectionBuilder()
            .withUrl(url: url, options: options)
            .withAutomaticReconnect()
            .build()

        await hub.on("PositionUpdate") { (position: MobileConductorPosition) in
            Task { @MainActor in onPosition(position) }
        }
        await hub.onReconnected {
            do {
                try await hub.invoke(method: "JoinRoom", arguments: eventID.uuidString)
            } catch { }
        }
        await hub.onClosed { error in
            Task { @MainActor in
                if !self.isClosing { onClosed(error) }
            }
        }

        connection = hub
        do {
            try await hub.start()
            try await hub.invoke(method: "JoinRoom", arguments: eventID.uuidString)
        } catch {
            connection = nil
            await hub.stop()
            throw error
        }
    }

    func broadcast(eventID: UUID, arrangementID: UUID, positionMs: Int64, playing: Bool) async throws {
        guard let connection else { return }
        let request = MobilePositionBroadcast(
            eventId: eventID,
            arrangementId: arrangementID,
            positionMs: max(positionMs, 0),
            playing: playing
        )
        try await connection.send(method: "BroadcastPosition", arguments: request)
    }

    func close() async {
        guard let connection else { return }
        isClosing = true
        self.connection = nil
        await connection.stop()
    }
}
