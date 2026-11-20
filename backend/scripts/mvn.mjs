import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const goals = process.argv.slice(2);
const child = process.platform === "win32"
  ? spawn("cmd.exe", ["/d", "/s", "/c", "mvnw.cmd", "-q", ...goals], {
      cwd: backendDir,
      stdio: "inherit",
      windowsHide: true,
    })
  : spawn("./mvnw", ["-q", ...goals], {
      cwd: backendDir,
      stdio: "inherit",
    });

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
