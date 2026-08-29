#!/usr/bin/env node
/* gpu-game-check.mjs — run the ACTUAL GAME on whatever GPU this machine has,
 * and report the renderer's own verdict.
 *
 * The portable sibling of tools/gfx-probe.mjs. gfx-probe is tuned for this
 * container (Lavapipe ICD, soft-present blit, Linux paths); this one assumes
 * nothing but Playwright and a static server, so it runs on a GitHub macOS or
 * Windows image where a real adapter may exist. It answers the question the
 * software container cannot: with a hardware GPU, does the three.js/WebGPU path
 * boot, present, and reach zero uncaptured Dawn errors?
 *
 * It reads the SAME hooks the ?gfxdebug=1 overlay prints, so a CI answer and a
 * player's copy-pasted answer are directly comparable.
 *
 * Run: node tools/gpu-game-check.mjs [track] [--json out.json] [--shot out.png]
 *      [--backend three|webgpu] [--path webgpu|webgl2] [--boot-timeout MS]
 *      [--ls apex26.key=value ...]
 *
 * It checkpoints the --json file after every phase, so a step timeout leaves a
 * diagnosis on disk rather than nothing at all.
 */
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".wasm": "application/wasm",
  ".ico": "image/x-icon", ".txt": "text/plain", ".map": "application/json",
};
const PINNED = ["/opt/pw-browsers/chromium", process.env.APEX_CHROMIUM].filter(Boolean)
  .find((p) => { try { return existsSync(p); } catch (_) { return false; } }) || null;

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const track = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--json"
  && argv[argv.indexOf(a) - 1] !== "--shot" && argv[argv.indexOf(a) - 1] !== "--backend"
  && argv[argv.indexOf(a) - 1] !== "--path") || "montreal";
const backend = flag("--backend", "three");
// --ls key=value (repeatable), same contract as gfx-probe: drive a knob the
// pins do not know about — apex26.tlxForceHw above all, which is how the
// real-GPU content path is reproduced on a software adapter.
const extraLs = argv.reduce((acc, a2, i) => (a2 === "--ls" && argv[i + 1] ? acc.concat(argv[i + 1]) : acc), []);
const path3 = flag("--path", "webgpu");

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rp) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      const f = join(ROOT, url === "/" ? "index.html" : url.replace(/^\/+/, ""));
      // Path containment: a static server that follows ../ out of the repo is a
      // hazard even in CI, and it costs one comparison to refuse.
      if (!f.startsWith(ROOT) || !existsSync(f)) { rp.writeHead(404); rp.end("nope"); return; }
      try {
        rp.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
        rp.end(readFileSync(f));
      } catch (_) { rp.writeHead(500); rp.end("err"); }
    });
    s.listen(0, "127.0.0.1", () => res({ server: s, port: s.address().port }));
  });
}

