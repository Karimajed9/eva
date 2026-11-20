import { motion, useReducedMotion } from "motion/react";
import { HudPanel } from "./HudPanel";

export function ConversationPanel() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="panel-slot"
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <HudPanel testId="conversation-panel" label="Conversation">
        <div className="panel-head">
          <p className="eyebrow">Conversation</p>
          <p className="stamp" data-testid="conversation-connection">Not connected to AI</p>
        </div>
        <div className="empty">
          <strong>No model is connected.</strong>
          <p>
            This panel is a placeholder for a future conversation view. Nothing typed here is sent
            anywhere.
          </p>
        </div>
        <form className="composer" onSubmit={(event) => event.preventDefault()}>
          <textarea
            disabled
            readOnly
            aria-label="Message"
            placeholder="Messages appear once a model is connected."
          />
          <button type="submit" disabled>
            Send
          </button>
        </form>
      </HudPanel>
    </motion.div>
  );
}
