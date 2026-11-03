using Sonivo.Application.Repertoire.ChordPro;
using Sonivo.Application.Repertoire.ChordPro.Formatters;
using Sonivo.Application.Repertoire.ChordPro.Transformers;

namespace Sonivo.Application.Repertoire;

public static class ChordSheetConverter
{
    public static string ToChordPro(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var document = Document.Parse(text);
        var transformed = new ChordProTransformer(document).Transform();
        return new TextFormatter(transformed.Document).ToString();
    }
}