const jsonAt = flag("--json", null);
const t0 = Date.now();
// A killed step leaves NOTHING behind: no log (a job's log is a 404 until the
// job ends) and no artifact. So write the JSON after every phase — whatever
// phase the run reached is then on disk when the step timeout fires, and a
// hang becomes evidence instead of a blank. `phase` is the load-bearing field.
function checkpoint(phase, extra) {
  out.phase = phase;
  out.elapsedMs = Date.now() - t0;
  if (extra) Object.assign(out, extra);
  if (jsonAt) { try { writeFileSync(jsonAt, JSON.stringify(out, null, 2)); } catch (_) { /* disk */ } }
  console.log(`[game-check] ${phase} +${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
const log = (m) => console.log(`[game-check] ${m}`);
const out = { platform: process.platform, arch: process.arch, track, backend, path: path3 };
const { server, port } = await serve();
const browser = await chromium.launch({
  ...(PINNED ? { executablePath: PINNED } : { channel: "chromium" }),
  args: ["--enable-unsafe-webgpu", ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
});
checkpoint("browser-launched");
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const console_ = [];
  page.on("console", (m) => { if (console_.length < 200) console_.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  page.on("pageerror", (e) => console_.push("pageerror: " + String(e && e.message).slice(0, 300)));
  // A renderer crash makes every later page.evaluate hang FOREVER rather than
  // throw — which is how two macOS runs burned 20 minutes each and reported
  // nothing but "timed out". Playwright emits this; nobody was listening.
  page.on("crash", () => { out.crashed = true; checkpoint("renderer-crashed"); });
  page.on("close", () => { out.pageClosed = true; });
  browser.on("disconnected", () => { out.browserGone = true; });
  await page.addInitScript(([be, p, ls]) => {
    try {
      localStorage.setItem("apex26.gfxBackend", be);
      if (be === "three") localStorage.setItem("apex26.tlxForceGL", p === "webgl2" ? "1" : "0");
      localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
    } catch (_) { /* blocked storage: the defaults still boot */ }
    for (const kv of ls || []) {
      const i = kv.indexOf("=");
      if (i > 0) { try { localStorage.setItem(kv.slice(0, i), kv.slice(i + 1)); } catch (_) { /* blocked */ } }
    }
  }, [backend, path3, extraLs]);

  // Bounded: a wedged renderer must not turn the diagnosis into another blank.
  const bounded = (fn, ms, label) => Promise.race([
    fn(),
    new Promise((_, rj) => setTimeout(() => rj(new Error(label + " timeout")), ms)),
  ]).catch((err) => ({ error: String((err && err.message) || err).slice(0, 120) }));

  await page.goto(`http://127.0.0.1:${port}/index.html?gfxdebug=1`,
    { waitUntil: "domcontentloaded", timeout: 120000 });
  checkpoint("navigated");
  // 120 s is not enough on a software rasteriser that is ALSO a slow disk:
  // windows-latest (WARP + "Microsoft Basic Render Driver") timed out here on
  // both backends while ubuntu booted the same tree in 3 s. A boot timeout on
  // an image with no GPU says nothing about the renderer, so give it room.
  await page.waitForFunction(() => window.__apex != null, null,
    { polling: 100, timeout: Number(flag("--boot-timeout", 300000)) });
  checkpoint("booted");
  out.adapter = await page.evaluate(async () => {
    if (!navigator.gpu) return { hasGpu: false };
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      const i = (a && a.info) || {};
      return { hasGpu: true, vendor: i.vendor, architecture: i.architecture, description: i.description };
    } catch (e) { return { hasGpu: true, error: String((e && e.message) || e) }; }
  });

  // race() and park() were the last unbounded evaluates. A renderer that
  // wedges DURING the track load hangs them forever, and then the beats below
  // — the whole diagnosis — never run at all.
  out.raceCall = await bounded(() => page.evaluate((t) => window.__apex.race(t), track), 60000, "race");
  checkpoint("race-called");
  // 300 s was a guess made against a software rasteriser; on a real GPU the
  // load is seconds, so a long wait here only delays the beats that carry the
  // answer. Fail fast and let the beat trace speak.
  out.trackReady = await bounded(
    () => page.waitForFunction(() => window.__apex.info().track != null, null,
      { polling: 100, timeout: 120000 }), 130000, "track-ready");
  checkpoint("track-ready");
  out.parkCall = await bounded(() => page.evaluate(() => window.__apex.park(0.1)), 60000, "park");
  checkpoint("racing", { track });
  // Poll instead of one blind sleep. The question after park() is whether the
  // page is STILL ANSWERING, and a single waitForTimeout cannot tell a healthy
  // wait from a wedged renderer — on Apple Metal both three paths went silent
  // here and the run learned nothing for twenty minutes. Each poll carries its
  // own short timeout, so the last successful beat is recorded either way.
  out.beats = [];
  for (let i = 0; i < 15; i++) {
    if (out.crashed || out.browserGone) break;
    try {
      const beat = await Promise.race([
        page.evaluate(() => ({
          t: (window.__apex && window.__apex.info && window.__apex.info().track) || null,
          f: (window.__apex && window.__apex.info && Math.round(window.__apex.info().fps || 0)) || 0,
        })),
        new Promise((_, rj) => setTimeout(() => rj(new Error("beat timeout")), 8000)),
      ]);
      out.beats.push({ s: +((Date.now() - t0) / 1000).toFixed(1), ...beat });
    } catch (e) {
      out.beats.push({ s: +((Date.now() - t0) / 1000).toFixed(1), dead: String((e && e.message) || e).slice(0, 80) });
      checkpoint("page-stopped-answering");
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  checkpoint("settled");

  out.overlay = await bounded(() => page.evaluate(() => {
    const el = document.getElementById("gfx-debug");
    return el ? el.innerText : null;
  }), 20000, "overlay");
  out.gfx = await bounded(() => page.evaluate(() => {
    const g = typeof GLX !== "undefined" ? GLX : null;
    if (!g) return { glx: false };
    const r = { glx: true, gpuErrors: g.gpuErrors ? g.gpuErrors() : null,
      gpuFirstError: g.gpuFirstError ? g.gpuFirstError() : null };
    if (g.__tlx) {
      try { r.backendState = g.__tlx.backendState(); } catch (e) { r.backendStateError = String(e && e.message); }
      try { r.envState = g.__tlx.envState(); } catch (_) { /* pre-probe */ }
      try { r.envFailStack = g.__tlx.envFailStack ? g.__tlx.envFailStack() : null; } catch (_) { /* older build */ }
      try { r.skyState = g.__tlx.skyState(); } catch (_) { /* no sky yet */ }
    }
    try { r.engine = document.getElementById("game").getAttribute("data-engine"); } catch (_) { /* no canvas */ }
    return r;
  }), 20000, "gfx");
  checkpoint("gfx-read");
  const shot = flag("--shot", null);
  if (shot) {
    const r = await bounded(() => page.screenshot({ path: shot, fullPage: false }), 30000, "screenshot");
    out.shot = (r && r.error) ? null : shot;
    if (r && r.error) out.shotError = r.error;
  }
  out.console = console_.filter((l) => /error|warn|refus|fail|WGX|TLX/i.test(l)).slice(0, 40);
  out.ok = true;
  checkpoint("done");
} catch (e) {
  out.ok = false;
  out.error = String((e && e.message) || e);
  checkpoint("failed");
} finally {
  // browser.close() HANGS after a WebGPU/Metal session: run 4's WebGPU check
  // reached phase "done" at +42.4s and the step was then killed at 20 minutes
  // with the process still in this line. A teardown hang must not masquerade
  // as a renderer hang — bound it and let the reported phases stand.
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((r) => setTimeout(() => { out.closeHung = true; r(); }, 20000)),
  ]);
  server.close();
}
console.log(JSON.stringify(out, null, 2));
if (jsonAt) writeFileSync(jsonAt, JSON.stringify(out, null, 2));
// A lingering GPU-process handle keeps node alive after close() gives up, so
// exit explicitly rather than waiting on the event loop.
process.exit(out.ok ? 0 : 1);
