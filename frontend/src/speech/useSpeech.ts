import { useEffect, useRef, useState } from "react";
import type { BackendState } from "../../../shared/contract";
import {
  emptySpeechPreferences,
  normalizeVocabulary,
  speechPrompt,
  type SpeechLanguage,
  type SpeechPreferences,
} from "../../../shared/speech-preferences";
import { bindCaptureActions } from "./audio-device-actions";
import { stopActiveProbe } from "./audio-device-model";
import { openRecording, type MicrophoneSession } from "./microphone";
import { describeMicrophoneFailure, formatDuration, MAX_RECORDING_MS, readyNotice, timingTitle } from "./speech-state";

export type SpeechPhase = "idle" | "recording" | "transcribing" | "ready" | "error";

export interface SpeechView {
  phase: SpeechPhase;
  notice: string;
  timingTitle: string;
  level: number;
  arming: boolean;
  transcript: string;
  transcriptVersion: number;
  language: SpeechLanguage;
  vocabulary: string[];
  setLanguage: (language: SpeechLanguage) => void;
  addTerm: (term: string) => boolean;
  editTerm: (index: number, term: string) => boolean;
  removeTerm: (index: number) => void;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export function useSpeech(coreState: BackendState, beforeStart?: () => void): SpeechView {
  const [phase, setPhase] = useState<SpeechPhase>("idle");
  const [notice, setNotice] = useState("");
  const [level, setLevel] = useState(0);
  const [arming, setArming] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptVersion, setTranscriptVersion] = useState(0);
  const [language, setLanguage] = useState<SpeechLanguage>(emptySpeechPreferences.language);
  const [vocabulary, setVocabulary] = useState<string[]>(emptySpeechPreferences.vocabulary);
  const [timing, setTiming] = useState("");
  const phaseRef = useRef(phase);
  const sessionRef = useRef<MicrophoneSession | null>(null);
  const epoch = useRef(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const armingRef = useRef(false);
  const finishingRef = useRef(false);
  const finishRef = useRef<(auto: boolean) => Promise<void>>(async () => {});
  const languageRef = useRef(language);
  const vocabularyRef = useRef(vocabulary);
  const touched = useRef(false);
  phaseRef.current = phase;
  languageRef.current = language;
  vocabularyRef.current = vocabulary;

  function clearTimer(): void {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => {
    const api = window.eva;
    if (!api || coreState !== "up") {
      return;
    }
    let live = true;
    void api.getSpeechStatus().then((result) => {
      if (!live || phaseRef.current === "recording" || phaseRef.current === "transcribing" || phaseRef.current === "ready") {
        return;
      }
      if ("ok" in result) {
        setNotice(result.detail);
        return;
      }
      setNotice(result.available ? "" : result.detail);
    }).catch(() => {
      if (live) {
        setNotice("Local transcription status could not be read.");
      }
    });
    return () => {
      live = false;
    };
  }, [coreState]);

  useEffect(() => {
    const api = window.eva;
    if (!api) {
      return;
    }
    let live = true;
    void api.getSpeechPreferences().then((preferences) => {
      if (!live || touched.current) {
        return;
      }
      setLanguage(preferences.language);
      setVocabulary(preferences.vocabulary);
    }).catch(() => {
      if (live && (phaseRef.current === "idle" || phaseRef.current === "error")) {
        setNotice("Speech settings could not be read.");
      }
    });
    return () => {
      live = false;
    };
  }, []);

  async function savePreferences(next: SpeechPreferences): Promise<void> {
    touched.current = true;
    setLanguage(next.language);
    setVocabulary(next.vocabulary);
    const api = window.eva;
    if (!api) {
      return;
    }
    try {
      const saved = await api.saveSpeechPreferences(next);
      setLanguage(saved.language);
      setVocabulary(saved.vocabulary);
    } catch {
      if (phaseRef.current !== "recording" && phaseRef.current !== "transcribing") {
        setNotice("Speech settings could not be saved.");
      }
    }
  }

  const abandonRef = useRef<(notice: string) => void>(() => {});
  abandonRef.current = (notice: string) => {
    if (!armingRef.current && !sessionRef.current && phaseRef.current !== "recording") {
      return;
    }
    epoch.current += 1;
    clearTimer();
    const session = sessionRef.current;
    sessionRef.current = null;
    finishingRef.current = false;
    armingRef.current = false;
    setArming(false);
    setLevel(0);
    session?.cancel();
    void window.eva?.cancelSpeech();
    setPhase("idle");
    setTiming("");
    setNotice(notice);
  };

  useEffect(() => bindCaptureActions({
    captureBusy: () => armingRef.current || sessionRef.current !== null || phaseRef.current === "recording",
    discardRecording: (notice) => abandonRef.current(notice),
  }), []);

  useEffect(() => () => {
    epoch.current += 1;
    clearTimer();
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.cancel();
    if (session || phaseRef.current === "transcribing") {
      void window.eva?.cancelSpeech();
    }
  }, []);

  async function finish(auto: boolean): Promise<void> {
    const session = sessionRef.current;
    if (!session || finishingRef.current) {
      return;
    }
    const id = epoch.current;
    finishingRef.current = true;
    clearTimer();
    setLevel(0);
    setPhase("transcribing");
    setNotice(auto
      ? "Maximum length reached. Transcribing on this machine."
      : "Transcribing on this machine.");
    try {
      const wav = await session.finish();
      if (epoch.current !== id) {
        return;
      }
      const api = window.eva;
      if (!api) {
        throw new Error("The desktop bridge is unavailable.");
      }
      const recordingMs = Math.min(MAX_RECORDING_MS, Math.max(0, Date.now() - startedAt.current));
      const result = await api.transcribeSpeech({
        audio: wav,
        language: languageRef.current,
        prompt: speechPrompt(vocabularyRef.current),
        recordingMs,
      });
      if (epoch.current !== id) {
        return;
      }
      if (!result.ok) {
        setPhase("error");
        setNotice(result.detail);
        return;
      }
      setTranscript(result.text);
      setTranscriptVersion((value) => value + 1);
      setPhase("ready");
      setTiming(timingTitle(result.loadMs, result.inferenceMs));
      setNotice(readyNotice(result.elapsedMs, result.recordingMs));
    } catch (error) {
      if (epoch.current !== id) {
        return;
      }
      setPhase("error");
      setNotice(describeMicrophoneFailure(error));
    } finally {
      finishingRef.current = false;
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    }
  }
  finishRef.current = finish;

  function cancel(): void {
    if (!armingRef.current && !sessionRef.current && !finishingRef.current && phaseRef.current !== "recording" && phaseRef.current !== "transcribing") {
      return;
    }
    epoch.current += 1;
    clearTimer();
    const session = sessionRef.current;
    sessionRef.current = null;
    finishingRef.current = false;
    armingRef.current = false;
    setArming(false);
    setLevel(0);
    session?.cancel();
    void window.eva?.cancelSpeech();
    setPhase("idle");
    setTiming("");
    setNotice("Recording cancelled. Nothing was kept.");
  }

  function start(): void {
    stopActiveProbe();
    beforeStart?.();
    if (armingRef.current || sessionRef.current || phaseRef.current === "recording" || phaseRef.current === "transcribing") {
      return;
    }
    if (coreState !== "up" || !window.eva) {
      setPhase("error");
      setNotice("The local core is not running.");
      return;
    }
    const id = epoch.current + 1;
    epoch.current = id;
    armingRef.current = true;
    setArming(true);
    setNotice("Requesting microphone access.");
    void openRecording().then((session) => {
      if (epoch.current !== id) {
        session.cancel();
        return;
      }
      sessionRef.current = session;
      startedAt.current = Date.now();
      setPhase("recording");
      setLevel(session.level());
      setNotice("Recording 0:00. Audio stays on this machine.");
      timer.current = setInterval(() => {
        if (epoch.current !== id || !sessionRef.current) {
          return;
        }
        const elapsed = Date.now() - startedAt.current;
        setLevel(sessionRef.current.level());
        setNotice(`Recording ${formatDuration(elapsed)}. Audio stays on this machine.`);
        if (elapsed >= MAX_RECORDING_MS) {
          void finishRef.current(true);
        }
      }, 200);
    }).catch((error: unknown) => {
      if (epoch.current !== id) {
        return;
      }
      setPhase("error");
      setLevel(0);
      setNotice(describeMicrophoneFailure(error));
    }).finally(() => {
      if (epoch.current === id) {
        armingRef.current = false;
        setArming(false);
      }
    });
  }

  function stop(): void {
    void finish(false);
  }

  function chooseLanguage(next: SpeechLanguage): void {
    void savePreferences({ language: next, vocabulary: vocabularyRef.current });
  }

  function addTerm(term: string): boolean {
    const next = normalizeVocabulary([...vocabularyRef.current, term]);
    if (!next) {
      return false;
    }
    void savePreferences({ language: languageRef.current, vocabulary: next });
    return true;
  }

  function editTerm(index: number, term: string): boolean {
    const next = vocabularyRef.current.map((current, currentIndex) => (currentIndex === index ? term : current));
    const normalized = normalizeVocabulary(next);
    if (!normalized) {
      return false;
    }
    void savePreferences({ language: languageRef.current, vocabulary: normalized });
    return true;
  }

  function removeTerm(index: number): void {
    void savePreferences({
      language: languageRef.current,
      vocabulary: vocabularyRef.current.filter((_term, currentIndex) => currentIndex !== index),
    });
  }

  return {
    phase,
    notice,
    timingTitle: timing,
    level,
    arming,
    transcript,
    transcriptVersion,
    language,
    vocabulary,
    setLanguage: chooseLanguage,
    addTerm,
    editTerm,
    removeTerm,
    start,
    stop,
    cancel,
  };
}
