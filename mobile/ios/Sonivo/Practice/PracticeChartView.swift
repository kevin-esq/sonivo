import SwiftUI

struct PracticeChartLine: Identifiable {
    let id: Int
    let text: String
    let startPositionMs: Int64?
}

struct PracticeChartView: View {
    let lines: [PracticeChartLine]
    let positionMs: Int64
    var showChords = true
    var karaoke = false

    private var activeIndex: Int? {
        lines.indices
            .filter { index in
                guard let start = lines[index].startPositionMs else { return false }
                return start <= positionMs
            }
            .max { (lines[$0].startPositionMs ?? .min) < (lines[$1].startPositionMs ?? .min) }
    }

    var body: some View {
        if lines.isEmpty {
            ContentUnavailableView("chart.empty", systemImage: "music.note.list")
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(lines) { line in
                            Text(chordProText(line.text, showChords: showChords))
                                .font(karaoke ? .system(size: 30, weight: line.id == activeIndex ? .semibold : .regular, design: .rounded) : .title3)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(karaoke ? 20 : 14)
                                .foregroundStyle(karaoke && line.id != activeIndex ? Color.white.opacity(0.58) : Color.primary)
                                .background(line.id == activeIndex ? Color.accentColor.opacity(karaoke ? 0.28 : 0.16) : .clear)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .shadow(color: karaoke && line.id == activeIndex ? Color.accentColor.opacity(0.18) : .clear, radius: 18)
                                .accessibilityAddTraits(line.id == activeIndex ? .isSelected : [])
                                .id(line.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: activeIndex) { _, index in
                    if let index { withAnimation(.easeInOut(duration: 0.2)) { proxy.scrollTo(index, anchor: .center) } }
                }
            }
        }
    }

    private func chordProText(_ source: String, showChords: Bool) -> AttributedString {
        var output = AttributedString()
        let pattern = #"\[([^\]]+)\]"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return AttributedString(source) }
        let fullRange = NSRange(source.startIndex..<source.endIndex, in: source)
        var cursor = source.startIndex
        for match in regex.matches(in: source, range: fullRange) {
            guard let chordRange = Range(match.range(at: 1), in: source),
                  let tokenRange = Range(match.range, in: source) else { continue }
            output.append(AttributedString(source[cursor..<tokenRange.lowerBound]))
            if showChords {
                var chord = AttributedString(source[chordRange])
                chord.foregroundColor = .accentColor
                chord.font = .caption.weight(.bold)
                output.append(chord)
            }
            cursor = tokenRange.upperBound
        }
        output.append(AttributedString(source[cursor...]))
        return output
    }
}
