#!/usr/bin/env node
// apex-eval — boot the game headless and evaluate an __apex expression, print JSON.
// @doc Boot the game headless, evaluate one `__apex` expression, print JSON: `apex-eval.mjs monza '__apex.corners()'`.
// @skill playwright-probe
//
//   node tools/shot/apex-eval.mjs <trackId> "<expr>"
//   node tools/shot/apex-eval.mjs monaco "a.camera()"
//   node tools/shot/apex-eval.mjs spa    "a.corners().length"
//   node tools/shot/apex-eval.mjs monza  "(a.go(), a.jump(0.2,55), a.physState())"
//   node tools/shot/apex-eval.mjs monza  "a.trackProfile(6)" --raw     # full JSON, no shape-compaction
//   node tools/shot/apex-eval.mjs monza  "a.info()" --backend webgl2       # GLX, not the TLX default
//
// --backend three|webgl2|webgpu pins apex26.gfxBackend (default: three, the
// shipped default). ALWAYS pass it when the expr names a backend global:
// the pick is descriptor-copied onto `GLX`, so `GLX.x()` under the default
// returns TLX's answer. The resolved pin is echoed on stderr.
//
// `a` is window.__apex inside the expr. Async expr is awaited. Default output
// is shape-compacted (keys + sampled types + rounded numbers); --raw dumps the
// real value. Starts its own static server + Chromium; no setup needed.
//
// Robust against this repo's environment: picks the preinstalled Chromium when
// the npm playwright build doesn't match (executablePath fallback), and resolves
// playwright from the project even when run from elsewhere.

import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

const argv = process.argv.slice(2);
const raw = argv.includes("--raw");
// WHICH RENDERER ANSWERED. This tool pinned no backend, so it booted whatever
// `backendPreference()` defaults to — and that default is now THREE (TLX), not
// GLX. Because a backend is descriptor-copied ONTO the `GLX` global, an expr
// reading `GLX.hdrMode()` gets TLX's answer under GLX's name and reports it as
// verified GLX. Pin the backend explicitly and print the pin, so a recipe can
// never silently measure a renderer it did not ask for.
const BACKENDS = ["three", "webgl2", "webgpu"];
let backend = "three";
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--raw") continue;
  const m = /^--backend(?:=(.*))?$/.exec(a);
  if (m) { backend = m[1] != null ? m[1] : argv[++i]; continue; }
  rest.push(a);
}
if (!BACKENDS.includes(backend)) {
  console.error(`apex-eval: --backend must be one of ${BACKENDS.join(" | ")} (got "${backend}")`);
  process.exit(2);
}
const track = rest[0] || "monza";
const expr = rest[1] || "a.info()";

const SHAPE = function () {
  window.__shape = function (v, d = 0) {
    if (v === null || v === undefined) return v === null ? "null" : "undefined";
    if (Array.isArray(v)) return `Array(${v.length})` + (v.length ? `<${window.__shape(v[0], d + 1)}>` : "");
    const t = typeof v;
    if (t === "object") {
      if (d > 1) return "object";
      const o = {};
      for (const k of Object.keys(v).slice(0, 32)) {
        const x = v[k];
        o[k] = Array.isArray(x) ? `Array(${x.length})`
          : x && typeof x === "object" ? "object"
          : typeof x === "number" ? +x.toFixed(3) : x;
      }
      return o;
    }
    return t === "number" ? +v.toFixed(3) : v;
  };
};

(async () => {
  const srv = await startStaticServer(ROOT);

  try {
    const browser = await launchChromium({
      args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
    });
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.addInitScript((be) => {
      try {
        localStorage.setItem("apex26.gfxBackend", be);
        if (be === "three") localStorage.setItem("apex26.tlxForceGL", "1");
        if (be === "webgpu") localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
      } catch (_) { /* blocked storage: the page falls back to its own default */ }
    }, backend);
    console.error(`apex-eval: backend=${backend} track=${track}`);
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { timeout: 15000 });
    await page.evaluate(SHAPE);
    await page.evaluate((t) => window.__apex.race(t), track);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 15000 });
    await sleep(1600); // mesh build

    const result = await page.evaluate(async ({ expr, raw }) => {
      try {
        const a = window.__apex;
        // eslint-disable-next-line no-new-func
        const v = await new Function("a", "return (async()=>(" + expr + "))()")(a);
        return { ok: true, val: raw ? v : window.__shape(v) };
      } catch (e) { return { err: String((e && e.message) || e) }; }
    }, { expr, raw });

    console.log(JSON.stringify(result.ok ? result.val : result, null, 2));
  } catch (e) {
    console.error("apex-eval failed:", e.message);
    process.exitCode = 1;
  } finally {
    // Closes the browser too — it must not survive a throw above (that is how
    // stray chrome/crashpad processes used to pile up).
    await shutdown();
  }
})();
