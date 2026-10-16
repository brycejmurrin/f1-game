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
import { exitIfHelp } from "../lib/cli-args.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rest = process.argv.slice(2);
// Answer --help here, before forwarding (render-car would launch nothing either,
// but its usage does not say this alias pins --preset=wing). An unknown flag is
// rejected by render-car's own flag set before Chromium launches (#1708).
exitIfHelp(rest, `usage: node tools/car/audit-aero.mjs [--team=mclaren] [--aero=extreme] [render-car flags...]
  Alias for: node tools/car/render-car.mjs --preset=wing ...  (three wing views; prefer the parent).
  Every flag is forwarded to render-car, which rejects unknown ones before launching Chromium.`);
const hasPreset = rest.some((a) => a === "--preset" || a.startsWith("--preset="));
const args = hasPreset ? rest : ["--preset=wing", ...rest];
console.error("audit-aero: forwarding to render-car --preset=wing (alias; prefer the parent)");
const r = spawnSync(process.execPath, [path.join(HERE, "render-car.mjs"), ...args], {
  stdio: "inherit",
});
process.exit(r.status == null ? 1 : r.status);
