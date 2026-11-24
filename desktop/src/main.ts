import { app, BrowserWindow, dialog, Menu } from "electron";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IpcChannel } from "../../shared/contract";
import { BackendManager } from "./backend-manager";
import { registerIpc } from "./ipc";
import { resolveBackendJar } from "./process-launch";
import { redactSecrets } from "./redact";
import { createMainWindow, hardenSession, installNavigationGuards, rendererFilePath } from "./window";

const dev = process.env.EVA_MODE === "development";
const smoke = process.env.EVA_SMOKE === "1";
const rendererUrl = process.env.EVA_RENDERER_URL ?? "http://127.0.0.1:5173";

let manager: BackendManager | null = null;
let mainWindow: BrowserWindow | null = null;
let shuttingDown = false;

function shellVersion(): string {
  try {
    const source = readFileSync(path.join(__dirname, "../package.json"), "utf8");
    const parsed = JSON.parse(source) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function reportFatal(error: unknown): void {
  const message = error instanceof Error ? (error.stack ?? error.message) : "unknown failure";
  console.error(`[eva] ${redactSecrets(message, [])}`);
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  const finish = () => {
    app.exit(1);
  };
  if (!manager) {
    finish();
    return;
  }
  void manager.stop().finally(finish);
}

function broadcastStatus(): void {
  if (!manager || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(IpcChannel.statusEvent, manager.getStatus());
}

async function bootstrap(): Promise<void> {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }
  hardenSession({
    dev,
    rendererUrl,
    rendererFile: rendererFilePath(),
  });
  installNavigationGuards({
    dev,
    rendererUrl,
    preloadPath: path.join(__dirname, "preload.js"),
    rendererFile: rendererFilePath(),
  });

  const jarPath = resolveBackendJar([__dirname, process.cwd(), path.resolve(__dirname, "..")]);
  if (!jarPath) {
    dialog.showErrorBox(
      "EVA",
      "The backend build was not found. From the repository root, run npm run build.",
    );
    app.exit(1);
    return;
  }

  manager = new BackendManager({
    jarPath,
    log: (line) => {
      console.info(`[backend] ${line}`);
    },
  });
  manager.onStatus(() => {
    broadcastStatus();
  });
  registerIpc(manager, {
    dev,
    rendererUrl,
    rendererFile: rendererFilePath(),
    version: shellVersion(),
    platform: process.platform,
  });

  try {
    mainWindow = await createMainWindow({
      dev,
      rendererUrl,
      preloadPath: path.join(__dirname, "preload.js"),
      rendererFile: rendererFilePath(),
    });
  } catch (error) {
    dialog.showErrorBox("EVA", error instanceof Error ? error.message : "The window failed to open.");
    app.exit(1);
    return;
  }

  broadcastStatus();
  if (smoke) {
    void runSmoke(mainWindow);
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void manager.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "The local core failed to start.";
    console.error(`[eva] ${redactSecrets(message, [])}`);
    broadcastStatus();
  });
}

async function pageText(window: BrowserWindow, selector: string): Promise<string> {
  const script = `document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`;
  const result = await Promise.race([
    window.webContents.executeJavaScript(script, true),
    new Promise((resolve) => setTimeout(() => resolve(""), 2_000)),
  ]);
  return String(result ?? "");
}

async function runSmoke(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 25_000;
  let detail = "The interface did not report an online core.";
  let ok = false;
  while (Date.now() < deadline) {
    try {
      const status = await pageText(window, "[data-testid=\"connection-status\"]");
      const conversation = await pageText(window, "[data-testid=\"conversation-panel\"]");
      const activity = await pageText(window, "[data-testid=\"activity-panel\"]");
      detail = `${status.trim()} | conversation=${conversation.toLowerCase().includes("provider")} | activity=${activity.toLowerCase().includes("not connected to ai")}`;
      if (
        status.includes("CORE ONLINE")
        && conversation.toLowerCase().includes("provider")
        && activity.toLowerCase().includes("not connected to ai")
      ) {
        ok = true;
        break;
      }
    } catch (error) {
      detail = error instanceof Error ? error.message : "The smoke query failed.";
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  try {
    window.setBounds({ x: 40, y: 40, width: 1280, height: 820 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const shot = path.join(os.tmpdir(), "eva-milestone1.png");
    await writeFile(shot, (await window.capturePage()).toPNG());
    console.log(`screenshot ${shot}`);
  } catch (error) {
    console.error(`[eva] screenshot failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
  console.log(JSON.stringify({ smoke: ok, detail }));
  await manager?.stop();
  app.exit(ok ? 0 : 1);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.on("before-quit", (event) => {
    if (shuttingDown || !manager) {
      return;
    }
    event.preventDefault();
    shuttingDown = true;
    void manager.stop().finally(() => {
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("certificate-error", (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(false);
  });

  process.on("uncaughtException", (error) => {
    reportFatal(error);
  });
  process.on("unhandledRejection", (error) => {
    reportFatal(error);
  });

  app.whenReady().then(bootstrap).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "EVA failed to start.";
    dialog.showErrorBox("EVA", message);
    app.exit(1);
  });
}
