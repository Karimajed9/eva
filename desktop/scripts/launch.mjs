import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(desktopDir, "package.json"));
const electronPath = require("electron");
const args = process.argv.slice(2);
const mode = args.find((arg) => !arg.startsWith("--")) ?? "production";
const smoke = mode === "smoke" || args.includes("--smoke");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (mode === "development") {
  env.JARVIS_MODE = "development";
  env.JARVIS_RENDERER_URL = "http://127.0.0.1:5173";
} else {
  env.JARVIS_MODE = "production";
  delete env.JARVIS_RENDERER_URL;
}

if (smoke) {
  env.JARVIS_SMOKE = "1";
} else {
  delete env.JARVIS_SMOKE;
}

const child = spawn(electronPath, ["."], {
  cwd: desktopDir,
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
