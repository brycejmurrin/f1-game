#!/usr/bin/env node
// hud-live-sample — where does each moved HUD piece sit over TIME in a LIVE, unfrozen race?
// @doc Sample moved HUD pieces every few ms in an unfrozen race after position jumps; report time spent off screen.
// @skill survey-ui-matrix
//
//   node tools/shot/hud-live-sample.mjs                                   # monza, desktop-1280, cockpit
//   node tools/shot/hud-live-sample.mjs --device phone-landscape-844x390 --cam chase
//   node tools/shot/hud-live-sample.mjs --ids aero,ot --jumps 0.12,0.3,0.55 --window 4000
//   node tools/shot/hud-live-sample.mjs --tolerate 0                       # any off-screen frame fails
//   node tools/shot/hud-live-sample.mjs --keep                             # don't switch every HUD piece on first
//
// WHY THIS EXISTS. hud-survey freezes the sim per cell (a.freeze(true)) and reads
// one frame, so the HUD's own ~10 Hz tick — which is what re-fits a moved piece
// (HudLayout.fit) when its words change width — never runs after the cell's last
// jump. Measured 2026-10-05: the survey read the cockpit AERO chip at right edge
// 1297 of 1280 in every run, while a live race held it at 1276 and the real
// defect (a chip hanging off the edge for ~1.7 s after its words changed) was a
// transient the survey could not see. Frozen-cell positions for MOVED pieces are
// therefore not evidence of what a player sees; this reads the live thing.
//
// How: boot like apex-eval, race, go, pick the camera, then for each --jumps
// fraction teleport (a.jump(frac, 70, 0)) and sample every moved piece's
// getBoundingClientRect every --interval ms for --window ms, with the sim
// RUNNING. Per piece it reports the worst overshoot past the screen edge and
// past fit's own margin (EDGE = 4 px), and for how many ms each lasted.
//
// Exit 0 when no piece is off screen for longer than --tolerate ms (default 250,
// a couple of HUD ticks), 1 when one is, 2 on a usage error. JSON on stdout.
// Needs the repo's Chromium; boots its own static server. ~1 min on SwiftShader.

import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { DEVICES } from "../lib/hud-survey-matrix.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const BOOT_MS = 45000;
const TRACK_MS = 45000;
const EDGE = 4;            // HudLayout.fit's own margin (js/ui/hud-layout.js EDGE)
const OFF = 0.5;           // px of overshoot below which a rect counts as on screen (sub-pixel layout)

/**
 * Reduce one piece's samples to how far and how long it sat outside the screen.
 * samples: [{ t (ms), rect: {left,right,top,bottom} | null, txt? }] in time order;
 * a null rect is "not laid out right now" and counts as on screen.
 * Pure — no DOM, no browser — so a unit test can pin it.
 */
export function analyzeSamples(samples, { W, H, margin = EDGE, interval = 40 }) {
  const out = { samples: samples.length, shown: 0, maxOffScreenPx: 0, offScreenMs: 0, firstOffScreenAt: null,
    lastOffScreenAt: null, maxPastMarginPx: 0, pastMarginMs: 0, widthMin: null, widthMax: null };
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.rect) continue;
    out.shown++;
    const r = s.rect;
    const dt = i + 1 < samples.length ? Math.max(0, samples[i + 1].t - s.t) : interval;
    const w = r.right - r.left;
    out.widthMin = out.widthMin == null ? w : Math.min(out.widthMin, w);
    out.widthMax = out.widthMax == null ? w : Math.max(out.widthMax, w);
    const off = Math.max(0 - r.left, r.right - W, 0 - r.top, r.bottom - H, 0);
    const past = Math.max(margin - r.left, r.right - (W - margin), margin - r.top, r.bottom - (H - margin), 0);
    if (off > OFF) {
      out.offScreenMs += dt;
      if (out.firstOffScreenAt == null) out.firstOffScreenAt = s.t;
      out.lastOffScreenAt = s.t;
    }
    if (past > OFF) out.pastMarginMs += dt;
    out.maxOffScreenPx = Math.max(out.maxOffScreenPx, off);
    out.maxPastMarginPx = Math.max(out.maxPastMarginPx, past);
  }
  out.maxOffScreenPx = +out.maxOffScreenPx.toFixed(1);
  out.maxPastMarginPx = +out.maxPastMarginPx.toFixed(1);
  if (out.widthMin != null) { out.widthMin = +out.widthMin.toFixed(1); out.widthMax = +out.widthMax.toFixed(1); }
  return out;
}

/** Fold per-trial per-piece results into one worst-case row per piece. */
export function summarize(trials) {
  const worst = {};
  for (const tr of trials) {
    for (const [id, r] of Object.entries(tr.pieces)) {
      const w = worst[id] || (worst[id] = { maxOffScreenPx: 0, offScreenMs: 0, maxPastMarginPx: 0, pastMarginMs: 0, trialsOffScreen: 0 });
      w.maxOffScreenPx = Math.max(w.maxOffScreenPx, r.maxOffScreenPx);
      w.offScreenMs = Math.max(w.offScreenMs, r.offScreenMs);
      w.maxPastMarginPx = Math.max(w.maxPastMarginPx, r.maxPastMarginPx);
      w.pastMarginMs = Math.max(w.pastMarginMs, r.pastMarginMs);
      if (r.offScreenMs > 0) w.trialsOffScreen++;
    }
  }
  return worst;
}

const num = (v, d) => { const n = +v; return Number.isFinite(n) ? n : d; };

