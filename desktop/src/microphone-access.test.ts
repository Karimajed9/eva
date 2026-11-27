import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { microphoneCheckAllowed, microphoneRequestAllowed } from "./microphone-access";
import type { RendererTrustOptions } from "./trusted-renderer";

const rendererFile = path.resolve("frontend", "dist", "index.html");
const production: RendererTrustOptions = {
  dev: false,
  rendererUrl: "http://127.0.0.1:5173",
  rendererFile,
};
const dev: RendererTrustOptions = { ...production, dev: true };

describe("microphone access", () => {
  it("allows audio only for the trusted development origin", () => {
    expect(microphoneRequestAllowed("media", {
      requestingUrl: "http://127.0.0.1:5173/",
      isMainFrame: true,
      mediaTypes: ["audio"],
    }, dev)).toBe(true);
    expect(microphoneCheckAllowed("media", {
      requestingUrl: "http://127.0.0.1:5173/",
      isMainFrame: true,
      mediaType: "audio",
    }, dev)).toBe(true);
    expect(microphoneRequestAllowed("media", {
      requestingUrl: "https://evil.example/",
      isMainFrame: true,
      mediaTypes: ["audio"],
    }, dev)).toBe(false);
    expect(microphoneRequestAllowed("media", {
      requestingUrl: "http://127.0.0.1:5174/",
      isMainFrame: true,
      mediaTypes: ["audio"],
    }, dev)).toBe(false);
  });

  it("allows audio only for the built interface and never camera or display capture", () => {
    const fileUrl = pathToFileURL(rendererFile).href;
    expect(microphoneRequestAllowed("media", {
      requestingUrl: fileUrl,
      isMainFrame: true,
      mediaTypes: ["audio"],
    }, production)).toBe(true);
    expect(microphoneRequestAllowed("media", {
      requestingUrl: fileUrl,
      isMainFrame: true,
      mediaTypes: ["video"],
    }, production)).toBe(false);
    expect(microphoneRequestAllowed("media", {
      requestingUrl: fileUrl,
      isMainFrame: true,
      mediaTypes: ["audio", "video"],
    }, production)).toBe(false);
    expect(microphoneRequestAllowed("display-capture", {
      requestingUrl: fileUrl,
      isMainFrame: true,
      mediaTypes: ["audio"],
    }, production)).toBe(false);
    expect(microphoneRequestAllowed("media", {
      requestingUrl: fileUrl,
      isMainFrame: false,
      mediaTypes: ["audio"],
    }, production)).toBe(false);
    expect(microphoneCheckAllowed("geolocation", {
      requestingUrl: fileUrl,
      isMainFrame: true,
      mediaType: "audio",
    }, production)).toBe(false);
  });

  it("allows speaker selection only for the trusted main frame", () => {
    const fileUrl = pathToFileURL(rendererFile).href;
    expect(microphoneRequestAllowed("speaker-selection", {
      requestingUrl: fileUrl,
      isMainFrame: true,
    }, production)).toBe(true);
    expect(microphoneCheckAllowed("speaker-selection", {
      requestingUrl: fileUrl,
      isMainFrame: true,
    }, production)).toBe(true);
    expect(microphoneRequestAllowed("speaker-selection", {
      requestingUrl: "https://evil.example/",
      isMainFrame: true,
    }, production)).toBe(false);
    expect(microphoneRequestAllowed("speaker-selection", {
      requestingUrl: fileUrl,
      isMainFrame: false,
    }, production)).toBe(false);
    expect(microphoneCheckAllowed("speaker-selection", {
      requestingUrl: fileUrl,
      isMainFrame: false,
    }, production)).toBe(false);
    expect(microphoneRequestAllowed("usb", {
      requestingUrl: fileUrl,
      isMainFrame: true,
    }, production)).toBe(false);
  });
});
