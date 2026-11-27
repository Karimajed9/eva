import { useEffect, useRef, useState } from "react";
import type { BackendState } from "../../../shared/contract";
import { speakableSegments } from "../../../shared/spoken-text";
import type { TtsResult } from "../../../shared/tts";
import {
  defaultTtsPreferences,
  TTS_PREVIEW,
  ttsVoice,
  type TtsPreferences,
  type TtsVoiceId,
} from "../../../shared/tts-preferences";
import type { PanelPhase } from "../hooks/useConversation";
import type { ConversationMessage } from "../../../shared/contract";
import { createSpeechPlayer, type SpeechPlayer } from "./playback";

export type VoicePhase = "idle" | "preparing" | "speaking" | "error";

export interface VoiceView {
  phase: VoicePhase;
  notice: string;
  timingTitle: string;
  level: number;
  voice: TtsVoiceId;
  speed: number;
  volume: number;
  autoPlay: boolean;
  activeIndex: number | null;
  setVoice: (voice: TtsVoiceId) => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setAutoPlay: (enabled: boolean) => void;
  speak: (text: string, index: number | null) => void;
  preview: () => void;
  stop: () => void;
}

let playerFactory: () => SpeechPlayer = createSpeechPlayer;

export function setSpeechPlayer(factory: () => SpeechPlayer): void {
  playerFactory = factory;
}

