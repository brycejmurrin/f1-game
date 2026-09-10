#!/usr/bin/env node
/**
 * @doc Thin alias → `gfx-probe.mjs --backend webgpu` (WGX soft-present + optional readback).
 * @skill webgpu-debug
 *
 * Prefer the parent directly:
 *   node tools/gfx/gfx-probe.mjs --backend webgpu [--lite] [track]
 *
 * This shim keeps old npm/docs invocations working.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rest = process.argv.slice(2);
if (rest.includes("--help") || rest.includes("-h")) {
  console.log(`wgx-capture — alias of gfx-probe --backend webgpu

Prefer:
  node tools/gfx/gfx-probe.mjs --backend webgpu [--lite] [track]

Legacy:
  node tools/gfx/wgx-capture.mjs [track] [--lite]
`);
  process.exit(0);
}
const args = ["--backend", "webgpu"];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === "--lite") args.push("--lite");
  else if (a === "--out" || a === "--frames") i += 1; // parent picks its own out
  else if (!a.startsWith("-")) args.push(a);
  else console.error(`wgx-capture: ignoring unsupported flag ${a} (use gfx-probe directly)`);
}
console.error("wgx-capture: forwarding to gfx-probe --backend webgpu (alias; prefer the parent)");
const r = spawnSync(process.execPath, [path.join(HERE, "gfx-probe.mjs"), ...args], {
  stdio: "inherit",
});
process.exit(r.status == null ? 1 : r.status);
