#!/usr/bin/env node
// backend-compare — the SAME deterministic scene, screenshotted on each render
// @doc Same deterministic scene on GLX/TLX/WGX + numeric pixel diff (MAD, %px changed) and per-backend console errors.
// @skill playwright-probe
// Workflow: docs/RENDERERS.md §Cross-backend parity (the folded cross-backend-parity skill).
// backend (GLX webgl2 / TLX three / WGX webgpu), plus a numeric pixel diff.
//
// WHY. The parity suite proves each backend's SURFACE answers; nothing proves
// the pixels agree. Every TLX/WGX look defect so far (transparent cars, ghosted
// opaques, missing sky) shipped past green unit tests because no tool put the
// two frames side by side. This is that tool: one framing, N backends, one
// manifest with per-backend console errors and a mean-abs-diff you can put in
// a commit message.
//
// Usage:
//   node tools/capture/backend-compare.mjs [track] [frac] [cam] \
//     [--backends webgl2,three] [--tod day|dusk|dawn|night] \
//     [--az N] [--el N] [--dist N] [--side -1|1] [--out DIR] [--label NAME]
//   cam = orbit | eye | cinematic | trackside | park   (default: orbit)
//
// Output: <out>/<label>-<backend>.png + <label>-manifest.json. Default out dir
// scratch/captures/backend-compare/ (regenerable, gitignored).
//
// Notes that are traps elsewhere:
//   - The backend pick lives in localStorage and must be set BEFORE the page
//     boots — addInitScript, not evaluate-then-reload.
//   - --backends three pins apex26.tlxForceGL=1 (the spec pin): three's own
//     WebGPU path dies under SwiftShader inside mappedAtCreation uploads.
//   - The diff decodes the CAPTURED PNGs in a 2d canvas. Never diff the live
//     WebGL canvas via drawImage — the drawing buffer is cleared after
//     compositing and you measure the clear, not the frame.
//   - webgpu pixels are blank in-container (Dawn validates, does not execute
//     on this box) — a webgpu row is lifecycle evidence only.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
  WEBGPU_CHROMIUM_ARGS,
} from "../harness.mjs";
import { assertSafePathToken, resolveRepoDefault } from "../output-paths.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

const argv = process.argv.slice(2);
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++; continue; }
  positionals.push(argv[i]);
}
const [trackId = "monza", fracArg = "0.1", cam = "orbit"] = positionals;
const safeTrackId = assertSafePathToken(trackId, "track id");
const safeCam = assertSafePathToken(cam, "camera");
const frac = parseFloat(fracArg);
const az = parseFloat(flag(argv, "--az", "45"));
const el = parseFloat(flag(argv, "--el", "18"));
const dist = parseFloat(flag(argv, "--dist", "45"));
const side = parseInt(flag(argv, "--side", "1"), 10) || 1;
const tod = flag(argv, "--tod", "day");
const backends = flag(argv, "--backends", "webgl2,three").split(",").map((s) => s.trim()).filter(Boolean);
const live = argv.includes("--live");   // skip headless(true): screenshot the live loop
const label = assertSafePathToken(
  flag(argv, "--label", `${safeTrackId}-${Math.round(frac * 100)}-${safeCam}-${tod}`), "label");
const outDir = flag(argv, "--out", null)
  ? resolve(flag(argv, "--out", null))
  : resolveRepoDefault(ROOT, "scratch", "captures", "backend-compare");
mkdirSync(outDir, { recursive: true });

const srv = await startStaticServer(ROOT);
const shots = [];

async function captureBackend(backend) {
  // WGX needs the full-Chromium WebGPU pins; the others render on SwiftShader GL.
  const args = backend === "webgpu"
    ? [...WEBGPU_CHROMIUM_ARGS]
    : ["--use-angle=swiftshader", "--no-sandbox"];
  const browser = await launchChromium({ args });
  const consoleLines = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning") consoleLines.push(`[${t}] ${m.text()}`);
    });
    await page.addInitScript((be) => {
      try {
        if (be === "webgl2") localStorage.removeItem("apex26.gfxBackend");
        else localStorage.setItem("apex26.gfxBackend", be);
        if (be === "three") localStorage.setItem("apex26.tlxForceGL", "1");
        sessionStorage.clear();
      } catch (_) {}
    }, backend);
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 30_000 });

    // Models resident BEFORE the build so scenery bakedModel() emits identically.
    await page.evaluate(async () => {
      if (typeof Assets !== "undefined" && Assets.loadModels) {
        try { await Assets.loadModels(); } catch (_) {}
      }
    });
    await page.evaluate((id) => window.__apex.race(id), safeTrackId);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await sleep(1200);

    const state = await page.evaluate(({ frac, cam, az, el, dist, side, tod }) => {
      const a = window.__apex;
      a.go();
      a.park(frac);
      a.freeze(true);
      if (a.setTimeOfDay) a.setTimeOfDay(tod);
      if (a.hud) a.hud(false);
      if (cam === "eye") a.eyeAt(frac, 0, 2.5);
      else if (cam === "orbit") a.orbit(frac, az, el, dist);
      else if (cam === "cinematic") a.cinematic(frac, { dist, el });
      else if (cam === "trackside")
        a.view({ s: frac, side, dist, height: Math.max(3, el * 0.35), look: "in" });
      else a.snapCam(); // park/chase only — NEVER after a free-cam call
      a.step && a.step(1 / 60, 4);
      return {
        backend: typeof GLX !== "undefined" ? (GLX.backend || "webgl2") : "none",
        diagBackend: a.diag ? (a.diag({ download: false }).env || {}).backend : null,
        camera: a.camera(),
      };
    }, { frac, cam: safeCam, az, el, dist, side, tod });

    await sleep(1500); // present a few frames with the final framing
    // The chase cam auto-cuts to a broadcast angle after ~2 s idle (mcp-probe
    // SEVENTH trap) — for park/chase re-snap immediately before the shot so
    // both backends capture the identical framing.
    if (safeCam === "park") {
      await page.evaluate(() => window.__apex.snapCam());
      await sleep(250);
    }
    if (!live) {
      await page.evaluate(() => window.__apex.headless(true)); // stop the loop; canvas keeps the last frame
      await sleep(100);
    }
    const path = resolve(outDir, `${label}-${backend}.png`);
    const buf = await page.locator("canvas#game").screenshot({ path, timeout: 60_000 });
    shots.push({ backend, path, bytes: buf.length, state, consoleLines });
    console.log(`  ${backend}: ${path} (${(buf.length / 1024).toFixed(1)} KB) bound=${state.backend}`
      + (buf.length < 5000 ? "  ⚠ looks blank" : ""));
  } finally {
    await browser.close();
  }
}

