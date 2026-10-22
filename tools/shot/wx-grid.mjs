#!/usr/bin/env node
// @doc Weather×time 24-cell grid + luminance.json (6 weathers incl. storm × 4 TOD). One Chrome boot; --track --turn.
// Full description: One Chromium boot shoots dry|wet|rain|storm|overcast|fog × dawn|day|dusk|night at a curated
//   turn apex (def.turns). Prefers WebGPU, falls back to three then webgl2 and prints which ran. Writes a labelled
//   contact sheet PNG + luminance.json (mean L, mean RGB, saturation per cell) under artifacts/ (never commit).
//   node tools/shot/wx-grid.mjs --track monaco --turn 1 [--out DIR] [--backend auto|webgpu|three|webgl2]
//   [--seed 42] [--eye 4.25] [--fov 60] [--viewport 720x405] [--plan]
// @skill playwright-probe
/*
 * wx-grid.mjs — REPEATABLE weather×time MEASUREMENT for the lighting lane (#3387).
 *
 * look-survey has no storm column; executors hand-wrote one-off matrices. This is the
 * durable tool: 24 cells, seed/eye/FOV pinned, luminance ratios for storm-vs-rain day
 * and fog-night / dry-night milky fog. Does NOT change lighting code.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadavg } from "node:os";
import sharp from "sharp";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { installProbeInit, gotoGame, screenshotPresentedCanvas, chromiumArgsForBackend } from "./probe-page.mjs";
import { pixelEvidence } from "./capture-contract.mjs";
import {
  TODS, WEATHERS, CELL_COUNT, DEFAULT_EYE_H, DEFAULT_FOV, DEFAULT_SEED,
  cellLayout, sheetSize, luminanceStats, lightingRatios, turnFrac, sortCombosMinRebuild,
} from "./lib/wx-grid.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { CIRCUITS } = require(path.join(ROOT, "tools/manifest.cjs"));

const argv = process.argv.slice(2);
exitIfHelp(argv, `wx-grid — 6 weathers × 4 times contact sheet + luminance.json

  node tools/shot/wx-grid.mjs --track monaco --turn 1
    [--out artifacts/wx-grid/<track>-T<n>] [--backend auto|webgpu|three|webgl2]
    [--seed 42] [--eye 4.25] [--fov 60] [--viewport 720x405] [--port 0] [--frac 0.12]
    [--prefer-dark] [--plan]

Defaults: seed ${DEFAULT_SEED}, eye ${DEFAULT_EYE_H} m, FOV ${DEFAULT_FOV}°, backend auto
(WebGPU → three → webgl2). Output under artifacts/ or scratch/ only.`);

const arg = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const has = (name) => argv.includes("--" + name);
const die = (msg) => { console.error("wx-grid: " + msg); process.exit(2); };

const TRACK = arg("track", null);
const TURN_RAW = arg("turn", null);
const FRAC_RAW = arg("frac", null);
const OUT = arg("out", null);
const BACKEND_REQ = arg("backend", "auto");
const SEED = Number(arg("seed", String(DEFAULT_SEED)));
const EYE_H = Number(arg("eye", String(DEFAULT_EYE_H)));
const FOV = Number(arg("fov", String(DEFAULT_FOV)));
const VIEWPORT = arg("viewport", "720x405");
const PORT = +arg("port", "0");
const PLAN = has("plan");
const PREFER_DARK = has("prefer-dark");
const BACKENDS_AUTO = ["webgpu", "three", "webgl2"];

if (!TRACK) die("--track <id> required");
if (!CIRCUITS.includes(TRACK)) die(`unknown track "${TRACK}" — ${CIRCUITS.join(", ")}`);
if (TURN_RAW == null && FRAC_RAW == null) die("--turn <1-based> or --frac <0..1> required");
if (!(Number.isInteger(SEED) && SEED >= 0 && SEED <= 0xffffffff)) die(`--seed must be uint32 (got ${SEED})`);
if (!(Number.isFinite(EYE_H) && EYE_H > 0 && EYE_H < 50)) die(`--eye must be metres in (0,50) (got ${EYE_H})`);
if (!(Number.isFinite(FOV) && FOV >= 5 && FOV <= 170)) die(`--fov must be degrees in 5..170 (got ${FOV})`);
if (!/^\d+x\d+$/.test(VIEWPORT)) die(`--viewport must be WxH (got ${VIEWPORT})`);
const [VW, VH] = VIEWPORT.split("x").map(Number);
if (!(VW >= 64 && VW <= 1920 && VH >= 64 && VH <= 1080)) die("viewport bounds: 64..1920 × 64..1080");
if (!(PORT >= 0 && PORT < 65536)) die(`--port must be 0..65535 (got ${PORT})`);
if (BACKEND_REQ !== "auto" && !BACKENDS_AUTO.includes(BACKEND_REQ)) {
  die(`--backend must be auto|${BACKENDS_AUTO.join("|")} (got ${BACKEND_REQ})`);
}

const outDir = path.resolve(ROOT, OUT || path.join(
  "artifacts", "wx-grid",
  TURN_RAW != null ? `${TRACK}-T${TURN_RAW}` : `${TRACK}-f${FRAC_RAW}`,
));
const relOut = path.relative(ROOT, outDir);
if (!(relOut.startsWith("artifacts" + path.sep) || relOut.startsWith("scratch" + path.sep))) {
  die("--out must be under artifacts/ or scratch/");
}

const cells = cellLayout();
if (cells.length !== CELL_COUNT) die(`internal: expected ${CELL_COUNT} cells, got ${cells.length}`);

if (PLAN) {
  console.log(JSON.stringify({
    track: TRACK, turn: TURN_RAW, frac: FRAC_RAW, seed: SEED, eye: EYE_H, fov: FOV,
    viewport: { width: VW, height: VH }, backend: BACKEND_REQ, out: relOut,
    cells: CELL_COUNT, tods: TODS, weathers: WEATHERS,
  }, null, 2));
  process.exit(0);
}

const avg = loadavg()[0];
if (avg >= 3) die(`loadavg ${avg.toFixed(2)} ≥ 3 — refuse a 24-cell browser run (AGENTS.md rule 5)`);

async function statsFromPng(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return luminanceStats(data, info.width, info.height, info.channels);
}

async function composeSheet(cellBufs, meta) {
  const tileW = Math.round(VW / 2);
  const tileH = Math.round(VH / 2);
  const labelH = 18;
  const { width, height, cellH } = sheetSize(WEATHERS.length, TODS.length, tileW, tileH, labelH);
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 18, g: 18, b: 20 } },
  });
  const composites = [];
  for (const cell of cells) {
    const buf = cellBufs[cell.key];
    if (!buf) continue;
    const tile = await sharp(buf).resize(tileW, tileH, { fit: "fill" }).png().toBuffer();
    const x = cell.col * tileW;
    const y = cell.row * cellH;
    const label = Buffer.from(
      `<svg width="${tileW}" height="${labelH}">` +
      `<rect width="100%" height="100%" fill="#1c1c20"/>` +
      `<text x="6" y="13" font-family="monospace" font-size="11" fill="#e6e6e6">` +
      `${meta.track} ${cell.tod}|${cell.weather}</text></svg>`,
    );
    composites.push({ input: label, left: x, top: y });
    composites.push({ input: tile, left: x, top: y + labelH });
  }
  return base.composite(composites).png().toBuffer();
}

async function bootBackend(backend) {
  const srv = await startStaticServer(ROOT, { port: PORT });
  const browser = await launchChromium({
    args: chromiumArgsForBackend(backend),
    ...(process.env.APEX_CHROMIUM ? { executablePath: process.env.APEX_CHROMIUM } : {}),
  });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 160)));
  await installProbeInit(page, { backend });
  await gotoGame(page, srv.url, 180000);
  return { srv, browser, page, backend };
}

async function resolveFrac(page) {
  if (FRAC_RAW != null) {
    const f = Number(FRAC_RAW);
    if (!Number.isFinite(f) || f < 0 || f > 1) die(`--frac must be 0..1 (got ${FRAC_RAW})`);
    return { frac: f, turn: TURN_RAW != null ? Number(TURN_RAW) : null, turns: null };
  }
  const turns = await page.evaluate((id) => {
    const def = (typeof Tracks !== "undefined" && Tracks.LIST)
      ? Tracks.LIST.find((t) => t && t.id === id) : null;
    return def && Array.isArray(def.turns) ? def.turns.slice() : null;
  }, TRACK);
  if (!turns) die(`track "${TRACK}" has no def.turns after boot`);
  const turn = Number(TURN_RAW);
  return { frac: turnFrac(turns, turn), turn, turns };
}

async function raceAndPin(page, tod, weather) {
  await page.evaluate(async ([id, t, w, seed]) => {
    const a = window.__apex;
    if (a.seed) a.seed(seed);
    a.headless(false);
    const r = a.race(id, t, w, { grid: "tier" });
    if (r && typeof r.then === "function") await r;
  }, [TRACK, tod, weather, SEED]);
  await page.waitForFunction((id) => window.__apex.info().track === id, TRACK, {
    timeout: 180000, polling: 200,
  });
}

async function settleCell(page, tod, weather, frac, prevTod) {
  return page.evaluate(async ([t, w, f, eyeH, fov, prev]) => {
    const a = window.__apex;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const dark = (x) => x !== "day";
    const rebuilt = prev == null || dark(prev) !== dark(t);
    if (a.setTimeOfDay && a.setTimeOfDay() !== t) a.setTimeOfDay(t);
    if (a.weather && a.weather() !== w) a.weather(w);
    if (rebuilt) {
      // loadTrack rebuild on day ↔ dawn/dusk/night — poll present / builtNight
      for (let i = 0; i < 50; i++) {
        await wait(120);
        if (a.awaitPresent) {
          try { await a.awaitPresent(1000); break; } catch (_) { /* keep polling */ }
        }
        const ls = a.lightState ? a.lightState() : null;
        if (ls && ls.builtNight != null) break;
      }
    } else {
      await wait(250);
    }
    a.go();
    a.park(f);
    a.freeze(true);
    if (a.hud) a.hud(false);
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.hidden = true;
    document.querySelectorAll(".screen").forEach((el) => { el.hidden = true; });
    // eyeAt pins FOV 60 by default; re-apply freeCam when --fov differs
    const placed = a.eyeAt(f, 0, eyeH);
    if (placed && a.freeCam && fov !== 60) {
      a.freeCam({ eye: placed.eye, target: placed.target, fov });
    }
    a.step && a.step(1 / 60, 8);
    const diag = a.diag ? a.diag({ download: false }) : null;
    const cs = a.camState ? a.camState() : null;
    return {
      tod: a.setTimeOfDay ? a.setTimeOfDay() : t,
      weather: a.weather ? a.weather() : w,
      backend: diag && diag.env && diag.env.backend,
      backendState: diag && diag.env && diag.env.backendState,
      fov: cs && cs.fov,
      eye: cs && cs.eye,
    };
  }, [tod, weather, frac, EYE_H, FOV, prevTod]);
}

