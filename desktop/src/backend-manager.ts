import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  loopbackUrl,
  parseHealthPayload,
  type BackendStatus,
} from "../../shared/contract";
import { assertJava21, findFreePort, resolveJavaExecutable } from "./process-launch";
import { redactSecrets } from "./redact";
import {
  readProcessCommandLine,
  readRuntimeRecord,
  removeRuntimeRecord,
  shouldReapCommandLine,
  writeRuntimeRecord,
} from "./runtime-file";

const STARTUP_TIMEOUT_MS = 45_000;
const HEALTH_POLL_MS = 3_000;
const MAX_HEALTH_BYTES = 4_096;

export interface BackendManagerOptions {
  jarPath: string;
  javaPath?: string;
  log?: (line: string) => void;
  runtimeFilePath?: string;
}

export class BackendManager {
  private child: ChildProcess | null = null;
  private token = "";
  private port: number | null = null;
  private suppressExit = false;
  private poll: NodeJS.Timeout | null = null;
  private disposed = false;
  private haltPromise: Promise<void> | null = null;
  private readonly recentLogs: string[] = [];
  private readonly listeners = new Set<(status: BackendStatus) => void>();
  private readonly runtimeFilePath: string;
  private status: BackendStatus = {
    state: "starting",
    detail: "The local core has not started.",
    health: null,
    checkedAt: null,
  };

  constructor(private readonly options: BackendManagerOptions) {
    this.runtimeFilePath = options.runtimeFilePath
      ?? path.join(os.tmpdir(), "eva", "backend-runtime.json");
  }

  getStatus(): BackendStatus {
    return {
      state: this.status.state,
      detail: this.status.detail,
      health: this.status.health ? { ...this.status.health } : null,
      checkedAt: this.status.checkedAt,
    };
  }

  endpointPort(): number | null {
    return this.port;
  }

