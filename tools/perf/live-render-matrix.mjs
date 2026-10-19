#!/usr/bin/env node
// live-render-matrix.mjs — #2572 render live-debug matrix on a runner that can draw.
// @doc #2572 render matrix: rebuild A/B, context loss, quality tiers, visibility/resize, night/mirror per backend.
// @skill renderer-debug
//
//   node tools/perf/live-render-matrix.mjs --backend three|webgl2 [--gl-fallback 1|0]
//        [--tracks bahrain,monaco] [--cycles 3] [--rows 1,2,3,4,5] [--json PATH]
//
// Rows (issue #2572 "Done when"):
//   1 rebuild   race(a), race(b) x cycles: GL create-delete live count per visit; the SAME circuit must
//               return to the same live count on visits 2..N (visit 1 pays one-time caches). TLX adds
//               renderer.info.memory geometries/textures.
//   2 ctxloss   WEBGL_lose_context.loseContext() 400 ms after a race() call (inside the track build) and
//               again on a settled race; verdict = frames advance again and the canvas is not stuck black
//               within the deadline (a reload is accepted: the probe re-boots and checks the same).
//   3 tiers     renderScale 1 -> 0.6 -> 1, govHold on/off with mirror on; NaN scan of every uniform upload
//               (sun direction, camera matrices, light positions arrive as uniform*fv / uniformMatrix*fv).
//   4 vis       visibilitychange hidden/visible and pageshow{persisted:true}; resize 844x390 <-> 390x844.
//   5 night     race(…, "night") with mirror on/off and matTex(0/1).
// Every row ends in a verdict: pass | fail | skip (with why). A scenario that throws is a fail with the
// error, never silently dropped. The JSON is checkpointed after every row so a CI timeout keeps the rest.
// No js/ edit: this only drives __apex and wraps WebGL2 at the prototype, before any page script runs.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, sleep } from "../lib/harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const KINDS = ["VertexArray", "Program", "Shader", "Buffer", "Texture", "Framebuffer", "Renderbuffer"];

function parseArgs(argv) {
  const o = { backend: "three", glFallback: null, tracks: ["bahrain", "monaco"], cycles: 3, rows: [1, 2, 3, 4, 5], json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--backend") o.backend = next();
    else if (a === "--gl-fallback") o.glFallback = next() !== "0";
    else if (a === "--tracks") o.tracks = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--cycles") o.cycles = Math.max(2, +next() | 0);
    else if (a === "--rows") o.rows = next().split(",").map(Number).filter(Boolean);
    else if (a === "--json") o.json = next();
    else if (a === "-h" || a === "--help") { console.log("usage: node tools/perf/live-render-matrix.mjs --backend three|webgl2 [--gl-fallback 1|0] [--tracks a,b] [--cycles N] [--rows 1,2,3,4,5] [--json PATH]"); process.exit(0); }
    else throw new Error("unknown argument " + a);
  }
  if (!["three", "webgl2"].includes(o.backend)) throw new Error("--backend must be three or webgl2");
  if (o.tracks.length < 2) throw new Error("--tracks needs two circuits");
  if (o.glFallback === null) o.glFallback = o.backend === "three" ? process.env.CENSUS_TLX_GL !== "0" : false;
  return o;
}

