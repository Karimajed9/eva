import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationRequest } from "../../../shared/contract";
import type { SpeechAudioRequest } from "../../../shared/speech-preferences";
import { MIN_SPEECH_SAMPLES } from "../../../shared/speech-wav";
import { App } from "../App";
import { beginSession, openMicrophone, setMicrophoneOpener, type MicrophoneSession } from "./microphone";

afterEach(() => {
  setMicrophoneOpener(openMicrophone);
  vi.restoreAllMocks();
  delete window.eva;
});

function install(options: {
  transcribe?: (request: SpeechAudioRequest) => Promise<
    | { ok: true; text: string; elapsedMs?: number; recordingMs?: number; loadMs?: number | null; inferenceMs?: number | null }
    | { ok: false; code: "missing-model"; detail: string }
  >;
  status?: { available: boolean; detail: string };
} = {}) {
  const sent: ConversationRequest[] = [];
  const cancelled: { speech: number } = { speech: 0 };
  window.eva = {
    getBackendStatus: async () => ({
      state: "up",
      detail: "The local core is online.",
      health: {
        status: "UP",
        service: "eva-backend",
        version: "0.1.0",
        timestamp: "2026-11-19T04:00:00.000Z",
      },
      checkedAt: "2026-11-19T04:00:01.000Z",
    }),
    subscribeBackendStatus: () => () => {},
    getAppInfo: async () => ({ name: "EVA", version: "0.1.0", platform: "win32" }),
    getConversation: async () => ({
      messages: [],
      providers: [
        {
          id: "ollama",
          label: "Ollama",
          local: true,
          reachable: true,
          configured: true,
          detail: "Local models stay on this machine.",
          models: [{ id: "llama3.2", label: "llama3.2" }],
        },
        {
          id: "openai",
          label: "OpenAI",
          local: false,
          reachable: true,
          configured: false,
          detail: "Cloud replies leave this machine.",
          models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
        },
      ],
    }),
    sendConversation: async (request) => {
      sent.push(request);
      return {
        ok: true as const,
        provider: request.provider,
        model: request.model,
        text: "Hello from EVA.",
        usage: { promptTokens: 1, completionTokens: 1, estimatedUsd: null },
      };
    },
    resetConversation: async () => ({ messages: [], providers: [] }),
    cancelConversation: async () => {},
    subscribeConversation: () => () => {},
    getSpeechStatus: async () => ({
      engine: "whisper.cpp" as const,
      available: options.status?.available ?? true,
      detail: options.status?.detail ?? "Local transcription is ready. Audio stays on this machine.",
    }),
    getSpeechPreferences: async () => ({ language: "auto" as const, vocabulary: [] as string[] }),
    saveSpeechPreferences: async (preferences) => preferences,
    transcribeSpeech: async (request) => {
      if (!options.transcribe) {
        return {
          ok: true as const,
          text: "from the microphone",
          elapsedMs: 1800,
          recordingMs: request.recordingMs,
          loadMs: null,
          inferenceMs: null,
        };
      }
      const result = await options.transcribe(request);
      if (!result.ok) {
        return result;
      }
      return {
        ok: true as const,
        text: result.text,
        elapsedMs: result.elapsedMs ?? 1800,
        recordingMs: result.recordingMs ?? request.recordingMs,
        loadMs: result.loadMs === undefined ? 700 : result.loadMs,
        inferenceMs: result.inferenceMs === undefined ? 900 : result.inferenceMs,
      };
    },
    cancelSpeech: async () => {
      cancelled.speech += 1;
    },
    getTtsStatus: async () => ({ engine: "kokoro" as const, available: false, detail: "Kokoro is not configured.", loadMs: null }),
    getTtsPreferences: async () => ({ voice: "af_heart" as const, speed: 1, volume: 1, autoPlay: false }),
    saveTtsPreferences: async (preferences) => preferences,
    synthesizeSpeech: async () => ({ ok: false as const, code: "missing-engine" as const, detail: "Kokoro is not configured." }),
    cancelTts: async () => {},
  };
  return { sent, cancelled };
}

function session(capture?: () => Promise<{ samples: Float32Array; sampleRate: number }>) {
  const stops: string[] = [];
  return {
    stops,
    open: async () => beginSession({
      level: () => 0.66,
      capture: capture ?? (async () => ({
        samples: new Float32Array(MIN_SPEECH_SAMPLES).fill(0.1),
        sampleRate: 16_000,
      })),
      stopTracks: () => stops.push("stop"),
      close: async () => {},
    }),
  };
}

