#!/usr/bin/env node
// wgx-shot.mjs — WebGPU screenshots before the black-output probe reloads.
//
// SwiftShader-Vulkan validates WGX but often paints a black swapchain; this tool
// grabs frame-2 evidence (canvas + CPU view raster) while backend is still webgpu.
//
// Usage:
//   node tools/wgx-shot.mjs [trackId] [--lite] [--out DIR] [--cam orbit|eye|park]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS } from "./harness.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const track = args.find((a) => !a.startsWith("--")) || "montreal";
const lite = args.includes("--lite");
const camArg = args.indexOf("--cam");
const cam = camArg >= 0 ? args[camArg + 1] : "orbit";
const outArg = args.indexOf("--out");
const outDir = outArg >= 0 ? args[outArg + 1] : join("artifacts", "tmp", "wgx-shots", track);

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.addInitScript((wantLite) => {
    localStorage.setItem("apex26.gfxBackend", "webgpu");
    localStorage.removeItem("apex26.gfxWgxLevel");
    localStorage.removeItem("apex26.gfxWgxLite");
    if (wantLite) localStorage.setItem("apex26.gfxWgxLite", "1");
    sessionStorage.setItem("apex26.wgxCapture", "1");
  }, lite);

  await page.goto(srv.url + "index.html");
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 60000 });
  await page.evaluate((id) => { __apex.race(id); __apex.go(); }, track);
  await page.waitForFunction(
    () => { try { const p = __apex.physState(); return p && p.ok !== false; } catch { return false; } },
    null, { polling: 100, timeout: 120000 });

  await page.evaluate(({ camMode }) => {
    __apex.park(0.12);
    __apex.freeze(true);
    if (camMode === "eye") __apex.eyeAt(0.12, 0, 2.5);
    else if (camMode === "orbit") __apex.orbit(0.12, 45, 18, 55);
    else __apex.snapCam();
    __apex.jump(0.12, 65);
  }, { camMode: cam });

  // ~60 frames for post/env-probe to settle; capture mode disables the black probe.
  await page.evaluate((n) => new Promise((res) => {
    let i = 0;
    const t = () => (++i > n ? res() : requestAnimationFrame(t));
    requestAnimationFrame(t);
  }), 60);

  const canvasPath = join(outDir, "canvas.png");
  const pagePath = join(outDir, "page-hud.png");
  const rasterPath = join(outDir, "view-raster.png");

  await page.locator("#game").screenshot({ path: canvasPath, type: "png" });
  await page.screenshot({ path: pagePath, type: "png" });

  const payload = await page.evaluate(() => {
    const view = __apex.render({ what: "view", cols: 96, rows: 36 });
    const diag = __apex.diag({ download: false });
    const lines = (view && view.grid && view.grid.lines) || [];
    const el = document.createElement("pre");
    el.style.cssText = "margin:0;padding:8px;background:#050508;color:#c8d0e0;font:12px/1.1 monospace;white-space:pre;";
    el.textContent = lines.join("\n");
    document.body.innerHTML = "";
    document.body.style.background = "#050508";
    document.body.appendChild(el);
    return {
      backend: diag.env && diag.env.backend,
      msaa: diag.env && diag.env.msaa,
      gpuErrors: window.WGX && WGX.gpuErrors ? WGX.gpuErrors() : null,
      coveragePct: view && view.coveragePct,
      viewText: lines.join("\n"),
      light: __apex.lightState ? __apex.lightState() : null,
    };
  });
  await page.screenshot({ path: rasterPath, type: "png" });

  writeFileSync(join(outDir, "view.txt"), payload.viewText + "\n", "utf8");
  writeFileSync(join(outDir, "state.json"), JSON.stringify({
    track, lite, cam, backend: payload.backend, msaa: payload.msaa,
    gpuErrors: payload.gpuErrors, coveragePct: payload.coveragePct,
    light: payload.light,
    files: ["canvas.png", "view-raster.png", "page-hud.png", "view.txt", "state.json"],
  }, null, 2));

  const ok = payload.backend === "webgpu";
  if (!ok) exitCode = 1;
  console.log(JSON.stringify({ ok, outDir, track, lite, cam, ...payload }, null, 2));
} catch (e) {
  console.error("wgx-shot failed:", (e && e.message) || e);
  exitCode = 1;
} finally {
  await shutdown();
}
process.exit(exitCode);
