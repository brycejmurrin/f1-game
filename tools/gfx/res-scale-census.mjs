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
import { startStaticServer, launchChromium, shutdown } from "../lib/harness.mjs";
import { censusInitScript, waitFrames } from "../lib/mem-census.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const o = { track: "monza", scales: [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.7, 1], settle: 4, json: null, ls: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--track") o.track = next();
    else if (a === "--scales") o.scales = next().split(",").map(Number).filter((v) => v >= 0.5 && v <= 1);
    else if (a === "--settle") o.settle = Math.max(1, +next() | 0);
    else if (a === "--json") o.json = next();
    else if (a === "--ls") { const [k, v] = next().split("="); o.ls[k] = v; }
    else if (a === "-h" || a === "--help") {
      console.log("usage: node tools/gfx/res-scale-census.mjs [--track id] [--scales a,b,c] [--settle frames] [--json PATH] [--ls key=value]");
      process.exit(0);
    } else throw new Error("unknown argument " + a);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  const rows = [], errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript((ls) => {
      window.__TEST_MODE = true;
      try {
        localStorage.setItem("apex26.gfxBackend", "three");
        localStorage.setItem("apex26.tlxForceGL", "1");
        localStorage.setItem("apex26.tyreWear", JSON.stringify("off"));
        for (const k of Object.keys(ls)) localStorage.setItem(k.startsWith("apex26.") ? k : "apex26." + k, ls[k]);
      } catch (_) { /* no storage: defaults */ }
    }, o.ls);
    await ctx.addInitScript(censusInitScript);
    await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1", { waitUntil: "load" });
    await page.waitForFunction(() => window.__apex && window.__apex.info && typeof Tracks !== "undefined", null, { polling: 100, timeout: 120000 });
    await page.evaluate((id) => { window.__apex.race(id); }, o.track);
    await page.waitForFunction((id) => { try { const i = window.__apex.info(); return i.track === id && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, o.track, { polling: 100, timeout: 240000 });
    await waitFrames(page, 8, 400000);
    const read = () => page.evaluate(() => {
      const t = window.GLX && window.GLX.__tlx;
      const ps = t && t.postState ? t.postState() : null;
      const inf = t && t.renderer && t.renderer.info && t.renderer.info.memory;
      return { rtResizes: ps ? ps.rtResizes : null, targets: ps ? ps.targets : null, textures: inf ? inf.textures : null };
    });
    const base = await read();
    rows.push({ step: "start", scale: 1, ...base, dResizes: 0 });
    let prev = base;
    for (const s of o.scales) {
      const ms = await page.evaluate((v) => { const t0 = performance.now(); window.__apex.renderScale(v); return +(performance.now() - t0).toFixed(2); }, s);
      await waitFrames(page, o.settle, 400000);
      const r = await read();
      rows.push({ step: "scale", scale: s, callMs: ms, ...r, dResizes: r.rtResizes - prev.rtResizes });
      prev = r;
    }
    const total = prev.rtResizes - base.rtResizes;
    const summary = { track: o.track, steps: o.scales.length, totalRtResizes: total, perStep: +(total / Math.max(1, o.scales.length)).toFixed(2),
      maxTextures: Math.max(...rows.map((r) => r.textures || 0)), pageErrors: errors.length };
    for (const r of rows) console.log(JSON.stringify(r));
    console.log(JSON.stringify({ summary }));
    if (o.json) { mkdirSync(dirname(o.json), { recursive: true }); writeFileSync(o.json, JSON.stringify({ rows, summary }, null, 2)); }
  } finally {
    await browser.close().catch(() => {});
    await srv.close().catch(() => {});
    shutdown();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
