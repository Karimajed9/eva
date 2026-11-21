import type { BackendStatus } from "../../../shared/contract";
import { statusLabel } from "../status-copy";

interface HeaderProps {
  status: BackendStatus;
  platform: string;
}

export function Header({ status, platform }: HeaderProps) {
  const pad = platform === "win32" ? "pad-win" : platform === "darwin" ? "pad-mac" : "";
  return (
    <header className={`topbar drag ${pad}`}>
      <div className="brand">
        <span className="mark" aria-hidden="true" />
        <span className="wordmark">EVA</span>
      </div>
      <p className="privacy">Local session · Private</p>
      <div
        className="status-pill no-drag"
        data-testid="connection-status"
        data-state={status.state}
        role="status"
        aria-live="polite"
        title={status.detail}
      >
        <span className="dot" aria-hidden="true" />
        {statusLabel(status.state)}
      </div>
    </header>
  );
}
