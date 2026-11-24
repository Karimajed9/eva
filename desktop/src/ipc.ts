import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  IpcChannel,
  parseConversationCatalog,
  parseConversationRequest,
  parseSpeechStatusResult,
  SHELL_NAME,
  type AppInfo,
  type ConversationFailure,
  type SpeechFailure,
} from "../../shared/contract";
import { parseSpeechWav } from "../../shared/speech-wav";
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

  ipcMain.handle(IpcChannel.getSpeech, async (event) => {
    assertTrustedSender(event, options);
    const result = await manager.core("GET", "/api/speech");
    if ("ok" in result) {
      return result;
    }
    return parseSpeechStatusResult(result.json) ?? invalidSpeech();
  });

  ipcMain.handle(IpcChannel.transcribeSpeech, async (event, payload: unknown) => {
    assertTrustedSender(event, options);
    const audio = parseSpeechWav(payload);
    if (!audio) {
      return invalidAudio();
    }
    return manager.transcribeSpeech(audio);
  });

  ipcMain.handle(IpcChannel.cancelSpeech, async (event) => {
    assertTrustedSender(event, options);
    manager.abortSpeech();
    await manager.core("POST", "/api/speech/cancel");
    return { ok: true as const, status: "CANCELLED" };
  });
}

function invalidConversation(): ConversationFailure {
  return { ok: false, code: "invalid", detail: "The conversation response did not match the contract." };
}

function invalidSpeech(): SpeechFailure {
  return { ok: false, code: "engine-error", detail: "The speech status did not match the contract." };
}

function invalidAudio(): SpeechFailure {
  return { ok: false, code: "invalid-audio", detail: "EVA could not use that recording." };
}

export function assertTrustedSender(event: IpcMainInvokeEvent, options: IpcOptions): void {
  const frame = event.senderFrame;
  if (!frame || frame.parent != null || !isTrustedRendererUrl(frame.url, options)) {
    throw new Error("Untrusted renderer.");
  }
}
