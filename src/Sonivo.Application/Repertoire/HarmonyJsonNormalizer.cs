using System.Text.Json;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Repertoire;

/// <summary>Validates versioned harmony editor state before it is stored on an Arrangement.</summary>
public static class HarmonyJsonNormalizer
{
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (value.Length > Arrangement.MaxBodyLength)
            throw new ValidationException($"HarmonyJson must be {Arrangement.MaxBodyLength} characters or fewer.");

        try
        {
            using var document = JsonDocument.Parse(value);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !root.TryGetProperty("version", out var version) ||
                version.ValueKind != JsonValueKind.Number ||
                !version.TryGetInt32(out var versionNumber) || versionNumber != 1)
            {
                throw new ValidationException("HarmonyJson must be a version 1 object.");
            }

            var scale = RequiredString(root, "scale", 32);
            if (scale is not ("major" or "natural-minor" or "harmonic-minor" or "melodic-minor" or "dorian" or "phrygian" or "lydian" or "mixolydian" or "locrian" or "major-pentatonic" or "minor-pentatonic" or "blues"))
                throw new ValidationException("HarmonyJson scale is not supported.");

            if (!root.TryGetProperty("meter", out var meter) || meter.ValueKind != JsonValueKind.Object)
                throw new ValidationException("HarmonyJson meter is required.");
            var numerator = RequiredInteger(meter, "numerator", 1, 12);
            var denominator = RequiredInteger(meter, "denominator", 2, 16);
            if (denominator is not (2 or 4 or 8 or 16))
                throw new ValidationException("HarmonyJson meter denominator is not supported.");
            _ = RequiredString(root, "genre", 64);

            if (!root.TryGetProperty("sections", out var sections) || sections.ValueKind != JsonValueKind.Array || sections.GetArrayLength() is < 1 or > 32)
                throw new ValidationException("HarmonyJson must contain between 1 and 32 sections.");
            var barTicks = numerator * 16 / denominator;
            foreach (var section in sections.EnumerateArray())
            {
                if (section.ValueKind != JsonValueKind.Object)
                    throw new ValidationException("HarmonyJson section must be an object.");
                _ = RequiredString(section, "id", 128);
                _ = RequiredString(section, "name", 64);
                if (!section.TryGetProperty("bars", out var bars) || bars.ValueKind != JsonValueKind.Array || bars.GetArrayLength() is < 1 or > 64)
                    throw new ValidationException("HarmonyJson section must contain between 1 and 64 bars.");
                foreach (var bar in bars.EnumerateArray())
                {
                    if (bar.ValueKind != JsonValueKind.Array || bar.GetArrayLength() > 16)
                        throw new ValidationException("HarmonyJson bar must contain no more than 16 chords.");
                    var usedTicks = 0;
                    foreach (var slot in bar.EnumerateArray())
                    {
                        if (slot.ValueKind != JsonValueKind.Object)
                            throw new ValidationException("HarmonyJson chord slot must be an object.");
                        _ = RequiredString(slot, "chord", 24);
                        usedTicks += RequiredInteger(slot, "durationTicks", 1, 192);
                    }
                    if (usedTicks > barTicks)
                        throw new ValidationException("HarmonyJson chord durations cannot exceed the bar length.");
                }
            }

            if (!root.TryGetProperty("tracks", out var tracks) || tracks.ValueKind != JsonValueKind.Array || tracks.GetArrayLength() > 6)
                throw new ValidationException("HarmonyJson tracks must be an array of at most 6 items.");
            foreach (var track in tracks.EnumerateArray())
            {
                if (track.ValueKind != JsonValueKind.Object)
                    throw new ValidationException("HarmonyJson track must be an object.");
                _ = RequiredString(track, "id", 128);
                var instrument = RequiredString(track, "instrument", 16);
                if (instrument is not ("chord" or "piano" or "lead" or "bass" or "guitar" or "drums"))
                    throw new ValidationException("HarmonyJson track instrument is not supported.");
                if (!track.TryGetProperty("enabled", out var enabled) || enabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    throw new ValidationException("HarmonyJson track enabled must be a boolean.");
                var pattern = RequiredString(track, "pattern", 24);
                if (pattern is not ("sustain" or "accompaniment" or "rhythm"))
                    throw new ValidationException("HarmonyJson track pattern is not supported.");
                if (!track.TryGetProperty("volume", out var volume) || volume.ValueKind != JsonValueKind.Number || !volume.TryGetDouble(out var volumeValue) || volumeValue is < 0 or > 1)
                    throw new ValidationException("HarmonyJson track volume must be between 0 and 1.");
            }

            return value.Trim();
        }
        catch (JsonException)
        {
            throw new ValidationException("HarmonyJson must contain valid JSON.");
        }
    }

    private static string RequiredString(JsonElement element, string propertyName, int maxLength)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
            throw new ValidationException($"HarmonyJson {propertyName} is required.");
        var value = property.GetString();
        if (string.IsNullOrWhiteSpace(value) || value.Length > maxLength)
            throw new ValidationException($"HarmonyJson {propertyName} must be between 1 and {maxLength} characters.");
        return value;
    }

    private static int RequiredInteger(JsonElement element, string propertyName, int min, int max)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.Number || !property.TryGetInt32(out var value) || value < min || value > max)
            throw new ValidationException($"HarmonyJson {propertyName} must be between {min} and {max}.");
        return value;
    }
}
