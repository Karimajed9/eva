import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  IpcChannel,
  parseConversationCatalog,
  parseConversationRequest,
  SHELL_NAME,
  type AppInfo,
  type ConversationFailure,
} from "../../shared/contract";
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

  ipcMain.handle(IpcChannel.getConversation, async (event) => {
    assertTrustedSender(event, options);
    const result = await manager.core("GET", "/api/conversation");
    if ("ok" in result) {
      return result;
    }
    return parseConversationCatalog(result.json) ?? invalidConversation();
  });

  ipcMain.handle(IpcChannel.sendConversation, async (event, payload: unknown) => {
    assertTrustedSender(event, options);
    const request = parseConversationRequest(payload);
    if (!request) {
      return invalidConversation();
    }
    const sender = event.sender;
    return manager.streamConversation(request, (delta) => {
      if (!sender.isDestroyed()) {
        sender.send(IpcChannel.conversationEvent, delta);
      }
    });
  });

  ipcMain.handle(IpcChannel.resetConversation, async (event) => {
    assertTrustedSender(event, options);
    const result = await manager.core("POST", "/api/conversation/reset");
    if ("ok" in result) {
      return result;
    }
    return parseConversationCatalog(result.json) ?? invalidConversation();
  });

  ipcMain.handle(IpcChannel.cancelConversation, async (event) => {
    assertTrustedSender(event, options);
    manager.abortActiveStream();
    const result = await manager.core("POST", "/api/conversation/cancel");
    if ("ok" in result) {
      return result;
    }
    return { ok: true as const, status: "CANCELLED" };
  });
}

function invalidConversation(): ConversationFailure {
  return { ok: false, code: "invalid", detail: "The conversation response did not match the contract." };
}

export function assertTrustedSender(event: IpcMainInvokeEvent, options: IpcOptions): void {
  const frame = event.senderFrame;
  if (!frame || frame.parent != null || !isTrustedRendererUrl(frame.url, options)) {
    throw new Error("Untrusted renderer.");
  }
}
