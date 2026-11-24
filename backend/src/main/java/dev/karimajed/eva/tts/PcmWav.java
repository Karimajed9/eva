package dev.karimajed.eva.tts;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

public final class PcmWav {

    public static final int SAMPLE_RATE = 24_000;
    public static final int MIN_SAMPLES = SAMPLE_RATE / 20;
    public static final int MAX_SAMPLES = SAMPLE_RATE * 180;

    private PcmWav() {
    }

    public static byte[] encode(byte[] pcm) {
        if (pcm == null || pcm.length < MIN_SAMPLES * 2 || pcm.length > MAX_SAMPLES * 2 || pcm.length % 2 != 0) {
            throw new TtsException("engine-error", 502, "Local speech failed.");
        }
        int dataBytes = pcm.length;
        ByteBuffer buffer = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put("RIFF".getBytes(StandardCharsets.US_ASCII));
        buffer.putInt(36 + dataBytes);
        buffer.put("WAVE".getBytes(StandardCharsets.US_ASCII));
        buffer.put("fmt ".getBytes(StandardCharsets.US_ASCII));
        buffer.putInt(16);
        buffer.putShort((short) 1);
        buffer.putShort((short) 1);
        buffer.putInt(SAMPLE_RATE);
        buffer.putInt(SAMPLE_RATE * 2);
        buffer.putShort((short) 2);
        buffer.putShort((short) 16);
        buffer.put("data".getBytes(StandardCharsets.US_ASCII));
        buffer.putInt(dataBytes);
        buffer.put(pcm);
        return buffer.array();
    }

    public static int audioMillis(int sampleCount) {
        return Math.round(sampleCount * 1000f / SAMPLE_RATE);
    }
}
