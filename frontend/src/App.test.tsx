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
    subscribeConversation: () => () => {},
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

  it("does not read the catalog until the core is online", async () => {
    let push: (status: BackendStatus) => void = () => {};
    let catalogCalls = 0;
    window.eva = {
      getBackendStatus: () => new Promise(() => {}),
      subscribeBackendStatus: (listener) => {
        push = listener;
        return () => {};
      },
      getAppInfo: async () => ({ name: "EVA", version: "0.1.0", platform: "win32" }),
      getConversation: async () => {
        catalogCalls += 1;
        return catalog();
      },
      sendConversation: async (request) => reply(request),
      resetConversation: async () => catalog(),
      cancelConversation: async () => {},
      subscribeConversation: () => () => {},
    };

    render(<App />);
    expect(screen.getByText(/waiting for the local core/i)).toBeInTheDocument();
    expect(catalogCalls).toBe(0);

    act(() => {
      push(online);
    });
    expect(await screen.findByText(/local models stay on this machine/i)).toBeInTheDocument();
    expect(catalogCalls).toBe(1);
    expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i);
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
    await waitFor(() => expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i));

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

  it("selects GPT-6 Luna when OpenAI is chosen and leaves the other models selectable", async () => {
    const source = catalog();
    source.providers[1] = {
      ...source.providers[1],
      models: [
        { id: "gpt-4o-mini", label: "GPT-4o mini" },
        { id: "gpt-4o", label: "GPT-4o" },
        { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
        { id: "gpt-6-luna", label: "GPT-6 Luna" },
      ],
    };
    const tracker = installBridge({ catalog: source });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toHaveValue("llama3.2"));
    expect(screen.getByLabelText("Provider")).toHaveValue("ollama");

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } });
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-6-luna");
    expect(screen.getByRole("checkbox", { name: "Send messages to OpenAI" })).not.toBeChecked();
    expect(screen.getByRole("option", { name: "GPT-4o mini" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GPT-4o" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GPT-4.1 mini" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Send messages to OpenAI" }));
    await sendDraft("Hello Luna");
    await waitFor(() => expect(tracker.sent).toHaveLength(1));
    expect(tracker.sent[0]).toMatchObject({ provider: "openai", model: "gpt-6-luna", cloudEnabled: true });

    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4o" } });
    await sendDraft("Use GPT-4o");
    await waitFor(() => expect(tracker.sent).toHaveLength(2));
    expect(tracker.sent[1]).toMatchObject({ provider: "openai", model: "gpt-4o", cloudEnabled: true });

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "ollama" } });
    expect(screen.getByLabelText("Provider")).toHaveValue("ollama");
    expect(screen.getByLabelText("Model")).toHaveValue("llama3.2");
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } });
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-6-luna");
  });

  it("shows a provider error without leaving the HUD", async () => {
    installBridge({
      send: async () => ({ ok: false, code: "provider-error", detail: "The model did not answer." }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i));
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

  it("keeps the question when a late reply arrives after stop", async () => {
    let finish: (result: ConversationResult) => void = () => {};
    const tracker = installBridge({
      send: (request) => new Promise((resolve) => {
        finish = resolve;
        void request;
      }),
    });
    const kept = catalog();
    window.eva = {
      ...window.eva!,
      getConversation: async () => kept,
      cancelConversation: async () => {
        tracker.cancelled += 1;
        kept.messages = [{ role: "user", text: "Wait for this", status: "stopped" }];
        finish({ ok: false, code: "cancelled", detail: "The reply was cancelled." });
      },
    };
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i));
    await sendDraft("Wait for this");
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "processing");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tracker.cancelled).toBe(1);
    await act(async () => {
      finish(reply({ provider: "ollama", model: "llama3.2", cloudEnabled: false, text: "Wait for this" }, "Too late"));
    });
    expect(await screen.findByText("Wait for this")).toBeInTheDocument();
    expect(screen.queryByText("Too late")).not.toBeInTheDocument();
    expect(document.querySelector("[data-role='assistant']")).toBeNull();
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("sends on Enter and keeps Shift+Enter in the message box", async () => {
    const tracker = installBridge();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i));
    const message = screen.getByLabelText("Message");

    fireEvent.change(message, { target: { value: "  " } });
    expect(fireEvent.keyDown(message, { key: "Enter" })).toBe(false);
    expect(tracker.sent).toHaveLength(0);

    fireEvent.change(message, { target: { value: "line one" } });
    expect(fireEvent.keyDown(message, { key: "Enter", shiftKey: true })).toBe(true);
    expect(tracker.sent).toHaveLength(0);
    expect(message).toHaveValue("line one");

    expect(fireEvent.keyDown(message, { key: "Enter" })).toBe(false);
    expect(await screen.findByText("Hello from EVA.")).toBeInTheDocument();
    expect(tracker.sent).toHaveLength(1);
    expect(tracker.sent[0]).toMatchObject({ provider: "ollama", text: "line one" });
    expect(message).toHaveValue("");
  });

  it("keeps streamed text once when generation stops and sends the next question", async () => {
    let emit: (delta: { type: "delta"; seq: number; text: string }) => void = () => {};
    let finish: (result: ConversationResult) => void = () => {};
    let turn = 0;
    const kept = catalog();
    const tracker = installBridge({
      send: (request) => {
        turn += 1;
        if (turn > 1) {
          return Promise.resolve(reply(request, "Second answer"));
        }
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    window.eva = {
      ...window.eva!,
      getConversation: async () => ({ ...kept, messages: kept.messages.map((message) => ({ ...message })) }),
      subscribeConversation: (listener) => {
        emit = listener;
        return () => {
          emit = () => {};
        };
      },
      cancelConversation: async () => {
        tracker.cancelled += 1;
        kept.messages = [
          { role: "user", text: "Stream this", status: "complete" },
          { role: "assistant", text: "Hello from EVA.", status: "stopped" },
        ];
        finish({ ok: false, code: "cancelled", detail: "The reply was cancelled." });
      },
    };
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Stream this" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Stream this")).toBeInTheDocument();
    act(() => {
      emit({ type: "delta", seq: 1, text: "Hello " });
      emit({ type: "delta", seq: 1, text: "NO" });
      emit({ type: "delta", seq: 2, text: "from EVA." });
    });
    expect(await screen.findByText("Hello from EVA.")).toBeInTheDocument();
    expect(screen.queryByText(/NO/)).not.toBeInTheDocument();
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "responding");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tracker.cancelled).toBe(1);
    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Stream this")).toHaveAttribute("data-role", "user");
    expect(screen.getByText("Hello from EVA.")).toHaveAttribute("data-status", "stopped");
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "idle");
    expect(screen.getByLabelText("Message")).toHaveValue("");
    act(() => {
      emit({ type: "delta", seq: 3, text: "LATE" });
    });
    expect(screen.queryByText(/LATE/)).not.toBeInTheDocument();
    expect(screen.getByText("Hello from EVA.")).toHaveTextContent("Hello from EVA.");

    await sendDraft("Next question");
    expect(await screen.findByText("Second answer")).toBeInTheDocument();
    expect(tracker.sent).toHaveLength(2);
    expect(tracker.sent[1]).toMatchObject({ provider: "ollama", cloudEnabled: false, text: "Next question" });
    expect(screen.getByText("Stream this")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("shows stopped without an assistant bubble when nothing was generated", async () => {
    let finish: (result: ConversationResult) => void = () => {};
    const kept = catalog();
    const tracker = installBridge({
      send: () => new Promise((resolve) => {
        finish = resolve;
      }),
    });
    window.eva = {
      ...window.eva!,
      getConversation: async () => ({ ...kept, messages: kept.messages.map((message) => ({ ...message })) }),
      cancelConversation: async () => {
        tracker.cancelled += 1;
        kept.messages = [{ role: "user", text: "Just the question", status: "stopped" }];
        finish({ ok: false, code: "cancelled", detail: "The reply was cancelled." });
      },
    };
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i));
    await sendDraft("Just the question");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Just the question")).toHaveAttribute("data-status", "stopped");
    expect(document.querySelector("[data-role='assistant']")).toBeNull();
    expect(screen.getByTestId("ai-orb")).toHaveAttribute("data-phase", "idle");
    expect(screen.getByLabelText("Message")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } });
    expect(screen.getByRole("checkbox", { name: "Send messages to OpenAI" })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Do not send this" } });
    fireEvent.submit(screen.getByRole("form", { name: "Send a message" }));
    expect(tracker.sent).toHaveLength(1);
    expect(tracker.sent[0]).toMatchObject({ provider: "ollama", cloudEnabled: false });
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument();
  });

  it("clears the transcript when a new conversation starts", async () => {
    installBridge();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("active-provider")).toHaveTextContent(/local · ollama/i));
    await sendDraft("Remember this");
    expect(await screen.findByText("Remember this")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await waitFor(() => expect(screen.queryByText("Remember this")).not.toBeInTheDocument());
  });
});
