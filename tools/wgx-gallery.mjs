#!/usr/bin/env node
// wgx-gallery.mjs — batch WebGPU screenshots across a curated track set.
//
// Writes PNGs + manifest to artifacts/tmp/wgx-gallery/<stamp>/ (gitignored).
// Committed reference: docs/research/wgx-gallery-manifest.json (recipe + last run).
//
// Usage:
//   node tools/wgx-gallery.mjs [--lite] [--out DIR]

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const lite = args.includes("--lite");
const outArg = args.indexOf("--out");
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const outRoot = outArg >= 0 ? args[outArg + 1] : join("artifacts", "tmp", "wgx-gallery", stamp);

/** @type {{ track: string, cam: string, extra?: string[] }[]} */
const SHOTS = [
  { track: "montreal", cam: "orbit" },
  { track: "montreal", cam: "eye" },
  { track: "singapore", cam: "orbit" },
  { track: "vegas", cam: "orbit" },
  { track: "spa", cam: "orbit" },
  { track: "monaco", cam: "eye" },
  { track: "bahrain", cam: "orbit" },
];

mkdirSync(outRoot, { recursive: true });

const results = [];
let failures = 0;

for (const spec of SHOTS) {
  const label = spec.track + (spec.cam !== "orbit" ? "-" + spec.cam : "");
  const outDir = join(outRoot, label);
  mkdirSync(outDir, { recursive: true });
  const shotArgs = ["tools/wgx-shot.mjs", spec.track];
  if (lite) shotArgs.push("--lite");
  shotArgs.push("--cam", spec.cam, "--out", outDir);
  const run = spawnSync(process.execPath, shotArgs, { cwd: ROOT, encoding: "utf8" });
  const statePath = join(outDir, "state.json");
  const state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : null;
  const entry = {
    label,
    track: spec.track,
    cam: spec.cam,
    ok: run.status === 0 && state && state.backend === "webgpu" && state.gpuErrors === 0,
    backend: state && state.backend,
    gpuErrors: state && state.gpuErrors,
    coveragePct: state && state.coveragePct,
    canvas: join(outDir, "canvas.png"),
    exitCode: run.status,
    error: run.status !== 0 ? ((run.stderr || run.stdout || "wgx-shot failed").trim().slice(0, 300)) : null,
  };
  results.push(entry);
  if (!entry.ok) failures++;
  console.log(label, entry.ok ? "ok" : "FAIL", entry.gpuErrors != null ? "gpuErrors=" + entry.gpuErrors : "");
}

const manifest = {
  generatedAt: new Date().toISOString(),
  lite,
  outRoot,
  backend: "webgpu",
  shots: results.map(({ canvas, ...rest }) => rest),
};
writeFileSync(join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const refPath = join(ROOT, "docs/research/wgx-gallery-manifest.json");
writeFileSync(refPath, JSON.stringify({
  ...manifest,
  note: "PNG output is gitignored under artifacts/; re-run tools/wgx-gallery.mjs to regenerate.",
}, null, 2) + "\n");

console.log("wrote", join(outRoot, "manifest.json"));
console.log("updated", refPath);
process.exit(failures ? 1 : 0);
