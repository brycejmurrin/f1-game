#!/usr/bin/env node
// track-session.mjs — ONE booted game, many track shots: the server half of apex_track.
// @doc Persistent track session (`--serve`): boot once, then JSON-line shot/eval/track/sheet/diff ops in seconds each.
// @skill survey-track
//
// Every shot.mjs call boots Chromium, defines __apex (10–13 s) and builds the
// track (~16 s) before its one frame, so a 45-shot survey spent ~35 min mostly
// re-booting the same circuit (2026-10-03). This keeps the page and the built
// track alive and answers one JSON line per op on stdin:
//
//   {"id":1,"shot":"t3-eye","frac":0.12,"cam":"eye"}        → {id, ok, png, spread, kb, frame}
//   {"id":2,"eval":"a.trackInfo({what:'corners'})"}           → {id, ok, value}
//   {"id":3,"track":"monaco"}                                 → {id, ok, track, buildMs}
//   {"id":4,"sheet":"overview"}                               → {id, ok, png, n}   (every shot so far)
//   {"id":5,"diff":["t3-eye","t3-eye-night"]}                 → {id, ok, delta, png}
//   {"id":6,"status":true}                                    → {id, ok, track, shots, uptimeMs}
//
// Cameras are shot.mjs's: park | eye | orbit | cinematic | trackside, with
// az/el/dist/side/tod/hud, plus h: metres above the road (eye: eye height;
// orbit: the aim point, so a prop 200 m up can be framed). On eye, el is the
// pitch (view() free-look); without it eye looks ahead as before. The first
// line it prints is {"ready":true,…}; stdin EOF closes the browser. Usage:
//   node tools/shot/track-session.mjs --serve --track spa --out artifacts/track-session
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { awaitPresentedFrame, screenshotPresentedCanvas } from "./probe-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const BOOT_MS = 45000, TRACK_MS = 60000, PRESENT_MS = 90000;
const CAMS = new Set(["park", "eye", "orbit", "cinematic", "trackside"]);
const TODS = new Set(["day", "dusk", "dawn", "night"]);
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;

if (!argv.includes("--serve")) {
  console.error("usage: track-session.mjs --serve --track <id> [--out <dir under artifacts/ or scratch/>]");
  process.exit(2);
}
const outDir = resolve(ROOT, flag("--out", "artifacts/track-session"));
mkdirSync(outDir, { recursive: true });
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");

const started = Date.now();
const shots = [];                  // {name, png, frac, cam, tod}
let page = null, track = null;

async function buildTrack(id) {
  const t0 = Date.now();
  await page.evaluate((t) => window.__apex.race(t), id);
  await page.waitForFunction((t) => window.__apex.info().track === t, id, { timeout: TRACK_MS, polling: 100 });
  await sleep(1200);   // mesh build settles, as shot.mjs
  track = id;
  return Date.now() - t0;
}

