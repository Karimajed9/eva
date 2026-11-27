import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TtsRequest } from "../../../shared/tts";
import { App } from "../App";
import type { SpeechPlayer } from "./playback";
import { setSpeechPlayer } from "./useVoice";

function showVoice(): void {
  const toggle = screen.getByRole("button", { name: /^Voice,/ });
  if (toggle.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(toggle);
  }
}

afterEach(() => {
  setSpeechPlayer(() => ({
    play: async () => {},
    setVolume() {},
    stop() {},
  }));
  delete window.eva;
});

function player(): SpeechPlayer & { plays: number } {
  const seen = { plays: 0, release: () => {} };
  return {
    get plays() {
      return seen.plays;
    },
    async play(_wav, _volume, onLevel, onStart) {
      seen.plays += 1;
      onStart();
      onLevel(0.4);
      await new Promise<void>((resolve) => {
        seen.release = resolve;
      });
    },
    setVolume() {},
    stop() {
      seen.release();
    },
  };
}

function install(options: {
  text?: string;
  autoPlay?: boolean;
  synthesize?: (request: TtsRequest) => Promise<{ ok: true; audio: Uint8Array; elapsedMs: number; loadMs: number | null; audioMs: number; sampleRate: number }>;
} = {}) {
  const sent: string[] = [];
  const spoken: TtsRequest[] = [];
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
    sendConversation: async (request) => {
      sent.push(request.text);
      return {
        ok: true as const,
        provider: request.provider,
        model: request.model,
        text: options.text ?? "Hello from EVA. This is the second sentence for playback today.",
        usage: null,
      };
    },
    resetConversation: async () => ({ messages: [], providers: [] }),
    cancelConversation: async () => {},
    subscribeConversation: () => () => {},
    getSpeechStatus: async () => ({ engine: "whisper.cpp" as const, available: true, detail: "Local transcription is ready." }),
    getSpeechPreferences: async () => ({ language: "auto" as const, vocabulary: [] }),
    saveSpeechPreferences: async (preferences) => preferences,
    transcribeSpeech: async () => ({ ok: true as const, text: "from the microphone", elapsedMs: 1, recordingMs: 1, loadMs: null, inferenceMs: null }),
    cancelSpeech: async () => {},
    getTtsStatus: async () => ({ engine: "kokoro" as const, available: true, detail: "Kokoro is configured.", loadMs: null }),
    getTtsPreferences: async () => ({ voice: "af_heart" as const, speed: 1, volume: 0.5, autoPlay: options.autoPlay ?? false }),
    saveTtsPreferences: async (preferences) => preferences,
    synthesizeSpeech: async (request) => {
      spoken.push(request);
      if (options.synthesize) {
        return options.synthesize(request);
      }
      return { ok: true as const, audio: new Uint8Array(8), elapsedMs: 20, loadMs: 0, audioMs: 1000, sampleRate: 24000 };
    },
    cancelTts: async () => {},
  };
  return { sent, spoken };
}

describe("local speech playback", () => {
  it("speaks a completed reply in order and can preview without sending a message", async () => {
    const playback = player();
    setSpeechPlayer(() => playback);
    const tracker = install({
      text: "Use `eva` here.\n```sh\nRemove-Item secret\n```\nDr. Eva is ready. The total is 3.14 today.",
    });
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    showVoice();
    fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
    await waitFor(() => expect(tracker.spoken.length).toBeGreaterThan(0));
    expect(tracker.sent).toHaveLength(0);
    expect(tracker.spoken[0]?.text).toContain("Hello.");
    expect(tracker.spoken[0]?.voice).toBe("af_heart");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Remove-Item/i);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() => expect(tracker.spoken.some((item) => item.text.includes("eva"))).toBe(true));
    const reply = tracker.spoken.filter((item) => item.text.includes("eva") || item.text.includes("3.14")).map((item) => item.text).join(" ");
    expect(reply).not.toContain("Remove-Item");
    expect(reply).toContain("3.14");
    await waitFor(() => expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "speaking"));
  });

  it("does not play a late result after speech is stopped", async () => {
    let release: (value: { ok: true; audio: Uint8Array; elapsedMs: number; loadMs: number | null; audioMs: number; sampleRate: number }) => void = () => {};
    const playback = player();
    setSpeechPlayer(() => playback);
    install({
      synthesize: () => new Promise((resolve) => {
        release = resolve;
      }),
    });
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    showVoice();
    fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
    expect(await screen.findByText(/preparing speech/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop speaking" }));
    release({ ok: true, audio: new Uint8Array(8), elapsedMs: 5, loadMs: 0, audioMs: 100, sampleRate: 24000 });
    await waitFor(() => expect(screen.getByTestId("voice-status")).toHaveTextContent(/speech stopped/i));
    expect(playback.plays).toBe(0);
  });

  it("speaks a new completed reply automatically", async () => {
    const tracker = install({ text: "Automatic playback is ready today." });
    setSpeechPlayer(() => ({
      play: async (_wav, _volume, _level, onStart) => {
        onStart();
      },
      stop() {},
      setVolume() {},
    }));
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    showVoice();
    fireEvent.click(screen.getByRole("checkbox", { name: "Speak completed replies" }));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(tracker.spoken.length).toBeGreaterThan(0));
    expect(tracker.spoken[0]?.text).toContain("Automatic playback");
    expect(await screen.findByText(/spoke in/i)).toBeInTheDocument();
  });

  it("does not speak a failed reply", async () => {
    const tracker = install();
    window.eva = {
      ...window.eva!,
      sendConversation: async () => ({
        ok: false as const,
        code: "provider-error" as const,
        detail: "The model failed.",
      }),
    };
    render(<App />);
    await screen.findByText(/local models stay on this machine/i);
    showVoice();
    fireEvent.click(screen.getByRole("checkbox", { name: "Speak completed replies" }));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/model failed/i)).toBeInTheDocument();
    expect(tracker.spoken).toHaveLength(0);
  });

  it("applies one volume slider to playback immediately", async () => {
    const played: number[] = [];
    const live: number[] = [];
    let release = () => {};
    setSpeechPlayer(() => ({
      async play(_wav, volume, _level, onStart) {
        played.push(volume);
        onStart();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      setVolume(volume) {
        live.push(volume);
      },
      stop() {
        release();
      },
    }));
    install();
    render(<App />);
    showVoice();
    await waitFor(() => expect((screen.getByLabelText("Playback volume") as HTMLInputElement).value).toBe("0.5"));
    fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
    await waitFor(() => expect(played).toEqual([0.5]));
    fireEvent.change(screen.getByLabelText("Playback volume"), { target: { value: "0" } });
    expect(live).toEqual([0]);
    fireEvent.click(screen.getByRole("button", { name: "Stop speaking" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
    await waitFor(() => expect(played).toEqual([0.5, 0]));
  });
});
