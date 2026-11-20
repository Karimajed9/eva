import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: "node",
  target: "es2022",
  format: "cjs",
  sourcemap: true,
  legalComments: "none",
  external: ["electron"],
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
});

await build({
  ...shared,
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.js",
});
