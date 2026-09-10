#!/usr/bin/env node
/**
 * @doc Thin alias → `render-car.mjs --preset=wing` (three wing views). Prefer the parent.
 * @skill garage-parts-livery
 *
 *   node tools/car/render-car.mjs --team=mclaren --preset=wing [--aero=extreme]
 *
 * Historical ROOT bug (climbed one level above the repo) is gone with this shim.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rest = process.argv.slice(2);
const hasPreset = rest.some((a) => a === "--preset" || a.startsWith("--preset="));
const args = hasPreset ? rest : ["--preset=wing", ...rest];
console.error("audit-aero: forwarding to render-car --preset=wing (alias; prefer the parent)");
const r = spawnSync(process.execPath, [path.join(HERE, "render-car.mjs"), ...args], {
  stdio: "inherit",
});
process.exit(r.status == null ? 1 : r.status);
