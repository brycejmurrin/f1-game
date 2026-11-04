#!/usr/bin/env node
// res-scale-census.mjs — render-target reallocations across a render-scale sweep (#2655).
// @doc Counts TLX post-target reallocations, live textures and the step's own cost over a setRenderScale sweep.
// @skill renderer-debug
//
// The governor's header (js/perf/governor.js) holds, backs off and caps because
// every scale step re-creates the HDR/bloom/SSAO/godray targets. This prints the
// EXACT count (tlx-post.js state().rtResizes) and renderer.info.memory.textures
// per step, so "one allocation, then uniform steps" is a number, not a feel. It
// never reports a frame rate (valid on this software-GL box; PERF-FINDINGS §0).
//
//   node tools/gfx/res-scale-census.mjs [--track monza] [--scales 1,0.9,0.8,0.7,0.6,0.5,0.7,1]
//        [--settle 8] [--json PATH] [--ls key=value ...]
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } from "../lib/harness.mjs";
import { censusInitScript, waitFrames } from "../lib/mem-census.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function parseArgs(argv) {
  const o = { track: "monza", scales: [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.7, 1], settle: 4, json: null, ls: {}, webgpu: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--track") o.track = next();
    else if (a === "--scales") o.scales = next().split(",").map(Number).filter((v) => v >= 0.5 && v <= 1);
    else if (a === "--settle") o.settle = Math.max(1, +next() | 0);
    else if (a === "--json") o.json = next();
    else if (a === "--webgpu") o.webgpu = true;   // three's WebGPU backend on Mesa lavapipe
    else if (a === "--ls") { const [k, v] = next().split("="); o.ls[k] = v; }
    else if (a === "-h" || a === "--help") {
      console.log("usage: node tools/gfx/res-scale-census.mjs [--track id] [--scales a,b,c] [--settle frames] [--json PATH] [--ls key=value] [--webgpu]");
      process.exit(0);
    } else throw new Error("unknown argument " + a);
  }
  return o;
}

