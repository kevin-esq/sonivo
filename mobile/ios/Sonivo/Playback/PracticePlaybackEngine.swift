import AVFoundation
import Combine
import MediaPlayer

@MainActor
final class PracticePlaybackEngine: ObservableObject {
    enum State: Equatable {
        case idle
        case preparing
        case ready
        case playing
        case paused
        case ended
        case failed
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var position: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0

    private var player: AVPlayer?
    private var itemStatusObservation: NSKeyValueObservation?
    private var playbackEndToken: NSObjectProtocol?
    private var timeObserver: Any?
    private var notificationTokens: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default
        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in self?.handleInterruption(notification) }
        })
        notificationTokens.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in self?.handleRouteChange(notification) }
        })
        configureRemoteCommands()
    }

    func load(authorizedURL: URL, title: String, headers: [String: String] = [:]) throws {
        releasePlayer()
        state = .preparing
        guard authorizedURL.scheme?.lowercased() == "https" else {
            state = .failed
            throw URLError(.badURL)
        }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)
        } catch {
            state = .failed
            throw error
        }

        let asset = AVURLAsset(url: authorizedURL, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let item = AVPlayerItem(asset: asset)
        itemStatusObservation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            Task { @MainActor in
                switch item.status {
                case .readyToPlay: self?.state = .ready
                case .failed: self?.state = .failed
                default: self?.state = .preparing
                }
            }
        }
        playbackEndToken = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.state = .ended
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }
        }
        let engine = AVPlayer(playerItem: item)
        player = engine
        updateNowPlaying(title: title)
        timeObserver = engine.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            Task { @MainActor in
                guard let self else { return }
                self.position = time.seconds.isFinite ? time.seconds : 0
                let seconds = engine.currentItem?.duration.seconds ?? 0
                self.duration = seconds.isFinite ? seconds : 0
                self.updateNowPlaying(title: title)
            }
        }
    }

    func play() {
        guard let player else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            player.play()
            state = .playing
        } catch {
            state = .failed
        }
    }

    func pause() {
        guard let player else { return }
        player.pause()
        state = .paused
    }

    func seek(to seconds: TimeInterval) {
        guard let player else { return }
        let shouldResume = player.rate > 0
        state = .preparing
        player.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600)) { [weak self] _ in
            Task { @MainActor in
                if shouldResume { self?.play() }
                else { self?.state = .paused }
            }
        }
    }

    func releasePlayer() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        if let playbackEndToken {
            NotificationCenter.default.removeObserver(playbackEndToken)
        }
        playbackEndToken = nil
        timeObserver = nil
        player?.pause()
        player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        position = 0
        duration = 0
        state = .idle
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func configureRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { [weak self] _ in self?.play(); return .success }
        commands.pauseCommand.addTarget { [weak self] _ in self?.pause(); return .success }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.seek(to: event.positionTime)
            return .success
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began { pause() }
    }

    private func handleRouteChange(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        pause()
    }

    private func updateNowPlaying(title: String) {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: title,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyPlaybackRate: player?.rate ?? 0
        ]
    }
}
