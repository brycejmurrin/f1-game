#!/usr/bin/env node
// gl-object-census.mjs — GL objects created minus deleted per circuit visit (the three WebGL-fallback leak, #2651).
// @doc GL object census: WebGL2 create/delete counts (VAO, program, shader, buffer, texture, FBO, RBO) per circuit visit.
// @skill renderer-debug / mcp-probe
//
//   node tools/gfx/gl-object-census.mjs [--backend three|webgl2] [--tracks monza,monaco,spa]
//        [--cycles 3] [--settle 10] [--json PATH] [--quiet]
//
// Wraps WebGL2RenderingContext.prototype create*/delete* before any page script runs,
// then drives the picker (RACE -> tap circuit, as mem-census does) and prints, per visit,
// live = creates - deletes for each object kind. Growth of `live` between the last two
// cycles is the leak; flat is clean. Counts, never a frame rate.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, sleep } from "../lib/harness.mjs";
import { censusInitScript, censusAfterGc, pickTrack, waitFrames, waitUntilDrawn } from "../lib/mem-census.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const KINDS = ["VertexArray", "Program", "Shader", "Buffer", "Texture", "Framebuffer", "Renderbuffer"];

function parseArgs(argv) {
  const o = { backend: "three", tracks: ["monza", "monaco", "spa"], cycles: 3, settle: 10, json: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--backend") o.backend = next();
    else if (a === "--tracks") o.tracks = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--cycles") o.cycles = Math.max(1, +next() | 0);
    else if (a === "--settle") o.settle = Math.max(0, +next());
    else if (a === "--json") o.json = next();
    else if (a === "--quiet") o.quiet = true;
    else if (a === "-h" || a === "--help") { console.log("usage: node tools/gfx/gl-object-census.mjs [--backend three|webgl2] [--tracks a,b,c] [--cycles N] [--settle S] [--json PATH] [--quiet]"); process.exit(0); }
    else throw new Error("unknown argument " + a);
  }
  if (!["three", "webgl2"].includes(o.backend)) throw new Error("--backend must be three or webgl2");
  return o;
}

// Init script: counts every create/delete that reaches a WebGL2 context.
function glCountInit(kinds) {
  if (window.__glCount) return;
  const C = window.__glCount = {};
  for (const k of kinds) C[k] = { c: 0, d: 0 };
  const P = window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype;
  if (!P) return;
  for (const k of kinds) {
    const cr = P["create" + k], de = P["delete" + k];
    if (cr) P["create" + k] = function (...a) { const r = cr.apply(this, a); if (r) C[k].c++; return r; };
    if (de) P["delete" + k] = function (o, ...a) { if (o) C[k].d++; return de.call(this, o, ...a); };
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--enable-precise-memory-info", "--use-angle=swiftshader"] });
  const rows = [], errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript((be) => {
      window.__TEST_MODE = true;
      try { localStorage.setItem("apex26.gfxBackend", be); localStorage.setItem("apex26.tyreWear", JSON.stringify("off")); } catch (_) {}
    }, o.backend);
    await ctx.addInitScript(censusInitScript);
    await ctx.addInitScript(glCountInit, KINDS);
    await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    const cdp = await ctx.newCDPSession(page);
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1", { waitUntil: "load" });
    await page.waitForFunction(() => window.__apex && window.__apex.info && typeof Tracks !== "undefined", null, { polling: 100, timeout: 120000 });
    const read = async () => {
      await censusAfterGc(page, cdp);
      return page.evaluate(() => {
        const o = {};
        for (const k in window.__glCount) o[k] = { created: window.__glCount[k].c, deleted: window.__glCount[k].d, live: window.__glCount[k].c - window.__glCount[k].d };
        return { gl: o, backend: (window.renderer && window.renderer.backend && window.renderer.backend.constructor.name) || null };
      });
    };
    const emit = (row) => { rows.push(row); if (!o.quiet) console.log(JSON.stringify(row)); };
    emit({ step: "boot", ...(await read()) });
    for (let cycle = 1; cycle <= o.cycles; cycle++) {
      for (const id of o.tracks) {
        await pickTrack(page, id);
        await waitUntilDrawn(page, id);
        await waitFrames(page, 15);
        await sleep(o.settle * 1000);
        emit({ step: `${cycle}:${id}`, cycle, track: id, ...(await read()) });
      }
    }
    // live objects per kind at each circuit, last cycle minus the one before.
    const growth = {};
    if (o.cycles >= 2) {
      for (const id of o.tracks) {
        const a = rows.find((r) => r.cycle === o.cycles - 1 && r.track === id);
        const b = rows.find((r) => r.cycle === o.cycles && r.track === id);
        if (a && b) growth[id] = Object.fromEntries(KINDS.map((k) => [k, b.gl[k].live - a.gl[k].live]));
      }
    }
    const grew = Object.values(growth).some((g) => Object.values(g).some((v) => v > 0));
    const summary = { backend: o.backend, renderBackend: rows[0] && rows[0].backend, cycles: o.cycles, growthLastCycle: growth, pageErrors: errors.length, verdict: grew ? "grows" : "flat" };
    console.log("= gl-object-census " + JSON.stringify(summary));
    if (o.json) { mkdirSync(dirname(o.json), { recursive: true }); writeFileSync(o.json, JSON.stringify({ summary, rows, errors }, null, 2)); }
  } finally {
    await browser.close().catch(() => {});
    await srv.close?.();
    shutdown();
  }
}

main().catch((e) => { console.error(e && e.stack || e); shutdown(); process.exit(2); });
