using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// Digitizer eligibility (ADR-0032 Q-W32-5): <c>file</c>-kind Resources with
/// playable audio MIME and purpose <c>audio</c>/<c>practice</c>/<c>click</c>.
/// Links are OUT (server must read bytes; link fetching is SSRF surface).
/// </summary>
public static class DigitizeEligibility
{
    private static readonly string[] AudioExtensions =
        [".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac", ".webm", ".opus"];

    /// <summary>Null when eligible; otherwise a user-facing (Spanish) rejection reason.</summary>
    public static string? RejectReason(Resource resource)
    {
        if (!string.Equals(resource.Kind, ResourceKinds.File, StringComparison.OrdinalIgnoreCase))
        {
            return "Solo se pueden digitalizar archivos de audio. Los enlaces no se pueden digitalizar.";
        }

        if (!IsDigitizablePurpose(resource.Purpose))
        {
            return "Solo se pueden digitalizar recursos con propósito audio, practice o click.";
        }

        if (!IsPlayableAudio(resource.ContentType, resource.OriginalFileName))
        {
            return "El archivo no es un audio reproducible.";
        }

        return null;
    }

    public static bool IsDigitizablePurpose(string? purpose)
        => purpose is ResourcePurposes.Audio or ResourcePurposes.Practice or ResourcePurposes.Click;

    /// <summary>
    /// Same playability rule as Practice: audio MIME wins; otherwise a known
    /// audio filename extension.
    /// </summary>
    public static bool IsPlayableAudio(string? contentType, string? fileName)
    {
        if (!string.IsNullOrWhiteSpace(contentType)
            && contentType.Trim().StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var name = (fileName ?? string.Empty).Split('?')[0].ToLowerInvariant();
        return AudioExtensions.Any(name.EndsWith);
    }
}
