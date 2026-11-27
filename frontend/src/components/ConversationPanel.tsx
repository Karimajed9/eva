import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ConversationView } from "../hooks/useConversation";
import type { SpeechView } from "../speech/useSpeech";
import type { VoiceView } from "../speech/useVoice";
import { ttsVoices, type TtsVoiceId } from "../../../shared/tts-preferences";
import type { SpeechLanguage } from "../../../shared/speech-preferences";
import { HudPanel } from "./HudPanel";

const bottomSlack = 8;

function atBottom(node: HTMLElement): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= bottomSlack;
}

interface ConversationPanelProps {
  conversation: ConversationView;
  speech: SpeechView;
  voice: VoiceView;
}

export function ConversationPanel({ conversation, speech, voice }: ConversationPanelProps) {
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const follow = useRef(true);
  const generating = useRef(false);
  const appliedTranscript = useRef(0);
  const [pinned, setPinned] = useState(true);
  const selected = conversation.providers.find((item) => item.id === conversation.provider);
  const models = selected?.models ?? [];
  const cloudBlocked = conversation.provider === "openai" && !conversation.cloudEnabled;
  const composerDisabled = conversation.phase === "loading"
    || conversation.phase === "generating"
    || conversation.phase === "disconnected"
    || models.length === 0
    || cloudBlocked;
  const micDisabled = conversation.phase === "loading" || conversation.phase === "generating";
  const location = conversation.provider === "openai" ? "Cloud" : "Local";
  const modelLabel = models.find((item) => item.id === conversation.model)?.label ?? "No model";
  const languageLabel = speechLanguageLabel(speech.language);
  const voiceLabel = ttsVoices.find((item) => item.id === voice.voice)?.label ?? "Voice";

  useEffect(() => {
    if (speech.transcriptVersion === appliedTranscript.current) {
      return;
    }
    appliedTranscript.current = speech.transcriptVersion;
    setDraft(speech.transcript);
    const field = composer.current?.querySelector("textarea");
    if (field instanceof HTMLTextAreaElement) {
      field.focus();
    }
  }, [speech.transcript, speech.transcriptVersion]);

  function revealBottom(): void {
    const node = transcript.current;
    follow.current = true;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
    setPinned(true);
  }

  useLayoutEffect(() => {
    const node = transcript.current;
    if (!node) {
      return;
    }
    const onScroll = () => {
      const bottom = atBottom(node);
      follow.current = bottom;
      setPinned(bottom);
    };
    node.addEventListener("scroll", onScroll);
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const node = transcript.current;
    const active = conversation.phase === "generating";
    if (active && !generating.current) {
      follow.current = true;
    }
    generating.current = active;
    if (!node) {
      return;
    }
    if (follow.current) {
      node.scrollTop = node.scrollHeight;
    }
    setPinned(atBottom(node));
  }, [conversation.messages, conversation.phase]);

  return (
    <motion.div
      className="panel-slot"
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <HudPanel testId="conversation-panel" label="Conversation" phase={conversation.phase}>
        <div className="panel-head">
          <p className="eyebrow">Conversation</p>
          <p className="stamp" data-testid="active-provider">{location} · {selected?.label ?? "Provider"}</p>
        </div>
        <div className="panel-scroll">
        <div className="panel-folds">
          <Fold title="Provider" summary={`${location} · ${modelLabel}`}>
            <div className="conversation-tools">
              <label>
                Provider
                <select
                  aria-label="Provider"
                  value={conversation.provider}
                  onChange={(event) => conversation.setProvider(event.target.value === "openai" ? "openai" : "ollama")}
                >
                  <option value="ollama">Ollama · local</option>
                  <option value="openai">OpenAI · cloud</option>
                </select>
              </label>
              <label>
                Model
                <select
                  aria-label="Model"
                  value={conversation.model}
                  onChange={(event) => conversation.setModel(event.target.value)}
                >
                  {models.length === 0 ? <option value="">No model available</option> : null}
                  {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => void conversation.reset()}>New conversation</button>
            </div>
            {conversation.provider === "openai" ? (
              <p className="notice" data-testid="cloud-notice">
                Cloud mode sends this conversation to OpenAI. It stays off until you opt in, and EVA will not fall back to the cloud on its own.
                <label className="choice">
                  <input
                    type="checkbox"
                    checked={conversation.cloudEnabled}
                    onChange={(event) => conversation.setCloudEnabled(event.target.checked)}
                  />
                  Send messages to OpenAI
                </label>
              </p>
            ) : null}
          </Fold>
          <Fold title="Listening" summary={languageLabel}>
            <SpeechSettings speech={speech} />
          </Fold>
          <Fold title="Voice" summary={voice.autoPlay ? `${voiceLabel} · automatic` : voiceLabel}>
            <VoiceSettings voice={voice} />
          </Fold>
        </div>
        <div className="transcript-frame">
          <div className="transcript" ref={transcript} aria-live="polite">
            {conversation.messages.length === 0 ? <p className="empty-copy">{conversation.detail}</p> : null}
            {conversation.messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="turn">
                <p className={`bubble ${message.role}`} data-role={message.role} data-status={message.status}>
                  {message.text}
                </p>
                {message.role === "assistant" && message.text.trim().length > 0 ? (
                  <button
                    type="button"
                    className="listen"
                    onClick={() => (voice.activeIndex === index && voice.phase !== "idle" ? voice.stop() : voice.speak(message.text, index))}
                  >
                    {voice.activeIndex === index && voice.phase !== "idle" ? "Stop speaking" : "Listen"}
                  </button>
                ) : null}
                {message.status === "stopped" ? <p className="status-copy">Stopped</p> : null}
              </div>
            ))}
            {conversation.messages.length > 0 ? <p className="status-copy">{conversation.detail}</p> : null}
          </div>
          {pinned ? null : (
            <button type="button" className="jump-bottom" aria-label="Scroll to bottom" onClick={revealBottom}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 6.5 8 11l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        {conversation.usage ? (
          <p className="usage-line" data-testid="usage">
            {conversation.usage.promptTokens} prompt tokens
            {" · "}
            {conversation.usage.completionTokens} completion tokens
            {conversation.usage.estimatedUsd === null ? "" : ` · about $${conversation.usage.estimatedUsd.toFixed(4)}`}
          </p>
        ) : null}
        {voice.notice ? (
          <p className="speech-status" data-testid="voice-status" data-phase={voice.phase} title={voice.timingTitle || undefined}>
            {voice.notice}
          </p>
        ) : null}
        {speech.notice ? (
          <p
            className="speech-status"
            data-testid="speech-status"
            data-phase={speech.phase}
            title={speech.timingTitle || undefined}
            aria-live="polite"
          >
            {speech.phase === "recording" ? <span className="speech-dot" aria-hidden="true" /> : null}
            {speech.notice}
          </p>
        ) : null}
        </div>
        <form
          ref={composer}
          className="composer"
          aria-label="Send a message"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft;
            setDraft("");
            void conversation.send(text).then((accepted) => {
              if (!accepted) {
                setDraft(text);
              }
            });
          }}
        >
          <textarea
            aria-label="Message"
            rows={2}
            placeholder="Message EVA"
            value={draft}
            disabled={composerDisabled}
            style={{ overflowY: "auto" }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => onComposerKeyDown(event, composerDisabled, draft, composer.current)}
          />
          <div className="composer-actions">
            {speech.phase === "recording" ? (
              <>
                <button type="button" onClick={speech.stop}>Stop recording</button>
                <button type="button" onClick={speech.cancel}>Discard recording</button>
              </>
            ) : null}
            {speech.phase === "transcribing" ? (
              <button type="button" onClick={speech.cancel}>Cancel transcription</button>
            ) : null}
            {speech.phase === "recording" || speech.phase === "transcribing" ? null : (
              <button
                type="button"
                data-testid="microphone"
                disabled={micDisabled || speech.arming}
                onClick={speech.start}
              >
                Speak
              </button>
            )}
            {conversation.phase === "generating"
              ? <button type="button" onClick={conversation.cancel}>Cancel</button>
              : <button type="submit" disabled={composerDisabled || draft.trim().length === 0}>Send</button>}
          </div>
        </form>
      </HudPanel>
    </motion.div>
  );
}

