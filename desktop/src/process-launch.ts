import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const JAR_NAME = "eva-backend-0.1.0.jar";

export function resolveJavaExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.JAVA_HOME;
  if (home) {
    const executable = process.platform === "win32" ? "java.exe" : "java";
    const candidate = path.join(home, "bin", executable);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return process.platform === "win32" ? "java.exe" : "java";
}

export function parseJavaMajor(output: string): number | null {
  const match = output.match(/version "(?:1\.)?(\d+)/);
  if (!match?.[1]) {
    return null;
  }
  const major = Number(match[1]);
  return Number.isInteger(major) ? major : null;
}

export function resolveBackendJar(roots: readonly string[]): string | null {
  const relatives = [
    path.join("backend", "target", JAR_NAME),
    path.join("..", "backend", "target", JAR_NAME),
    path.join("..", "..", "backend", "target", JAR_NAME),
  ];
  for (const root of roots) {
    for (const relative of relatives) {
      const candidate = path.resolve(root, relative);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("No TCP port available.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function assertJava21(javaPath: string): Promise<void> {
  let output = "";
  try {
    output = await captureJavaVersion(javaPath);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code)
      : "";
    if (code === "ENOENT") {
      throw new Error("Java was not found. Install Java 21 or newer and try again.");
    }
    throw new Error("Java could not be started. Install Java 21 or newer and try again.");
  }

  const major = parseJavaMajor(output);
  if (major === null) {
    throw new Error("The installed Java version could not be read.");
  }
  if (major < 21) {
    throw new Error(`Java ${major} is too old. EVA needs Java 21 or newer.`);
  }
}

function captureJavaVersion(javaPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, ["-version"], { windowsHide: true, shell: false });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (output.trim().length === 0) {
        reject(new Error(`java -version exited ${code ?? "unknown"}.`));
        return;
      }
      resolve(output);
    });
  });
}
