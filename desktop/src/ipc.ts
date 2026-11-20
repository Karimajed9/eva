import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IpcChannel, SHELL_NAME, type AppInfo } from "../../shared/contract";
import type { BackendManager } from "./backend-manager";
import { isTrustedRendererUrl, type RendererTrustOptions } from "./trusted-renderer";

export interface IpcOptions extends RendererTrustOptions {
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
  const frame = event.senderFrame;
  if (!frame || frame.parent != null || !isTrustedRendererUrl(frame.url, options)) {
    throw new Error("Untrusted renderer.");
  }
}
