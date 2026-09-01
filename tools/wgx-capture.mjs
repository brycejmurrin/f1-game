#!/usr/bin/env node
// wgx-capture.mjs — capture WGX render evidence on a REAL WebGPU device.
// @doc REAL WGX pixels in-container (~10 s): soft-present readback via `GLX.capturePixels()` → `frame.png`.
// @skill webgpu-debug
//
// SwiftShader-Dawn EXECUTES shader work in this container. The native swapchain
// never composites; WGX soft-presents (final pass → COPY_SRC texture → 2D blit
// on visible #game). This tool requests GLX.capturePixels() readback of that
// same texture → frame.png. Primary visible-canvas gate:
//   node tools/gfx-probe.mjs --backend webgpu [--lite] <track>  → canvas.png
// Readback here is an optional oracle — can flake on SwiftShader when run after
// display readback. __apex.render({what:"view"}) is the CPU coverage cross-check.
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
  // Small viewport on purpose: SwiftShader EXECUTES every pass, and a 960×540
  // full-post frame costs ~10 s of software rasterizing — 480×270 keeps a
  // capture round under ~20 s.
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });

  await page.addInitScript((wantLite) => {
    localStorage.setItem("apex26.gfxBackend", "webgpu");
    localStorage.removeItem("apex26.gfxWgxLevel");
    // Software adapter => WGX takes its soft-present path automatically: the
    // final pass renders into a COPY_SRC texture and the swapchain is never
    // touched (headless SwiftShader breaks mapAsync device-wide on the FIRST
    // getCurrentTexture() call), so capturePixels() just works.
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

  // Real pixels: WGX.capturePixels() resolves off the NEXT presented frame, so
  // it needs the render loop live — request it, then let frames run.
  const frameCap = await page.evaluate(() => new Promise((res) => {
    // game.js installs the backend by descriptor-copy ONTO GLX, so the live
    // surface (incl. capturePixels) is read from GLX, not the WGX module.
    // NB: GLX is a `const` script global — it is NOT on window; test with typeof.
    if (typeof GLX === "undefined" || !GLX.capturePixels || GLX.backend !== "webgpu")
      return res({ ok: false, why: "no capturePixels on the live backend (WGX not installed?)" });
    GLX.capturePixels().then((cap) => {
      const c = document.createElement("canvas");
      c.width = cap.width; c.height = cap.height;
      c.getContext("2d").putImageData(new ImageData(cap.data, cap.width, cap.height), 0, 0);
      // Cheap non-blank stats before encoding: mean + max luma over a stride.
      let sum = 0, max = 0, n = 0;
      for (let i = 0; i < cap.data.length; i += 401 * 4) {
        const l = (cap.data[i] + cap.data[i + 1] + cap.data[i + 2]) / 3;
        sum += l; if (l > max) max = l; n++;
      }
      res({ ok: true, width: cap.width, height: cap.height,
            meanLuma: +(sum / n).toFixed(1), maxLuma: max,
            png: c.toDataURL("image/png").split(",")[1] });
    }, (e) => res({ ok: false, why: String((e && e.message) || e) }));
    // Offscreen frames are paced by onSubmittedWorkDone (one in flight), and a
    // software-rasterized frame can take several seconds — wait generously.
    setTimeout(() => res({ ok: false, why: "capture timed out (no frame presented in 90 s)" }), 90000);
  }));
  let frameBytes = 0;
  if (frameCap.ok) {
    const buf = Buffer.from(frameCap.png, "base64");
    writeFileSync(join(outDir, "frame.png"), buf);
    frameBytes = buf.length;
  }

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
    frame: frameCap.ok
      ? { width: frameCap.width, height: frameCap.height, meanLuma: frameCap.meanLuma, maxLuma: frameCap.maxLuma, bytes: frameBytes }
      : { failed: frameCap.why },
    canvasBytes: canvasStat.size,
    canvasLikelyBlank: canvasStat.size < 8000,
    note: "frame.png = GLX.capturePixels() readback (optional oracle). canvas.png = page screenshot (visible #game via soft-present 2D blit when timing is right). Prefer gfx-probe.mjs for visible-canvas gate.",
  }, null, 2));
  writeFileSync(join(outDir, "diag.json"), JSON.stringify(payload.diag, null, 2));

  const ok = payload.backend === "webgpu" && payload.gpuErrors === 0
    && frameCap.ok && frameCap.maxLuma > 0;
  if (!ok) exitCode = 1;

  console.log(JSON.stringify({
    ok,
    outDir,
    track,
    lite,
    backend: payload.backend,
    msaa: payload.msaa,
    gpuErrors: payload.gpuErrors,
    frame: frameCap.ok
      ? { width: frameCap.width, height: frameCap.height, meanLuma: frameCap.meanLuma, maxLuma: frameCap.maxLuma, bytes: frameBytes }
      : { failed: frameCap.why },
    coveragePct: payload.coveragePct,
    canvasBytes: canvasStat.size,
    files: ["frame.png", "canvas.png", "view.txt", "state.json", "diag.json"],
  }, null, 2));
} catch (e) {
  console.error("wgx-capture failed:", (e && e.message) || e);
  exitCode = 1;
} finally {
  await shutdown();
}
process.exit(exitCode);
