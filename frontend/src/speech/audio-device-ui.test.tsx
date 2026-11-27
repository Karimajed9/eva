import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AudioDevicePreferences } from "../../../shared/audio-device-preferences";
import type { MicrophoneAudioConstraints } from "../../../shared/audio-devices";
import { App } from "../App";
import { beginSession, setMicrophoneOpener } from "./microphone";
import { setAudioDevicePorts } from "./useAudioDevices";
import type { OpenInput } from "./audio-device-model";

afterEach(() => {
  setAudioDevicePorts(null);
  setMicrophoneOpener(async () => {
    throw new Error("unexpected microphone");
  });
  delete window.eva;
});

function showAudio(): void {
  const toggle = screen.getByRole("button", { name: /^Audio,/ });
  if (toggle.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(toggle);
  }
}

function install() {
  const transcribed: unknown[] = [];
  const saved: AudioDevicePreferences[] = [];
  const opened: MicrophoneAudioConstraints[] = [];
  const stopped: number[] = [];
  window.eva = {
    getBackendStatus: async () => ({
      state: "up",
      detail: "The local core is online.",
      health: { status: "UP", service: "eva-backend", version: "0.1.0", timestamp: "2026-11-19T04:00:00.000Z" },
      checkedAt: "2026-11-19T04:00:01.000Z",
    }),
    subscribeBackendStatus: () => () => {},
    getAppInfo: async () => ({ name: "EVA", version: "0.1.0", platform: "win32" }),
    getConversation: async () => ({
      messages: [],
      providers: [{
        id: "ollama",
        label: "Ollama",
        local: true,
        reachable: true,
        configured: true,
        detail: "Local models stay on this machine.",
        models: [{ id: "llama3.2", label: "llama3.2" }],
      }],
    }),
    sendConversation: async () => ({ ok: false as const, code: "invalid" as const, detail: "no" }),
    resetConversation: async () => ({ messages: [], providers: [] }),
    cancelConversation: async () => {},
    subscribeConversation: () => () => {},
    getSpeechStatus: async () => ({ engine: "whisper.cpp" as const, available: true, detail: "Local transcription is ready." }),
    getSpeechPreferences: async () => ({ language: "auto" as const, vocabulary: [] as string[] }),
    saveSpeechPreferences: async (preferences) => preferences,
    transcribeSpeech: async (request) => {
      transcribed.push(request);
      return { ok: true as const, text: "should not run", elapsedMs: 1, recordingMs: 1, loadMs: null, inferenceMs: null };
    },
    cancelSpeech: async () => {},
    getTtsStatus: async () => ({ engine: "kokoro" as const, available: false, detail: "Kokoro is not configured.", loadMs: null }),
    getTtsPreferences: async () => ({ voice: "af_heart" as const, speed: 1, volume: 1, autoPlay: false }),
    saveTtsPreferences: async (preferences) => preferences,
    synthesizeSpeech: async () => ({ ok: false as const, code: "missing-engine" as const, detail: "Kokoro is not configured." }),
    cancelTts: async () => {},
    getAudioDevicePreferences: async () => ({ inputDeviceId: "default", outputDeviceId: "default" }),
    saveAudioDevicePreferences: async (preferences) => {
      saved.push(preferences);
      return preferences;
    },
  };
  setAudioDevicePorts(() => ({
    enumerate: async () => [
      { deviceId: "mic-a", kind: "audioinput", label: "Headset mic" },
      { deviceId: "spk-a", kind: "audiooutput", label: "HDMI display" },
      { deviceId: "default", kind: "audioinput", label: "Default - Headset mic" },
    ],
    openInput: async (constraints) => {
      opened.push(constraints);
      const handle: OpenInput = {
        level: () => 0.5,
        stop: () => {
          stopped.push(stopped.length + 1);
        },
        onEnded() {},
      };
      return handle;
    },
    readPreferences: async () => ({ inputDeviceId: "default", outputDeviceId: "default" }),
    writePreferences: async (preferences) => {
      saved.push(preferences);
      return preferences;
    },
  }));
  return { transcribed, saved, opened, stopped };
}

describe("audio device settings", () => {
  it("selects and tests a microphone without transcribing", async () => {
    const tracker = install();
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    showAudio();
    expect(await screen.findByRole("option", { name: "Headset mic" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "HDMI display" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /default - headset/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Input device"), { target: { value: "mic-a" } });
    await waitFor(() => expect(tracker.saved.at(-1)?.inputDeviceId).toBe("mic-a"));
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
    expect(await screen.findByText(/nothing is saved or sent/i)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Microphone level" })).toBeInTheDocument();
    expect(tracker.opened.at(-1)?.deviceId).toEqual({ exact: "mic-a" });
    expect(tracker.transcribed).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Stop test" }));
    await waitFor(() => expect(tracker.stopped.length).toBeGreaterThan(0));
    expect(tracker.transcribed).toHaveLength(0);
  });

  it("discards a recording when the microphone changes and releases a test when audio settings close", async () => {
    const tracker = install();
    setMicrophoneOpener(async () => beginSession({
      level: () => 0.2,
      capture: async () => ({ samples: new Float32Array(1600), sampleRate: 16_000 }),
      stopTracks() {},
      close: async () => {},
    }));
    const view = render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(await screen.findByText(/recording 0:00/i)).toBeInTheDocument();
    showAudio();
    expect(await screen.findByRole("option", { name: "Headset mic" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Input device"), { target: { value: "mic-a" } });
    expect(await screen.findByText(/recording was discarded/i)).toBeInTheDocument();
    expect(tracker.transcribed).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
    expect(await screen.findByText(/nothing is saved or sent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Audio,/ }));
    await waitFor(() => expect(tracker.stopped.length).toBeGreaterThan(0));
    view.unmount();
  });
});
