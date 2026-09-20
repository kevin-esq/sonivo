namespace Sonivo.Infrastructure.Whisper;

/// <summary>
/// Local transcription config (ADR-0032 Q-W32-6). No secrets: model name,
/// model directory, and the duration cap. Bound from the <c>Whisper</c>
/// section. Model weights download lazily on first job — never in git,
/// never in the DB. Render ephemeral disk re-downloads after sleep/restart.
/// </summary>
public sealed class WhisperOptions
{
    /// <summary>tiny | base. Default tiny per ADR-0032 Q-W32-1.</summary>
    public string Model { get; set; } = "tiny";

    /// <summary>
    /// Directory holding the model <c>.bin</c>. Empty = a <c>sonivo-whisper</c>
    /// folder under the OS temp path (environment-provisioned).
    /// </summary>
    public string ModelDirectory { get; set; } = string.Empty;

    /// <summary>Audio duration cap in seconds (default 120, ADR-0032 Q-W32-6).</summary>
    public int MaxAudioSeconds { get; set; } = 120;
}
