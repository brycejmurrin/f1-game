#!/usr/bin/env node
// tools/perf/first-race-census.mjs — every render pipeline three builds AFTER the lights on a page's FIRST race (#3673).
// @doc First-race pipeline census: TLX WebGPU on Lavapipe, one driven first lap; every createRenderPipeline after
// @doc lights-out with its material key (TLX matCache), object, attributes, render target and winding sign.
//
// The iPhone 14 evidence (docs/notes/DEVICE-FARM-ANALYSIS-2026-10-24.md §4 lever 2): the first race on a unit gets two
// frames over 100 ms that the second race does not, with or without apex26.tlxWarmPlus=1. A pipeline the entry warm
// did not build is compiled synchronously inside the race frame that first draws it. This census names each one so
// the warm list (tlx.js _LATE_LIT / _LATE_FX, the #3640 pattern) can pre-mint it. Read NAMES and COUNTS: build ms on
// Lavapipe are not a phone's.
//
//   node tools/perf/first-race-census.mjs [--track monza] [--tod day] [--lap 100] [--cam helmet] [--no-lavapipe] [--go] [--cpu]
//        [--ls "apex26.k=v ..."] [--json artifacts/perf/first-race-census.json]
//
// Output: `= first-race-census track=… api=… warm=… pre=N post=M sync=S misses=K dist=…m` and one line per pipeline built
// after lights-out: `  +<s> <state> key=<matCache key|-> <obj> <mat> rt=<target> sx=<±1> attrs=<…> <build ms>`.
import { startStaticServer, launchChromium, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } from "../lib/harness.mjs";
import { gotoGame } from "../shot/probe-page.mjs";
import { raceGate } from "../lib/census-entry.mjs";
import { driver } from "../gfx/live-frame-census.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseArgs(argv) {
  const o = { track: "monza", tod: null, lap: 100, cam: "helmet", lavapipe: true, go: false, cpu: false, ls: [], json: "artifacts/perf/first-race-census.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--track") { o.track = String(v); i++; }
    else if (a === "--tod") { o.tod = String(v); i++; }
    else if (a === "--lap") { o.lap = Math.max(10, Math.min(600, +v || 100)); i++; }
    else if (a === "--cam") { o.cam = String(v); i++; }
    else if (a === "--no-lavapipe") o.lavapipe = false;
    else if (a === "--go") o.go = true;
    else if (a === "--cpu") o.cpu = true;
    else if (a === "--ls") { o.ls = String(v || "").split(/\s+/).filter(Boolean).map((kv) => { const k = kv.indexOf("="); return k > 0 ? [kv.slice(0, k), kv.slice(k + 1)] : null; }).filter(Boolean); i++; }
    else if (a === "--json") { o.json = String(v); i++; }
    else throw new Error("unknown flag: " + a);
  }
  return o;
}

// Page side, after boot: name every pipeline three's backend builds, stamped with the game state it landed in.
export function hookPipelines() {
  const P = window.__frc = { pipes: [], lightsAt: null };
  const T = typeof GLX !== "undefined" ? GLX.__tlx : null, be = T && T.renderer && T.renderer.backend;
  if (!be || typeof be.createRenderPipeline !== "function") return "no three backend";
  const o = be.createRenderPipeline;
  be.createRenderPipeline = function (ro, promises) {
    const a = performance.now();
    try { return o.apply(this, arguments); } finally {
      try {
        let st = null; try { st = window.__apex.info().state; } catch (_) { /* booting */ }
        if (st === "race" && P.lightsAt == null) P.lightsAt = a;
        const m = ro.material || {}, ob = ro.object || {}, g = ro.geometry || {}, c = ro.context || {};
        let key = null; try { key = T.matKeyOf ? T.matKeyOf(m) : null; } catch (_) { /* older TLX */ }
        const det = ob.matrixWorld && ob.matrixWorld.determinant ? ob.matrixWorld.determinant() : 1;
        const rt = c.renderTarget ? (c.renderTarget.texture && c.renderTarget.texture.name || c.renderTarget.name || "rt") + ":" + c.width + "x" + c.height : "canvas";
        if (P.pipes.length < 600) P.pipes.push({ at: Math.round(a), ms: +(performance.now() - a).toFixed(1), async: !!promises, state: st, key,
          mat: (m.type || "") + ":" + (m.name || ""), transparent: !!m.transparent, side: m.side,
          obj: (ob.type || "") + ":" + (ob.name || "") + (ob.isInstancedMesh ? ":inst" : ""), sx: det < 0 ? -1 : 1,
          attrs: Object.keys(g.attributes || {}).sort().join(","), indexed: !!g.index, rt });
      } catch (_) { /* naming is best-effort; the build itself already returned */ }
    }
  };
  // Lights-out by the clock too: a race whose first frame builds nothing still marks it.
  (function poll() { try { if (P.lightsAt == null && window.__apex.info().state === "race") P.lightsAt = performance.now(); } catch (_) { /* booting */ }
    if (P.lightsAt == null) requestAnimationFrame(poll); })();
  let api = null; try { api = T.backendState().api; } catch (_) { /* older TLX */ }
  return "ok " + (api || (be.isWebGPUBackend ? "webgpu" : "webgl2"));
}

