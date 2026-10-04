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
//   {"id":7,"batch":[{shot spec}, …],"sheet":"name"}          → {id, ok, shots:[…], failed:[…], sheet}
//   {"id":8,"survey":"quick"|"standard","tods":true}          → the shot list built from trackInfo, then a batch
//   {"id":9,"reset":{"frac":0.2,"speed":40}}                  → obs()          (driving ops: headless physics)
//   {"id":10,"act":{"steer":0,"throttle":true},"n":60}        → obs() after n ticks
//   {"id":11,"rollout":{"seconds":6,"input":{…}}}             → __apex.rollout digest
//   {"id":12,"world":"drive"} / {"field":"brief"}             → world() / field()  (brief | drive | full)
// Long ops (batch, survey) print {"id","progress","total","note"} lines first.
// --root <dir> serves ANOTHER checkout's js/css/assets (track-compare.mjs).
//
// Cameras are shot.mjs's: park | eye | orbit | cinematic | trackside, with
// az/el/dist/side/tod/hud. The first line it prints is {"ready":true,…}; stdin
// EOF closes the browser. Usage:
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
const SERVE_ROOT = resolve(ROOT, flag("--root", "."));
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
    side: Number(op.side) === -1 ? -1 : 1, hud: !!op.hud };
  const frame = await page.evaluate((o) => {
    const a = window.__apex;
    if (a.headless) a.headless(false);   // a driving op may have left render off — a shot would be stale
    a.go(); a.park(o.frac); a.freeze(true);
    if (a.setTimeOfDay) a.setTimeOfDay(o.tod);
    if (a.hud) a.hud(o.hud);
    if (o.cam === "eye") a.eyeAt(o.frac, 0, 2.5);
    else if (o.cam === "orbit") a.orbit(o.frac, o.az, o.el, o.dist);
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

/** Many shots in one op; a failed shot is reported and skipped, not fatal. */
async function batch(id, list, sheetName) {
  if (!Array.isArray(list) || !list.length) throw new Error("batch needs a non-empty list of shot specs");
  if (list.length > 200) throw new Error("batch is capped at 200 shots");
  const done = [], failed = [];
  for (let i = 0; i < list.length; i++) {
    const spec = list[i] || {};
    send({ id, progress: i, total: list.length, note: `shot ${i + 1}/${list.length} ${spec.shot || ""}`.trim() });
    try { const r = await shot({ ...spec, shot: spec.shot ?? spec.name ?? true }); done.push({ name: basename(r.png, ".png"), png: r.png, spread: r.spread }); }
    catch (e) { failed.push({ i, spec, error: String(e.message || e) }); }
  }
  send({ id, progress: list.length, total: list.length, note: "sheet" });
  const sh = sheetName && done.length ? await sheet(String(sheetName), 0) : null;
  return { shots: done, failed, sheet: sh && sh.png };
}

/** A shot list built from the circuit itself: overview, then per named corner
 *  an approach eye, an apex orbit and a trackside; `tods` adds dawn/dusk/night
 *  at the first two corners. `quick` keeps the overview + 4 corners. */
async function surveyList(preset, tods, maxCorners) {
  const info = await page.evaluate(() => {
    const a = window.__apex, t = a.trackInfo ? a.trackInfo({ what: "corners" }) : null;
    const list = (t && (t.corners || t.turns)) || [];
    const fr = list.map((c) => ({ name: String(c.name || c.label || c.turn || c.id || "").replace(/[^A-Za-z0-9_-]+/g, "-"), frac: c.frac ?? c.apexFrac ?? c.f }))
      .filter((c) => typeof c.frac === "number");
    return fr.length ? fr : (a.corners ? a.corners().map((f, i) => ({ name: `c${i + 1}`, frac: f })) : []);
  });
  const cap = maxCorners || (preset === "quick" ? 4 : 40);
  const corners = info.slice(0, cap);
  const shots = [0, 0.25, 0.5, 0.75].map((f) => ({ shot: `sv-ov-${f}`, frac: f, cam: "orbit", el: 60, dist: 400 }));
  for (const [i, c] of corners.entries()) {
    const n = `sv-${String(i + 1).padStart(2, "0")}-${c.name || "corner"}`.slice(0, 60);
    shots.push({ shot: `${n}-eye`, frac: +Math.max(0, c.frac - 0.004).toFixed(4), cam: "eye" });
    shots.push({ shot: `${n}-orbit`, frac: +c.frac.toFixed(4), cam: "orbit", az: 45, el: 25, dist: 60 });
    if (preset !== "quick") shots.push({ shot: `${n}-ts`, frac: +c.frac.toFixed(4), cam: "trackside", side: 1, dist: 40 });
  }
  if (tods) for (const c of corners.slice(0, 2)) for (const tod of ["dawn", "dusk", "night"]) {
    shots.push({ shot: `sv-tod-${c.name || "c"}-${tod}`.slice(0, 70), frac: c.frac, cam: "orbit", az: 45, el: 25, dist: 60, tod });
  }
  return shots;
}

/** A driving op: headless physics through the __apex obs/act loop. Shots turn
 *  rendering back on. */
async function drive(fn, arg) {
  const r = await page.evaluate(async ({ src, arg: o }) => {
    try {
      const a = window.__apex;
      if (a.info().state !== "race") { a.go(); }
      const v = await new Function("a", "o", "return (" + src + ")(a, o)")(a, o);
      return { value: v == null ? null : JSON.parse(JSON.stringify(v)) };
    } catch (e) { return { err: String((e && e.message) || e) }; }
  }, { src: fn.toString(), arg });
  if (r.err) throw new Error(r.err);
  return { value: r.value };
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
  if (op.batch) return batch(op.id, op.batch, op.sheet);
  if (op.survey) return batch(op.id, await surveyList(String(op.survey), !!op.tods, Number(op.maxCorners) || 0), op.sheet || `survey-${track}`);
  if (op.reset) return drive((a, o) => { if (a.headless) a.headless(true); return a.reset(o.frac ?? 0, o.speed, o.x); }, op.reset);
  if (op.act) return drive((a, o) => a.act(o.input, o.dt, o.n), { input: op.act, dt: op.dt, n: Math.min(Math.max(Number(op.n) || 1, 1), 7200) });
  if (op.rollout) return drive((a, o) => a.rollout(o), op.rollout);
  if (op.world) return drive((a, o) => a.world({ detail: o }), op.world === true ? "drive" : String(op.world));
  if (op.field) return drive((a, o) => a.field({ detail: o }), op.field === true ? "brief" : String(op.field));
  if (op.sheet) return sheet(op.sheet === true ? "sheet" : String(op.sheet), Number(op.cols) || 0);
  if (op.diff) return diff(op.diff[0], op.diff[1]);
  if (op.shot != null || op.frac != null || op.cam != null) return shot(op);
  throw new Error("unknown op: send shot | eval | track | sheet | diff | status");
}

(async () => {
  const id = String(flag("--track", "monza"));
  const srv = await startStaticServer(SERVE_ROOT);
  try {
    const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"] });
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
