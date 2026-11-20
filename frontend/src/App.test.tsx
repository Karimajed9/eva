import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { BackendStatus } from "../../shared/contract";
import { App } from "./App";

const online: BackendStatus = {
  state: "up",
  detail: "The local core is online.",
  health: {
    status: "UP",
    service: "jarvis-backend",
    version: "0.1.0",
    timestamp: "2026-11-19T04:00:00.000Z",
  },
  checkedAt: "2026-11-19T04:00:01.000Z",
};

describe("JARVIS interface", () => {
  it("identifies both panels as not connected to AI", () => {
    render(<App />);
    expect(screen.getByTestId("conversation-panel")).toHaveTextContent(/not connected to ai/i);
    expect(screen.getByTestId("activity-panel")).toHaveTextContent(/not connected to ai/i);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByTestId("ai-orb")).toBeInTheDocument();
  });

  it("explains when the desktop bridge is missing", () => {
    render(<App />);
    expect(screen.getAllByText(/desktop bridge unavailable/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("connection-status")).toHaveTextContent("CORE ERROR");
  });

  it("shows the live backend status from the desktop bridge", async () => {
    let push: (status: BackendStatus) => void = () => {};
    window.jarvis = {
      getBackendStatus: async () => online,
      subscribeBackendStatus: (listener) => {
        push = listener;
        return () => {};
      },
      getAppInfo: async () => ({ name: "JARVIS", version: "0.1.0", platform: "win32" }),
    };

    render(<App />);
    expect(await screen.findByTestId("connection-status")).toHaveTextContent("CORE ONLINE");
    expect(screen.getAllByText("The local core is online.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/jarvis-backend 0\.1\.0/i).length).toBeGreaterThan(0);

    act(() => {
      push({
        ...online,
        state: "down",
        detail: "The local core is not responding.",
        health: null,
        checkedAt: "2026-11-19T04:00:05.000Z",
      });
    });
    expect(screen.getByTestId("connection-status")).toHaveTextContent("CORE OFFLINE");
  });
});
