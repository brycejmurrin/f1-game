#!/usr/bin/env node
/**
 * @doc Thin alias → `gfx-probe.mjs --backend three --tlx-webgpu --lavapipe`.
 * @skill webgpu-debug / mcp-probe
 *
 * Prefer the parent directly. This shim keeps old recipe paths working.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rest = process.argv.slice(2);
if (rest.includes("--help") || rest.includes("-h")) {
  console.log(`wgx-lavapipe-probe — alias of gfx-probe --lavapipe

Prefer:
  node tools/gfx/gfx-probe.mjs --backend three --tlx-webgpu --lavapipe [track]

Legacy:
  node tools/gfx/wgx-lavapipe-probe.mjs [track] [--lite]
`);
  process.exit(0);
}
const track = rest.find((a) => !a.startsWith("--")) || "montreal";
const lite = rest.includes("--lite");
const args = ["--backend", "three", "--tlx-webgpu", "--lavapipe", track];
if (lite) args.push("--lite");
console.error("wgx-lavapipe-probe: forwarding to gfx-probe --lavapipe (alias; prefer the parent)");
const r = spawnSync(process.execPath, [path.join(HERE, "gfx-probe.mjs"), ...args], {
  stdio: "inherit",
});
process.exit(r.status == null ? 1 : r.status);
