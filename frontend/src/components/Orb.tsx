import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import type { BackendState } from "../../../shared/contract";
import { orbTone } from "../status-copy";

interface OrbProps {
  state: BackendState;
  phase?: "idle" | "processing" | "responding" | "error" | "recording";
  micLevel?: number;
}

export function Orb({ state, phase = "idle", micLevel = 0 }: OrbProps) {
  const reduced = useReducedMotion();
  const style = phase === "recording"
    ? { "--mic-level": micLevel.toFixed(3) } as CSSProperties
    : undefined;
  return (
    <motion.div
      className="orb"
      data-testid="ai-orb"
      data-state={state}
      data-phase={phase}
      data-tone={orbTone(state)}
      style={style}
      initial={reduced ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="orb-glow" />
      <div className="ticks" aria-hidden="true" />
      <svg className="reticle" viewBox="0 0 200 200" aria-hidden="true">
        <path d="M100 4 v18 M100 178 v18 M4 100 h18 M178 100 h18" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
        <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.35" />
      </svg>
      <svg className="ring" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 7" />
        <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="42 16 10 16" strokeLinecap="round" />
      </svg>
      <svg className="ring inner" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="1 10" />
      </svg>
      <div className="orbit" aria-hidden="true"><span /></div>
      <div className="orbit alt" aria-hidden="true"><span /></div>
      <div className="sphere" />
    </motion.div>
  );
}
