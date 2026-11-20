import { describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { assertTrustedSender } from "./ipc";

function eventWithUrl(url: string): IpcMainInvokeEvent {
  return { senderFrame: { url } } as IpcMainInvokeEvent;
}

describe("assertTrustedSender", () => {
  it("allows the dev renderer origin and local files in production", () => {
    expect(() => assertTrustedSender(eventWithUrl("http://127.0.0.1:5173/"), {
      dev: true,
      rendererUrl: "http://127.0.0.1:5173",
      version: "0.1.0",
      platform: "win32",
    })).not.toThrow();

    expect(() => assertTrustedSender(eventWithUrl("http://127.0.0.1:5174/"), {
      dev: true,
      rendererUrl: "http://127.0.0.1:5173",
      version: "0.1.0",
      platform: "win32",
    })).toThrow(/untrusted/i);

    expect(() => assertTrustedSender(eventWithUrl("file:///C:/jarvis/frontend/dist/index.html"), {
      dev: false,
      rendererUrl: "http://127.0.0.1:5173",
      version: "0.1.0",
      platform: "win32",
    })).not.toThrow();

    expect(() => assertTrustedSender(eventWithUrl("https://evil.example/"), {
      dev: false,
      rendererUrl: "http://127.0.0.1:5173",
      version: "0.1.0",
      platform: "win32",
    })).toThrow(/untrusted/i);
  });
});
