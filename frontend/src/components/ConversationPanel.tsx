import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ConversationView } from "../hooks/useConversation";
import { HudPanel } from "./HudPanel";

interface ConversationPanelProps {
  conversation: ConversationView;
}

export function ConversationPanel({ conversation }: ConversationPanelProps) {
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const selected = conversation.providers.find((item) => item.id === conversation.provider);
  const models = selected?.models ?? [];
  const cloudBlocked = conversation.provider === "openai" && !conversation.cloudEnabled;
  const composerDisabled = conversation.phase === "loading"
    || conversation.phase === "generating"
    || conversation.phase === "disconnected"
    || models.length === 0
    || cloudBlocked;
  const location = conversation.provider === "openai" ? "Cloud" : "Local";

  useEffect(() => {
    const node = transcript.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
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
        <div className="transcript" ref={transcript} aria-live="polite">
          {conversation.messages.length === 0 ? <p className="empty-copy">{conversation.detail}</p> : null}
          {conversation.messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className="turn">
              <p className={`bubble ${message.role}`} data-role={message.role} data-status={message.status}>
                {message.text}
              </p>
              {message.status === "stopped" ? <p className="status-copy">Stopped</p> : null}
            </div>
          ))}
          {conversation.messages.length > 0 ? <p className="status-copy">{conversation.detail}</p> : null}
        </div>
        {conversation.usage ? (
          <p className="usage-line" data-testid="usage">
            {conversation.usage.promptTokens} prompt tokens
            {" · "}
            {conversation.usage.completionTokens} completion tokens
            {conversation.usage.estimatedUsd === null ? "" : ` · about $${conversation.usage.estimatedUsd.toFixed(4)}`}
          </p>
        ) : null}
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
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => onComposerKeyDown(event, composerDisabled, draft, composer.current)}
          />
          {conversation.phase === "generating"
            ? <button type="button" onClick={conversation.cancel}>Cancel</button>
            : <button type="submit" disabled={composerDisabled || draft.trim().length === 0}>Send</button>}
        </form>
      </HudPanel>
    </motion.div>
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
