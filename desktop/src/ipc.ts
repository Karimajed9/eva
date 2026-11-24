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
import { parseSpeechAudioRequest, parseSpeechPreferences } from "../../shared/speech-preferences";
import type { BackendManager } from "./backend-manager";
import { readSpeechPreferences, writeSpeechPreferences } from "./speech-preferences";
import { isTrustedRendererUrl, type RendererTrustOptions } from "./trusted-renderer";

export interface IpcOptions extends RendererTrustOptions {
  version: string;
  platform: NodeJS.Platform;
  preferencesPath: string;
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
    const request = parseSpeechAudioRequest(payload);
    if (!request) {
      return invalidAudio();
    }
    return manager.transcribeSpeech(request);
  });

  ipcMain.handle(IpcChannel.getSpeechPreferences, async (event) => {
    assertTrustedSender(event, options);
    return readSpeechPreferences(options.preferencesPath);
  });

  ipcMain.handle(IpcChannel.saveSpeechPreferences, async (event, payload: unknown) => {
    assertTrustedSender(event, options);
    const preferences = parseSpeechPreferences(payload);
    if (!preferences) {
      return invalidSettings();
    }
    await writeSpeechPreferences(options.preferencesPath, preferences);
    return preferences;
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

function invalidSettings(): SpeechFailure {
  return { ok: false, code: "invalid-audio", detail: "The speech settings were rejected." };
}

export function assertTrustedSender(event: IpcMainInvokeEvent, options: IpcOptions): void {
  const frame = event.senderFrame;
  if (!frame || frame.parent != null || !isTrustedRendererUrl(frame.url, options)) {
    throw new Error("Untrusted renderer.");
  }
}
