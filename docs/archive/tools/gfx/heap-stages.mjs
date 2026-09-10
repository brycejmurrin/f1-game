#!/usr/bin/env node
// heap-stages.mjs — WHERE does the TLX/GLX heap gap come from?
// @doc Stages the TLX/GLX JS-heap gap boot / track-built / settled, asserting which backend actually bound.
//
// A single settled number ("TLX is ~48 MB heavier") names no owner. This splits
// the boot into three stages and measures each, so the gap can be attributed to
// the stage that opens it:
//
//   boot     __apex is ready, no track built  — module/vendor cost only
//   track    race(<track>) resolved           — scene + geometry construction
//   settled  driven for a fixed WALL TIME        — per-frame allocation that sticks
//
//   node docs/archive/tools/gfx/heap-stages.mjs [track] [--seconds N] [--json]
//
// Equal wall time, not equal frames: the legs do not run at the same rate
// (measured here — GLX managed 24 frames in the budget TLX ran 120 in), so a
// frame count makes the two legs soak for different durations and the
// settled figures stop being comparable.
//
// Heap is read through CDP (Runtime.getHeapUsage) after HeapProfiler
// .collectGarbage, NOT performance.memory: that one is deliberately coarsened
// and quantised in a way that hides differences this size.
//
// THE MEASUREMENT ONLY MEANS ANYTHING IF THE BACKEND TOOK. TLX is deferred and
// game.js falls back to GLX silently when it refuses to boot, which would show
// as "no gap" — the most misleading possible result. Every leg asserts
// info().gfx and aborts the run rather than reporting a comparison of GLX
// against itself.
import { chromium } from "playwright";
import { createServer } from "http";
import { existsSync, readFileSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const args = process.argv.slice(2);
let track = "montreal", seconds = 20, asJson = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--seconds") seconds = Math.max(5, +args[++i] || 20);
  else if (a === "--json") asJson = true;
  else if (!a.startsWith("--")) track = a;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function serve() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      try {
        let p = decodeURIComponent((req.url || "/").split("?")[0]);
        if (p === "/") p = "/index.html";
        const file = join(ROOT, p.replace(/^\//, ""));
        if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        const body = readFileSync(file);
        res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
        res.end(body);
      } catch (_) { res.writeHead(404); res.end("missing"); }
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

const MB = (b) => +(b / 1048576).toFixed(1);

async function heap(cdp) {
  // Three GC passes: one collect leaves the youngest generation's garbage in
  // place often enough to swing a stage by several MB between identical runs.
  for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return usedSize;
}

async function leg(browser, port, backend) {
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("Runtime.enable");

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((b) => {
    try { localStorage.setItem("apex26.gfxBackend", b); } catch (_) { /* blocked storage */ }
  }, backend);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__apex && typeof window.__apex.race === "function",
                             null, { timeout: 90000, polling: 100 });

  const boot = await heap(cdp);

  await page.evaluate(async (t) => { await window.__apex.race(t); }, track);
  await page.waitForFunction(() => window.__apex.info().track, null, { timeout: 120000, polling: 100 });

  // The backend is only knowable once a renderer exists — assert before spending
  // any more time, and BEFORE reporting a gap that a fallback would fake.
  // info() has NO gfx field — reading one returned null on both legs and the
  // assert below then read as "TLX did not boot". diag().env.backend is what
  // actually BOUND (sessionStorage apex26.gfxBound), which is the question;
  // localStorage apex26.gfxBackend is only the PICK and agrees even when the
  // bind fell back.
  const got = await page.evaluate(() => {
    const i = window.__apex.info();
    let backend = null, engine = null;
    try {
      const d = window.__apex.diag();
      backend = (d && d.env && d.env.backend) || null;
      engine = (d && d.backendState && d.backendState.engine) || null;
    } catch (_) { /* diag() is best-effort; a null backend fails the assert below */ }
    return { gfx: backend, engine, track: i.track || null };
  });
  const built = await heap(cdp);

  await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.18, 40); window.__apex.snapCam(); });
  // EVERY frame gets a deadline and the loop gets a budget. A bare
  // `await new Promise(r => requestAnimationFrame(r))` never resolves if rAF
  // stops being serviced, and on SwiftShader with a TLX track build that is not
  // hypothetical — it hung here for eight minutes with no output and had to be
  // killed, which is a measurement lost to the harness rather than to the game.
  // The frame count is REPORTED, not targeted — it is a rate observation.
  // GPU-SIDE SAMPLES, because the JS heap is the wrong number for a handset.
  // Runtime.getHeapUsage cannot see textures, buffers or pipelines, and iOS
  // jetsam counts exactly those (glx.js mobile-tier note). three tracks them in
  // renderer.info.memory/render, which TLX already surfaces on GLX.__tlx.memState().
  // Sampled ON A CLOCK through the soak: an end-to-end delta cannot tell a
  // filling working set from a slope, which is the distinction this whole file
  // exists for.
  const series = [];
  const sample = () => page.evaluate(() => {
    // The surface hangs off GLX, NOT window: `GLX.__tlx` (gfx-probe.mjs already
    // reaches it that way). Reading window.__tlx returns undefined on every
    // sample and the series prints a tidy column of nothing, which is a lie
    // that looks like data.
    const g = typeof GLX !== "undefined" ? GLX : null;
    const tl = (g && g.__tlx) || (typeof window !== "undefined" ? window.__tlx : null);
    const t = tl && tl.memState ? tl.memState() : null;
    // ABSENT is not the same as ZERO or as undefined-looking data. The GLX leg
    // has no __tlx at all, and printing its columns as `undefined` reads as a
    // measurement that failed rather than one that does not apply.
    const out = { t: Math.round(performance.now()), tlx: !!t };
    if (!t) return out;
    {
      // memState()'s shape is FLAT — rGeo/rTex/progs/calls, not info.memory.*.
      // backendData is three's WebGPU DataMap size: the per-object GPU state
      // the renderer retains, and the counter closest to what iOS jetsam
      // actually charges the tab for.
      out.mats = t.mats; out.pool = t.pool; out.geoKeys = t.geoKeys;
      out.rGeo = t.rGeo; out.rTex = t.rTex; out.progs = t.progs; out.calls = t.calls;
      // backendData is three's WebGPU DataMap size and it comes back UNDEFINED
      // here: memState guards on `b.data.size != null`, and the DataMap is a
      // WeakMap, which has no size. So the counter closest to GPU retention is
      // NOT available from this surface — do not read its absence as "flat".
      out.backendData = t.backendData === undefined ? null : t.backendData;
      if (t.mirror) out.sweeps = t.mirror.sweeps;
    }
    return out;
  }).catch(() => null);

  // Node-side clock, running CONCURRENTLY with the soak's evaluate below.
  const every = Math.max(5000, Math.round(seconds * 1000 / 8));
  series.push(await sample());
  const ticker = setInterval(() => { sample().then((r) => r && series.push(r)); }, every);

  const framesRun = await page.evaluate(async ({ budgetMs, frameMs }) => {
    const t0 = performance.now();
    let i = 0;
    for (;;) {
      if (performance.now() - t0 > budgetMs) break;
      i++;
      await new Promise((r) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; r(); } };
        requestAnimationFrame(done);
        setTimeout(done, frameMs);
      });
    }
    return i;
  }, { budgetMs: seconds * 1000, frameMs: 3000 });
  clearInterval(ticker);
  const settled = await heap(cdp);
  series.push(await sample());

  await page.close();
  return { backend, gfx: got.gfx, track: got.track, boot, built, settled, framesRun, series };
}