describe("microphone transcription", () => {
  it("puts the transcript in the message box and waits for the user to send it", async () => {
    const tracker = install({
      transcribe: async () => ({ ok: true, text: "Set a timer for tea" }),
    });
    const mic = session();
    setMicrophoneOpener(mic.open);
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(await screen.findByText(/recording 0:00/i)).toBeInTheDocument();
    expect(screen.getByTestId("speech-status")).toHaveAttribute("data-phase", "recording");
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "recording");
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(await screen.findByText(/ready to send/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue("Set a timer for tea"));
    const message = screen.getByLabelText("Message");
    expect(tracker.sent).toHaveLength(0);
    fireEvent.change(message, { target: { value: "Set a timer for coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(tracker.sent).toHaveLength(1));
    expect(tracker.sent[0]?.text).toBe("Set a timer for coffee");
    expect(screen.getByTestId("speech-status")).toHaveAttribute("data-phase", "ready");
  });

  it("explains a denied microphone and a missing model without sending audio to chat", async () => {
    const tracker = install();
    setMicrophoneOpener(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(await screen.findByText(/permission was denied/i)).toBeInTheDocument();
    expect(screen.getByTestId("speech-status")).toHaveAttribute("data-phase", "error");
    expect(tracker.sent).toHaveLength(0);
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("shows a missing model and discards a recording without keeping the microphone", async () => {
    const tracker = install({
      status: {
        available: false,
        detail: "The whisper.cpp model file was not found. EVA does not download a model.",
      },
      transcribe: async () => ({
        ok: false,
        code: "missing-model",
        detail: "The whisper.cpp model file was not found. EVA does not download a model.",
      }),
    });
    const mic = session();
    setMicrophoneOpener(mic.open);
    render(<App />);
    expect(await screen.findByText(/does not download a model/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    await screen.findByRole("button", { name: "Discard recording" });
    fireEvent.click(screen.getByRole("button", { name: "Discard recording" }));
    expect(await screen.findByText(/nothing was kept/i)).toBeInTheDocument();
    expect(mic.stops).toEqual(["stop"]);
    expect(tracker.cancelled.speech).toBe(1);
    expect(tracker.sent).toHaveLength(0);
  });

  it("cancels transcription and ignores a second start while one is opening", async () => {
    const tracker = install();
    let opened = 0;
    let release = (): void => {};
    const pending = new Promise<{ samples: Float32Array; sampleRate: number }>(() => {});
    setMicrophoneOpener(() => new Promise<MicrophoneSession>((resolve) => {
      opened += 1;
      release = () => resolve(beginSession({
        level: () => 0.2,
        capture: () => pending,
        stopTracks: () => {},
        close: async () => {},
      }));
    }));
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(opened).toBe(1);
    release();
    fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));
    expect(await screen.findByText(/transcribing on this machine/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel transcription" }));
    expect(await screen.findByText(/nothing was kept/i)).toBeInTheDocument();
    expect(tracker.cancelled.speech).toBeGreaterThan(0);
    expect(tracker.sent).toHaveLength(0);
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("stops a recording that reaches the one minute limit", async () => {
    const tracker = install({
      transcribe: async () => ({ ok: true, text: "one minute" }),
    });
    let elapsed = 0;
    const start = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => start + elapsed);
    setMicrophoneOpener(async () => beginSession({
      level: () => 0.5,
      capture: async () => ({
        samples: new Float32Array(MIN_SPEECH_SAMPLES).fill(0.1),
        sampleRate: 16_000,
      }),
      stopTracks: () => {},
      close: async () => {},
    }));
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(await screen.findByText(/recording 0:00/i)).toBeInTheDocument();
    elapsed = 60_000;
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue("one minute"));
    expect(tracker.sent).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("sends the chosen language and vocabulary with the recording", async () => {
    const seen: SpeechAudioRequest[] = [];
    const tracker = install({
      transcribe: async (request) => {
        seen.push(request);
        return {
          ok: true,
          text: "Muay Thai",
          elapsedMs: 1800,
          recordingMs: request.recordingMs,
          loadMs: 700,
          inferenceMs: 900,
        };
      },
    });
    const mic = session();
    setMicrophoneOpener(mic.open);
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    fireEvent.click(screen.getByRole("button", { name: /^Listening,/ }));
    fireEvent.change(screen.getByLabelText("Speech language"), { target: { value: "fr" } });
    fireEvent.change(screen.getByLabelText("Add vocabulary term"), { target: { value: "tea" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit vocabulary term 1"), { target: { value: "Muay Thai" } });
    fireEvent.blur(screen.getByLabelText("Edit vocabulary term 1"));
    expect(screen.getByText("Muay Thai")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Muay Thai" }));
    expect(screen.queryByText("Muay Thai")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Add vocabulary term"), { target: { value: "Muay Thai" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue("Muay Thai"));
    expect(seen[0]?.language).toBe("fr");
    expect(seen[0]?.prompt).toBe("Muay Thai");
    expect(screen.getByTestId("speech-status")).toHaveAttribute("title", "Model load 0.7 s · recognition 0.9 s");
    expect(screen.getByText(/transcribed in 1\.8 s/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveStyle({ overflowY: "auto" });
    expect(tracker.sent).toHaveLength(0);
  });
});