  onStatus(listener: (status: BackendStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.disposed || this.child) {
      return;
    }
    this.suppressExit = false;
    this.token = randomBytes(32).toString("hex");
    const javaPath = this.options.javaPath ?? resolveJavaExecutable();
    try {
      await assertJava21(javaPath);
    } catch (error) {
      this.publish(this.failure(error));
      throw error;
    }
    if (await this.stoppedDuringStartup()) {
      return;
    }

    await this.reapOrphan();
    if (await this.stoppedDuringStartup()) {
      return;
    }
    const port = await findFreePort();
    this.port = port;
    if (await this.stoppedDuringStartup()) {
      this.port = null;
      return;
    }
    this.publish({
      state: "starting",
      detail: "Starting the local core.",
      health: null,
      checkedAt: null,
    });

    const child = spawn(javaPath, ["-jar", this.options.jarPath, `--server.port=${port}`], {
      env: {
        ...process.env,
        EVA_SESSION_TOKEN: this.token,
        EVA_BACKEND_PORT: String(port),
      },
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.capture(child);
    if (await this.stoppedDuringStartup()) {
      return;
    }
    if (child.pid) {
      await writeRuntimeRecord(this.runtimeFilePath, {
        pid: child.pid,
        port,
        createdAt: new Date().toISOString(),
      });
    }
    if (await this.stoppedDuringStartup()) {
      return;
    }

    const ready = await this.waitUntilReady();
    if (this.disposed) {
      await this.haltProcess();
      return;
    }
    if (!ready) {
      await this.haltProcess();
      throw new Error(this.status.detail);
    }
    if (this.disposed) {
      await this.haltProcess();
      return;
    }
    this.poll = setInterval(() => {
      void this.refresh();
    }, HEALTH_POLL_MS);
    this.poll.unref();
  }

  async refresh(): Promise<BackendStatus> {
    if (this.disposed || this.port === null) {
      return this.getStatus();
    }
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(loopbackUrl(this.port, "/api/health"), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        signal: AbortSignal.timeout(3_000),
      });
      if (response.status === 401 || response.status === 403) {
        return this.publish({
          state: "error",
          detail: "The local core rejected the desktop session.",
          health: null,
          checkedAt,
        });
      }
      const body = await response.text();
      if (body.length > MAX_HEALTH_BYTES) {
        return this.publish({
          state: "error",
          detail: "The health response was larger than expected.",
          health: null,
          checkedAt,
        });
      }
      if (!response.ok) {
        return this.publish({
          state: "down",
          detail: `The local core returned HTTP ${response.status}.`,
          health: null,
          checkedAt,
        });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
      const health = parseHealthPayload(parsed);
      if (!health || health.status !== "UP") {
        return this.publish({
          state: "error",
          detail: "The health response did not match the expected contract.",
          health: null,
          checkedAt,
        });
      }
      return this.publish({
        state: "up",
        detail: "The local core is online.",
        health,
        checkedAt,
      });
    } catch {
      if (this.status.state === "starting") {
        return this.getStatus();
      }
      return this.publish({
        state: "down",
        detail: "The local core is not responding.",
        health: null,
        checkedAt,
      });
    }
  }

  async stop(): Promise<void> {
    this.disposed = true;
    await this.haltProcess();
    this.publish({
      state: "down",
      detail: "The local core has stopped.",
      health: null,
      checkedAt: new Date().toISOString(),
    });
  }

  private async stoppedDuringStartup(): Promise<boolean> {
    if (!this.disposed) {
      return false;
    }
    await this.haltProcess();
    return true;
  }

  private async waitUntilReady(): Promise<boolean> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.disposed) {
        return false;
      }
      if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
        this.publish({
          state: "error",
          detail: this.withTail("The local core stopped before it was ready."),
          health: null,
          checkedAt: new Date().toISOString(),
        });
        return false;
      }
      const status = await this.refresh();
      if (status.state === "up") {
        return true;
      }
      if (status.state === "error") {
        return false;
      }
      await delay(300);
    }
    this.publish({
      state: "error",
      detail: this.withTail("The local core did not become ready in time."),
      health: null,
      checkedAt: new Date().toISOString(),
    });
    await this.haltProcess();
    return false;
  }

  private haltProcess(): Promise<void> {
    if (!this.haltPromise) {
      this.haltPromise = this.haltProcessOnce().finally(() => {
        this.haltPromise = null;
      });
    }
    return this.haltPromise;
  }

  private async haltProcessOnce(): Promise<void> {
    this.suppressExit = true;
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
    const child = this.child;
    const port = this.port;
    const token = this.token;
    if (child && port !== null && token && child.exitCode === null) {
      try {
        await fetch(loopbackUrl(port, "/api/shutdown"), {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(2_000),
        });
      } catch {
        // The process may already be gone. A direct kill follows.
      }
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      await waitForExit(child, 5_000);
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      await waitForExit(child, 3_000);
    }
    if (child?.pid && child.exitCode === null && child.signalCode === null && process.platform === "win32") {
      await forceKillWindows(child.pid);
      await waitForExit(child, 3_000);
    }
    this.child = null;
    this.port = null;
    this.token = "";
    await removeRuntimeRecord(this.runtimeFilePath);
  }

  private async reapOrphan(): Promise<void> {
    const record = await readRuntimeRecord(this.runtimeFilePath);
    if (!record || record.pid === process.pid) {
      return;
    }
    const commandLine = await readProcessCommandLine(record.pid);
    if (!shouldReapCommandLine(commandLine)) {
      return;
    }
    try {
      process.kill(record.pid);
    } catch {
      // The previous process is already gone.
    }
    await delay(400);
  }

  private capture(child: ChildProcess): void {
    const append = (chunk: Buffer) => {
      const text = redactSecrets(chunk.toString("utf8"), [this.token]);
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        this.recentLogs.push(trimmed);
        if (this.recentLogs.length > 30) {
          this.recentLogs.shift();
        }
        this.options.log?.(trimmed);
      }
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => {
      this.publish(this.failure(error));
    });
    child.once("exit", (code, signal) => {
      if (this.poll) {
        clearInterval(this.poll);
        this.poll = null;
      }
      if (this.disposed || this.suppressExit || this.status.state === "starting") {
        return;
      }
      void removeRuntimeRecord(this.runtimeFilePath);
      this.publish({
        state: "down",
        detail: this.withTail(`The local core exited (${signal ?? code ?? "unknown"}).`),
        health: null,
        checkedAt: new Date().toISOString(),
      });
    });
  }

  private withTail(message: string): string {
    const tail = this.recentLogs.at(-1);
    const combined = tail ? `${message} ${tail}` : message;
    return combined.slice(0, 400);
  }

  private failure(error: unknown): BackendStatus {
    const message = error instanceof Error ? error.message : "The local core failed to start.";
    return {
      state: "error",
      detail: message.slice(0, 400),
      health: null,
      checkedAt: new Date().toISOString(),
    };
  }

  private publish(status: BackendStatus): BackendStatus {
    if (this.disposed && status.state !== "down") {
      return this.getStatus();
    }
    this.status = status;
    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function forceKillWindows(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      shell: false,
      stdio: "ignore",
    });
    killer.once("exit", () => resolve());
    killer.once("error", () => resolve());
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve();
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once("exit", onExit);
  });
}
