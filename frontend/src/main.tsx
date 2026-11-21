import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/orbitron/500.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("EVA could not find its root element.");
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
