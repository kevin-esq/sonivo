using System.Globalization;
using System.Text.Json;

namespace Sonivo.Application.Repertoire;

public static partial class LrcParser
{
    private static (string? Text, LrcParseResult? Parsed) ReadProviderPayload(string text, string encoding)
    {
        var invalid = new LrcParseResult([], EmptyMetadata, [new(0, "lyrics.invalidImport")], [], encoding) { Format = "provider-json" };
        try
        {
            using var json = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 16 });
            var pending = new Queue<JsonElement>();
            pending.Enqueue(json.RootElement);
            for (var inspected = 0; pending.Count > 0 && inspected < 256; inspected++)
            {
                var element = pending.Dequeue();
                if (element.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in element.EnumerateArray().Take(256)) pending.Enqueue(item);
                    continue;
                }
                if (element.ValueKind != JsonValueKind.Object) continue;
                foreach (var key in new[] { "ttml", "syncedLyrics", "syncedLyric", "lrc", "subtitle_body", "plainLyrics", "lyrics" })
                {
                    if (element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()))
                        return (value.GetString(), null);
                }
                if (element.TryGetProperty("lines", out var lines) && lines.ValueKind == JsonValueKind.Array)
                {
                    if (lines.GetArrayLength() > MaxMarks) return (null, invalid);
                    var entries = new List<LrcEntry>();
                    foreach (var line in lines.EnumerateArray())
                    {
                        if (line.ValueKind != JsonValueKind.Object || !line.TryGetProperty("startTimeMs", out var start) || !TryMilliseconds(start, out var atMs) ||
                            !line.TryGetProperty("words", out var words) || words.ValueKind != JsonValueKind.String || words.GetString()!.Contains('\n')) return (null, invalid);
                        int? endMs = null;
                        if (line.TryGetProperty("endTimeMs", out var end) && TryMilliseconds(end, out var finish) && finish > atMs) endMs = finish;
                        entries.Add(new(entries.Count, atMs, words.GetString()!, endMs));
                    }
                    return (null, new(entries.OrderBy(e => e.AtMs).ToList(), EmptyMetadata, [], [], encoding) { Format = "provider-json" });
                }
                foreach (var property in element.EnumerateObject().Take(256)) pending.Enqueue(property.Value);
            }
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException) { }
        return (null, invalid);
    }

    private static bool TryMilliseconds(JsonElement value, out int milliseconds)
    {
        milliseconds = 0;
        return value.ValueKind switch
        {
            JsonValueKind.String => int.TryParse(value.GetString(), NumberStyles.None, CultureInfo.InvariantCulture, out milliseconds) && milliseconds >= 0,
            JsonValueKind.Number => value.TryGetInt32(out milliseconds) && milliseconds >= 0,
            _ => false,
        };
    }
}