async function shootAll(backend) {
  let handle;
  try {
    handle = await bootBackend(backend);
    const { page } = handle;
    // Boot race once so Tracks.LIST + def.turns are live
    await raceAndPin(page, "day", "dry");
    const placed = await resolveFrac(page);
    console.log(`wx-grid: ${TRACK} turn=${placed.turn ?? "-"} frac=${placed.frac.toFixed(4)} ` +
      `seed=${SEED} eye=${EYE_H} fov=${FOV} backend=${backend}`);

    const order = sortCombosMinRebuild(cells, PREFER_DARK);
    const cellBufs = {};
    const cellStats = {};
    let prevTod = null;
    let actualBackend = backend;
    let probeOk = false;

    for (const cell of order) {
      // One boot race above; settleCell flips tod/weather (rebuild only on day↔dark)
      const settled = await settleCell(page, cell.tod, cell.weather, placed.frac, prevTod);
      if (settled.backend) actualBackend = settled.backend;
      const shot = await screenshotPresentedCanvas(page, {
        path: path.join(outDir, `${cell.key}.png`),
        awaitMs: 60000,
        pauseRender: true,
      });
      const pix = await pixelEvidence(shot.buf);
      if (!pix.meaningful) {
        console.warn(`wx-grid: ${cell.key} evidence=${pix.classification} on ${backend}`);
        if (backend === "webgpu" && !probeOk) {
          throw Object.assign(new Error(`webgpu scene not meaningful (${pix.classification})`), { fallback: true });
        }
      } else {
        probeOk = true;
      }
      const stats = await statsFromPng(shot.buf);
      cellBufs[cell.key] = shot.buf;
      cellStats[cell.key] = {
        tod: cell.tod,
        weather: cell.weather,
        meanL: +stats.meanL.toFixed(4),
        meanRGB: stats.meanRGB.map((v) => +v.toFixed(4)),
        saturation: +stats.saturation.toFixed(6),
        file: `${cell.key}.png`,
        evidence: pix.classification,
      };
      console.log(`  ${cell.key.padEnd(14)} L=${stats.meanL.toFixed(1).padStart(6)} ` +
        `sat=${stats.saturation.toFixed(3)} ${pix.classification}`);
      prevTod = cell.tod;
    }

    const ratios = lightingRatios(cellStats);
    const sheetBuf = await composeSheet(cellBufs, { track: TRACK });
    const sheetName = `${TRACK}-wx-grid.png`;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, sheetName), sheetBuf);

    const report = {
      tool: "wx-grid",
      track: TRACK,
      turn: placed.turn,
      frac: placed.frac,
      seed: SEED,
      eye: EYE_H,
      fov: FOV,
      viewport: { width: VW, height: VH },
      backendRequested: backend,
      backend: actualBackend,
      sheet: sheetName,
      cells: cellStats,
      ratios: {
        stormVsRainDay: +ratios.stormVsRainDay.toFixed(4),
        fogNightVsDryNight: +ratios.fogNightVsDryNight.toFixed(4),
        overcastNightVsDryNight: +ratios.overcastNightVsDryNight.toFixed(4),
        values: Object.fromEntries(
          Object.entries(ratios.values).map(([k, v]) => [k, +v.toFixed(4)]),
        ),
      },
      capturedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(outDir, "luminance.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`wrote ${path.join(relOut, sheetName)}`);
    console.log(`wrote ${path.join(relOut, "luminance.json")}`);
    console.log(`ratios: storm/rain day=${report.ratios.stormVsRainDay} ` +
      `fog/dry night=${report.ratios.fogNightVsDryNight}`);
    console.log(`= run passed (${CELL_COUNT} cells, backend ${actualBackend})`);
    return report;
  } finally {
    await shutdown();
  }
}

fs.mkdirSync(outDir, { recursive: true });

const tryList = BACKEND_REQ === "auto" ? BACKENDS_AUTO : [BACKEND_REQ];
let lastErr = null;
for (const be of tryList) {
  try {
    await shootAll(be);
    lastErr = null;
    break;
  } catch (e) {
    lastErr = e;
    const msg = e && e.message ? e.message : String(e);
    console.warn(`wx-grid: backend ${be} failed: ${msg}`);
    if (BACKEND_REQ !== "auto" && !e?.fallback) break;
    console.warn(`wx-grid: falling back…`);
  }
}
if (lastErr) {
  console.error("wx-grid: " + (lastErr.stack || lastErr));
  process.exit(1);
}