function pngDataUrl(buf) { return "data:image/png;base64," + Buffer.from(buf).toString("base64"); }

// Decode both PNGs in a throwaway page and diff — browser-side, no PNG dep.
// Also writes a contrast-boosted diff-map PNG so the drift is locatable.
async function diffShots(a, b, diffPath) {
  const browser = await launchChromium({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const { readFileSync, writeFileSync: wf } = await import("node:fs");
    const res = await page.evaluate(async ([ua, ub]) => {
      const load = (u) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img); img.onerror = rej; img.src = u;
      });
      const [ia, ib] = await Promise.all([load(ua), load(ub)]);
      const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const px = (img) => { ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, w, h).data; };
      const pa = px(ia), pb = px(ib);
      let sum = 0, diffPx = 0, meanA = 0, meanB = 0;
      const n = w * h;
      const dm = ctx.createImageData(w, h);
      for (let i = 0; i < n * 4; i += 4) {
        const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
        sum += d;
        if (d > 30) diffPx++;
        meanA += pa[i] + pa[i + 1] + pa[i + 2];
        meanB += pb[i] + pb[i + 1] + pb[i + 2];
        const v = Math.min(255, d * 2); // contrast boost
        dm.data[i] = v; dm.data[i + 1] = v; dm.data[i + 2] = v; dm.data[i + 3] = 255;
      }
      ctx.putImageData(dm, 0, 0);
      return {
        w, h,
        meanAbsDiff: +(sum / (n * 3)).toFixed(2),
        pctDiffPixels: +((diffPx / n) * 100).toFixed(2),
        meanRGB: [+(meanA / (n * 3)).toFixed(1), +(meanB / (n * 3)).toFixed(1)],
        diffPng: cv.toDataURL("image/png"),
      };
    }, [pngDataUrl(readFileSync(a.path)), pngDataUrl(readFileSync(b.path))]);
    if (diffPath && res.diffPng) {
      wf(diffPath, Buffer.from(res.diffPng.split(",")[1], "base64"));
    }
    delete res.diffPng;
    return res;
  } finally {
    await browser.close();
  }
}

try {
  console.log(`backend-compare: ${safeTrackId} frac=${frac} cam=${safeCam} tod=${tod} → ${outDir}`);
  for (const be of backends) await captureBackend(be);

  const diffs = [];
  for (let i = 1; i < shots.length; i++) {
    const diffPath = resolve(outDir, `${label}-diff-${shots[0].backend}-vs-${shots[i].backend}.png`);
    const d = await diffShots(shots[0], shots[i], diffPath);
    diffs.push({ pair: `${shots[0].backend} vs ${shots[i].backend}`, diffPath, ...d });
    console.log(`  diff ${shots[0].backend} vs ${shots[i].backend}: meanAbsDiff=${d.meanAbsDiff} pctDiffPixels=${d.pctDiffPixels}% meanRGB=${d.meanRGB}`);
  }

  const manifest = {
    track: safeTrackId, frac, cam: safeCam, tod, az, el, dist, side,
    shots: shots.map((s) => ({ ...s, path: s.path })),
    diffs,
  };
  const mPath = resolve(outDir, `${label}-manifest.json`);
  writeFileSync(mPath, JSON.stringify(manifest, null, 2));
  console.log(`wrote ${mPath}`);
  const errs = shots.flatMap((s) => s.consoleLines.filter((l) => l.startsWith("[error]")).map((l) => `${s.backend}: ${l}`));
  if (errs.length) { console.log("console errors:"); for (const e of errs) console.log("  " + e); }
} catch (err) {
  console.error("backend-compare failed:", err && err.stack || err);
  process.exitCode = 1;
} finally {
  await shutdown();
}
