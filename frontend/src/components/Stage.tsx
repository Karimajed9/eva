import type { BackendStatus } from "../../../shared/contract";
import type { OrbPhase } from "../hooks/useConversation";
import { statusHeadline } from "../status-copy";
import { Orb } from "./Orb";

interface StageProps {
  status: BackendStatus;
  phase: OrbPhase;
}

export function Stage({ status, phase }: StageProps) {
  return (
    <section className="stage" aria-label="Assistant">
      <Orb state={status.state} phase={phase} />
      <div className="nameplate">
        <p className="kicker"><span>EVA</span></p>
        <h1 className="headline">{statusHeadline(status.state)}</h1>
        <p className="detail">{status.detail}</p>
        {status.health ? (
          <p className="meta">
            {status.health.service} {status.health.version}
            {status.checkedAt ? ` · checked ${new Date(status.checkedAt).toLocaleTimeString()}` : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