export function useVoice(
  coreState: BackendState,
  conversation: { phase: PanelPhase; messages: ConversationMessage[] },
): VoiceView {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [notice, setNotice] = useState("");
  const [timingTitle, setTimingTitle] = useState("");
  const [level, setLevel] = useState(0);
  const [preferences, setPreferences] = useState<TtsPreferences>(defaultTtsPreferences);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const generation = useRef(0);
  const saveGeneration = useRef(0);
  const preferencesRef = useRef(preferences);
  const player = useRef<SpeechPlayer | null>(null);
  const wasGenerating = useRef(false);
  const speakRef = useRef<(text: string, index: number | null) => void>(() => {});
  preferencesRef.current = preferences;

  function audioPlayer(): SpeechPlayer {
    player.current ??= playerFactory();
    return player.current;
  }

  useEffect(() => {
    const api = window.eva;
    if (!api) {
      return;
    }
    let live = true;
    void api.getTtsPreferences().then((saved) => {
      if (live && saveGeneration.current === 0) {
        setPreferences(saved);
      }
    }).catch(() => {
      if (live) {
        setNotice("Speech settings could not be read.");
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => () => {
    generation.current += 1;
    player.current?.stop();
    void window.eva?.cancelTts();
  }, []);

  async function save(next: TtsPreferences): Promise<void> {
    const ticket = saveGeneration.current + 1;
    saveGeneration.current = ticket;
    preferencesRef.current = next;
    setPreferences(next);
    const api = window.eva;
    if (!api) {
      return;
    }
    try {
      const stored = await api.saveTtsPreferences(next);
      if (ticket === saveGeneration.current) {
        preferencesRef.current = stored;
        setPreferences(stored);
      }
    } catch {
      if (ticket === saveGeneration.current) {
        setNotice("Speech settings could not be saved.");
      }
    }
  }

  function stop(): void {
    generation.current += 1;
    audioPlayer().stop();
    setLevel(0);
    setActiveIndex(null);
    setPhase("idle");
    setNotice("Speech stopped.");
    void window.eva?.cancelTts();
  }

  function speak(text: string, index: number | null): void {
    const segments = speakableSegments(text);
    if (segments.length === 0) {
      setPhase("error");
      setNotice("Nothing to speak.");
      return;
    }
    const epoch = generation.current + 1;
    generation.current = epoch;
    audioPlayer().stop();
    void window.eva?.cancelTts();
    setLevel(0);
    setActiveIndex(index);
    setPhase("preparing");
    setNotice("Preparing speech on this machine.");
    void run(epoch, segments);
  }
  speakRef.current = speak;

  async function run(epoch: number, segments: string[]): Promise<void> {
    const api = window.eva;
    if (!api || coreState !== "up") {
      if (epoch === generation.current) {
        setPhase("error");
        setNotice("The local core is not running.");
      }
      return;
    }
    const started = performance.now();
    let firstSound: number | null = null;
    let elapsed = 0;
    let audioMs = 0;
    let loadMs: number | null = null;
    try {
      let pending = request(api, segments[0] ?? "", preferencesRef.current);
      for (let index = 0; index < segments.length; index += 1) {
        const result = await pending;
        if (epoch !== generation.current) {
          return;
        }
        if (!result.ok) {
          setPhase("error");
          setNotice(result.detail);
          return;
        }
        elapsed += result.elapsedMs;
        audioMs += result.audioMs;
        loadMs = result.loadMs ?? loadMs;
        const next = segments[index + 1];
        if (next) {
          pending = request(api, next, preferencesRef.current);
        }
        setPhase("speaking");
        await audioPlayer().play(result.audio, preferencesRef.current.volume, setLevel, () => {
          if (firstSound === null) {
            firstSound = Math.round(performance.now() - started);
          }
        });
        if (epoch !== generation.current) {
          return;
        }
      }
      setPhase("idle");
      setActiveIndex(null);
      setLevel(0);
      setNotice(`Spoke in ${(elapsed / 1000).toFixed(1)} s · audio ${(audioMs / 1000).toFixed(1)} s.`);
      const load = loadMs === null ? "model already loaded" : `model load ${(loadMs / 1000).toFixed(1)} s`;
      const first = firstSound === null ? "" : ` · first sound ${(firstSound / 1000).toFixed(1)} s`;
      setTimingTitle(`${load} · synthesis ${(elapsed / 1000).toFixed(1)} s${first}`);
    } catch {
      if (epoch === generation.current) {
        setPhase("error");
        setLevel(0);
        setNotice("Local speech failed.");
      }
    }
  }

  useEffect(() => {
    if (conversation.phase === "generating" && !wasGenerating.current) {
      generation.current += 1;
      player.current?.stop();
      setLevel(0);
      setActiveIndex(null);
      setPhase("idle");
      void window.eva?.cancelTts();
    }
    const finished = wasGenerating.current && conversation.phase === "idle";
    wasGenerating.current = conversation.phase === "generating";
    if (!finished || !preferencesRef.current.autoPlay) {
      return;
    }
    const last = conversation.messages.at(-1);
    if (!last || last.role !== "assistant" || last.status !== "complete" || last.text.trim().length === 0) {
      return;
    }
    speakRef.current(last.text, conversation.messages.length - 1);
  }, [conversation.phase, conversation.messages]);

  const previousCount = useRef(conversation.messages.length);
  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = conversation.messages.length;
    if (previous > 0 && conversation.messages.length === 0) {
      generation.current += 1;
      player.current?.stop();
      setLevel(0);
      setActiveIndex(null);
      setPhase("idle");
      void window.eva?.cancelTts();
    }
  }, [conversation.messages.length]);

  return {
    phase,
    notice,
    timingTitle,
    level,
    voice: preferences.voice,
    speed: preferences.speed,
    volume: preferences.volume,
    autoPlay: preferences.autoPlay,
    activeIndex,
    setVoice: (voice) => {
      if (ttsVoice(voice)) {
        void save({ ...preferencesRef.current, voice });
      }
    },
    setSpeed: (speed) => {
      void save({ ...preferencesRef.current, speed });
    },
    setVolume: (volume) => {
      audioPlayer().setVolume(volume);
      void save({ ...preferencesRef.current, volume });
    },
    setAutoPlay: (autoPlay) => {
      void save({ ...preferencesRef.current, autoPlay });
    },
    speak,
    preview: () => speak(TTS_PREVIEW, null),
    stop,
  };
}

function request(api: NonNullable<Window["eva"]>, text: string, preferences: TtsPreferences): Promise<TtsResult> {
  const selected = ttsVoice(preferences.voice);
  return api.synthesizeSpeech({
    voice: preferences.voice,
    speed: preferences.speed,
    lang: selected?.lang ?? "en-us",
    text,
  });
}