// Page side: per-stage ms of the last count frames and the first race frames (#3673 goal 3: the device's first race frame
// spent 65 ms in physics). One row per game frame: [state, frame ms, {stage: ms}] from PerfSpans begin/end pairs.
// cpu (--cpu): console.profile() around race frames 1-3 and 120-122; the CDP session saves both .cpuprofile files.
export function hookFrames(cpu) {
  if (typeof PerfSpans === "undefined" || window.__frcFrames) return "no PerfSpans";
  const F = window.__frcFrames = { count: [], race: [], n: 0 };
  let cur = null; const open = {};
  const b0 = PerfSpans.begin, e0 = PerfSpans.end;
  PerfSpans.begin = function (n) { const t = performance.now();
    if (n === "frame") { let st = null; try { st = window.__apex.info().state; } catch (_) { /* booting */ } cur = { st, t, ms: {} };
      if (st === "race" && ++F.n && cpu) { if (F.n === 1) console.profile("first"); if (F.n === 120) console.profile("steady"); } }
    open[n] = t; return b0.apply(this, arguments); };
  PerfSpans.end = function (n) { const t = performance.now();
    if (cur && open[n] != null) { cur.ms[n] = +((cur.ms[n] || 0) + t - open[n]).toFixed(1); open[n] = null; }
    if (n === "frame" && cur) { const row = [cur.st, +(t - cur.t).toFixed(1), cur.ms];
      if (cpu && cur.st === "race") { if (F.n === 3) console.profileEnd("first"); if (F.n === 122) console.profileEnd("steady"); }
      if (cur.st === "count") { F.count.push(row); if (F.count.length > 10) F.count.shift(); } else if (cur.st === "race" && F.race.length < 15) F.race.push(row); cur = null; }
    return e0.apply(this, arguments); };
  return "ok";
}

/** The pipelines built after lights-out (state "race"), grouped by what a pre-mint keys on. Pure: the unit test runs it. */
export function latePipelines(pipes, lightsAt) {
  const late = (pipes || []).filter((p) => p.state === "race" || (lightsAt != null && p.at >= lightsAt));
  const groups = new Map();
  for (const p of late) {
    const g = `${p.key || p.mat}|${p.obj.replace(/:inst$/, "")}|sx=${p.sx}|${p.attrs}|${p.rt}`;
    const e = groups.get(g); if (e) e.n++; else groups.set(g, { n: 1, first: p });
  }
  return { late, groups: [...groups.values()].map((e) => ({ n: e.n, ...e.first })) };
}