function Fold({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="fold">
      <button
        type="button"
        className="fold-toggle"
        aria-expanded={open}
        aria-label={`${title}, ${summary}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="fold-title">{title}</span>
        <span className="fold-summary">{summary}</span>
      </button>
      {open ? <div className="fold-body">{children}</div> : null}
    </section>
  );
}

function speechLanguageLabel(language: SpeechLanguage): string {
  if (language === "en") {
    return "English";
  }
  if (language === "fr") {
    return "French";
  }
  if (language === "ar") {
    return "Arabic";
  }
  return "Detect language";
}

function SpeechSettings({ speech }: { speech: SpeechView }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");
  const locked = speech.phase === "recording" || speech.phase === "transcribing";

  function add(): void {
    if (!speech.addTerm(draft)) {
      setError("Use letters, numbers, spaces, apostrophes, or hyphens.");
      return;
    }
    setDraft("");
    setError("");
  }

  function commitEdit(): void {
    if (editing === null) {
      return;
    }
    if (!speech.editTerm(editing, editValue)) {
      setError("Use letters, numbers, spaces, apostrophes, or hyphens.");
      return;
    }
    setEditing(null);
    setError("");
  }

  return (
    <div className="speech-tools">
      <label>
        Speech language
        <select
          aria-label="Speech language"
          value={speech.language}
          disabled={locked}
          onChange={(event) => speech.setLanguage(event.target.value as SpeechLanguage)}
        >
          <option value="auto">Detect language</option>
          <option value="en">English</option>
          <option value="fr">French</option>
          <option value="ar">Arabic</option>
        </select>
      </label>
      <div className="vocab">
        <p className="vocab-label">Vocabulary</p>
        {speech.vocabulary.map((term, index) => (
          <div className="vocab-row" key={`${index}-${term}`}>
            {editing === index ? (
              <input
                aria-label={`Edit vocabulary term ${index + 1}`}
                value={editValue}
                disabled={locked}
                onChange={(event) => setEditValue(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitEdit();
                  }
                }}
              />
            ) : (
              <span>{term}</span>
            )}
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                setEditing(index);
                setEditValue(term);
                setError("");
              }}
            >
              Edit
            </button>
            <button
              type="button"
              aria-label={`Remove ${term}`}
              disabled={locked}
              onClick={() => speech.removeTerm(index)}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="vocab-row">
          <input
            aria-label="Add vocabulary term"
            placeholder="Muay Thai"
            value={draft}
            disabled={locked}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <button type="button" disabled={locked || draft.trim().length === 0} onClick={add}>Add</button>
        </div>
        {error ? <p className="vocab-error">{error}</p> : null}
      </div>
    </div>
  );
}

function VoiceSettings({ voice }: { voice: VoiceView }) {
  const locked = voice.phase === "preparing" || voice.phase === "speaking";
  return (
    <div className="speech-tools">
      <label>
        Voice
        <select
          aria-label="Voice"
          value={voice.voice}
          disabled={locked}
          onChange={(event) => voice.setVoice(event.target.value as TtsVoiceId)}
        >
          {ttsVoices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}{item.lang === "fr-fr" ? " · French" : item.lang === "en-gb" ? " · British" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Speed
        <input
          aria-label="Speaking speed"
          type="range"
          min="0.5"
          max="1.5"
          step="0.05"
          value={voice.speed}
          disabled={locked}
          onChange={(event) => voice.setSpeed(Number(event.target.value))}
        />
      </label>
      <label>
        Volume
        <input
          aria-label="Playback volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={voice.volume}
          onChange={(event) => voice.setVolume(Number(event.target.value))}
        />
      </label>
      <label className="choice">
        <input
          type="checkbox"
          checked={voice.autoPlay}
          onChange={(event) => voice.setAutoPlay(event.target.checked)}
        />
        Speak completed replies
      </label>
      <button type="button" disabled={voice.phase === "preparing" || voice.phase === "speaking"} onClick={voice.preview}>Preview voice</button>
      {voice.phase === "idle" ? null : (
        <button type="button" onClick={voice.stop}>Stop speaking</button>
      )}
    </div>
  );
}

function onComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  composerDisabled: boolean,
  draft: string,
  form: HTMLFormElement | null,
) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
    return;
  }
  event.preventDefault();
  if (composerDisabled || draft.trim().length === 0) {
    return;
  }
  form?.requestSubmit();
}
