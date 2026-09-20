namespace Sonivo.Application.Abstractions;

/// <summary>
/// One transcribed audio segment (ADR-0032). Times are milliseconds from the audio start.
/// </summary>
public sealed record TranscribedSegment(int StartMs, int EndMs, string Text);

/// <summary>
/// Converts audio bytes into transcript segments. Transcription lives behind this
/// interface so unit/API tests run against a fake — model weights are never
/// downloaded in tests and never stored in git or the DB.
/// </summary>
public interface IAudioTranscriber
{
    Task<IReadOnlyList<TranscribedSegment>> TranscribeAsync(
        Stream audio,
        string contentType,
        CancellationToken cancellationToken);
}

/// <summary>
/// Thin transcription failure carrying a user-facing (Spanish) message.
/// The digitizer surfaces it as a failed job — never as a partial write.
/// </summary>
public sealed class TranscriptionException : Exception
{
    public TranscriptionException(string message)
        : base(message)
    {
    }

    public TranscriptionException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
