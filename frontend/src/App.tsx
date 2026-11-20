import { ActivityPanel } from "./components/ActivityPanel";
import { ConversationPanel } from "./components/ConversationPanel";
import { Header } from "./components/Header";
import { Stage } from "./components/Stage";
import { useAppInfo, useBackendStatus } from "./hooks/useBackendStatus";

export function App() {
  const status = useBackendStatus();
  const appInfo = useAppInfo();
  const platform = appInfo?.platform
    ?? (typeof navigator !== "undefined" && navigator.userAgent.includes("Windows") ? "win32" : "unknown");

  return (
    <div className="shell">
      <div className="atmosphere" />
      <div className="vignette" />
      <Header status={status} platform={platform} />
      <main className="workspace">
        <ConversationPanel />
        <Stage status={status} />
        <ActivityPanel status={status} />
      </main>
      <footer className="footer">Milestone 1 · Desktop foundation · No model connected</footer>
    </div>
  );
}
