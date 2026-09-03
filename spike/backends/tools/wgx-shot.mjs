#!/usr/bin/env node
// wgx-shot.mjs — WebGPU screenshots (software adapters use the 2D compositor blit).
// @doc WebGPU screenshots, one track or `--gallery`: `canvas.png`, HUD, `view.txt`; polls until pixels are non-black.
// @skill webgpu-debug
//
// SwiftShader-Vulkan validates WGX but does not composite the hidden swapchain;
// wgx.js readbacks the present target and putImageData() on #game when allowed.
//
//   node spike/backends/tools/wgx-shot.mjs --help
//   node spike/backends/tools/wgx-shot.mjs [trackId] [--lite] [--out DIR] [--cam orbit|eye|park]
//   node spike/backends/tools/wgx-shot.mjs --gallery [--lite] [--out DIR]
//
// Import runWgxShot() / runWgxGallery() — do not spawn this file as a subprocess.
// Canvas shots use page.screenshot({ clip }) so a live WebGL canvas does not
// trip Playwright's locator.screenshot stability timeout.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS } from "../lib/harness.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {{ track: string, cam: string }[]} */
export const WGX_GALLERY_SHOTS = [
  { track: "montreal", cam: "orbit" },
  { track: "montreal", cam: "eye" },
  { track: "singapore", cam: "orbit" },
  { track: "vegas", cam: "orbit" },
  { track: "spa", cam: "orbit" },
  { track: "monaco", cam: "eye" },
  { track: "bahrain", cam: "orbit" },
];

function printHelp() {
  console.log(`wgx-shot — WebGPU screenshot helper

  --help                         this text
  --gallery                      batch curated track set + manifest
  --lite                         WGX lite stack (software WebGPU)
  --cam orbit|eye|park           camera for single shot (default orbit)
  --out DIR                      output directory

  [trackId]                      single shot (default montreal)
  npm run wgx:gallery            alias for --gallery --lite
`);
}

export async function runWgxGallery({ lite = false, outRoot } = {}) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const dest = outRoot || join("artifacts", "tmp", "wgx-gallery", stamp);
  mkdirSync(dest, { recursive: true });

  const results = [];
  let failures = 0;

  for (const spec of WGX_GALLERY_SHOTS) {
    const label = spec.track + (spec.cam !== "orbit" ? "-" + spec.cam : "");
    const shotDir = join(dest, label);
    mkdirSync(shotDir, { recursive: true });
    let shotErr = null;
    let shotOk = false;
    try {
      const result = await runWgxShot({ track: spec.track, lite, cam: spec.cam, outDir: shotDir });
      shotOk = !!(result && result.ok);
    } catch (e) {
      shotErr = String((e && e.message) || e).slice(0, 300);
    }
    const statePath = join(shotDir, "state.json");
    const state = existsSync(statePath)
      ? JSON.parse(readFileSync(statePath, "utf8"))
      : null;
    const entry = {
      label,
      track: spec.track,
      cam: spec.cam,
      ok: shotOk && state && state.backend === "webgpu" && state.gpuErrors === 0,
      backend: state && state.backend,
      gpuErrors: state && state.gpuErrors,
      coveragePct: state && state.coveragePct,
      canvas: join(shotDir, "canvas.png"),
      exitCode: shotOk ? 0 : 1,
      error: shotErr,
    };
    results.push(entry);
    if (!entry.ok) failures++;
    console.log(label, entry.ok ? "ok" : "FAIL", entry.gpuErrors != null ? "gpuErrors=" + entry.gpuErrors : "");
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    lite,
    outRoot: dest,
    backend: "webgpu",
    shots: results.map(({ canvas, ...rest }) => rest),
  };
  writeFileSync(join(dest, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const refPath = join(ROOT, "spike/backends/docs/wgx-gallery-manifest.json");
  writeFileSync(refPath, JSON.stringify({
    ...manifest,
    note: "PNG output is gitignored under artifacts/; re-run node spike/backends/tools/wgx-shot.mjs --gallery to regenerate.",
  }, null, 2) + "\n");

  console.log("wrote", join(dest, "manifest.json"));
  console.log("updated", refPath);
  return { ok: failures === 0, failures, outRoot: dest, manifest };
}

export async function runWgxShot({
  track = "montreal",
  lite = false,
  cam = "orbit",
  outDir,
} = {}) {
  const dest = outDir || join("artifacts", "tmp", "wgx-shots", track);
  mkdirSync(dest, { recursive: true });

  const srv = await startStaticServer(ROOT);
  const { chromium } = require("playwright");
  const browser = await launchChromium({
    executablePath: chromium.executablePath(),
    headless: true,
    args: WEBGPU_CHROMIUM_ARGS,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

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

    // Software WebGPU composites via async 2D readback — poll until #game has pixels.
    await page.waitForFunction(() => {
      const c = document.getElementById("game");
      if (!c || c.width < 8) return false;
      const ctx2d = c.getContext("2d");
      if (ctx2d) {
        const d = ctx2d.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
        return d[0] + d[1] + d[2] > 30;
      }
      const tmp = document.createElement("canvas");
      tmp.width = c.width; tmp.height = c.height;
      tmp.getContext("2d").drawImage(c, 0, 0);
      const d = tmp.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
      return d[0] + d[1] + d[2] > 30;
    }, null, { polling: 100, timeout: 60000 });

    const canvasPath = join(dest, "canvas.png");
    const pagePath = join(dest, "page-hud.png");
    const rasterPath = join(dest, "view-raster.png");

    const box = await page.locator("#game").boundingBox();
    if (box) await page.screenshot({ path: canvasPath, clip: box, type: "png", timeout: 60000 });
    else await page.screenshot({ path: canvasPath, type: "png", timeout: 60000 });
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

    writeFileSync(join(dest, "view.txt"), payload.viewText + "\n", "utf8");
    writeFileSync(join(dest, "state.json"), JSON.stringify({
      track, lite, cam, backend: payload.backend, msaa: payload.msaa,
      gpuErrors: payload.gpuErrors, coveragePct: payload.coveragePct,
      light: payload.light,
      files: ["canvas.png", "view-raster.png", "page-hud.png", "view.txt", "state.json"],
    }, null, 2));

    const ok = payload.backend === "webgpu";
    return { ok, outDir: dest, track, lite, cam, ...payload };
  } finally {
    await shutdown();
  }
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const lite = args.includes("--lite");
  const outArg = args.indexOf("--out");
  const outDir = outArg >= 0 ? args[outArg + 1] : null;

  if (args.includes("--gallery")) {
    let exitCode = 0;
    try {
      const result = await runWgxGallery({ lite, outRoot: outDir || undefined });
      if (!result.ok) exitCode = 1;
    } catch (e) {
      console.error("wgx-shot --gallery failed:", (e && e.message) || e);
      exitCode = 1;
    }
    process.exit(exitCode);
  }

  const track = args.find((a) => !a.startsWith("--")) || "montreal";
  const camArg = args.indexOf("--cam");
  const cam = camArg >= 0 ? args[camArg + 1] : "orbit";
  const shotOut = outDir || join("artifacts", "tmp", "wgx-shots", track);
  let exitCode = 0;
  try {
    const result = await runWgxShot({ track, lite, cam, outDir: shotOut });
    if (!result.ok) exitCode = 1;
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("wgx-shot failed:", (e && e.message) || e);
    exitCode = 1;
  }
  process.exit(exitCode);
}