export function parseArgs(argv) {
  const o = { track: "monza", device: "desktop-1280", cam: "cockpit", ids: null, jumps: [0.12, 0.3, 0.55, 0.8, 0.12, 0.3],
    window: 3000, interval: 40, tolerate: 250, speed: 70, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) return { error: `unexpected argument "${argv[i]}"` };
    const val = () => (m[2] != null ? m[2] : argv[++i]);
    switch (m[1]) {
      case "track": o.track = val(); break;
      case "device": o.device = val(); break;
      case "cam": o.cam = val(); break;
      case "ids": o.ids = String(val()).split(",").map((s) => s.trim()).filter(Boolean); break;
      case "jumps": o.jumps = String(val()).split(",").map((s) => +s.trim()); break;
      case "window": o.window = num(val(), NaN); break;
      case "interval": o.interval = num(val(), NaN); break;
      case "tolerate": o.tolerate = num(val(), NaN); break;
      case "speed": o.speed = num(val(), NaN); break;
      case "keep": o.keep = true; break;   // a flag: no value to consume
      default: return { error: `unknown option --${m[1]}` };
    }
  }
  if (!DEVICES[o.device]) return { error: `--device must be one of ${Object.keys(DEVICES).join(" | ")}` };
  if (!o.jumps.length || o.jumps.some((f) => !(f >= 0 && f <= 1))) return { error: "--jumps takes lap fractions in 0..1, comma separated" };
  for (const k of ["window", "interval", "tolerate", "speed"]) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `--${k} must be a number >= 0` };
  if (o.interval < 10) return { error: "--interval below 10 ms measures the sampler, not the HUD" };
  return o;
}

async function main() {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/shot/hud-live-sample.mjs [--track monza] [--device desktop-1280] [--cam cockpit]
         [--ids aero,ot] [--jumps 0.12,0.3,0.55] [--window 3000] [--interval 40] [--tolerate 250] [--speed 70] [--keep]
  Samples moved HUD pieces in an UNFROZEN race after each position jump; prints JSON; exit 1 when a piece is
  off screen longer than --tolerate ms. Devices: ${Object.keys(DEVICES).join(", ")}. See the header of this file.`);
  const o = parseArgs(argv);
  if (o.error) { console.error("hud-live-sample: " + o.error); process.exit(2); }
  const dev = DEVICES[o.device];

  const srv = await startStaticServer(ROOT);
  let result;
  try {
    const browser = await launchChromium({
      args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
    });
    const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, hasTouch: dev.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.tlxForceGL", "1"); } catch (_) { /* blocked storage */ }
    });
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { timeout: BOOT_MS, polling: 100 });
    const ins = dev.ins || {};
    if (ins.sal || ins.sar || ins.sat || ins.sab) {
      await page.addStyleTag({ content: `:root{--sal:${ins.sal}px;--sar:${ins.sar}px;--sat:${ins.sat}px;--sab:${ins.sab}px;}` });
    }
    await page.evaluate((t) => window.__apex.race(t), o.track);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: TRACK_MS, polling: 100 });
    await sleep(1600); // mesh build
    // go + camera, then show every piece (a hidden piece cannot overflow, and a survey that
    // forgot to switch one on would pass it) — the same switch-all hud-survey uses. --keep
    // leaves the switches as the game booted them.
    const picked = await page.evaluate(async ({ cam, ids, keep }) => {
      const a = window.__apex;
      if (!keep) for (const [id] of HudElements.ELEMENTS) HudElements.set(id, true);
      a.go(); a.camera(cam);
      await new Promise((r) => setTimeout(r, 600));
      const sels = {};
      for (const [id, , sel] of HudLayout.ELEMENTS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        if (ids ? ids.includes(id) : el.hasAttribute("data-hl")) sels[id] = sel;
      }
      return { sels, set: HudLayout.shown() };
    }, { cam: o.cam, ids: o.ids, keep: o.keep });
    const ids = Object.keys(picked.sels);
    if (!ids.length) throw new Error("no moved HUD piece to sample in this layout (" + picked.set + "); pass --ids to force some");

    const trials = [];
    for (const frac of o.jumps) {
      const raw = await page.evaluate(async ({ frac, sels, windowMs, intervalMs, speed }) => {
        const a = window.__apex;
        a.jump(frac, speed, 0);
        const t0 = performance.now();
        const ids = Object.keys(sels), series = Object.fromEntries(ids.map((id) => [id, []]));
        while (performance.now() - t0 < windowMs) {
          await new Promise((r) => setTimeout(r, intervalMs));
          const t = Math.round(performance.now() - t0);
          for (const id of ids) {
            const el = document.querySelector(sels[id]);
            const r = el && !el.hidden ? el.getBoundingClientRect() : null;
            series[id].push(r && r.width && r.height
              ? { t, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, txt: el.textContent.trim().slice(0, 18) }
              : { t, rect: null });
          }
        }
        return { series, W: innerWidth, H: innerHeight };
      }, { frac, sels: picked.sels, windowMs: o.window, intervalMs: o.interval, speed: o.speed });
      const pieces = {};
      for (const id of ids) pieces[id] = analyzeSamples(raw.series[id], { W: raw.W, H: raw.H, interval: o.interval });
      trials.push({ frac, W: raw.W, H: raw.H, pieces });
    }
    const worst = summarize(trials);
    const failing = Object.entries(worst).filter(([, w]) => w.offScreenMs > o.tolerate).map(([id]) => id);
    result = { ok: failing.length === 0, track: o.track, device: o.device, cam: o.cam, layoutSet: picked.set,
      window: o.window, interval: o.interval, tolerate: o.tolerate, sampled: ids, failing, worst, trials };
  } catch (e) {
    console.error("hud-live-sample failed:", e.message);
    process.exitCode = 1;
  } finally {
    await shutdown();
    srv.close && srv.close();
  }
  if (result) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }
}

let isEntry = false;
try { isEntry = fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (isEntry) main();
