import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const windowSource = readFileSync(new URL("./window.ts", import.meta.url), "utf8");
const preload = readFileSync(new URL("./preload.ts", import.meta.url), "utf8");

describe("security posture", () => {
  it("keeps the renderer sandboxed and isolated from Node", () => {
    expect(windowSource).toContain("contextIsolation: true");
    expect(windowSource).toContain("nodeIntegration: false");
    expect(windowSource).toContain("sandbox: true");
    expect(windowSource).not.toContain("nodeIntegration: true");
    expect(windowSource).not.toContain("contextIsolation: false");
  });

  it("does not expose a generic IPC bridge", () => {
    expect(preload).toContain("contextBridge.exposeInMainWorld(\"jarvis\"");
    expect(preload).not.toContain("ipcRenderer.send");
    expect(preload).not.toContain("exposeInMainWorld(\"ipcRenderer\"");
    expect(main).not.toContain("nodeIntegration: true");
    expect(windowSource).not.toContain("shell.openExternal");
    expect(main).not.toContain("shell.openExternal");
  });
});
