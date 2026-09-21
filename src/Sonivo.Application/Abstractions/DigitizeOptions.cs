namespace Sonivo.Application.Abstractions;

/// <summary>
/// Digitizer caps (ADR-0032 Q-W32-6). Bound from the <c>Whisper</c> config
/// section; no secrets. Single source for the audio-duration cap shared by
/// the transcriber (fail fast on WAV headers) and the job runner
/// (transcript-span check for every format).
/// </summary>
public sealed class DigitizeOptions
{
    public int MaxAudioSeconds { get; set; } = 120;
}