const { srv, port } = await serve();
// The container ships a chromium build the pinned Playwright does not name
// (1194 vs the 1228 it looks for), so the default resolve throws "Executable
// doesn't exist" and reads as a broken tool rather than a missing browser.
// Honour PW_CHROMIUM, else fall back to the unversioned /opt/pw-browsers path.
const PW_CHROMIUM = process.env.PW_CHROMIUM
  || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
const browser = await chromium.launch({
  headless: true,
  ...(PW_CHROMIUM ? { executablePath: PW_CHROMIUM } : {}),
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-features=Vulkan",
         "--use-gl=angle", "--enable-unsafe-swiftshader", "--no-sandbox"],
});

try {
  const glx = await leg(browser, port, "webgl2");
  const tlx = await leg(browser, port, "three");

  const bad = [];
  if (!/webgl2|glx/i.test(String(glx.gfx))) bad.push(`GLX leg BOUND ${glx.gfx} (expected webgl2)`);
  if (!/three|tlx/i.test(String(tlx.gfx)))  bad.push(`TLX leg BOUND ${tlx.gfx} (expected three) — TLX did not take, so any gap below is GLX vs GLX`);

  const rows = [["stage", "GLX MB", "TLX MB", "gap MB", "x"]];
  for (const k of ["boot", "built", "settled"]) {
    rows.push([k, MB(glx[k]), MB(tlx[k]), +(MB(tlx[k]) - MB(glx[k])).toFixed(1),
               +(tlx[k] / glx[k]).toFixed(2)]);
  }
  if (asJson) {
    console.log(JSON.stringify({ ok: !bad.length, track, seconds, glx, tlx, problems: bad }, null, 2));
  } else {
    console.log(`heap-stages: ${track}, ${seconds}s settle per leg, CDP getHeapUsage after 3x collectGarbage`);
    console.log(`  bound: GLX leg=${glx.gfx} (${glx.engine || "-"})  TLX leg=${tlx.gfx} (${tlx.engine || "-"})`);
    console.log(`  frames in ${seconds}s: GLX ${glx.framesRun}  TLX ${tlx.framesRun}`
                + `   (equal wall time, so a frame-rate difference is not a heap difference)`);
    for (const r of rows) {
      console.log("  " + String(r[0]).padEnd(9) + r.slice(1).map((c) => String(c).padStart(9)).join(""));
    }
    const d = (k) => MB(tlx[k]) - MB(glx[k]);
    console.log(`  stage opening the gap: boot ${d("boot").toFixed(1)} -> built `
                + `${d("built").toFixed(1)} -> settled ${d("settled").toFixed(1)} MB`);
    for (const b of bad) console.log("  !! " + b);
  }
  process.exit(bad.length ? 1 : 0);
} finally {
  await browser.close();
  srv.close();
}
