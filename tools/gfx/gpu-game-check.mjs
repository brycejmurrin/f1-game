#!/usr/bin/env node
// @doc Portable sibling of gfx-probe (no Lavapipe, no Linux paths): boots the game on the runner's real GPU and dumps errors.
/* gpu-game-check.mjs — run the ACTUAL GAME on whatever GPU this machine has,
 * and report the renderer's own verdict.
 *
 * The portable sibling of spike/backends/tools/gfx-probe.mjs. gfx-probe is tuned for this
 * container (Lavapipe ICD, soft-present blit, Linux paths); this one assumes
 * nothing but Playwright and a static server, so it runs on a GitHub macOS or
 * Windows image where a real adapter may exist. It answers the question the
 * software container cannot: with a hardware GPU, does the three.js/WebGPU path
 * boot, present, and reach zero uncaptured Dawn errors?
 *
 * It reads the SAME hooks the ?gfxdebug=1 overlay prints, so a CI answer and a
 * player's copy-pasted answer are directly comparable.
 *
 * Run: node tools/gfx/gpu-game-check.mjs [track] [--json out.json] [--shot out.png]
 *      [--backend three|webgpu] [--path webgpu|webgl2] [--boot-timeout MS]
 *      [--ls apex26.key=value ...]
 *
 * It checkpoints the --json file after every phase, so a step timeout leaves a
 * diagnosis on disk rather than nothing at all.
 */
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, NOT `new URL(..).pathname`. On Windows that pathname is
// `/D:/a/f1-game/f1-game/` and resolve() prefixes the cwd's drive, giving a
// path that cannot exist — the server then 404s every file, the game never
// boots, and the boot wait below burns its whole timeout saying nothing.
// That is exactly what happened on windows-latest; docs/PERF-FINDINGS.md 2f.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
  // A server rooted at the wrong directory answers 404 to everything, which is
  // INDISTINGUISHABLE from a slow boot: both are silence until a timeout. Fail
  // here, in milliseconds, naming the path — the Windows outage cost two
  // sessions and ~30 min of runner time precisely because it did not.
  if (!existsSync(join(ROOT, "index.html"))) {
    throw new Error(`gpu-game-check: no index.html under ROOT ${ROOT} — the ` +
      `server would 404 every request and the boot wait would time out saying nothing`);
  }
  return new Promise((res, rej) => {
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
    // Without this a bind failure is an unhandled 'error' event: the process
    // dies before any JSON is written and the gate reports "produced nothing".
    s.once("error", rej);
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
// ABOVE the try, deliberately. This was `const console_ = []` INSIDE the try
// while the finally below reads it — sibling scopes, so the finally threw
// `ReferenceError: console_ is not defined` on EVERY run, success or failure.
// Everything after that line was dead: out.console (the diagnostic lines a
// previous round moved into the finally precisely so a FAILING run would keep
// them), out.root (added to name the Windows path bug — never once set on a
// real run), the bounded browser/server teardown, and the final process.exit,
// so the tool always exited non-zero even when ok:true. `continue-on-error:
// true` on all four census steps swallowed it, and checkpoint() had already
// written the JSON, so nothing ever looked wrong. docs/PERF-FINDINGS.md 2l.
const console_ = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
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
      // GLX drains gl.getError() only for the first presents unless this is
      // set: the census is the consumer of the per-present drain (2e).
      localStorage.setItem("apex26.glErrDrain", "1");
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
  // 120 s. This was once raised to 300 s on the theory that windows-latest was
  // "a software rasteriser that is ALSO a slow disk" — it was not. ROOT was
  // computed with a Windows-broken idiom, so the server 404'd index.html and
  // the page could never boot at ANY timeout; the raise turned a 2-minute
  // failure into a 5-minute one and taught nothing. Widening a tolerance to
  // make something pass is forbidden outright (AGENTS.md); this is the revert.
  await page.waitForFunction(() => window.__apex != null, null,
    { polling: 100, timeout: Number(flag("--boot-timeout", 120000)) });
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
    // WGX only: softPresent() is exported by the native WebGPU backend, so its
    // presence says WGX bound (not a GLX fallback) and its value says whether
    // the frame reaches #game through the swapchain or the CPU blit.
    r.wgx = typeof g.softPresent === "function";
    if (r.wgx) { try { r.wgxSoftPresent = !!g.softPresent(); } catch (e) { r.wgxSoftPresentError = String(e && e.message); } }
    // WGX classifies a HeadlessChrome UA as software on purpose (the swapchain
    // was measured never to composite there), so on a headless runner a
    // hardware adapter still soft-presents; the Verdict needs to tell that
    // expected case from a real regression.
    try { r.headlessUa = /HeadlessChrome/i.test(navigator.userAgent); } catch (_) { /* no navigator */ }
    if (g.__tlx) {
      try { r.backendState = g.__tlx.backendState(); } catch (e) { r.backendStateError = String(e && e.message); }
      try { r.envState = g.__tlx.envState(); } catch (_) { /* pre-probe */ }
      try { r.envFailStack = g.__tlx.envFailStack ? g.__tlx.envFailStack() : null; } catch (_) { /* older build */ }
      try { r.skyState = g.__tlx.skyState(); } catch (_) { /* no sky yet */ }
    }
    // THE GOVERNOR, because envReady alone cannot say why a probe is cold.
    // PerfGov rung 1 is "env probe off" and game.js gates the producer on
    // `PerfGov.tier() < 1`, so a leg reporting envReady=false, envFail=0,
    // gaveUp=false has two indistinguishable explanations: the probe ran out
    // of frames, or the tier gate meant it was never ASKED. envState().face
    // (consecutive baked faces) separates those — face > 0 is progress, face
    // === 0 after parked frames is the gate — and only the tier says which
    // rung closed it. Recording neither is what left the 30 % luma gap between
    // three's two backends an open lead after run 25 (docs/PERF-FINDINGS.md 2t).
    try { const a = window.__apex; if (a && a.renderScale) r.gov = a.renderScale(); } catch (e) { r.govError = String(e && e.message); }
    try { r.engine = document.getElementById("game").getAttribute("data-engine"); } catch (_) { /* no canvas */ }
    return r;
  }), 20000, "gfx");
  // bounded() turns ANY failure into a value, so a gfx read that threw or timed
  // out still left phase "done" and ok true while every reported field came out
  // undefined — indistinguishable from a backend that simply has nothing to
  // say. That is what made the Windows webgpu leg unreadable. Name it.
  if (out.gfx && out.gfx.error) out.gfxReadFailed = "read failed: " + out.gfx.error;
  else if (out.gfx && out.gfx.glx === false) out.gfxReadFailed = "GLX was undefined in the page";
  if (out.overlay && out.overlay.error) out.overlayReadFailed = "read failed: " + out.overlay.error;
  checkpoint("gfx-read");
  const shot = flag("--shot", null);
  if (shot) {
    const r = await bounded(() => page.screenshot({ path: shot, fullPage: false }), 30000, "screenshot");
    out.shot = (r && r.error) ? null : shot;
    if (r && r.error) out.shotError = r.error;
  }
  // APPEARANCE. gpu-census.yml has always printed `meanLuma=${frame.meanLuma}`
  // and this tool never once wrote out.frame — the word "frame" did not appear
  // in this file — so that column read "n/a" on every leg, every image, every
  // run since it was added. The gate deliberately does not BLOCK on appearance
  // (a brightness floor is the kind of threshold that goes flaky and then gets
  // widened, which AGENTS.md forbids), but "reported for a human" was not true
  // either: there was nothing to report. docs/PERF-FINDINGS.md 2l.
  //
  // Read it from the SCREENSHOT, not from the page. The in-page reads used
  // elsewhere do not generalise: gfx-probe's getContext("2d") works only where
  // WGX/TLX route through the soft-present blit, GLX.capturePixels does not
  // exist on GLX at all, and drawImage of a WebGL canvas reads solid black
  // outside the frame (measured, PERF-FINDINGS 2d). A composited screenshot is
  // the one source that works for every backend on every image.
  if (out.shot) {
    try {
      const sharp = (await import("sharp")).default;
      const { data, info } = await sharp(out.shot).raw().toBuffer({ resolveWithObject: true });
      let sum = 0, max = 0, n = 0;
      for (let i = 0; i + 2 < data.length; i += info.channels) {
        const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
        sum += l; if (l > max) max = l; n++;
      }
      out.frame = n
        ? { meanLuma: +(sum / n).toFixed(1), maxLuma: max, w: info.width, h: info.height }
        : null;
      if (!n) out.frameReadFailed = "screenshot decoded to zero pixels";
    } catch (e) {
      // Named, never silent — a tool that cannot measure appearance must say so
      // rather than leave the same empty column it left for months.
      out.frameReadFailed = "luma read failed: " + String((e && e.message) || e).slice(0, 160);
    }
  } else {
    out.frameReadFailed = shot ? "screenshot failed, so there is nothing to measure" : "no --shot requested";
  }
  out.ok = true;
  checkpoint("done");
} catch (e) {
  out.ok = false;
  out.error = String((e && e.message) || e);
  checkpoint("failed");
} finally {
  // In the finally, not the success path: a run that FAILED is the one whose
  // console lines decide the diagnosis, and assigning this at the end of try
  // meant every failure threw them away.
  out.console = console_.filter((l) => /error|warn|refus|fail|WGX|TLX/i.test(l)).slice(0, 40);
  out.root = ROOT;
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
