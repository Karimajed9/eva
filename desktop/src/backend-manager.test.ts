import { describe, expect, it } from "vitest";
import { BackendManager } from "./backend-manager";

describe("BackendManager shutdown", () => {
  it("does not launch a core after stop", async () => {
    const manager = new BackendManager({ jarPath: "missing.jar" });
    await manager.stop();
    await manager.start();
    expect(manager.endpointPort()).toBeNull();
    expect(manager.getStatus().state).toBe("down");
    expect(manager.getStatus().detail).toBe("The local core has stopped.");
  });
});
