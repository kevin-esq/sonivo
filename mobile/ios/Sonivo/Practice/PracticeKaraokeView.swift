import SwiftUI

struct PracticeKaraokeView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var playback: PracticePlaybackEngine
    let groupName: String
    let title: String
    let lines: [PracticeChartLine]
    let conductorPosition: MobileConductorPosition?
    @State private var showChords = true

    private var hasTiming: Bool { lines.contains { $0.startPositionMs != nil } }

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(groupName.uppercased())
                        .font(.caption.weight(.semibold))
                        .tracking(1.2)
                        .foregroundStyle(.white.opacity(0.58))
                        .lineLimit(1)
                    Text(title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    HStack(spacing: 5) {
                        LucideGlyph(name: "waveform", color: Color(red: 0.73, green: 0.66, blue: 1))
                            .frame(width: 16, height: 16)
                        Text("practice.karaoke").font(.caption.weight(.medium))
                    }
                }
                Spacer(minLength: 8)
                Button {
                    showChords.toggle()
                } label: {
                    LucideGlyph(name: showChords ? "eye" : "eyeOff", color: .white)
                        .frame(width: 44, height: 44)
                        .background(.white.opacity(0.1), in: Circle())
                }
                .accessibilityLabel(showChords ? "practice.hide_chords" : "practice.show_chords")
                Button {
                    dismiss()
                } label: {
                    LucideGlyph(name: "close", color: .white)
                        .frame(width: 44, height: 44)
                        .background(.white.opacity(0.1), in: Circle())
                }
                .accessibilityLabel("practice.close_karaoke")
            }
            .foregroundStyle(.white)

            if !hasTiming {
                Text("practice.karaoke.no_timing")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let conductorPosition {
                Text(String(format: NSLocalizedString("practice.conductor_position", comment: ""), conductorPosition.conductorDisplayName))
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.65))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            PracticeChartView(
                lines: lines,
                positionMs: conductorPosition?.positionMs ?? Int64(playback.position * 1000),
                showChords: showChords,
                karaoke: true
            )
            .environment(\.colorScheme, .dark)

            VStack(spacing: 8) {
                if playback.duration > 0 {
                    Slider(value: Binding(
                        get: { playback.position },
                        set: { playback.seek(to: $0) }
                    ), in: 0...playback.duration)
                    .tint(.white)
                    .accessibilityLabel("practice.seek")
                }
                HStack {
                    Text(time(playback.position))
                    Spacer()
                    Button {
                        if playback.state == .playing { playback.pause() }
                        else { playback.play() }
                    } label: {
                        LucideGlyph(name: playback.state == .playing ? "pause" : "play", color: Color(red: 0.1, green: 0.08, blue: 0.14))
                            .frame(width: 58, height: 58)
                            .background(.white, in: Circle())
                    }
                    .accessibilityLabel(playback.state == .playing ? "practice.pause" : "practice.play")
                    Spacer()
                    Text(time(playback.duration))
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .background {
            LinearGradient(
                colors: [Color(red: 0.14, green: 0.12, blue: 0.22), Color(red: 0.07, green: 0.07, blue: 0.09), .black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
    }

    private func time(_ seconds: TimeInterval) -> String {
        let value = seconds.isFinite ? max(0, Int(seconds)) : 0
        return "\(value / 60):\(String(format: "%02d", value % 60))"
    }
}

struct LucideGlyph: View {
    let name: String
    let color: Color

    var body: some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / 24
            var path = Path()
            switch name {
            case "eye":
                path.move(to: CGPoint(x: 2, y: 12))
                path.addCurve(to: CGPoint(x: 22, y: 12), control1: CGPoint(x: 6, y: 3), control2: CGPoint(x: 18, y: 3))
                path.addCurve(to: CGPoint(x: 2, y: 12), control1: CGPoint(x: 18, y: 21), control2: CGPoint(x: 6, y: 21))
                path.addEllipse(in: CGRect(x: 9, y: 9, width: 6, height: 6))
            case "eyeOff":
                path.move(to: CGPoint(x: 3, y: 3)); path.addLine(to: CGPoint(x: 21, y: 21))
                path.move(to: CGPoint(x: 10.6, y: 10.6)); path.addCurve(to: CGPoint(x: 13.7, y: 13.7), control1: CGPoint(x: 9.7, y: 11.5), control2: CGPoint(x: 12.8, y: 14.6))
                path.move(to: CGPoint(x: 9.9, y: 5.2)); path.addCurve(to: CGPoint(x: 22, y: 12), control1: CGPoint(x: 16, y: 5), control2: CGPoint(x: 19.4, y: 7))
                path.addCurve(to: CGPoint(x: 19.5, y: 15.5), control1: CGPoint(x: 21.3, y: 13.4), control2: CGPoint(x: 20.5, y: 14.5))
                path.move(to: CGPoint(x: 6.2, y: 6.2)); path.addCurve(to: CGPoint(x: 2, y: 12), control1: CGPoint(x: 4.5, y: 7.2), control2: CGPoint(x: 3.1, y: 9.1))
                path.addCurve(to: CGPoint(x: 16.6, y: 17.8), control1: CGPoint(x: 4.6, y: 17), control2: CGPoint(x: 13.7, y: 19))
            case "close":
                path.move(to: CGPoint(x: 18, y: 6)); path.addLine(to: CGPoint(x: 6, y: 18))
                path.move(to: CGPoint(x: 6, y: 6)); path.addLine(to: CGPoint(x: 18, y: 18))
            case "play":
                path.move(to: CGPoint(x: 8, y: 5)); path.addLine(to: CGPoint(x: 19, y: 12)); path.addLine(to: CGPoint(x: 8, y: 19)); path.closeSubpath()
            case "pause":
                path.move(to: CGPoint(x: 8, y: 5)); path.addLine(to: CGPoint(x: 8, y: 19))
                path.move(to: CGPoint(x: 16, y: 5)); path.addLine(to: CGPoint(x: 16, y: 19))
            case "download":
                path.move(to: CGPoint(x: 21, y: 15)); path.addLine(to: CGPoint(x: 21, y: 19)); path.addQuadCurve(to: CGPoint(x: 19, y: 21), control: CGPoint(x: 21, y: 21))
                path.addLine(to: CGPoint(x: 5, y: 21)); path.addQuadCurve(to: CGPoint(x: 3, y: 19), control: CGPoint(x: 3, y: 21)); path.addLine(to: CGPoint(x: 3, y: 15))
                path.move(to: CGPoint(x: 7, y: 10)); path.addLine(to: CGPoint(x: 12, y: 15)); path.addLine(to: CGPoint(x: 17, y: 10))
                path.move(to: CGPoint(x: 12, y: 15)); path.addLine(to: CGPoint(x: 12, y: 3))
            case "waveform":
                for (x, top, bottom) in [(3.0, 10.0, 14.0), (7.0, 6.0, 18.0), (11.0, 3.0, 21.0), (15.0, 7.0, 17.0), (19.0, 10.0, 14.0), (23.0, 11.0, 13.0)] {
                    path.move(to: CGPoint(x: x, y: top)); path.addLine(to: CGPoint(x: x, y: bottom))
                }
            default: break
            }
            let transformed = path.applying(CGAffineTransform(scaleX: scale, y: scale))
            context.stroke(transformed, with: .color(color), style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}
