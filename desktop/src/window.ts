import { app, BrowserWindow, session, type BrowserWindowConstructorOptions } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { isTrustedRendererUrl, type RendererTrustOptions } from "./trusted-renderer";
import { microphoneCheckAllowed, microphoneRequestAllowed } from "./microphone-access";

export interface ShellWindowOptions {
  dev: boolean;
  rendererUrl: string;
  preloadPath: string;
  rendererFile: string;
}

export function rendererFilePath(): string {
  return path.resolve(__dirname, "../../frontend/dist/index.html");
}

export function hardenSession(options: RendererTrustOptions): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const requestingUrl = "requestingUrl" in details ? details.requestingUrl : "";
    const isMainFrame = "isMainFrame" in details ? details.isMainFrame : false;
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
    callback(microphoneRequestAllowed(permission, { requestingUrl, isMainFrame, mediaTypes }, options));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, _requestingOrigin, details) => {
    return microphoneCheckAllowed(permission, details, options);
  });
  const policy = contentSecurityPolicy(options.dev, options.rendererUrl);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = {
      ...details.responseHeaders,
      "Content-Security-Policy": [policy],
    };
    callback({ responseHeaders });
  });
}

export async function createMainWindow(options: ShellWindowOptions): Promise<BrowserWindow> {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#04060c",
    autoHideMenuBar: true,
    title: "EVA",
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: options.dev,
      spellcheck: false,
    },
  };

  if (process.platform === "darwin") {
    windowOptions.titleBarStyle = "hiddenInset";
  } else if (process.platform === "win32") {
    windowOptions.titleBarStyle = "hidden";
    windowOptions.titleBarOverlay = {
      color: "#04060c",
      symbolColor: "#d7eeff",
      height: 48,
    };
  }

  const window = new BrowserWindow(windowOptions);
  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, options)) {
      event.preventDefault();
    }
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[eva] renderer exited: ${details.reason}`);
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[eva] preload failed (${preloadPath}): ${error.message}`);
  });
  window.webContents.on("console-message", (event) => {
    if (event.level === "warning" || event.level === "error") {
      console.error(`[renderer] ${event.message}`);
    }
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[eva] failed to load ${url}: ${code} ${description}`);
  });

  if (options.dev) {
    await window.loadURL(options.rendererUrl);
  } else if (!existsSync(options.rendererFile)) {
    throw new Error("The interface build was not found. From the repository root, run npm run build.");
  } else {
    await window.loadFile(options.rendererFile);
  }
  return window;
}

export function installNavigationGuards(options: ShellWindowOptions): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      if (!isTrustedRendererUrl(url, options)) {
        event.preventDefault();
      }
    });
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
  });
}

function contentSecurityPolicy(dev: boolean, rendererUrl: string): string {
  const origin = dev ? new URL(rendererUrl).origin : "";
  const connect = dev ? `'self' ${origin} ${origin.replace("http://", "ws://")}` : "'self'";
  const script = dev ? `'self' 'unsafe-inline' ${origin}` : "'self'";
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; ");
}
