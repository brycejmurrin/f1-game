#!/usr/bin/env node
// Small, fixed WebGPU hardware gallery for city-track photography.
// @doc Produce a verified 4K urban WebGPU screenshot gallery through shot.mjs.
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function main() {
if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
  console.log("Capture the fixed 4K city WebGPU gallery on a hardware-enabled runner.\nUsage: node tools/shot/webgpu-urban-gallery.mjs");
  return;
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(ROOT, "artifacts", "webgpu-urban-gallery", stamp);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { track: "singapore", frac: 0.11, tod: "dusk", weather: "wet", side: -1, label: "Singapore dusk, wet street reflections" },
  { track: "vegas", frac: 0.62, tod: "night", weather: "rain", label: "Las Vegas night, rain and city lights" },
  { track: "monaco", frac: 0.37, tod: "day", weather: "dry", side: -1, label: "Monaco day, dry race traffic" },
].map((scene) => ({
  ...scene,
  cam: "trackside", side: scene.side ?? 1, el: 12, dist: 24, clear: true,
  traffic: true, noLine: true, showHud: false, backend: "three", team: "mclaren",
  out: join(outDir, `${scene.track}-${scene.tod}-${scene.weather}-4k.png`),
}));
const batchPath = join(outDir, "jobs.json");
writeFileSync(batchPath, JSON.stringify({ jobs: scenes }, null, 2) + "\n");

const shot = join(ROOT, "tools", "shot", "shot.mjs");
const args = [shot, "--batch", batchPath, "--backend", "three", "--tlx-webgpu", "--gpu", "hardware",
  "--browser", "chromium", "--profile", "comparison", "--width", "3840", "--height", "2160", "--dpr", "1",
  "--type", "png", "--seed", "42", "--ultra", "--traffic", "--no-line", "--wait", "180"];
console.log(`Capturing ${scenes.length} 3840x2160 full-frame WebGPU scenes in ${outDir}`);
const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit", env: process.env });
const status = result.status ?? 1;

const entries = scenes.map((scene) => {
  const evidence = `${scene.out}.capture.json`;
  const imageExists = existsSync(scene.out) && statSync(scene.out).size > 0;
  let receipt = null;
  try { receipt = JSON.parse(readFileSync(evidence, "utf8")); } catch (_) {}
  const state = receipt?.state?.diag?.env?.backendState;
  const verified = imageExists && receipt?.renderer?.positive === true
    && receipt?.browser?.webgpuAdapter?.verdict === "hardware"
    && state?.api === "webgpu" && state?.softAdapter === false
    && state?.liteGpu === false && state?.softBlit === false && state?.gpuErrors === 0
    && receipt?.frame?.drivingLine === "off" && receipt?.frame?.traffic?.count >= 2
    && receipt?.readiness;
  return { track: scene.track, label: scene.label, image: scene.out, evidence,
    status: verified ? "complete" : "failed" };
});
const manifest = { createdAt: new Date().toISOString(), resolution: "3840x2160", renderer: "Three.js WebGPU",
  gpu: "hardware", graphics: "ultra", racingLine: "off", traffic: "enabled",
  childExitCode: status, shots: entries };
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cards = entries.map((entry) => `<article><h2>${escape(entry.label)}</h2><a href="${escape(entry.image.split("/").slice(-1)[0])}"><img src="${escape(entry.image.split("/").slice(-1)[0])}" alt="${escape(entry.label)}"></a><p>${escape(entry.status)} · <a href="${escape(entry.evidence.split("/").slice(-1)[0])}">capture evidence</a></p></article>`).join("\n");
writeFileSync(join(outDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Three.js WebGPU urban gallery</title><style>body{margin:2rem;background:#101318;color:#f5f6f7;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:1.5rem}article{background:#1c222b;padding:1rem;border-radius:12px}img{width:100%;height:auto;display:block}a{color:#9bd1ff}</style><h1>Three.js WebGPU urban gallery · 4K</h1><p>Ultra graphics · cars staged in traffic · racing line off · original PNGs are linked below.</p><main>${cards}</main>`);
console.log(`Gallery: ${join(outDir, "index.html")}`);
process.exitCode = status || (entries.some((entry) => entry.status !== "complete") ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
