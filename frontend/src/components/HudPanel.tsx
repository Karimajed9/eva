import type { ReactNode } from "react";

interface HudPanelProps {
  testId: string;
  label: string;
  phase?: string;
  children: ReactNode;
}

export function HudPanel({ testId, label, phase, children }: HudPanelProps) {
  return (
    <section className="hud" data-testid={testId} data-phase={phase} aria-label={label}>
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
      {children}
    </section>
  );
}
