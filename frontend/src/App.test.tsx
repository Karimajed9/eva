import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  BackendStatus,
  ConversationCatalog,
  ConversationRequest,
  ConversationResult,
} from "../../shared/contract";
import { App } from "./App";
import type { EvaBridge } from "./types/bridge";

const online: BackendStatus = {
  state: "up",
  detail: "The local core is online.",
  health: {
    status: "UP",
    service: "eva-backend",
    version: "0.1.0",
    timestamp: "2026-11-19T04:00:00.000Z",
  },
  checkedAt: "2026-11-19T04:00:01.000Z",
};

function catalog(reachable = true): ConversationCatalog {
  return {
    messages: [],
    providers: [
      {
        id: "ollama",
        label: "Ollama",
        local: true,
        reachable,
        configured: true,
        detail: reachable
          ? "Local models stay on this machine."
          : "Ollama is not running. EVA will not download a model.",
        models: reachable ? [{ id: "llama3.2", label: "llama3.2" }] : [],
      },
      {
        id: "openai",
        label: "OpenAI",
        local: false,
        reachable: true,
        configured: false,
        detail: "Cloud replies leave this machine.",
        models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
      },
    ],
  };
}

function reply(request: ConversationRequest, text = "Hello from EVA."): ConversationResult {
  return {
    ok: true,
    provider: request.provider,
    model: request.model,
    text,
    usage: request.provider === "openai"
      ? { promptTokens: 12, completionTokens: 8, estimatedUsd: 0.0002 }
      : { promptTokens: 12, completionTokens: 8, estimatedUsd: null },
  };
}

function installBridge(options: {
  catalog?: ConversationCatalog;
  send?: (request: ConversationRequest) => Promise<ConversationResult>;
  reset?: () => Promise<ConversationCatalog>;
  cancel?: () => Promise<void>;
  subscribe?: EvaBridge["subscribeBackendStatus"];
} = {}): { sent: ConversationRequest[]; cancelled: number; resetCount: number } {
  const sent: ConversationRequest[] = [];
  const tracker = { sent, cancelled: 0, resetCount: 0 };
  const current = options.catalog ?? catalog();
  window.eva = {
    getBackendStatus: async () => online,
    subscribeBackendStatus: options.subscribe ?? (() => () => {}),
    getAppInfo: async () => ({ name: "EVA", version: "0.1.0", platform: "win32" }),
    getConversation: async () => current,
    sendConversation: async (request) => {
      sent.push(request);
      return options.send ? options.send(request) : reply(request);
    },
    resetConversation: async () => {
      tracker.resetCount += 1;
      return options.reset ? options.reset() : { ...current, messages: [] };
    },
    cancelConversation: async () => {
      tracker.cancelled += 1;
    },
  };
  return tracker;
}

afterEach(() => {
  delete window.eva;
});

async function sendDraft(text: string): Promise<void> {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("EVA interface", () => {
  it("labels the center of the HUD EVA", () => {
    render(<App />);
    const stage = screen.getByRole("region", { name: "Assistant" });
    expect(within(stage).getByText("EVA")).toBeInTheDocument();
    expect(stage).not.toHaveTextContent(/jarvis/i);
  });

  it("keeps the activity feed disconnected from AI and the composer closed without a bridge", () => {
    render(<App />);
    expect(screen.getByTestId("activity-panel")).toHaveTextContent(/not connected to ai/i);
    expect(screen.getByTestId("conversation-panel")).not.toHaveTextContent(/not connected to ai/i);
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "idle");
  });

  it("explains when the desktop bridge is missing", () => {
    render(<App />);
    expect(screen.getAllByText(/desktop bridge unavailable/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("connection-status")).toHaveTextContent("CORE ERROR");
  });

  it("shows the live backend status from the desktop bridge", async () => {
    let push: (status: BackendStatus) => void = () => {};
    installBridge({
      subscribe: (listener) => {
        push = listener;
        return () => {};
      },
    });

    render(<App />);
    expect(await screen.findByTestId("connection-status")).toHaveTextContent("CORE ONLINE");
    expect(screen.getAllByText("The local core is online.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/eva-backend 0\.1\.0/i).length).toBeGreaterThan(0);

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

  it("sends local and cloud messages through the same bridge call", async () => {
    const tracker = installBridge();
    render(<App />);
    expect(await screen.findByTestId("active-provider")).toHaveTextContent(/local · ollama/i);

    await sendDraft("Hello locally");
    expect(await screen.findByText("Hello from EVA.")).toBeInTheDocument();
    expect(screen.getByText("Hello locally")).toHaveAttribute("data-role", "user");

    await sendDraft("Second turn");
    expect(screen.getByText("Hello locally")).toBeInTheDocument();
    expect(screen.getByText("Second turn")).toBeInTheDocument();
    expect(tracker.sent.map((request) => request.provider)).toEqual(["ollama", "ollama"]);

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } });
    expect(screen.getByTestId("cloud-notice")).toHaveTextContent(/will not fall back/i);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Do not send this" } });
    fireEvent.submit(screen.getByRole("form", { name: "Send a message" }));
    expect(tracker.sent).toHaveLength(2);
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Send messages to OpenAI" }));
    await sendDraft("Hello cloud");
    await waitFor(() => expect(tracker.sent).toHaveLength(3));
    expect(tracker.sent[2]).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      cloudEnabled: true,
      text: "Hello cloud",
    });
    expect(screen.getByTestId("active-provider")).toHaveTextContent(/cloud · openai/i);
    expect(screen.getByTestId("usage")).toHaveTextContent(/\$0\.0002/);
  });

  it("shows a provider error without leaving the HUD", async () => {
    installBridge({
      send: async () => ({ ok: false, code: "provider-error", detail: "The model did not answer." }),
    });
    render(<App />);
    await screen.findByLabelText("Model");
    await sendDraft("This will fail");
    expect(await screen.findByText("The model did not answer.")).toBeInTheDocument();
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "error");
    expect(screen.getByRole("region", { name: "Assistant" })).toHaveTextContent("EVA");
  });

  it("marks Ollama as disconnected and does not send", async () => {
    const tracker = installBridge({ catalog: catalog(false) });
    render(<App />);
    expect(await screen.findByText(/will not download a model/i)).toBeInTheDocument();
    expect(screen.getByTestId("conversation-panel")).toHaveAttribute("data-phase", "disconnected");
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "error");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(tracker.sent).toHaveLength(0);
  });

  it("resets the transcript and ignores a cancelled reply", async () => {
    let finish: (result: ConversationResult) => void = () => {};
    const tracker = installBridge({
      send: (request) => new Promise((resolve) => {
        finish = resolve;
        void request;
      }),
    });
    render(<App />);
    await screen.findByLabelText("Model");
    await sendDraft("Wait for this");
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "processing");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tracker.cancelled).toBe(1);
    await act(async () => {
      finish(reply({ provider: "ollama", model: "llama3.2", cloudEnabled: false, text: "Wait for this" }, "Too late"));
    });
    expect(screen.queryByText("Too late")).not.toBeInTheDocument();
  });

  it("clears the transcript when a new conversation starts", async () => {
    installBridge();
    render(<App />);
    await screen.findByLabelText("Model");
    await sendDraft("Remember this");
    expect(await screen.findByText("Remember this")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await waitFor(() => expect(screen.queryByText("Remember this")).not.toBeInTheDocument());
  });
});
