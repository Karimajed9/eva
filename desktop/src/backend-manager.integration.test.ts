import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loopbackUrl } from "../../shared/contract";
import { BackendManager } from "./backend-manager";
import { resolveBackendJar } from "./process-launch";
import { readRuntimeRecord } from "./runtime-file";

const jarPath = resolveBackendJar([process.cwd(), path.resolve(process.cwd(), "..")]);

describe("backend process", () => {
  const managers: BackendManager[] = [];

  afterEach(async () => {
    await Promise.all(managers.splice(0).map((manager) => manager.stop()));
  });

  it("serves authenticated health on loopback and then shuts down", async () => {
    expect(jarPath, "Build the backend with npm run build --prefix backend before this test.").toBeTruthy();
    const logs: string[] = [];
    const manager = new BackendManager({
      jarPath: jarPath as string,
      log: (line) => logs.push(line),
    });
    managers.push(manager);

    await manager.start();
    const status = manager.getStatus();
    const port = manager.endpointPort();
    expect(status.state).toBe("up");
    expect(status.health?.service).toBe("jarvis-backend");
    expect(status.health?.status).toBe("UP");
    expect(port).toBeTypeOf("number");

    const anonymous = await fetch(loopbackUrl(port as number, "/api/health"));
    expect(anonymous.status).toBe(401);
    const wrongToken = await fetch(loopbackUrl(port as number, "/api/health"), {
      headers: { Authorization: `Bearer ${"b".repeat(64)}` },
    });
    expect(wrongToken.status).toBe(401);
    expect(logs.join("\n")).not.toMatch(/Bearer\s+[a-f0-9]{32,}/i);

    await manager.stop();
    let refused = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await fetch(loopbackUrl(port as number, "/api/health"), { signal: AbortSignal.timeout(500) });
      } catch {
        refused = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(refused).toBe(true);
    expect(manager.getStatus().state).toBe("down");
  }, 90_000);

  it("reports down when the core process exits", async () => {
    expect(jarPath).toBeTruthy();
    const runtimeFilePath = path.join(os.tmpdir(), `jarvis-runtime-${process.pid}-crash.json`);
    const manager = new BackendManager({
      jarPath: jarPath as string,
      runtimeFilePath,
      log: () => undefined,
    });
    managers.push(manager);
    await manager.start();
    const record = await readRuntimeRecord(runtimeFilePath);
    expect(record?.pid).toBeTypeOf("number");
    process.kill(record?.pid as number);
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && manager.getStatus().state !== "down") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(manager.getStatus().state).toBe("down");
    expect(manager.getStatus().detail.toLowerCase()).toMatch(/exited|not responding/);
  }, 90_000);

  it("stops a core that exits during startup", async () => {
    const manager = new BackendManager({
      jarPath: path.join(os.tmpdir(), "jarvis-missing-backend.jar"),
      log: () => undefined,
    });
    managers.push(manager);
    await expect(manager.start()).rejects.toThrow(/stopped before it was ready/i);
    expect(manager.endpointPort()).toBeNull();
    expect(manager.getStatus().state).toBe("error");
  }, 30_000);
});