async function shot(op) {
  const cam = String(op.cam || "orbit");
  if (!CAMS.has(cam)) throw new Error(`cam must be one of ${[...CAMS].join("|")}`);
  const tod = String(op.tod || "day");
  if (!TODS.has(tod)) throw new Error(`tod must be one of ${[...TODS].join("|")}`);
  const frac = Number(op.frac ?? 0.1);
  if (!(frac >= 0 && frac <= 1)) throw new Error("frac must be 0..1");
  const name = op.shot === true || op.shot == null ? `shot-${shots.length + 1}` : String(op.shot);
  if (!NAME_RE.test(name)) throw new Error("shot name: letters, digits, . _ - only");
  const num = (v, d) => (v == null || v === "" ? d : Number(v));
  const args = { frac, cam, tod, az: num(op.az, 45), el: num(op.el, 18), dist: num(op.dist, 45),
    side: Number(op.side) === -1 ? -1 : 1, hud: !!op.hud,
    // eye: an explicit el is the pitch (degrees, + up); none keeps eyeAt's look-ahead.
    pitch: op.el == null || op.el === "" ? null : Number(op.el),
    // metres above the road at frac: eye = eye height (eyeAt h, default 2.5),
    // orbit = aim point (orbit h, default 1.5) — frames a prop high in the air.
    h: op.h == null || op.h === "" ? null : Number(op.h) };
  for (const k of ["az", "el", "dist", "h"]) {
    if (args[k] != null && !Number.isFinite(args[k])) throw new Error(`${k} must be a finite number`);
  }
  const frame = await page.evaluate((o) => {
    const a = window.__apex;
    a.go(); a.park(o.frac); a.freeze(true);
    if (a.setTimeOfDay) a.setTimeOfDay(o.tod);
    if (a.hud) a.hud(o.hud);
    if (o.cam === "eye") {
      const r = a.eyeAt(o.frac, 0, o.h == null ? 2.5 : o.h);
      // Re-aim by pitch along the same heading: view() free-look, yaw 0 = -Z.
      if (o.pitch != null && r) {
        const yaw = Math.atan2(r.target[0] - r.eye[0], -(r.target[2] - r.eye[2])) * 180 / Math.PI;
        a.view({ eye: r.eye, yaw, pitch: o.pitch });
      }
    } else if (o.cam === "orbit") a.orbit(o.frac, o.az, o.el, o.dist, o.h == null ? 1.5 : o.h);
    else if (o.cam === "cinematic") a.cinematic(o.frac, { dist: o.dist, el: o.el });
    else if (o.cam === "trackside") a.view({ s: o.frac, side: o.side, dist: o.dist, height: Math.max(3, o.el * 0.35), look: "in" });
    else a.snapCam();
    if (a.step) a.step(1 / 60, 4);
    const vs = a.viewState ? a.viewState() : null, cs = a.camState ? a.camState() : null;
    return { dbgCamActive: !!(vs && vs.dbgCamActive) || !!(cs && cs.debug), camState: cs };
  }, args);
  await sleep(300);
  // A NEW frame or no file — the stale-blit guard shot.mjs carries (#780) —
  // waited for TWICE. In a live session a present is usually already in
  // flight from the previous camera; the first wait resolves on it and the
  // capture was the last shot again (orbit and eye shots 0.5 % apart,
  // 2026-10-03). The second present is rendered after the move.
  for (let i = 0; i < 2; i++) {
    if (await awaitPresentedFrame(page, PRESENT_MS) === false) {
      throw new Error(`no new frame within ${PRESENT_MS / 1000} s of the camera move`);
    }
  }
  const png = join(outDir, `${name}.png`);
  const cap = await screenshotPresentedCanvas(page, { path: png, skipAwait: true, timeout: 60000 });
  const st = await sharp(cap.buf).stats();
  const spread = Math.max(...st.channels.slice(0, 3).map((c) => c.stdev));
  if ((st.channels.length >= 4 && st.channels[3].max === 0) || spread < 2) {
    throw new Error(`frame is blank (pixel spread ${spread.toFixed(2)})`);
  }
  const prev = shots.findIndex((s) => s.name === name);
  const rec = { name, png, frac, cam, tod, track };
  if (prev >= 0) shots[prev] = rec; else shots.push(rec);
  return { png, spread: +spread.toFixed(1), kb: +(cap.buf.length / 1024).toFixed(1), frame };
}

const pngOf = (ref) => {
  const s = shots.find((x) => x.name === ref);
  if (s) return s.png;
  const p = resolve(outDir, String(ref));
  if (!p.startsWith(outDir) || !existsSync(p)) throw new Error(`unknown shot ${ref}`);
  return p;
};

