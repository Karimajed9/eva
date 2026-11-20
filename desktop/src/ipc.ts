import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IpcChannel, SHELL_NAME, type AppInfo } from "../../shared/contract";
import type { BackendManager } from "./backend-manager";

export interface IpcOptions {
  dev: boolean;
  rendererUrl: string;
  version: string;
  platform: NodeJS.Platform;
}

export function registerIpc(manager: BackendManager, options: IpcOptions): void {
  ipcMain.handle(IpcChannel.getStatus, (event) => {
    assertTrustedSender(event, options);
    return manager.getStatus();
  });

  ipcMain.handle(IpcChannel.getAppInfo, (event) => {
    assertTrustedSender(event, options);
    const info: AppInfo = {
      name: SHELL_NAME,
      version: options.version,
      platform: options.platform,
    };
    return info;
  });
}

export function assertTrustedSender(event: IpcMainInvokeEvent, options: IpcOptions): void {
  const url = event.senderFrame?.url ?? "";
  if (options.dev) {
    let parsed: URL;
    let allowed: URL;
    try {
      parsed = new URL(url);
      allowed = new URL(options.rendererUrl);
    } catch {
      throw new Error("Untrusted renderer.");
    }
    if (parsed.origin !== allowed.origin || parsed.protocol !== "http:") {
      throw new Error("Untrusted renderer.");
    }
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Untrusted renderer.");
  }
  if (parsed.protocol !== "file:") {
    throw new Error("Untrusted renderer.");
  }
}
