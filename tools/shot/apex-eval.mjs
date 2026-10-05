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
//   node tools/shot/apex-eval.mjs monza  "a.corners().length" --vm          # Node VM, no Chromium (~4 s)
//
// --vm routes the same expr through tools/lib/game-vm.cjs (the REAL js/game.js
// in a Node VM, renderer and DOM stubbed): physics, track geometry, lighting
// resolve, race control, the agent surface — every numeric question that needs
// no pixels — without a 30-45 s SwiftShader boot. `g` is the VM handle inside
// the expr (g.step(n), g.flushTimers()). What the VM cannot answer: anything
// drawn (render/frame/car rasters, numLights — it reports bakedLights /
// lampPosts), and a backend question (--backend is refused with --vm).
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
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/shot/apex-eval.mjs <trackId> "<expr>" [--raw] [--backend three|webgl2|webgpu] [--vm]
  \`a\` is window.__apex inside the expr (async is awaited); default output is shape-compacted, --raw dumps it.
  Boots its own static server + Chromium; --vm boots js/game.js in a Node VM instead (no browser, no pixels,
  \`g\` is the VM handle). Examples in the header of this file.`);
const raw = argv.includes("--raw");
const vmRoute = argv.includes("--vm");
// WHICH RENDERER ANSWERED. This tool pinned no backend, so it booted whatever
// `backendPreference()` defaults to — and that default is now THREE (TLX), not
// GLX. Because a backend is descriptor-copied ONTO the `GLX` global, an expr
// reading `GLX.hdrMode()` gets TLX's answer under GLX's name and reports it as
// verified GLX. Pin the backend explicitly and print the pin, so a recipe can
// never silently measure a renderer it did not ask for.
const BACKENDS = ["three", "webgl2", "webgpu"];
let backend = "three", backendPinned = false;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--raw" || a === "--vm") continue;
  const m = /^--backend(?:=(.*))?$/.exec(a);
  if (m) { backend = m[1] != null ? m[1] : argv[++i]; backendPinned = true; continue; }
  rest.push(a);
}
if (!BACKENDS.includes(backend)) {
  console.error(`apex-eval: --backend must be one of ${BACKENDS.join(" | ")} (got "${backend}")`);
  process.exit(2);
}
const track = rest[0] || "monza";
const expr = rest[1] || "a.info()";
if (vmRoute && backendPinned) {
  console.error("apex-eval: --vm has no renderer, so --backend means nothing there; drop one of them");
  process.exit(2);
}

// ONE shape function for both routes: installed as window.__shape in the page
// (Playwright serialises its source), called directly in the VM.
function shapeOf(v, d = 0) {
  if (v === null || v === undefined) return v === null ? "null" : "undefined";
  if (Array.isArray(v)) return `Array(${v.length})` + (v.length ? `<${shapeOf(v[0], d + 1)}>` : "");
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
}
const SHAPE = "window.__shape = " + shapeOf.toString() + "; window.__shape.shapeOf = window.__shape;";

// THE VM ROUTE. The same expr, `a` the VM's __apex, `g` the handle; the track
// is built by createGame({ track }) before the expr runs, as race() does in
// the browser route. Measured: ~1.5 s to __apex, ~2.5 s more to a built monza.
async function evalInVm() {
  const { createRequire } = await import("node:module");
  const { createGame } = createRequire(import.meta.url)("../lib/game-vm.cjs");
  console.error(`apex-eval: vm route track=${track} (no renderer: rasters and numLights are browser-only)`);
  const g = await createGame({ track });
  try {
    // eslint-disable-next-line no-new-func
    const v = await new Function("a", "g", "return (async()=>(" + expr + "))()")(g.apex, g);
    console.log(JSON.stringify(raw ? v : shapeOf(v), null, 2));
  } catch (e) {
    console.log(JSON.stringify({ err: String((e && e.message) || e) }, null, 2));
    process.exitCode = 1;
  } finally { g.close(); }
}
if (vmRoute) { await evalInVm(); process.exit(process.exitCode || 0); }

// How long a track build may take before this is a real failure. Sized off a
// MEASURED TLX build (16.6 s) with room for a loaded box, not off a round
// number: too short reads as "the game is broken" when the game is fine.
const TRACK_MS = 45000;
const BOOT_MS = 45000;

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
    // 15 s was under a cold boot: __apex lands 10.3-12.6 s after goto on an
    // idle container (2026-10-02) and later on a fresh Chromium, so the first
    // apex_eval of a session timed out and the retry passed.
    await page.waitForFunction(() => window.__apex != null, null, { timeout: BOOT_MS, polling: 100 });
    await page.evaluate(SHAPE.replace(/shapeOf\(/g, "window.__shape("));
    await page.evaluate((t) => window.__apex.race(t), track);
    // TRACK_MS, not 15 s. A TLX build of monza on this container's SwiftShader
    // measures 16.6 s (2026-09-21, idle box), so the old budget was simply
    // under the build — and BOTH halves matter. The 16.6 s was the same with
    // and without `polling: 100`, because a predicate that becomes true is
    // observed on the next animation frame either way; but a predicate that
    // NEVER becomes true is a different story, and tools/check/
    // wait-polling-lint.mjs measured a declared 3 s bound running 109,665 ms
    // under rAF starvation. A timeout that cannot fire is not a bound, so this
    // takes the timer polling too: the budget below is the fix for the failure
    // seen, the polling is what makes the budget mean anything. TLX became the DEFAULT backend on 2026-09-18, so from that
    // day this tool failed on its own default while every sibling kept
    // working: agent.mjs already budgets 20 s, shot.mjs 120 s, ssr-probe 120 s.
    await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: TRACK_MS, polling: 100 });
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
