package dev.karimajed.eva.speech;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * The desktop records 16 kHz mono PCM WAV. The layout matches shared/speech-wav.ts.
 * Anything else is rejected before a transcription process starts.
 */
public final class WavAudio {

    public static final int SAMPLE_RATE = 16_000;
    public static final int MIN_SAMPLES = SAMPLE_RATE * 3 / 10;
    public static final int MAX_SAMPLES = SAMPLE_RATE * 60;
    public static final int MAX_BYTES = 44 + MAX_SAMPLES * 2;
    private static final int HEADER = 44;

    private WavAudio() {
    }

    public static void validate(byte[] wav) {
        if (wav == null || wav.length > MAX_BYTES) {
            throw new SpeechException("invalid-audio", 400, "The recording is too large.");
        }
        if (wav.length < HEADER + MIN_SAMPLES * 2) {
            throw new SpeechException("invalid-audio", 400, "The recording was too short.");
        }
        if (!ascii(wav, 0, "RIFF") || !ascii(wav, 8, "WAVE") || !ascii(wav, 12, "fmt ") || !ascii(wav, 36, "data")) {
            throw invalid();
        }
        ByteBuffer view = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
        int fileSize = view.getInt(4);
        int formatChunk = view.getInt(16);
        int audioFormat = view.getShort(20) & 0xffff;
        int channels = view.getShort(22) & 0xffff;
        int sampleRate = view.getInt(24);
        int byteRate = view.getInt(28);
        int blockAlign = view.getShort(32) & 0xffff;
        int bits = view.getShort(34) & 0xffff;
        long dataBytes = view.getInt(40) & 0xffffffffL;
        if (fileSize != wav.length - 8 || formatChunk != 16 || audioFormat != 1 || channels != 1) {
            throw invalid();
        }
        if (sampleRate != SAMPLE_RATE || byteRate != SAMPLE_RATE * 2 || blockAlign != 2 || bits != 16) {
            throw invalid();
        }
        if (dataBytes < MIN_SAMPLES * 2L) {
            throw new SpeechException("invalid-audio", 400, "The recording was too short.");
        }
        if (dataBytes > MAX_SAMPLES * 2L) {
            throw new SpeechException("invalid-audio", 400, "The recording is longer than 60 seconds.");
        }
        if (dataBytes % 2 != 0 || wav.length != HEADER + dataBytes) {
            throw invalid();
        }
    }

    private static SpeechException invalid() {
        return new SpeechException("invalid-audio", 400, "EVA could not use that recording.");
    }

    private static boolean ascii(byte[] wav, int offset, String expected) {
        byte[] raw = expected.getBytes(StandardCharsets.US_ASCII);
        if (offset + raw.length > wav.length) {
            return false;
        }
        for (int index = 0; index < raw.length; index += 1) {
            if (wav[offset + index] != raw[index]) {
                return false;
            }
        }
        return true;
    }
}