/** The settle gate (#4783): every step reaches its size within 2 presented frames and the texture count returns to the start. */
export function verdict(sm) {
  const fails = [];
  if (sm.aborted) fails.push("sweep aborted (page navigated/crashed mid-step)");
  if (sm.warmTimedOut || sm.framesOk === false) fails.push("never presenting (warm " + (sm.warmTimedOut ? "timed out" : "done") + ", frames " + (sm.framesOk === false ? "stalled" : "ok") + ")");
  if (!sm.fixedTargets && sm.unsettledSteps) fails.push(`${sm.unsettledSteps} step(s) never reached the scaled post-target size`);
  if (!sm.fixedTargets && sm.maxSettleFrames > 2) fails.push(`settle took ${sm.maxSettleFrames} presented frames (> 2)`);
  if (sm.texturesEnd !== sm.texturesStart) fails.push(`textures ${sm.texturesStart} -> ${sm.texturesEnd} after the sweep`);
  return fails.length ? "FAIL: " + fails.join("; ") : "ok";
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium(o.webgpu ? { args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], env: { ...process.env, ...WEBGPU_LAVAPE_ENV } } : { args: ["--use-angle=swiftshader", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  const rows = [], errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(({ ls, webgpu }) => {
      window.__TEST_MODE = true;
      try {
        localStorage.setItem("apex26.gfxBackend", "three");
        localStorage.setItem("apex26.tlxForceGL", webgpu ? "0" : "1");
        localStorage.setItem("apex26.tyreWear", JSON.stringify("off"));
        // Slow-CI cap raise, as pass-census sets it: lavapipe's pipeline warm outlasts the default boot step, and the
        // resulting present failure reloads the page (run 41880521034).
        if (webgpu) localStorage.setItem("apex26.gfxBootStepMs", "45000");
        // SCREENSHOTS = NATIVE, as pass-census sets it: without it a headless software adapter takes tlx.js's soft-blit
        // present (GPU readback every frame). Run 7 (d287a735) still hit `present failed — null BYTES_PER_ELEMENT`
        // with boot cap, go() and grid parity; this is the last storage difference between the two censuses (#4783).
        if (webgpu) sessionStorage.setItem("apex26.wgxCapture", "0");
        for (const k of Object.keys(ls)) localStorage.setItem(k.startsWith("apex26.") ? k : "apex26." + k, ls[k]);
      } catch (_) { /* no storage: defaults */ }
    }, { ls: o.ls, webgpu: o.webgpu });
    await ctx.addInitScript(censusInitScript);
    await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    // A step that reloads or crashes the page is a finding (#4783), not noise: say when and what the page logged.
    let stepNow = "boot";
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.error(`res-scale-census: main frame navigated during ${stepNow}: ${f.url()}`); });
    page.on("crash", () => console.error(`res-scale-census: page crashed during ${stepNow}`));
    let logged = 0;
    page.on("console", (m) => { if (logged < 80 && /error|warn|lost|reload|sentinel|strike|crash|context/i.test(m.type() + " " + m.text())) { logged++; console.error(`  [page ${m.type()} @${stepNow}] ${m.text().slice(0, 300)}`); } });
    page.on("close", () => console.error(`res-scale-census: page closed during ${stepNow}`));
    page.on("framedetached", (f) => console.error(`res-scale-census: frame detached during ${stepNow}: ${f.url()}`));
    page.on("requestfailed", (r) => console.error(`  [requestfailed @${stepNow}] ${r.url().slice(0, 120)} ${r.failure() && r.failure().errorText}`));
    browser.on("disconnected", () => console.error(`res-scale-census: browser disconnected during ${stepNow}`));
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1", { waitUntil: "load" });
    await page.waitForFunction(() => window.__apex && window.__apex.info && typeof Tracks !== "undefined", null, { polling: 100, timeout: 120000 });
    await page.evaluate((id) => { window.__apex.race(id); }, o.track);
    await page.waitForFunction((id) => { try { const i = window.__apex.info(); return i.track === id && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, o.track, { polling: 100, timeout: 240000 });
    // pass-census parity: start the race and leave the grid (jump to 10%). Run 41882017262: on the grid, WebGPU present
    // failed (null vertex attribute, "color" not found) and the page reloaded; pass-census never sits on the grid.
    if (o.webgpu) await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); });
    // Hold the governor's tier: a scale sweep needs the same feature ladder at every step, and run 8 (a45f687f, with
    // wgxCapture parity) still failed ~40 s into the race. pass-census finishes in ~20 s, so a tier shed by the governor
    // on slow lavapipe is the remaining candidate: it rebuilds pipelines for car-shadow geometry whose CPU arrays
    // sweepCarShadowMirrors already freed (three reads attribute.array in getVertexBufferLayout). Tier moves are logged.
    if (o.webgpu) {
      const g = await page.evaluate(() => {
        const A = window.__apex, h = A.govHold(true);
        let last = h.tier;
        setInterval(() => { const t = A.govHold().tier; if (t !== last) { console.warn("res-scale-census tier " + last + " -> " + t); last = t; } }, 250);
        return h;
      });
      console.error("res-scale-census: governor held " + JSON.stringify(g));
    }
    await waitFrames(page, 8, 400000);
    stepNow = "pre-sweep";
    // Presented frames, not rAF ticks: on lavapipe a pipeline warm holds present() and applyResize() (tlx.js
    // `if (_warmPending) return`), so a renderScale() step issued then is dropped until the warm ends (#4783).
    // A frame is one top-level render (no render target); three's info.render.frame is not trusted to advance.
    let base = null, prev = null, api = "?", warmTimedOut = false, framesOk = true;
    try {
    await page.evaluate(() => {
      const r = window.GLX.__tlx.renderer;
      if (r.__resWrap) return;
      r.__resWrap = true; window.__resFrames = 0;
      const orig = r.render.bind(r);
      r.render = function () { if (!r.getRenderTarget()) window.__resFrames++; return orig.apply(this, arguments); };
    });
    const presented = (n, ms = 240000) => page.evaluate(([k, t]) => new Promise((res) => {
      const f0 = window.__resFrames, t0 = performance.now();
      const id = setInterval(() => { const done = window.__resFrames >= f0 + k; if (done || performance.now() - t0 > t) { clearInterval(id); res(done); } }, 100);
    }), [n, ms]);
    // Soft: a warm that never ends is reported (warmTimedOut), not a hang.
    const warmed = () => page.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      const id = setInterval(() => { const w = !!(window.GLX.warming && window.GLX.warming()); if (!w || performance.now() - t0 > 150000) { clearInterval(id); res(!w); } }, 200);
    }));
    const read = () => page.evaluate(() => {
      const t = window.GLX && window.GLX.__tlx;
      const ps = t && t.postState ? t.postState() : null;
      const inf = t && t.renderer && t.renderer.info && t.renderer.info.memory;
      const cv = t && t.renderer && t.renderer.domElement;
      return { rtResizes: ps ? ps.rtResizes : null, targets: ps ? ps.targets : null, textures: inf ? inf.textures : null,
        frame: window.__resFrames, warming: !!(window.GLX.warming && window.GLX.warming()),
        canvas: cv ? [cv.width, cv.height] : null, fixed: !!(ps && ps.fixed) };
    });
    api = await page.evaluate(() => { const b = window.GLX && window.GLX.__tlx && window.GLX.__tlx.renderer && window.GLX.__tlx.renderer.backend; return b && b.isWebGPUBackend ? "webgpu" : "webgl2"; });
    if (o.webgpu && api !== "webgpu") throw new Error("--webgpu asked for the WebGPU backend but three fell back to " + api);
    warmTimedOut = !(await warmed());
    framesOk = await presented(5);   // sweep only once present() is running
    if (!framesOk) console.error("res-scale-census: no top-level render in 240s (warming=" + (await read()).warming + ")");
    base = await read();
    base.scaleBase = base.fixed ? base.targets : [base.canvas ? base.canvas[0] : base.targets[0], base.canvas ? base.canvas[1] : base.targets[1]];
    rows.push({ step: "start", scale: 1, ...base, dResizes: 0 });
    prev = base;
    for (const s of o.scales) {
      stepNow = "scale " + s;
      const ms = await page.evaluate((v) => { const t0 = performance.now(); window.__apex.renderScale(v); return +(performance.now() - t0).toFixed(2); }, s);
      // Settle in presented frames and count how many the post target needs to follow (issue gate: <= 2).
      const want = [Math.max(1, Math.round(prev.scaleBase[0] * s)), Math.max(1, Math.round(prev.scaleBase[1] * s))];
      let r = null, settledAfter = null;
      for (let k = 0; k <= Math.max(o.settle, 8) && settledAfter == null; k++) {
        await presented(1, 60000);
        r = await read();
        if (r.targets && r.targets[0] === want[0] && r.targets[1] === want[1]) settledAfter = k + 1;
      }
      r = { ...r, scaleBase: prev.scaleBase };
      rows.push({ step: "scale", scale: s, callMs: ms, ...r, want, settledAfter, dResizes: r.rtResizes - prev.rtResizes });
      prev = r;
    }
    } catch (e) { stepNow = "aborted"; rows.push({ step: "aborted", error: String(e).slice(0, 300), lastRow: rows[rows.length - 1] }); console.error("res-scale-census aborted at " + (rows[rows.length - 2] ? "scale " + rows[rows.length - 2].scale : "start") + ": " + e); process.exitCode = 1; }
    if (!base) base = prev = { rtResizes: 0, textures: null, targets: [0, 0], fixed: false };
    if (!rows.length) rows.push({ step: "start", ...base });
    const total = (prev.rtResizes || 0) - (base.rtResizes || 0);
    const summary = { track: o.track, backend: api, steps: o.scales.length, totalRtResizes: total, perStep: +(total / Math.max(1, o.scales.length)).toFixed(2),
      maxTextures: Math.max(...rows.map((r) => r.textures || 0)), pageErrors: errors.length,
      maxSettleFrames: Math.max(0, ...rows.map((r) => r.settledAfter || 0)), unsettledSteps: rows.filter((r) => r.step === "scale" && r.settledAfter == null).length,
      warmTimedOut, framesOk, texturesStart: rows[0].textures, texturesEnd: prev.textures, aborted: rows.some((r) => r.step === "aborted"), fixedTargets: base.fixed };
    summary.verdict = verdict(summary);
    for (const r of rows) console.log(JSON.stringify(r));
    console.log(JSON.stringify({ summary }));
    if (o.webgpu && summary.verdict !== "ok") { console.error("res-scale-census " + summary.verdict); process.exitCode = 1; }
    if (o.json) { mkdirSync(dirname(o.json), { recursive: true }); writeFileSync(o.json, JSON.stringify({ rows, summary }, null, 2)); }
  } finally {
    await browser.close().catch(() => {});
    await srv.close().catch(() => {});
    shutdown();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
