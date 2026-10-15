#!/usr/bin/env node
/**
 * @doc Visual knob A/B: same frame with a lightTune knob ON twice (noise floor) and OFF; fails unless ON vs OFF beats noise.
 * @skill renderer-debug
 *
 * Why (2026-10-15, weather phase 3 #1885): standing-water puddles passed every
 * unit and parity test, then rendered INVISIBLE — PUDDLES 1 vs 0 changed 2.4 %
 * of pixels on GLX against a 1.0 % noise floor, and nothing above noise on TLX,
 * because the wet road around them was already a mirror. Only a pixel A/B
 * caught it. A software frame is not evidence about a player's GPU (that is
 * gpu-census.yml), but "the knob changes the picture more than the picture
 * changes on its own" IS decidable here, and it is the check a new visual knob
 * needs before anyone looks at it by eye.
 *
 *   node tools/gfx/knob-ab.mjs --knob puddles --on 1 --off 0 --weather rain --wet 1
 *   node tools/gfx/knob-ab.mjs --knob ssrWetMul --on 1 --off 0 --backend webgl2 --track spa --frac 0.4
 *   node tools/gfx/knob-ab.mjs --knob puddles --set wetness=1,lampWarmup=0 --cam helmet --desktop
 *
 * Shots, one browser, one frozen spot: ON(a), ON(b), OFF. noise = diff(ONa, ONb),
 * effect = diff(ONa, OFF). A pixel counts as changed when |ΔR|+|ΔG|+|ΔB| > 12.
 * PASS when effect% ≥ max(NOISE_MULT × noise%, noise% + MIN_MARGIN) (3×, +2 pp). Default viewport is
 * the phone the game is played on (844x390 @2, touch); --desktop = 1280x720.
 * Backends: three (default; pinned to its WebGL2 path like every probe) | webgl2 | webgpu.
 * Writes PNGs + verdict JSON to artifacts/knob-ab/<knob>-<backend>-<track>/.
 * Exit: 0 pass, 1 knob below noise, 2 bad args, 3 browser/boot failure.
 * Browser tool: parent session only (bash-guard refuses browser runs in subagents).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PIXEL_DELTA = 12;      // |ΔR|+|ΔG|+|ΔB| over this = a changed pixel (0–765 scale)
export const NOISE_MULT = 3;        // effect must be at least 3× the noise floor…
export const MIN_MARGIN = 2.0;      // …and at least this many percentage points above it
// Calibrated on the 2026-10-15 puddle A/Bs (844x390, Monza rain): invisible-by-eye
// GLX 2.38 % vs 1.0 % noise and TLX 3.69 % vs 3.03 % FAIL; the visible satin
// GLX 35.5 % vs 1.05 % and TLX 22.0 % vs 2.99 % PASS. 2× would have passed GLX's invisible case.

/** Fraction (%) of pixels changed and mean abs channel delta between two raw
 *  RGB(A) buffers of equal size. `channels` is 3 or 4. */
export function diffRaw(a, b, width, height, channels) {
  const n = width * height;
  if (!(n > 0) || a.length < n * channels || b.length < n * channels) throw new Error("diffRaw: buffer/size mismatch");
  let changed = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const k = i * channels;
    const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
    sum += d;
    if (d > PIXEL_DELTA) changed++;
  }
  return { pct: +(100 * changed / n).toFixed(2), mean: +(sum / (n * 3)).toFixed(3) };
}

/** Pure verdict on the two diffs (percent of pixels changed). */
export function verdict(noisePct, effectPct) {
  const need = +Math.max(NOISE_MULT * noisePct, noisePct + MIN_MARGIN).toFixed(2);
  const pass = effectPct >= need;
  return { pass, need, noisePct, effectPct,
    line: `= knob-ab ${pass ? "pass" : "FAIL"} — effect ${effectPct}% vs noise ${noisePct}% (need ≥ ${need}%)` };
}

/** "a=1,b=0.5" → { a: 1, b: 0.5 } (numbers only — lightTune knobs are numeric). */
export function parseSet(s) {
  const out = {};
  for (const part of String(s || "").split(",").filter(Boolean)) {
    const [k, v] = part.split("=");
    const x = Number(v);
    if (!k || !Number.isFinite(x)) throw new Error(`--set: bad pair "${part}"`);
    out[k.trim()] = x;
  }
  return out;
}