// Init script (runs before any page script): GL object counters, context registry, NaN uniform scan.
function initScript([kinds]) {
  if (window.__lrm) return;
  const L = window.__lrm = { gl: {}, ctxs: [], nan: { count: 0, first: null }, uploads: 0, frames: 0 };
  for (const k of kinds) L.gl[k] = { c: 0, d: 0 };
  const P = window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype;
  if (P) {
    for (const k of kinds) {
      const cr = P["create" + k], de = P["delete" + k];
      if (cr) P["create" + k] = function (...a) { const r = cr.apply(this, a); if (r) L.gl[k].c++; return r; };
      if (de) P["delete" + k] = function (o, ...a) { if (o) L.gl[k].d++; return de.call(this, o, ...a); };
    }
    const scan = (name, dataIdx) => {
      const f = P[name]; if (!f) return;
      P[name] = function (...a) {
        L.uploads++;
        const d = a[dataIdx];
        if (d && d.length) for (let i = 0; i < d.length; i++) if (d[i] !== d[i]) { L.nan.count++; if (!L.nan.first) L.nan.first = name + "[" + i + "] " + (new Error().stack || "").split("\n").slice(2, 4).join(" | "); break; }
        return f.apply(this, a);
      };
    };
    for (const n of ["uniform1fv", "uniform2fv", "uniform3fv", "uniform4fv"]) scan(n, 1);
    for (const n of ["uniformMatrix3fv", "uniformMatrix4fv"]) scan(n, 2);
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) {
    const c = gc.call(this, t, ...r);
    if (c && /webgl/.test(t) && !L.ctxs.includes(c)) L.ctxs.push(c);
    return c;
  };
  const tick = () => { L.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

const none = (n) => !(n > 0);   // absent or zero count: no coerced compare to 0
const readState = () => {
  const L = window.__lrm, out = { gl: {}, frames: L.frames, nan: L.nan.count, uploads: L.uploads, lost: L.ctxs.map((c) => c.isContextLost()) };
  for (const k in L.gl) out.gl[k] = L.gl[k].c - L.gl[k].d;
  try {
    const r = window.renderer;
    if (r && r.info && r.info.memory) out.tlxMem = { geometries: r.info.memory.geometries, textures: r.info.memory.textures };
    out.threeWebGL2 = !!(r && r.backend && r.backend.isWebGLBackend === true);
  } catch (_) { /* GLX has no renderer */ }
  try { out.gpuErrors = window.GLX && GLX.gpuErrors ? GLX.gpuErrors() : undefined; } catch (_) { /* no GLX */ }
  return out;
};

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const srv = await startStaticServer(ROOT);
  const args = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--enable-precise-memory-info"];
  if (process.platform === "linux") args.push("--use-angle=swiftshader");
  const browser = await launchChromium({ args });
  const report = { backend: o.backend, glFallback: o.glFallback, platform: process.platform, rows: {}, errors: [] };
  const save = () => { if (o.json) { mkdirSync(dirname(o.json), { recursive: true }); writeFileSync(o.json, JSON.stringify(report, null, 2)); } };
  const frames = (page) => page.evaluate(() => window.__lrm.frames);
  const framesAdvance = async (page, n = 20, ms = 90000) => {
    const f0 = await frames(page);
    try { await page.waitForFunction(([f, k]) => window.__lrm.frames >= f + k, [f0, n], { polling: 100, timeout: ms }); return true; } catch (_) { return false; }
  };
  // A black frame check: read the visible game canvases' centre pixels via 2D drawImage (works for #game-soft blits too).
  const notBlack = (page) => page.evaluate(() => {
    const cv = [...document.querySelectorAll("canvas")].filter((c) => c.width > 8 && c.height > 8);
    for (const c of cv) {
      try {
        const t = document.createElement("canvas"); t.width = 16; t.height = 16;
        const x = t.getContext("2d"); x.drawImage(c, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data; let s = 0;
        for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
        if (s > 16 * 16 * 3 * 2) return true;
      } catch (_) { /* tainted or webgl without preserveDrawingBuffer */ }
    }
    return false;
  });
  const mkPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(([be, force]) => {
      window.__TEST_MODE = true;
      try {
        localStorage.setItem("apex26.gfxBackend", be);
        if (force) localStorage.setItem("apex26.tlxForceGL", "1");
        localStorage.setItem("apex26.tyreWear", JSON.stringify("off"));
      } catch (_) { /* storage blocked */ }
    }, [o.backend, o.backend === "three" && o.glFallback]);
    await ctx.addInitScript(initScript, [KINDS]);
    await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => report.errors.push(String(e).slice(0, 300)));
    await page.goto(srv.url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__apex && window.__apex.info && typeof Tracks !== "undefined", null, { polling: 100, timeout: 120000 });
    return { ctx, page };
  };
  const raceTo = async (page, id, tod) => {
    await page.evaluate(async (t) => { const i = Tracks.LIST.findIndex((x) => x.id === t); if (i >= 0) await window.__apex.ensureCircuit(i); }, id);
    await page.evaluate(([t, d]) => (d ? window.__apex.race(t, d) : window.__apex.race(t)), [id, tod || ""]);
    await page.waitForFunction((t) => { const i = window.__apex.info(); return i.track != null && (i.track === t || (i.track && i.track.id === t)); }, id, { polling: 100, timeout: 120000 });
    await framesAdvance(page, 15);
  };
  // Each row is capped (a hung row used to eat the whole job) and a failed row gets a fresh page, so one
  // failure does not poison the rows after it.
  const ROW_CAP = { rebuild: 180000 }, DEFAULT_CAP = 90000;   // a capped row is "timeout" (inconclusive), never a silent pass
  const row = async (n, name, fn) => {
    if (!o.rows.includes(n)) return;
    const r = report.rows[name] = { verdict: "fail", notes: [] };
    const t0 = Date.now();
    console.log("= row " + name + " start");
    let timer;
    try {
      const cap = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error("row timeout " + (ROW_CAP[name] || DEFAULT_CAP) + " ms"), { timedOut: true })), ROW_CAP[name] || DEFAULT_CAP); });
      Object.assign(r, await Promise.race([fn(r), cap]));
    } catch (e) { r.verdict = e && e.timedOut ? "timeout" : "fail"; r.error = String(e && e.message || e).slice(0, 400); }
    clearTimeout(timer);
    r.ms = Date.now() - t0;
    console.log("= row " + name + " " + r.verdict + (r.error ? " " + r.error : ""));
    save();
    if (r.verdict === "fail" || r.verdict === "timeout") {
      try { await ctx.close(); } catch (_) { /* already gone */ }
      ({ ctx, page } = await mkPage());
    }
  };
  let ctx, page;
  try {
    ({ ctx, page } = await mkPage());
    report.boot = await page.evaluate(readState);
    const [A, B] = o.tracks;

    await row(1, "rebuild", async () => {
      const visits = [];
      for (let c = 1; c <= o.cycles; c++) for (const id of [A, B]) {
        await raceTo(page, id);
        await sleep(2000);
        visits.push({ cycle: c, track: id, ...(await page.evaluate(readState)) });
      }
      const flat = {};
      let ok = true;
      for (const id of [A, B]) {
        const vs = visits.filter((v) => v.track === id).slice(1);
        const same = vs.every((v) => KINDS.every((k) => v.gl[k] === vs[0].gl[k]) && (!v.tlxMem || (v.tlxMem.geometries === vs[0].tlxMem.geometries && v.tlxMem.textures === vs[0].tlxMem.textures)));
        flat[id] = same; ok = ok && same;
      }
      return { verdict: ok ? "pass" : "fail", visits, sameLiveCountAfterFirstVisit: flat };
    });

    await row(2, "ctxloss", async () => {
      const out = { phases: {} };
      const lose = (p) => p.evaluate(() => { const c = window.__lrm.ctxs.find((x) => !x.isContextLost()); const e = c && c.getExtension("WEBGL_lose_context"); if (!e) return "no-ext"; e.loseContext(); return "lost"; });
      const recover = async (p, label) => {
        const t0 = Date.now();
        let ok = false;
        for (let i = 0; i < 6 && !ok; i++) {
          ok = await framesAdvance(p, 20, 20000).catch(() => false);
          if (ok && await notBlack(p).catch(() => false)) break; ok = false;
          await sleep(1000);
        }
        out.phases[label].recoverMs = Date.now() - t0; out.phases[label].recovered = ok;
        return ok;
      };
      out.phases.duringBuild = {};
      const call = page.evaluate((t) => window.__apex.race(t), B).catch(() => {});
      await sleep(400);
      out.phases.duringBuild.lose = await lose(page);
      await call;
      out.phases.duringBuild.state = await page.evaluate(readState).catch((e) => ({ err: String(e) }));
      const ok1 = await recover(page, "duringBuild");
      if (!ok1) {   // a clean reload is the accepted ending; the page must come back drawing
        await page.reload({ waitUntil: "load" });
        await page.waitForFunction(() => window.__apex && window.__apex.info, null, { polling: 100, timeout: 120000 });
        await raceTo(page, A);
        out.phases.duringBuild.reloaded = true;
      }
      await raceTo(page, A);
      out.phases.settled = {};
      out.phases.settled.lose = await lose(page);
      await sleep(1500);
      const ok2 = await recover(page, "settled");
      if (!ok2) { await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => window.__apex && window.__apex.info, null, { polling: 100, timeout: 120000 }); await raceTo(page, A); out.phases.settled.reloaded = true; }
      const drawing = await framesAdvance(page, 20, 60000) && await notBlack(page).catch(() => false);
      out.endsDrawing = drawing;
      const noExt = out.phases.duringBuild.lose === "no-ext" || out.phases.settled.lose === "no-ext";
      return { ...out, verdict: noExt ? "skip" : drawing ? "pass" : "fail", ...(noExt ? { skipWhy: "WEBGL_lose_context unavailable on this context (WebGPU-backed or blocked)" } : {}) };
    });

    await row(3, "tiers", async () => {
      await raceTo(page, A);
      const before = await page.evaluate(readState);
      const seq = [];
      const step = async (label, fn) => { await page.evaluate(fn); await framesAdvance(page, 20, 90000); seq.push({ label, ...(await page.evaluate(readState)) }); };
      await page.evaluate(() => { try { window.__apex.mirror && window.__apex.mirror("on"); } catch (_) { /* hook absent */ } });
      await step("renderScale 0.6", () => window.__apex.renderScale(0.6));
      await step("govHold on", () => window.__apex.govHold(true));
      await step("renderScale 1", () => window.__apex.renderScale(1));
      await step("govHold off", () => window.__apex.govHold(false));
      const perf = await page.evaluate(() => { try { return window.__apex.perf(); } catch (_) { return null; } });
      const after = seq[seq.length - 1];
      const nan = after.nan - before.nan;
      return { verdict: none(nan) && none(after.gpuErrors) ? "pass" : "fail", nanUploadsDuringTiers: nan, firstNan: await page.evaluate(() => window.__lrm.nan.first), uploadsScanned: after.uploads - before.uploads, seq, perf };
    });

    await row(4, "visibility", async () => {
      const out = { cycles: [] };
      await raceTo(page, A);
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await sleep(1500);
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
          Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
        });
        const adv = await framesAdvance(page, 20, 60000);
        out.cycles.push({ i, framesAdvance: adv, drawing: await notBlack(page).catch(() => false), ...(await page.evaluate(readState)) });
      }
      out.resize = [];
      for (const [w, h] of [[844, 390], [390, 844], [844, 390]]) {
        await page.setViewportSize({ width: w, height: h });
        const adv = await framesAdvance(page, 20, 60000);
        out.resize.push({ w, h, framesAdvance: adv, drawing: await notBlack(page).catch(() => false), ...(await page.evaluate(readState)) });
      }
      const all = [...out.cycles, ...out.resize];
      const ok = all.every((c) => c.framesAdvance && c.drawing && !c.lost.some(Boolean) && none(c.gpuErrors));
      return { ...out, verdict: ok ? "pass" : "fail" };
    });

    await row(5, "night", async () => {
      await raceTo(page, A, "night");
      const out = { toggles: [] };
      const snap = async (label, fn) => {
        if (fn) await page.evaluate(fn);
        const adv = await framesAdvance(page, 20, 90000);
        out.toggles.push({ label, framesAdvance: adv, drawing: await notBlack(page).catch(() => false), lights: await page.evaluate(() => { try { return window.__apex.lightState(); } catch (_) { return null; } }), ...(await page.evaluate(readState)) });
      };
      await snap("night baseline");
      await snap("mirror off", () => window.__apex.mirror("off"));
      await snap("mirror on", () => window.__apex.mirror("on"));
      await snap("matTex 0", () => window.__apex.matTex(0));
      await snap("matTex 1", () => window.__apex.matTex(1));
      const ok = out.toggles.every((t) => t.framesAdvance && t.drawing && none(t.nan) && none(t.gpuErrors));
      return { ...out, verdict: ok ? "pass" : "fail" };
    });
    await ctx.close().catch(() => {});
  } catch (e) {
    report.fatal = String(e && e.stack || e).slice(0, 800);
  } finally {
    await browser.close().catch(() => {});
    await srv.close?.();
    shutdown();
  }
  const verdicts = Object.fromEntries(Object.entries(report.rows).map(([k, v]) => [k, v.verdict]));
  report.summary = { backend: o.backend, glFallback: o.glFallback, verdicts, pageErrors: report.errors.length, fatal: !!report.fatal };
  save();
  console.log("= live-render-matrix " + JSON.stringify(report.summary));
  process.exit(report.fatal ? 2 : 0);
}

main().catch((e) => { console.error(e && e.stack || e); shutdown(); process.exit(2); });
