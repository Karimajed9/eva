import type { ReactNode } from "react";

interface HudPanelProps {
  testId: string;
  label: string;
  children: ReactNode;
}

export function HudPanel({ testId, label, children }: HudPanelProps) {
  return (
    <section className="hud" data-testid={testId} aria-label={label}>
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
      {children}
    </section>
  );
}