async function sheet(name, cols) {
  if (!shots.length) throw new Error("no shots yet");
  const cell = 360, first = await sharp(shots[0].png).metadata();
  const ch = Math.round(cell * first.height / first.width), PAD = 10, LAB = 18;
  const n = cols || Math.min(shots.length, Math.max(1, Math.round(Math.sqrt(shots.length * 1.6))));
  const rows = Math.ceil(shots.length / n);
  const W = n * (cell + PAD) + PAD, H = rows * (ch + LAB + PAD) + PAD;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const comp = [], svg = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i], x = PAD + (i % n) * (cell + PAD), y = PAD + ((i / n) | 0) * (ch + LAB + PAD);
    comp.push({ input: await sharp(s.png).resize(cell, ch, { fit: "fill" }).toBuffer(), left: x, top: y });
    svg.push(`<text x="${x}" y="${y + ch + 13}" fill="#e6e9ef" font-family="monospace" font-size="11">${esc(`${s.name} · ${s.track} ${s.frac} ${s.cam} ${s.tod}`)}</text>`);
  }
  comp.push({ input: Buffer.from(`<svg width="${W}" height="${H}">${svg.join("")}</svg>`), left: 0, top: 0 });
  const file = join(outDir, `${name}.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: "#14161c" } }).composite(comp).png().toFile(file);
  return { png: file, n: shots.length };
}

async function diff(a, b) {
  const [pa, pb] = [pngOf(a), pngOf(b)];
  const { width, height } = await sharp(pa).metadata();
  const raw = (p) => sharp(p).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [ra, rb] = await Promise.all([raw(pa), raw(pb)]);
  const over = Buffer.alloc(ra.length);
  let changed = 0;
  for (let i = 0; i < ra.length; i += 3) {
    const d = Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2]);
    if (d > 30) { changed++; over[i] = 255; over[i + 1] = 40; over[i + 2] = 40; }
    else { const g = (rb[i] + rb[i + 1] + rb[i + 2]) / 9; over[i] = over[i + 1] = over[i + 2] = g; }
  }
  const file = join(outDir, `diff-${basename(pa, ".png")}-vs-${basename(pb, ".png")}.png`);
  await sharp(over, { raw: { width, height, channels: 3 } }).png().toFile(file);
  return { delta: +(changed / (width * height)).toFixed(4), png: file };
}

async function handle(op) {
  if (op.status) return { track, shots: shots.length, uptimeMs: Date.now() - started };
  if (op.track) {
    if (!/^[a-z0-9_]{2,40}$/.test(String(op.track))) throw new Error("bad track id");
    return { track: op.track, buildMs: await buildTrack(String(op.track)) };
  }
  if (op.eval != null) {
    const r = await page.evaluate(async (expr) => {
      try {
        const v = await new Function("a", "return (async()=>(" + expr + "))()")(window.__apex);
        return { value: v === undefined ? null : JSON.parse(JSON.stringify(v)) };
      } catch (e) { return { err: String((e && e.message) || e) }; }
    }, String(op.eval));
    if (r.err) throw new Error(r.err);
    return { value: r.value };
  }
  if (op.sheet) return sheet(op.sheet === true ? "sheet" : String(op.sheet), Number(op.cols) || 0);
  if (op.diff) return diff(op.diff[0], op.diff[1]);
  if (op.shot != null || op.frac != null || op.cam != null) return shot(op);
  throw new Error("unknown op: send shot | eval | track | sheet | diff | status");
}

(async () => {
  const id = String(flag("--track", "monza"));
  const srv = await startStaticServer(ROOT);
  try {
    // APEX_GL=llvmpipe: Mesa GL via ANGLE (same pin as playwright.config.js) —
    // ~2–3× faster software frames when Mesa dri is installed; SwiftShader default.
    const angle = process.env.APEX_GL === "llvmpipe" ? "gl" : "swiftshader";
    const browser = await launchChromium({ args: [`--use-angle=${angle}`, "--enable-unsafe-webgpu", "--disable-background-timer-throttling"] });
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { timeout: BOOT_MS, polling: 100 });
    // Models resident BEFORE the build, so scenery's bakedModel() emits (shot.mjs).
    await page.evaluate(async () => { try { if (typeof Assets !== "undefined" && Assets.loadModels) await Assets.loadModels(); } catch (_) { /* procedural look */ } });
    const buildMs = await buildTrack(id);
    send({ ready: true, track, out: outDir, bootMs: Date.now() - started, buildMs });
  } catch (e) {
    send({ ready: false, error: String(e.message || e) });
    await shutdown();
    process.exit(1);
  }
  // Ops run strictly in order: one page, one camera.
  let chain = Promise.resolve();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let op;
    try { op = JSON.parse(line); } catch { send({ ok: false, error: "line is not JSON" }); return; }
    chain = chain.then(async () => {
      try { send({ id: op.id, ok: true, ...(await handle(op)) }); }
      catch (e) { send({ id: op.id, ok: false, error: String(e.message || e) }); }
    });
  });
  rl.on("close", async () => { await chain; await shutdown(); process.exit(0); });
})();
