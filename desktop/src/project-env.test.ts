import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyProjectEnv, backendConfigKeys, projectEnvironment } from "./project-env";

const root = path.join(os.tmpdir(), "eva-env-root");

describe("project environment", () => {
  it("loads whisper and kokoro settings and resolves relative paths from the repository root", () => {
    const absoluteModel = path.resolve(root, "outside", "ggml-base.bin");
    const env = projectEnvironment({
      root,
      environ: {},
      fileText: `
        # local speech
        export EVA_WHISPER_EXECUTABLE=tools/whisper-cli.exe
        EVA_WHISPER_MODEL="${absoluteModel}"
        EVA_WHISPER_GPU=vulkan
        EVA_KOKORO_PYTHON=tools/python.exe
        EVA_KOKORO_WORKER=speech/kokoro/worker.py
        EVA_KOKORO_MODEL='models/kokoro-v1.0.onnx'
        EVA_KOKORO_VOICES=models/voices-v1.0.bin
      `,
    });
    expect(env.EVA_WHISPER_EXECUTABLE).toBe(path.resolve(root, "tools/whisper-cli.exe"));
    expect(env.EVA_WHISPER_MODEL).toBe(absoluteModel);
    expect(env.EVA_WHISPER_GPU).toBe("vulkan");
    expect(env.EVA_KOKORO_PYTHON).toBe(path.resolve(root, "tools/python.exe"));
    expect(env.EVA_KOKORO_WORKER).toBe(path.resolve(root, "speech/kokoro/worker.py"));
    expect(env.EVA_KOKORO_MODEL).toBe(path.resolve(root, "models/kokoro-v1.0.onnx"));
    expect(env.EVA_KOKORO_VOICES).toBe(path.resolve(root, "models/voices-v1.0.bin"));
    expect(path.isAbsolute(env.EVA_KOKORO_WORKER ?? "")).toBe(true);
  });

  it("keeps an operating-system value ahead of the file, including a relative one", () => {
    const env = projectEnvironment({
      root,
      environ: {
        EVA_WHISPER_MODEL: "from-the-shell.bin",
        EVA_KOKORO_WORKER: "speech/kokoro/worker.py",
      },
      fileText: [
        "EVA_WHISPER_MODEL=models/ggml-base.bin",
        "EVA_KOKORO_WORKER=other/worker.py",
        "EVA_WHISPER_GPU=vulkan",
      ].join("\n"),
    });
    expect(env.EVA_WHISPER_MODEL).toBe("from-the-shell.bin");
    expect(env.EVA_KOKORO_WORKER).toBe("speech/kokoro/worker.py");
    expect(env.EVA_WHISPER_GPU).toBe("vulkan");
  });

  it("leaves the environment unchanged when the file is missing", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "eva-no-env-"));
    const environ = { EVA_WHISPER_GPU: "amd", PATH: "C:\\Windows" };
    applyProjectEnv(environ, directory);
    expect(environ).toEqual({ EVA_WHISPER_GPU: "amd", PATH: "C:\\Windows" });
  });

  it("reads a present file without copying unrelated secrets or a session token", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "eva-env-"));
    writeFileSync(path.join(directory, ".env"), [
      "EVA_KOKORO_WORKER=speech/kokoro/worker.py",
      "EVA_OPENAI_API_KEY=desktop-only-key",
      "EVA_SESSION_TOKEN=not-a-real-session",
      "AWS_SECRET_ACCESS_KEY=not-for-eva",
      "OTHER_SECRET=leave-me-out",
    ].join("\n"));
    const environ: NodeJS.ProcessEnv = { PATH: "C:\\Windows" };
    applyProjectEnv(environ, directory);
    expect(environ.EVA_KOKORO_WORKER).toBe(path.resolve(directory, "speech/kokoro/worker.py"));
    expect(environ.EVA_OPENAI_API_KEY).toBe("desktop-only-key");
    expect(environ.EVA_SESSION_TOKEN).toBeUndefined();
    expect(environ.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(environ.OTHER_SECRET).toBeUndefined();
    expect(environ.PATH).toBe("C:\\Windows");
    expect(backendConfigKeys).not.toContain("EVA_SESSION_TOKEN");
  });

  it("does not give the speech workers the session token or the OpenAI key", () => {
    const worker = readFileSync(new URL("../../backend/src/main/java/dev/karimajed/eva/tts/KokoroWorker.java", import.meta.url), "utf8");
    const whisper = readFileSync(new URL("../../backend/src/main/java/dev/karimajed/eva/speech/whisper/LocalCommandRunner.java", import.meta.url), "utf8");
    for (const source of [worker, whisper]) {
      expect(source).toContain("environment.remove(\"EVA_SESSION_TOKEN\")");
      expect(source).toContain("environment.remove(\"EVA_OPENAI_API_KEY\")");
    }
    const preload = readFileSync(new URL("./preload.ts", import.meta.url), "utf8");
    expect(preload).not.toContain("project-env");
    expect(preload).not.toContain(".env");
    expect(preload).not.toContain("EVA_OPENAI_API_KEY");
  });
});
