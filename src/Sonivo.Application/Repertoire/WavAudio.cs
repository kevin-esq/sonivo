using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Repertoire;

/// <summary>
/// Dependency-free WAV decode to 16 kHz mono float samples for the local
/// transcriber (ADR-0032 Q-W32-3). Supports PCM 8/16/24/32-bit and IEEE-float
/// 32-bit, any channel count (downmixed) and any sample rate (linear
/// resample). Anything else — MP3 bytes, corrupt headers, compressed codecs —
/// throws <see cref="TranscriptionException"/> with a user-facing message so
/// the job fails cleanly instead of partially.
/// </summary>
public static class WavAudio
{
    public const int TargetSampleRate = 16_000;

    /// <summary>Decodes WAV bytes; enforces the duration cap before transcription.</summary>
    /// <exception cref="TranscriptionException">Not a WAV file, unsupported WAV, or over the duration cap.</exception>
    public static float[] DecodeToMono16k(byte[] bytes, int maxAudioSeconds)
    {
        var (samples, sampleRate) = DecodeToMono(bytes);
        var durationSeconds = (double)samples.Length / sampleRate;
        if (durationSeconds > maxAudioSeconds)
        {
            throw new TranscriptionException(
                $"El audio dura aproximadamente {(int)Math.Round(durationSeconds)} s (máximo {maxAudioSeconds} s). Usa un audio más corto.");
        }

        return sampleRate == TargetSampleRate ? samples : ResampleLinear(samples, sampleRate, TargetSampleRate);
    }

    /// <summary>Decodes WAV bytes to mono float samples at the file's own rate.</summary>
    public static (float[] Samples, int SampleRate) DecodeToMono(byte[] bytes)
    {
        if (bytes.Length < 44 || !MatchesAscii(bytes, 0, "RIFF") || !MatchesAscii(bytes, 8, "WAVE"))
        {
            throw new TranscriptionException("No se pudo leer el audio. Por ahora solo se admiten archivos WAV.");
        }

        var offset = 12;
        short formatTag = 0;
        short channels = 0;
        var sampleRate = 0;
        short bitsPerSample = 0;
        var dataStart = -1;
        var dataLength = 0;

        while (offset + 8 <= bytes.Length)
        {
            var chunkId = offset;
            var chunkSize = BitConverter.ToInt32(bytes, offset + 4);
            if (chunkSize < 0 || offset + 8 + chunkSize > bytes.Length)
            {
                break;
            }

            if (MatchesAscii(bytes, chunkId, "fmt ") && chunkSize >= 16)
            {
                formatTag = BitConverter.ToInt16(bytes, offset + 8);
                channels = BitConverter.ToInt16(bytes, offset + 10);
                sampleRate = BitConverter.ToInt32(bytes, offset + 12);
                bitsPerSample = BitConverter.ToInt16(bytes, offset + 22);
            }
            else if (MatchesAscii(bytes, chunkId, "data") && dataStart < 0)
            {
                dataStart = offset + 8;
                dataLength = chunkSize;
            }

            offset += 8 + chunkSize + (chunkSize % 2);
        }

        if (formatTag is not (1 or 3)
            || channels < 1
            || sampleRate < 4000
            || sampleRate > 192_000
            || bitsPerSample is not (8 or 16 or 24 or 32)
            || (formatTag == 3 && bitsPerSample != 32)
            || dataStart < 0)
        {
            throw new TranscriptionException("No se pudo leer el audio. Por ahora solo se admiten archivos WAV.");
        }

        var bytesPerSample = bitsPerSample / 8;
        var frameCount = dataLength / (bytesPerSample * channels);
        if (frameCount <= 0)
        {
            throw new TranscriptionException("No se pudo leer el audio. Por ahora solo se admiten archivos WAV.");
        }

        var mono = new float[frameCount];
        for (var frame = 0; frame < frameCount; frame++)
        {
            double mix = 0;
            for (var ch = 0; ch < channels; ch++)
            {
                var pos = dataStart + (frame * channels + ch) * bytesPerSample;
                mix += ReadSample(bytes, pos, formatTag, bitsPerSample);
            }

            mono[frame] = (float)(mix / channels);
        }

        return (mono, sampleRate);
    }

    private static double ReadSample(byte[] bytes, int pos, short formatTag, short bitsPerSample)
    {
        if (formatTag == 3)
        {
            return BitConverter.ToSingle(bytes, pos);
        }

        return bitsPerSample switch
        {
            8 => (bytes[pos] - 128) / 128.0,
            16 => BitConverter.ToInt16(bytes, pos) / 32768.0,
            24 => ReadInt24(bytes, pos) / 8388608.0,
            _ => BitConverter.ToInt32(bytes, pos) / 2147483648.0
        };
    }

    private static int ReadInt24(byte[] bytes, int pos)
    {
        var value = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
        return (value & 0x800000) != 0 ? value - 0x1000000 : value;
    }

    private static float[] ResampleLinear(float[] samples, int fromRate, int toRate)
    {
        if (samples.Length == 0)
        {
            return [];
        }

        var outputLength = (int)((long)samples.Length * toRate / fromRate);
        if (outputLength <= 0)
        {
            return [];
        }

        var output = new float[outputLength];
        for (var i = 0; i < outputLength; i++)
        {
            var position = (double)i * fromRate / toRate;
            var index = (int)position;
            var fraction = (float)(position - index);
            var first = samples[Math.Min(index, samples.Length - 1)];
            var second = samples[Math.Min(index + 1, samples.Length - 1)];
            output[i] = first + (second - first) * fraction;
        }

        return output;
    }

    private static bool MatchesAscii(byte[] bytes, int offset, string text)
    {
        if (offset + text.Length > bytes.Length)
        {
            return false;
        }

        for (var i = 0; i < text.Length; i++)
        {
            if (bytes[offset + i] != (byte)text[i])
            {
                return false;
            }
        }

        return true;
    }
}
