import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { assertTrustedSender, type IpcOptions } from "./ipc";

const rendererFile = path.resolve("frontend", "dist", "index.html");
const rendererFileUrl = pathToFileURL(rendererFile).href;
const otherFileUrl = pathToFileURL(path.resolve("frontend", "dist", "other.html")).href;

const production: IpcOptions = {
  dev: false,
  rendererUrl: "http://127.0.0.1:5173",
  rendererFile,
  version: "0.1.0",
  platform: "win32",
  preferencesPath: path.join("user-data", "speech-preferences.json"),
};

function eventWithUrl(url: string, parent: unknown = null): IpcMainInvokeEvent {
  return { senderFrame: { url, parent } } as IpcMainInvokeEvent;
}

describe("assertTrustedSender", () => {
  it("allows only the dev renderer origin", () => {
    const dev: IpcOptions = { ...production, dev: true };
    expect(() => assertTrustedSender(eventWithUrl("http://127.0.0.1:5173/"), dev)).not.toThrow();
    expect(() => assertTrustedSender(eventWithUrl("http://127.0.0.1:5174/"), dev)).toThrow(/untrusted/i);
    expect(() => assertTrustedSender(eventWithUrl("https://127.0.0.1:5173/"), dev)).toThrow(/untrusted/i);
  });

  it("allows only the built interface file", () => {
    expect(() => assertTrustedSender(eventWithUrl(rendererFileUrl), production)).not.toThrow();
    expect(() => assertTrustedSender(eventWithUrl(otherFileUrl), production)).toThrow(/untrusted/i);
    expect(() => assertTrustedSender(eventWithUrl("https://evil.example/"), production)).toThrow(/untrusted/i);
  });

  it("rejects subframes and missing frames", () => {
    expect(() => assertTrustedSender(eventWithUrl(rendererFileUrl, {}), production)).toThrow(/untrusted/i);
    expect(() => assertTrustedSender({} as IpcMainInvokeEvent, production)).toThrow(/untrusted/i);
  });
});