async function run(o) {
  const server = await startStaticServer(process.cwd());
  let browser = null;
  const out = { started: new Date().toISOString(), ...o };
  try {
    browser = await launchChromium(o.lavapipe ? { args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new"], env: { ...process.env, ...WEBGPU_LAVAPE_ENV } }
      : { args: ["--enable-unsafe-webgpu", "--disable-background-timer-throttling"] });
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript((ls) => {
      window.__TEST_MODE = true;
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "0");
      localStorage.setItem("apex26.gfxPreset", '"medium"');
      localStorage.setItem("apex26.gfxBootStepMs", "45000");
      for (const [k, v] of ls) localStorage.setItem(k, v);
    }, o.ls);
    await page.addInitScript(driver);
    await gotoGame(page, server.url, 180000);
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.renderer, null, { polling: 200, timeout: 180000 });
    out.hook = await page.evaluate(hookPipelines);
    const profs = {};
    if (o.cpu) { const cdp = await ctx.newCDPSession(page); await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
      cdp.on("Profiler.consoleProfileFinished", (e) => { profs[e.title] = e.profile; }); }
    out.hookFrames = await page.evaluate(hookFrames, o.cpu);
    // The device's entry (devicefarm-iphone.mjs KICK_API): race() and the lights run out on their own. --go skips the
    // countdown, so state is "race" before the entry warm even starts and every warm build reads as post-lights.
    await page.evaluate(async ([t, tod, cam, go]) => { const A = window.__apex; await (tod ? A.race(t, tod, "dry") : A.race(t, undefined, "dry"));
      try { A.camera(cam); } catch (_) { /* unknown mode: keep default */ }
      if (go) A.go(); }, [o.track, o.tod, o.cam, o.go]);
    await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
    out.pre = await page.evaluate(() => { let ms = null; try { ms = GLX.__tlx.memState(); } catch (_) { /* none */ }
      return { matMissKeys: ms && ms.matMissKeys, mat: ms && [ms.matHit, ms.matMiss, ms.matEvict], warm: ms && ms.warm }; });
    await page.evaluate(() => window.__lfDrive.start());
    await page.waitForFunction((m) => window.__lfDrive.dist >= m, o.lap * 50, { polling: 2000, timeout: o.lap * 6000 }).catch(() => {});
    await page.evaluate(() => window.__lfDrive.stop());
    if (o.cpu) { mkdirSync("artifacts/profiles", { recursive: true });
      out.profiles = Object.entries(profs).map(([k, p]) => { const f = `artifacts/profiles/first-race-${k}.cpuprofile`; writeFileSync(f, JSON.stringify(p)); return f; }); }
    out.post = await page.evaluate(() => { const P = window.__frc; let ms = null; try { ms = GLX.__tlx.memState(); } catch (_) { /* none */ }
      return { pipes: P.pipes, lightsAt: P.lightsAt, dist: Math.round(window.__lfDrive.dist), off: window.__lfDrive.off, err: window.__lfDrive.err, matMissKeys: ms && ms.matMissKeys, frames: window.__frcFrames || null,
        mat: ms && [ms.matHit, ms.matMiss, ms.matEvict] }; });
  } finally {
    mkdirSync(path.dirname(o.json), { recursive: true });
    writeFileSync(o.json, JSON.stringify(out, null, 1));
    if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]);
    if (server.close) server.close();
  }
  return out;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const r = await run(o);
  const post = r.post || {}, pipes = post.pipes || [];
  const { late, groups } = latePipelines(pipes, post.lightsAt);
  const missNew = (post.matMissKeys || []).filter((k) => !((r.pre || {}).matMissKeys || []).includes(k));
  console.log(`= first-race-census track=${o.track} tod=${o.tod || "default"} hook=${r.hook} lavapipe=${o.lavapipe} pre=${pipes.length - late.length} ` +
    `post=${late.length} sync=${late.filter((p) => !p.async).length} groups=${groups.length} misses=${missNew.length} dist=${post.dist}m` +
    // matMiss / matEvict deltas over the lap: an evicted warm material is re-minted as a NEW identity, so its pipelines build again.
    (r.pre && r.pre.mat && post.mat ? ` matMiss=+${post.mat[1] - r.pre.mat[1]} matEvict=+${post.mat[2] - r.pre.mat[2]} (pre ${r.pre.mat.join("/")})` : ""));
  for (const p of groups) console.log(`  +${((p.at - (post.lightsAt || p.at)) / 1000).toFixed(1)}s x${p.n} ${p.state} key=${p.key || "-"} ${p.obj} ${p.mat} ` +
    `rt=${p.rt} sx=${p.sx} tr=${p.transparent} attrs=${p.attrs}${p.indexed ? " idx" : ""} ${p.ms}ms${p.async ? " async" : ""}`);
  for (const k of missNew) console.log(`  miss ${k}`);
  const fr = post.frames;
  if (fr) for (const [i, row] of [...fr.count.slice(-3), ...fr.race.slice(0, 6)].entries()) console.log(`  frame ${i} ${row[0]} ${row[1]}ms ${JSON.stringify(row[2])}`);
  if (r.profiles) console.log("profiles: " + r.profiles.join(" ") + "  (node tools/perf/cpuprofile-summary.mjs <file>)");
  console.log("json: " + o.json);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