export function parseArgs(argv) {
  const get = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def; };
  const o = {
    knob: get("--knob", null), on: Number(get("--on", "1")), off: Number(get("--off", "0")),
    backend: get("--backend", "three"), track: get("--track", "monza"), frac: Number(get("--frac", "0.05")),
    weather: get("--weather", "dry"), tod: get("--tod", "day"), cam: get("--cam", "chase"),
    set: parseSet(get("--set", "")), desktop: argv.includes("--desktop"), settle: Number(get("--settle", "2000")),
  };
  const wet = get("--wet", null);
  if (wet != null) o.set.wetness = Number(wet);
  if (!o.knob) throw new Error("--knob <lightTune id> is required");
  if (!["three", "webgl2", "webgpu"].includes(o.backend)) throw new Error(`--backend must be three | webgl2 | webgpu`);
  for (const k of ["on", "off", "frac", "settle"]) if (!Number.isFinite(o[k])) throw new Error(`--${k} must be a number`);
  return o;
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: node tools/gfx/knob-ab.mjs --knob <id> [--on 1] [--off 0] [--backend three|webgl2|webgpu] [--track monza] [--frac 0.05]\n" +
      "  [--weather dry|wet|rain|storm|fog|overcast] [--wet <0..1>] [--tod day] [--cam chase] [--set k=v,…] [--desktop] [--settle ms]\n" +
      "  Shots ON, ON, OFF of one frozen spot; exit 0 when ON vs OFF beats max(3×noise, noise+2pp), 1 when not.");
    return 0;
  }
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`knob-ab: ${e.message}`); return 2; }
  const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
  const { launchChromium, shutdown, sleep, startStaticServer } = await import("../lib/harness.mjs");
  const { awaitPresentedFrame, screenshotPresentedCanvas } = await import("../shot/probe-page.mjs");
  const sharp = (await import("sharp")).default;
  const out = resolve(ROOT, "artifacts/knob-ab", `${o.knob}-${o.backend}-${o.track}`);
  mkdirSync(out, { recursive: true });
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--no-sandbox"] });
  const errs = [];
  try {
    const ctx = await browser.newContext(o.desktop ? { viewport: { width: 1280, height: 720 } } : {
      viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript((be) => {
      if (be === "webgl2") localStorage.removeItem("apex26.gfxBackend"); else localStorage.setItem("apex26.gfxBackend", be);
      if (be === "three") localStorage.setItem("apex26.tlxForceGL", "1");
    }, o.backend);
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 30_000 });
    await page.evaluate(async ([t, tod, w]) => { await window.__apex.race(t, tod, w); }, [o.track, o.tod, o.weather]);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 200, timeout: 120_000 });
    await page.evaluate(([frac, cam, set]) => {
      const a = window.__apex; a.go(); a.park(frac); a.headless(false);
      a.lightTune(Object.assign({ lampWarmup: 0, lampFlicker: 0 }, set)); a.camera(cam); a.snapCam();
    }, [o.frac, o.cam, o.set]);
    await sleep(o.settle);
    const shot = async (tag, val) => {
      const applied = await page.evaluate(([k, v]) => { window.__apex.lightTune({ [k]: v }); window.__apex.snapCam(); return window.__apex.lightTune()[k]; }, [o.knob, val]);
      if (applied !== val) throw new Error(`lightTune({${o.knob}: ${val}}) read back ${applied} — not a knob, or clamped`);
      await sleep(o.settle); await awaitPresentedFrame(page);
      const path = resolve(out, `${tag}.png`);
      await screenshotPresentedCanvas(page, { path, skipAwait: true, timeout: 90_000 });
      return path;
    };
    const pa = await shot("on-a", o.on), pb = await shot("on-b", o.on), p0 = await shot("off", o.off);
    const raw = (p) => sharp(p).raw().toBuffer({ resolveWithObject: true });
    const [A, B, C] = await Promise.all([raw(pa), raw(pb), raw(p0)]);
    const { width, height, channels } = A.info;
    const noise = diffRaw(A.data, B.data, width, height, channels), effect = diffRaw(A.data, C.data, width, height, channels);
    const v = verdict(noise.pct, effect.pct);
    writeFileSync(resolve(out, "verdict.json"), JSON.stringify({ ...o, noise, effect, ...v, errs: errs.slice(0, 5), shots: [pa, pb, p0] }, null, 2));
    console.log(`knob-ab: ${o.knob} ${o.on}→${o.off} on ${o.backend} ${o.track} (${o.weather}, ${o.cam}) — shots in ${out}`);
    if (errs.length) console.log(`knob-ab: page errors: ${errs.slice(0, 3).join(" | ")}`);
    console.log(v.line);
    return v.pass ? 0 : 1;
  } catch (e) {
    console.error(`knob-ab: ${String(e.message || e).slice(0, 300)}`);
    return 3;
  } finally {
    await browser.close();
    await shutdown(srv);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}
