import { useEffect, useRef, useState } from "react";
import type {
  ConversationCatalog,
  ConversationMessage,
  ConversationProvider,
  ConversationProviderStatus,
  ConversationUsage,
} from "../../../shared/contract";

export type PanelPhase = "loading" | "generating" | "error" | "disconnected" | "idle";
export type OrbPhase = "idle" | "processing" | "responding" | "error";

const bridgeDetail = "Desktop bridge unavailable. Launch EVA with the Electron shell.";

export interface ConversationView {
  phase: PanelPhase;
  orb: OrbPhase;
  detail: string;
  messages: ConversationMessage[];
  providers: ConversationProviderStatus[];
  provider: ConversationProvider;
  model: string;
  cloudEnabled: boolean;
  usage: ConversationUsage | null;
  setProvider: (provider: ConversationProvider) => void;
  setModel: (model: string) => void;
  setCloudEnabled: (enabled: boolean) => void;
  send: (text: string) => Promise<boolean>;
  reset: () => Promise<void>;
  cancel: () => void;
}

export function useConversation(): ConversationView {
  const bridge = typeof window !== "undefined" && window.eva ? window.eva : undefined;
  const [phase, setPhase] = useState<PanelPhase>(bridge ? "loading" : "error");
  const [orb, setOrb] = useState<OrbPhase>("idle");
  const [detail, setDetail] = useState(bridge ? "Checking models." : bridgeDetail);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [providers, setProviders] = useState<ConversationProviderStatus[]>([]);
  const [provider, setProviderState] = useState<ConversationProvider>("ollama");
  const [model, setModel] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [usage, setUsage] = useState<ConversationUsage | null>(null);
  const generation = useRef(0);
  const sending = useRef(false);
  const responding = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyCatalog(catalog: ConversationCatalog, selected = provider): void {
    setProviders(catalog.providers);
    setMessages(catalog.messages);
    const current = catalog.providers.find((item) => item.id === selected) ?? catalog.providers[0];
    if (!current) {
      setPhase("error");
      setDetail("The conversation catalog did not include a provider.");
      setOrb("error");
      return;
    }
    setProviderState(current.id);
    setModel((existing) => current.models.some((item) => item.id === existing) ? existing : (current.models[0]?.id ?? ""));
    if (current.id === "ollama" && !current.reachable) {
      setPhase("disconnected");
      setOrb("error");
    } else {
      setPhase("idle");
      setOrb("idle");
    }
    setDetail(current.detail);
  }

  useEffect(() => {
    const api = window.eva;
    if (!api) {
      return;
    }
    let active = true;
    void api.getConversation().then((result) => {
      if (!active) {
        return;
      }
      if ("ok" in result && result.ok === false) {
        setPhase("error");
        setOrb("error");
        setDetail(result.detail);
        return;
      }
      if ("providers" in result) {
        applyCatalog(result);
      }
    }).catch(() => {
      if (!active) {
        return;
      }
      setPhase("error");
      setOrb("error");
      setDetail("The conversation catalog could not be read.");
    });
    return () => {
      active = false;
      if (responding.current) {
        clearTimeout(responding.current);
      }
    };
  }, []);

  function setProvider(next: ConversationProvider): void {
    const status = providers.find((item) => item.id === next);
    setProviderState(next);
    setUsage(null);
    if (next !== "openai") {
      setCloudEnabled(false);
    }
    if (!status) {
      return;
    }
    setModel(status.models[0]?.id ?? "");
    setDetail(status.detail);
    if (next === "ollama" && !status.reachable) {
      setPhase("disconnected");
      setOrb("error");
      return;
    }
    setPhase("idle");
    setOrb("idle");
  }

  async function send(text: string): Promise<boolean> {
    const api = window.eva;
    const trimmed = text.trim();
    if (!api || sending.current || phase === "generating" || phase === "loading" || trimmed.length === 0 || model.length === 0) {
      return false;
    }
    if (provider === "openai" && !cloudEnabled) {
      setPhase("error");
      setOrb("error");
      setDetail("Cloud mode is off. Nothing was sent.");
      return false;
    }
    sending.current = true;
    const requestId = ++generation.current;
    setPhase("generating");
    setOrb("processing");
    setDetail("EVA is writing a reply.");
    try {
      const result = await api.sendConversation({
        provider,
        model,
        cloudEnabled: provider === "openai" && cloudEnabled,
        text: trimmed,
      });
      if (requestId !== generation.current) {
        return false;
      }
      if (!result.ok) {
        setPhase(result.code === "unavailable" ? "disconnected" : "error");
        setOrb("error");
        setDetail(result.detail);
        return false;
      }
      setMessages((current) => [
        ...current,
        { role: "user", text: trimmed },
        { role: "assistant", text: result.text },
      ]);
      setUsage(result.usage);
      setPhase("idle");
      setOrb("responding");
      setDetail(provider === "openai" ? "Replied through OpenAI." : "Replied locally.");
      if (responding.current) {
        clearTimeout(responding.current);
      }
      responding.current = setTimeout(() => {
        if (requestId === generation.current) {
          setOrb("idle");
        }
      }, 1200);
      return true;
    } catch {
      if (requestId !== generation.current) {
        return false;
      }
      setPhase("error");
      setOrb("error");
      setDetail("The reply could not be shown.");
      return false;
    } finally {
      sending.current = false;
    }
  }

  async function reset(): Promise<void> {
    const api = window.eva;
    generation.current += 1;
    setMessages([]);
    setUsage(null);
    setOrb("idle");
    if (!api) {
      return;
    }
    try {
      const result = await api.resetConversation();
      if ("providers" in result) {
        applyCatalog(result, provider);
      }
    } catch {
      setPhase("error");
      setDetail("The conversation could not be reset.");
    }
  }

  function cancel(): void {
    generation.current += 1;
    setPhase("idle");
    setOrb("idle");
    setDetail("The reply was cancelled.");
    void window.eva?.cancelConversation();
  }

  return {
    phase,
    orb,
    detail,
    messages,
    providers,
    provider,
    model,
    cloudEnabled,
    usage,
    setProvider,
    setModel,
    setCloudEnabled,
    send,
    reset,
    cancel,
  };
}
