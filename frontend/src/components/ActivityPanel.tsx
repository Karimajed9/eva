import { motion, useReducedMotion } from "motion/react";
import type { BackendStatus } from "../../../shared/contract";
import { HudPanel } from "./HudPanel";

interface ActivityPanelProps {
  status: BackendStatus;
}

export function ActivityPanel({ status }: ActivityPanelProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="panel-slot"
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
    >
      <HudPanel testId="activity-panel" label="Activity">
        <div className="panel-head">
          <p className="eyebrow">Activity</p>
          <p className="stamp" data-testid="activity-connection">Not connected to AI</p>
        </div>
        <p className="note">
          This feed is not an AI activity log. Computer automation is not enabled.
        </p>
        <ol className="feed">
          <li>
            <span>Shell</span>
            <strong>Interface loaded</strong>
            <em>local</em>
          </li>
          <li>
            <span>Core</span>
            <strong>{status.detail}</strong>
            <em>local</em>
          </li>
          {status.health ? (
            <li>
              <span>Build</span>
              <strong>{status.health.service} {status.health.version}</strong>
              <em>local</em>
            </li>
          ) : null}
        </ol>
      </HudPanel>
    </motion.div>
  );
}
