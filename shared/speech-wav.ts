export const SPEECH_RATE = 16_000;
export const MIN_SPEECH_SECONDS = 0.3;
export const MAX_SPEECH_SECONDS = 60;
export const MIN_SPEECH_SAMPLES = SPEECH_RATE * 3 / 10;
export const MAX_SPEECH_SAMPLES = SPEECH_RATE * MAX_SPEECH_SECONDS;
export const MAX_SPEECH_BYTES = 44 + MAX_SPEECH_SAMPLES * 2;

const HEADER = 44;

export function downsample(input: Float32Array, inputRate: number, outputRate = SPEECH_RATE): Float32Array {
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate <= 0 || outputRate <= 0) {
    throw new Error("Invalid sample rate.");
  }
  if (inputRate === outputRate) {
    return new Float32Array(input);
  }
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const fraction = position - left;
    const start = input[left] ?? 0;
    const end = input[Math.min(left + 1, input.length - 1)] ?? start;
    output[index] = start + (end - start) * fraction;
  }
  return output;
}

export function encodePcm16Wav(samples: Float32Array, sampleRate = SPEECH_RATE): Uint8Array {
  if (sampleRate !== SPEECH_RATE) {
    throw new Error("Speech audio must be 16 kHz.");
  }
  if (samples.length < MIN_SPEECH_SAMPLES || samples.length > MAX_SPEECH_SAMPLES) {
    throw new Error(samples.length > MAX_SPEECH_SAMPLES
      ? "The recording is longer than 60 seconds."
      : "The recording was too short.");
  }
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(HEADER + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = HEADER;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return bytes;
}

export function samplesToSpeechWav(samples: Float32Array, sampleRate: number): Uint8Array {
  return encodePcm16Wav(downsample(samples, sampleRate, SPEECH_RATE));
}

export function speechWavError(value: Uint8Array): string | null {
  if (value.length > MAX_SPEECH_BYTES) {
    return "The recording is too large.";
  }
  if (value.length < HEADER + MIN_SPEECH_SAMPLES * 2) {
    return "The recording was too short.";
  }
  if (ascii(value, 0, 4) !== "RIFF" || ascii(value, 8, 4) !== "WAVE" || ascii(value, 12, 4) !== "fmt " || ascii(value, 36, 4) !== "data") {
    return "EVA could not use that recording.";
  }
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const fileSize = view.getUint32(4, true);
  const formatChunk = view.getUint32(16, true);
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const bits = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  if (fileSize !== value.length - 8 || formatChunk !== 16 || audioFormat !== 1 || channels !== 1) {
    return "EVA could not use that recording.";
  }
  if (sampleRate !== SPEECH_RATE || byteRate !== SPEECH_RATE * 2 || blockAlign !== 2 || bits !== 16) {
    return "EVA could not use that recording.";
  }
  if (dataBytes < MIN_SPEECH_SAMPLES * 2 || dataBytes > MAX_SPEECH_SAMPLES * 2 || dataBytes % 2 !== 0) {
    return dataBytes > MAX_SPEECH_SAMPLES * 2
      ? "The recording is longer than 60 seconds."
      : "The recording was too short.";
  }
  if (value.length !== HEADER + dataBytes) {
    return "EVA could not use that recording.";
  }
  return null;
}

export function parseSpeechWav(value: unknown): Uint8Array | null {
  const bytes = asBytes(value);
  if (!bytes || speechWavError(bytes) !== null) {
    return null;
  }
  return bytes;
}

function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value.byteLength > MAX_SPEECH_BYTES ? null : new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength > MAX_SPEECH_BYTES ? null : new Uint8Array(value);
  }
  return null;
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index);
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return text;
}
