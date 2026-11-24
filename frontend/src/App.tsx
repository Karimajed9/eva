import { ActivityPanel } from "./components/ActivityPanel";
import { ConversationPanel } from "./components/ConversationPanel";
import { Header } from "./components/Header";
import { Stage } from "./components/Stage";
import { useConversation } from "./hooks/useConversation";
import { useAppInfo, useBackendStatus } from "./hooks/useBackendStatus";
import { useSpeech } from "./speech/useSpeech";

export function App() {
  const status = useBackendStatus();
  const conversation = useConversation(status.state);
  const speech = useSpeech(status.state);
  const appInfo = useAppInfo();
  const platform = appInfo?.platform
    ?? (typeof navigator !== "undefined" && navigator.userAgent.includes("Windows") ? "win32" : "unknown");
  const orbPhase = speech.phase === "recording"
    ? "recording"
    : speech.phase === "transcribing"
      ? "processing"
      : conversation.orb;

  return (
    <div className="shell">
      <div className="atmosphere" />
      <div className="vignette" />
      <Header status={status} platform={platform} />
      <main className="workspace">
        <ConversationPanel conversation={conversation} speech={speech} />
        <Stage status={status} phase={orbPhase} micLevel={speech.level} />
        <ActivityPanel status={status} />
      </main>
      <footer className="footer">Local by default · Cloud only after you opt in</footer>
    </div>
  );
}
