using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// Owner-assigned timing-mark draft shaped from one transcript segment
/// (ADR-0032 Q-W32-4): <c>atMs = startMs</c>; the line is chosen by the Owner
/// in review UX. Applied via the existing PATCH <c>chordTimingJson</c> path
/// with upsert semantics — never written by the digitizer itself.
/// </summary>
public sealed record TimingMarkDraft(int LineIndex, int AtMs);

/// <summary>
/// Pure shaping of transcript segments into review drafts (ADR-0032 Q-W32-4).
/// No persistence, no Arrangement writes.
/// </summary>
public static class DigitizeSegmentMapper
{
    /// <summary>Far below the server <c>MaxMarks = 2000</c> (ADR-0032 Q-W32-6).</summary>
    public const int MaxSegments = 500;

    /// <summary>
    /// Trims texts and drops blank-text segments. Throws
    /// <see cref="TranscriptionException"/> when any kept segment has
    /// non-negative-integer-violating times.
    /// </summary>
    public static IReadOnlyList<TranscribedSegment> Clean(IReadOnlyList<TranscribedSegment> segments)
    {
        var cleaned = new List<TranscribedSegment>(segments.Count);
        foreach (var segment in segments)
        {
            var text = segment.Text?.Trim() ?? string.Empty;
            if (text.Length == 0)
            {
                continue;
            }

            if (segment.StartMs < 0 || segment.EndMs < segment.StartMs)
            {
                throw new TranscriptionException("La transcripción devolvió tiempos no válidos.");
            }

            cleaned.Add(new TranscribedSegment(segment.StartMs, segment.EndMs, text));
        }

        return cleaned;
    }

    /// <summary>
    /// Maps each segment to a timing-mark draft. <paramref name="lineIndexFor"/>
    /// receives the 0-based segment position and returns the Owner-assigned
    /// ChordPro line index.
    /// </summary>
    public static IReadOnlyList<TimingMarkDraft> ToTimingMarks(
        IReadOnlyList<TranscribedSegment> segments,
        Func<int, int> lineIndexFor)
    {
        var marks = new List<TimingMarkDraft>(segments.Count);
        for (var i = 0; i < segments.Count; i++)
        {
            var lineIndex = lineIndexFor(i);
            if (lineIndex < 0)
            {
                throw new TranscriptionException("La línea asignada debe ser un número mayor o igual a 0.");
            }

            marks.Add(new TimingMarkDraft(lineIndex, segments[i].StartMs));
        }

        return marks;
    }

    /// <summary>Plain-text lyric draft: one segment per line.</summary>
    public static string ToLyricsDraft(IReadOnlyList<TranscribedSegment> segments)
        => string.Join("\n", segments.Select(s => s.Text.Trim()).Where(t => t.Length > 0));
}
