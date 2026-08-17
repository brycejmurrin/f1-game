#!/usr/bin/env node
// wgx-capture.mjs — capture WGX render evidence on a REAL WebGPU device.
//
// SwiftShader-Vulkan in this container VALIDATES and runs the frame graph but
// does not execute shader work — canvas PNGs are usually BLANK here. The
// reliable capture is __apex.render({what:"view"}) (character raster + coverage
// from the CPU-side scene tags) plus diag/state JSON.
//
// Usage:
//   node tools/wgx-capture.mjs [trackId] [--lite] [--out DIR] [--frames N]
//
// Default out: artifacts/tmp/wgx-capture/<track>/

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS } from "./harness.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const track = args.find((a) => !a.startsWith("--")) || "singapore";
const lite = args.includes("--lite");
const framesArg = args.indexOf("--frames");
const frames = framesArg >= 0 ? Math.max(1, parseInt(args[framesArg + 1], 10) || 60) : 60;
const outArg = args.indexOf("--out");
const outDir = outArg >= 0
  ? args[outArg + 1]
  : join("artifacts", "tmp", "wgx-capture", track);

mkdirSync(outDir, { recursive: true });

let exitCode = 0;
try {
  const srv = await startStaticServer(ROOT);
  const { chromium } = require("playwright");
  const browser = await launchChromium({
    executablePath: chromium.executablePath(),
    headless: true,
    args: WEBGPU_CHROMIUM_ARGS,
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  await page.addInitScript((wantLite) => {
    localStorage.setItem("apex26.gfxBackend", "webgpu");
    localStorage.removeItem("apex26.gfxWgxLevel");
    localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
    if (wantLite) localStorage.setItem("apex26.gfxWgxLite", "1");
    sessionStorage.setItem("apex26.wgxCapture", "1");
  }, lite);

  await page.goto(srv.url + "index.html");
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 60000 });
  await page.evaluate((id) => { __apex.race(id); __apex.go(); }, track);
  await page.waitForFunction(
    () => { try { const p = __apex.physState(); return p && p.ok !== false; } catch { return false; } },
    null, { polling: 100, timeout: 120000 });
  await page.evaluate(() => { __apex.jump(0.12, 65); __apex.snapCam(); });
  await page.evaluate(
    (n) => new Promise((res) => { let i = 0; const t = () => (++i > n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); }),
    frames);

  const payload = await page.evaluate(() => {
    const view = __apex.render({ what: "view", cols: 80, rows: 24 });
    const diag = __apex.diag({ download: false });
    const viewLines = view && view.grid && view.grid.lines;
    const viewText = Array.isArray(viewLines) ? viewLines.join("\n") : "";
    return {
      backend: diag.env && diag.env.backend,
      msaa: diag.env && diag.env.msaa,
      hdr: diag.env && diag.env.hdr,
      gpuErrors: window.WGX && WGX.gpuErrors ? WGX.gpuErrors() : null,
      lastFailure: (window.WGX && WGX.lastFailure) || null,
      coveragePct: view && view.coveragePct,
      viewText,
      light: __apex.lightState ? { num: __apex.lightState().numLights, dark: __apex.lightState().dark } : null,
      diag,
    };
  });

  const canvasPath = join(outDir, "canvas.png");
  await page.screenshot({ path: canvasPath, type: "png" });
  const canvasStat = require("node:fs").statSync(canvasPath);

  writeFileSync(join(outDir, "view.txt"), String(payload.viewText || "") + "\n", "utf8");
  writeFileSync(join(outDir, "state.json"), JSON.stringify({
    track, lite, frames,
    backend: payload.backend,
    msaa: payload.msaa,
    hdr: payload.hdr,
    gpuErrors: payload.gpuErrors,
    lastFailure: payload.lastFailure,
    coveragePct: payload.coveragePct,
    light: payload.light,
    canvasBytes: canvasStat.size,
    canvasLikelyBlank: canvasStat.size < 8000,
    note: "Canvas PNG may be blank in SwiftShader-Vulkan CI — use view.txt + coveragePct.",
  }, null, 2));
  writeFileSync(join(outDir, "diag.json"), JSON.stringify(payload.diag, null, 2));

  const ok = payload.backend === "webgpu" && payload.gpuErrors === 0;
  if (!ok) exitCode = 1;

  console.log(JSON.stringify({
    ok,
    outDir,
    track,
    lite,
    backend: payload.backend,
    msaa: payload.msaa,
    gpuErrors: payload.gpuErrors,
    coveragePct: payload.coveragePct,
    canvasBytes: canvasStat.size,
    files: ["canvas.png", "view.txt", "state.json", "diag.json"],
  }, null, 2));
} catch (e) {
  console.error("wgx-capture failed:", (e && e.message) || e);
  exitCode = 1;
} finally {
  await shutdown();
}
process.exit(exitCode);
