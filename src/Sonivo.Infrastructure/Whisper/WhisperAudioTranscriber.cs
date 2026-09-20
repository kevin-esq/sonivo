using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Domain.Repertoire;
using Whisper.net;
using Whisper.net.Ggml;

namespace Sonivo.Infrastructure.Whisper;

/// <summary>
/// Local transcription via whisper.cpp through Whisper.net (ADR-0032 Q-W32-1).
/// Default model <c>tiny</c>, auto language detection, zero vendor secrets,
/// audio never leaves the server. Output is an Owner-reviewed draft only —
/// limited tiny-model quality is acceptable by design.
/// </summary>
public sealed class WhisperAudioTranscriber : IAudioTranscriber
{
    private readonly WhisperOptions _options;
    private readonly DigitizeOptions _caps;
    private readonly ILogger<WhisperAudioTranscriber> _logger;
    private readonly SemaphoreSlim _modelGate = new(1, 1);

    public WhisperAudioTranscriber(
        IOptions<WhisperOptions> options,
        IOptions<DigitizeOptions> caps,
        ILogger<WhisperAudioTranscriber> logger)
    {
        _options = options.Value;
        _caps = caps.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyList<TranscribedSegment>> TranscribeAsync(
        Stream audio,
        string contentType,
        CancellationToken cancellationToken)
    {
        byte[] bytes;
        await using (var buffer = new MemoryStream())
        {
            await audio.CopyToAsync(buffer, cancellationToken);
            bytes = buffer.ToArray();
        }

        if (bytes.Length > ResourceFileConstraints.MaxByteSize)
        {
            throw new TranscriptionException(
                $"El archivo supera el máximo de {ResourceFileConstraints.MaxByteSize} bytes.");
        }

        var maxSeconds = Math.Max(1, _caps.MaxAudioSeconds);
        float[] samples;
        try
        {
            samples = WavAudio.DecodeToMono16k(bytes, maxSeconds);
        }
        catch (TranscriptionException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to decode WAV for transcription.");
            throw new TranscriptionException("No se pudo leer el audio. Por ahora solo se admiten archivos WAV.");
        }

        var modelPath = await EnsureModelAsync(cancellationToken);

        try
        {
            using var factory = WhisperFactory.FromPath(modelPath);
            using var processor = factory.CreateBuilder().WithLanguageDetection().Build();

            var segments = new List<TranscribedSegment>();
            await foreach (var segment in processor.ProcessAsync(samples, cancellationToken))
            {
                var text = segment.Text?.Trim() ?? string.Empty;
                if (text.Length == 0)
                {
                    continue;
                }

                segments.Add(new TranscribedSegment(
                    (int)segment.Start.TotalMilliseconds,
                    (int)segment.End.TotalMilliseconds,
                    text));
            }

            return segments;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Whisper transcription failed.");
            throw new TranscriptionException("No se pudo digitalizar el audio. Inténtalo de nuevo.", ex);
        }
    }

    private async Task<string> EnsureModelAsync(CancellationToken cancellationToken)
    {
        var model = (_options.Model ?? "tiny").Trim().ToLowerInvariant();
        var ggmlType = model switch
        {
            "tiny" => GgmlType.Tiny,
            "base" => GgmlType.Base,
            _ => throw new TranscriptionException("Modelo de transcripción no configurado correctamente.")
        };

        var directory = string.IsNullOrWhiteSpace(_options.ModelDirectory)
            ? Path.Combine(Path.GetTempPath(), "sonivo-whisper")
            : _options.ModelDirectory;
        var modelPath = Path.Combine(directory, $"ggml-{model}.bin");
        if (File.Exists(modelPath))
        {
            return modelPath;
        }

        await _modelGate.WaitAsync(cancellationToken);
        try
        {
            if (File.Exists(modelPath))
            {
                return modelPath;
            }

            Directory.CreateDirectory(directory);
            _logger.LogInformation("Downloading Whisper model {Model} to {Path}.", model, modelPath);
            var tempPath = modelPath + ".download";
            await using (var download = await WhisperGgmlDownloader.Default.GetGgmlModelAsync(
                ggmlType, QuantizationType.NoQuantization, cancellationToken))
            {
                await using var file = File.Create(tempPath);
                await download.CopyToAsync(file, cancellationToken);
            }

            File.Move(tempPath, modelPath, overwrite: true);
            return modelPath;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Whisper model download failed.");
            throw new TranscriptionException("No se pudo preparar la transcripción. Inténtalo de nuevo.", ex);
        }
        finally
        {
            _modelGate.Release();
        }
    }
}
