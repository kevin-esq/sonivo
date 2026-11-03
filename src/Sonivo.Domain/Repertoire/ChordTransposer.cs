// Adapted from HarmonyDB.Common.Representations.OneShelf.Note.
// Copyright and license details: THIRD-PARTY-NOTICES.md and HarmonyDB.LICENSE.txt.
namespace Sonivo.Domain.Repertoire;

public static class ChordTransposer
{
    private static readonly string[] SharpNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    private static readonly string[] FlatNotes = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    private static readonly Dictionary<char, int> NoteValues = new()
    {
        ['C'] = 0, ['D'] = 2, ['E'] = 4, ['F'] = 5, ['G'] = 7, ['A'] = 9, ['B'] = 11, ['H'] = 11
    };

    public static string Transpose(string chord, int semitones, bool preferFlats = false)
    {
        ArgumentNullException.ThrowIfNull(chord);
        return System.Text.RegularExpressions.Regex.Replace(chord,
            @"(?<![A-Za-z])(?<root>[A-H](?:#|b)?)(?<suffix>(?:maj|min|sus|dim|aug|add|m|M)?(?:\d+)?(?:[#b+\-])?)(?:/(?<bass>[A-H](?:#|b)?))?(?=$|[^A-Za-z#])",
            match =>
            {
                if (match.Index > 0 && char.IsLetter(chord[match.Index - 1])) return match.Value;
                if (match.Index + match.Length < chord.Length && char.IsLetter(chord[match.Index + match.Length])) return match.Value;
                return TransposeNote(match.Groups["root"].Value, semitones, preferFlats) +
                     match.Groups["suffix"].Value +
                     (match.Groups["bass"].Success ? "/" + TransposeNote(match.Groups["bass"].Value, semitones, preferFlats) : string.Empty);
            });
    }

    private static string TransposeNote(string note, int semitones, bool preferFlats)
    {
        var value = NoteValues[note[0]];
        if (note.Length == 2) value += note[1] == '#' ? 1 : -1;
        var names = preferFlats ? FlatNotes : SharpNotes;
        return names[((value + semitones) % 12 + 12) % 12];
    }
}
