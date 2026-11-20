import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loopbackUrl } from "../../shared/contract";
import { BackendManager } from "./backend-manager";
import { resolveBackendJar } from "./process-launch";

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
});
