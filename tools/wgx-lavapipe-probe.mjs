#!/usr/bin/env node
// wgx-lavapipe-probe.mjs — WebGPU on Mesa Lavapipe under Xvfb (three.js e2e recipe).
// @doc WebGPU on Mesa Lavapipe + Xvfb — the second software backend beside SwiftShader; `[track] [--lite]`.
// @skill webgpu-debug / mcp-probe
//
// Installed deps: mesa-vulkan-drivers (lvp_icd.json), xvfb.
// SwiftShader validates but never composites; Lavapipe shares ANGLE/Vulkan/Dawn
// and is the path upstream is moving to — still not a pixel oracle in every CI
// box, but a second lifecycle signal worth running before declaring WGX dead.
//
// Usage:
//   node tools/wgx-lavapipe-probe.mjs [trackId] [--lite]
//
// Writes artifacts/tmp/wgx-lavapipe-probe.json

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const track = args.find((a) => !a.startsWith("--")) || "montreal";
const lite = args.includes("--lite");

const inner = `
import { createRequire } from "node:module";
const ROOT = ${JSON.stringify(ROOT)};
const { startStaticServer, launchChromium, shutdown, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } = await import("./lib/harness.mjs");
const { chromium } = createRequire(import.meta.url)("playwright");
const srv = await startStaticServer(ROOT);
const browser = await launchChromium({
  executablePath: chromium.executablePath(),
  headless: false,
  args: WEBGPU_LAVAPE_CHROMIUM_ARGS,
  env: { ...process.env, ...WEBGPU_LAVAPE_ENV },
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript((wantLite) => {
  localStorage.setItem("apex26.gfxBackend", "webgpu");
  localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
  if (wantLite) localStorage.setItem("apex26.gfxWgxLite", "1");
  sessionStorage.setItem("apex26.wgxCapture", "1");
}, ${lite});
await page.goto(srv.url + "index.html");
await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 60000 });
await page.evaluate((id) => { __apex.race(id); __apex.go(); }, ${JSON.stringify(track)});
await page.waitForFunction(
  () => { try { const p = __apex.physState(); return p && p.ok !== false; } catch { return false; } },
  null, { polling: 100, timeout: 120000 });
await page.evaluate(() => { __apex.jump(0.12, 65); __apex.snapCam(); });
await page.evaluate((n) => new Promise((res) => {
  let i = 0; const t = () => (++i > n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t);
}), 40);
await page.evaluate(async () => {
  if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) await GLX.awaitSoftPresent(15000);
});
const out = await page.evaluate(async () => {
  const c = document.getElementById("game");
  const tmp = document.createElement("canvas");
  tmp.width = c.width; tmp.height = c.height;
  tmp.getContext("2d").drawImage(c, 0, 0);
  const d = tmp.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
  const ad = await navigator.gpu.requestAdapter();
  return {
    backend: __apex.diag({ download: false }).env.backend,
    gpuErrors: window.WGX ? WGX.gpuErrors() : null,
    canvasPx: [d[0], d[1], d[2], d[3]],
    adapterInfo: ad && ad.info ? ad.info : null,
    gfxBound: sessionStorage.getItem("apex26.gfxBound"),
    coverage: __apex.render({ what: "view" }).coveragePct,
  };
});
console.log(JSON.stringify(out));
await browser.close();
await shutdown();
`;

mkdirSync(join(ROOT, "artifacts/tmp"), { recursive: true });
const res = spawnSync("xvfb-run", ["-a", "node", "--input-type=module", "-e", inner], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, ...{ VK_ICD_FILENAMES: "/usr/share/vulkan/icd.d/lvp_icd.json" } },
  timeout: 180000,
});

let parsed = null;
try {
  const line = (res.stdout || "").trim().split("\n").pop();
  parsed = JSON.parse(line);
} catch (_) {
  parsed = { error: res.stderr || res.stdout || "probe failed", exit: res.status };
}

const report = { track, lite, lavapipe: true, xvfb: true, ...parsed };
writeFileSync(join(ROOT, "artifacts/tmp/wgx-lavapipe-probe.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(parsed && parsed.backend === "webgpu" && (parsed.gpuErrors === 0 || parsed.gpuErrors === null) ? 0 : 1);
