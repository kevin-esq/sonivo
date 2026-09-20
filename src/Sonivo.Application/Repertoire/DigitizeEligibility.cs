using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// Digitizer eligibility (ADR-0032 Q-W32-5): <c>file</c>-kind Resources with
/// playable audio MIME and purpose <c>audio</c>/<c>practice</c>/<c>click</c>.
/// Links are OUT (server must read bytes; link fetching is SSRF surface).
/// Decoder is WAV-only in thin: non-WAV audio is rejected up front with a
/// clear message instead of running a doomed job.
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

        if (!IsWavAudio(resource.ContentType, resource.OriginalFileName))
        {
            return "Por ahora solo se admiten archivos WAV.";
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

    /// <summary>
    /// Thin decoder supports WAV only (dependency-free <c>WavAudio</c>).
    /// Keep in sync with the transcriber: non-WAV must fail fast here,
    /// never as a doomed background job.
    /// </summary>
    public static bool IsWavAudio(string? contentType, string? fileName)
    {
        if (!string.IsNullOrWhiteSpace(contentType))
        {
            var mime = contentType.Trim().Split(';')[0].Trim().ToLowerInvariant();
            if (mime is "audio/wav" or "audio/x-wav" or "audio/wave" or "audio/vnd.wave")
            {
                return true;
            }
        }

        var name = (fileName ?? string.Empty).Split('?')[0].ToLowerInvariant();
        return name.EndsWith(".wav");
    }
}
