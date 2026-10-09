/* gfx-backend-canary.test.mjs — the RENDERER pick must survive the title menu.
 *
 * Title SETTINGS never presents a world frame (`render()` returns on !track
 * until the deferred flyby builds). A canary that stayed armed until present()
 * reverted THREE/WEBGPU to WEBGL2 on every refresh — computer and phone.
 *
 * HOW IT PINS THINGS (2026-09 rewrite). ~390 assertions here used to quote
 * source text; a one-token refactor that changed no behaviour broke two of
 * them. Now the GLX renderer is BOOTED on tests/helpers/glx-mock.mjs (a
 * recording WebGL2 mock) and asserted by its gl call stream — uniform caches,
 * fail-closed guards, cull bookkeeping, the light-lane packing, the opaque
 * canvas; the RENDERER picker is driven through renderer-picker.js in a VM; the
 * GPU-census Verdict script is EXECUTED against fixtures. WGX behaviour that
 * tests/unit/webgpu-lifecycle.test.mjs already drives on its mock device is
 * not repeated here as text. What stays a source pin — TLX (three.js cannot
 * load in Node), WGSL/GLSL/TSL, the vendored three bundle, the workflow
 * YAML, the tools — is matched on comment-stripped source by identifier and
 * shape, never by exact whitespace, argument order or comment text.
 *
 * Run: node --test tests/unit/gfx-backend-canary.test.mjs
 */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fnSource } from "../helpers/fn-source.mjs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedStore } from "../helpers/seed-store.mjs";   // gfx-quality.js persists through GameStore.store's raw lane
import { seedClipboard } from "../helpers/seed-clipboard.mjs";
import { bootGlx } from "../helpers/glx-mock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readFile = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// These guards span boot and frame-loop ownership; load the extracted owners explicitly.
const read = (p) => p === "js/game.js"
  ? ["js/render/renderer-boot.js", "js/core/lazy-bundles.js", "js/ui/platform-session.js", p].map(readFile).join("\n")
  : readFile(p);
// Comment-stripped source: a pin can only match code, and a comment can
// neither fail nor satisfy it.
const code = (p) => (p.startsWith("css/") ? readCssSource(p) : read(p)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
/** The span between two source needles, ASSERTING BOTH EXIST FIRST.
 *
 * `src.slice(src.indexOf(a), src.indexOf(b))` is the shape that disarmed this
 * file: `indexOf` answers -1 for a needle that moved, `slice(-1, -1)` is "",
 * and every assertion on an empty span passes. Measured 2026-09-20 — the
 * adapter-verdict pin below sliced on `_softAdapter = !!(` while tlx.js had
 * long since become `_softAdapter = !isMobile && !!(`, so two named guards
 * ("must not treat headless as software", "empty adapter.info must not be a
 * software verdict") had never checked anything. They were green the whole
 * time, which is worse than absent: the file reported coverage it did not have.
 *
 * Prefer fnBody() when the span IS a function. Use this when it is not, and
 * never reach for a bare indexOf again — a pin that cannot fail is not a pin.
 */
function span(src, from, to, what) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `${what}: the start needle moved — ${JSON.stringify(from)} is no longer in the source`);
  const b = src.indexOf(to, a + 1);
  assert.ok(b > a, `${what}: the end needle moved — ${JSON.stringify(to)} is not after the start`);
  return src.slice(a, b);
}
/** Like span(), but anchored from the END: the LAST `from` before `to`.
 *
 * For a name that is declared once and assigned later, a forward indexOf finds
 * the DECLARATION — a span that is technically non-empty and still the wrong
 * region, which is the quieter half of the same trap.
 */
function spanBack(src, from, to, what) {
  const b = src.indexOf(to);
  assert.ok(b >= 0, `${what}: the end needle moved — ${JSON.stringify(to)} is no longer in the source`);
  const a = src.lastIndexOf(from, b - 1);
  assert.ok(a >= 0, `${what}: no ${JSON.stringify(from)} before the end needle`);
  return src.slice(a, b);
}
/** Brace-matched body of `function name(` (or `name(args) {` for a method). */
function fnBody(src, name) {
  const m = src.match(new RegExp(`(?:function\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`));
  assert.ok(m, `${name}() moved`);
  let depth = 1;
  const start = m.index + m[0].length;
  let i = start;
  for (; i < src.length && depth; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  return src.slice(start, i - 1);
}

test("gfx-probe cannot report a stale optional frame as fresh", () => {
  const probe = read("tools/gfx/gfx-probe.mjs");
  assert.match(probe, /ATTEMPT_ARTIFACTS\s*=\s*\[[^\]]*"frame\.png"/,
    "frame.png must be one of the owned artifacts cleared before every attempt");
  assert.match(probe, /for \(let attempt[^]*?clearAttemptArtifacts\(\);[^]*?runProbeAttempt\(attempt\)/,
    "retry attempts must clear files before launching the browser");
  assert.match(probe, /files:\s*artifactFiles\(\)/,
    "the JSON result must list files that actually exist, not a static wish list");
  assert.doesNotMatch(probe, /files:\s*opts\.backend\s*===/,
    "backend selection alone cannot prove optional frame.png was written");
  assert.equal((probe.match(/\blite:\s*false\b/g) || []).length, 1,
    "probe defaults should not carry duplicate lite entries");
  assert.equal((probe.match(/\biphone:\s*false\b/g) || []).length, 1,
    "probe defaults should not carry duplicate iphone entries");
});

test("#pm-renderer is visible in the SETTINGS markup (not hidden)", () => {
  const html = read("index.html");
  const m = html.match(/<button id="pm-renderer"[^>]*>/);
  assert.ok(m, "pm-renderer button exists");
  assert.doesNotMatch(m[0], /\bhidden\b/, "hidden on the tag hid RENDERER until game.js finished an async backend load");
});

test("no stored renderer means Three.js on touch and desktop alike", () => {
  // Preference lives in renderer-boot.js (extracted); unset still names THREE,
  // and start() may downgrade to GLX only when requestAdapter() is null.
  const boot = code("js/render/renderer-boot.js");
  const select = boot.slice(boot.indexOf("function storedBackendPreference()"), boot.indexOf("function backendPreference()"));
  assert.ok(select.length > 0, "renderer preference selection block found");
  assert.doesNotMatch(select, /matchMedia\s*\([^)]*pointer:\s*coarse/,
    "touch and desktop must use the same default");
  assert.match(select, /pref\s*==\s*null\)\s*return\s*\{\s*pref:\s*"three"/,
    "an absent stored preference resolves to THREE (adapter gate is separate)");
  assert.match(boot, /storedBackendPreference\(\)/,
    "the boot selection must read the stored preference");
  assert.match(boot, /gpuAdapterAvailable/,
    "unset THREE must gate on a resolved GPU adapter before fetching three.webgpu");
  const picker = code("js/perf/renderer-picker.js");
  const def = picker.slice(picker.indexOf("function defaultBackend()"), picker.indexOf("function readBackend()"));
  assert.doesNotMatch(def, /matchMedia\s*\([^)]*pointer:\s*coarse/,
    "renderer-picker defaultBackend must agree with game.js on every device");
  assert.match(def, /return\s+"three"/, "unset picker read falls back to THREE");
});

test("renderer-picker readBackend is Three.js when unset and preserves explicit picks", () => {
  const src = read("js/perf/renderer-picker.js");
  for (const [stored, expected] of [[null, "three"], ["webgl2", "webgl2"], ["three", "three"], ["webgpu", "webgpu"], ["unknown", "webgl2"]]) {
    const ls = makeStorage(stored == null ? {} : { "apex26.gfxBackend": stored });
    const ctx = vm.createContext({
      window: { matchMedia: () => ({ matches: true }) },
      document: { readyState: "loading", addEventListener() {} },
      localStorage: ls,
      sessionStorage: makeStorage({}),
      navigator: { gpu: {} },
      ApexRoster: { DEFERRED: { webgpu: ["js/render/webgpu/wgx.js"], three: ["js/render/three/tlx.js"] } },
    });
    seedLog(ctx);
    seedStore(ctx);
    vm.runInContext(src, ctx, { filename: "js/perf/renderer-picker.js" });
    const G = vm.runInContext("RendererPicker", ctx);
    assert.equal(G.readBackend(), expected, `stored ${stored} resolves to ${expected}`);
  }
});

test("Gfx binds TLX when the preference is unset and honours explicit backends", async () => {
  const src = read("js/render/gfx.js");
  async function bind(stored) {
    const ls = makeStorage(stored == null ? {} : { "apex26.gfxBackend": stored });
    const tlxBackend = { name: "tlx" };
    const wgxBackend = { name: "wgx" };
    const ctx = vm.createContext({
      window: {},
      localStorage: ls,
      navigator: { gpu: {} },
      TLX: { async create() { return tlxBackend; } },
      WGX: { async create() { return wgxBackend; } },
    });
    seedLog(ctx);
    vm.runInContext(src, ctx, { filename: "js/render/gfx.js" });
    const G = vm.runInContext("Gfx", ctx);
    return G.create({}, {});
  }
  assert.equal((await bind(null)).name, "tlx", "unset preference takes the TLX seam");
  assert.equal(await bind("webgl2"), null, "explicit WEBGL2 remains the fallback request");
  assert.equal((await bind("webgpu")).name, "wgx", "explicit WEBGPU still takes WGX");
});

test("boot canary disarms after a successful bind, not only after present()", () => {
  const game = code("js/game.js");
  const bind = game.search(/Object\.defineProperties\(\s*GLX\s*,\s*Object\.getOwnPropertyDescriptors\(\s*backend\s*\)\s*\)/);
  const present = game.search(/gfx\.present\(\s*po\s*\)/);
  assert.ok(bind > 0 && present > bind, "bind then present");
  const disarmAfterBind = game.slice(bind).search(/removeItem\(\s*PROBE_KEY\s*\)/);
  assert.ok(disarmAfterBind >= 0 && bind + disarmAfterBind < present,
    "PROBE_KEY must be cleared after Gfx.create() binds, before the first present — title has no track");
});

test("a successful deferred bind clears a stale GLX live-backend latch", () => {
  const game = code("js/game.js");
  const bind = game.search(/Object\.defineProperties\(\s*GLX\s*,\s*Object\.getOwnPropertyDescriptors\(\s*backend\s*\)\s*\)/);
  const fallback = game.indexOf("if (!gfx) {", bind);
  const success = game.slice(bind, fallback);
  assert.match(success, /if\s*\(\s*gfx\s*\)[^]*?sessionStorage\.removeItem\(\s*"apex26\.gfxBound"\s*\)/,
    "same-tab recovery must not retain a previous GLX fallback after TLX/WGX binds");
  assert.match(success, /dispatchEvent\(\s*new Event\(\s*"apex-gfx-live"\s*\)\s*\)/,
    "SETTINGS and diagnostics must repaint after the live bind changes");
});

test("every successful game.js GLX fallback publishes the live backend", () => {
  const game = code("js/game.js");
  const fallback = game.slice(game.indexOf("if (!gfx) {"), game.indexOf("// Baked asset pack"));
  assert.match(fallback, /gfx\s*=\s*GLX[\s\S]*sessionStorage\.setItem\(\s*"apex26\.gfxBound"\s*,\s*"webgl2"\s*\)/,
    "claim-fail, first-strike and null-create all converge on the successful GLX attach");
  assert.match(fallback, /dispatchEvent\(\s*new Event\(\s*"apex-gfx-live"\s*\)\s*\)/,
    "the picker must repaint immediately when GLX takes over");
});

test("the shared Playwright fixture pins native GLX coverage", () => {
  const fixture = code("tests/helpers/fixtures.js");
  const install = fixture.slice(fixture.indexOf("async function installMocks"), fixture.indexOf("const consoleByPage"));
  assert.match(install, /localStorage\.setItem\(\s*"apex26\.gfxBackend"\s*,\s*"webgl2"\s*\)/);
});

// The pin above only reaches specs that import `test` from fixtures.js. Four
// gfx specs used to import raw @playwright/test and silently measured TLX on
// Metal after the three default (RENDERER-MACOS-RED-2026-09.md). Keep them on
// the fixtures path — tlx-probes is the TLX product gate and pins "three"
// itself.
test("gfx specs that name GLX import Playwright test from fixtures", () => {
  for (const rel of [
    "tests/specs/webgl-probes.spec.js",
    "tests/specs/image-grade-visual.spec.js",
    "tests/specs/lighting-ab.spec.js",
    "tests/specs/lighting-tuner-grade.spec.js",
    "tests/specs/instanced-draw.spec.js",
  ]) {
    const src = code(rel);
    assert.match(src, /from\s+["']\.\.\/helpers\/fixtures\.js["']/,
      rel + " must import test from fixtures (webgl2 pin)");
    assert.doesNotMatch(src, /from\s+["']@playwright\/test["']/,
      rel + " must not import raw @playwright/test (skips the webgl2 pin)");
  }
});

test("first world present re-arms the canary so a jetsam mid-frame still reverts", () => {
  // The arm used to be inlined right before gfx.present(po); it is now the
  // extracted armBackendProbe() (also called from tick()'s fatal catch, so a
  // pre-present crash still gets recorded — see the tick() test below), but
  // the call site must still be the LAST thing before present() and the
  // disarm-after-a-proved-run must still be the first thing after it.
  const game = code("js/game.js");
  const present = game.search(/gfx\.present\(\s*po\s*\)/);
  const before = game.slice(Math.max(0, present - 200), present);
  const after = game.slice(present, present + 900);
  // XR Phase 0: present goes through XrBoot.present(…) || gfx.present(po). The
  // canary must still arm immediately before that gate — nothing else may sit
  // between armBackendProbe() and the present call.
  assert.match(before, /armBackendProbe\(\)\s*;\s*(?:\n\s*if \(!XrBoot\.present\(gfx, _xrEyes, po\)\) )?$/,
    "the last statement before gfx.present(po) must arm the canary");
  assert.match(after, /removeItem\(\s*"apex26\.gfxBackendProbe"\s*\)/);
  const helper = fnBody(game, "armBackendProbe");
  assert.match(helper, /backendPreference\(\)/,
    "canary re-arm must resolve an unset preference to the default THREE pick");
  assert.match(helper, /setItem\(\s*"apex26\.gfxBackendProbe"/);
});

test("RENDERER picker lives in renderer-picker.js, not game.js or gfx-quality.js", () => {
  // The picker's own behaviour — a <select> with ‹ › steps, "WEBGPU
  // (UNAVAILABLE)" without navigator.gpu — is driven through bootPicker()
  // below; this is the ownership rule only.
  assert.doesNotMatch(code("js/game.js"), /getElementById\(\s*"pm-renderer"\s*\)|\$\(\s*"pm-renderer"\s*\)/);
  assert.match(code("js/perf/renderer-picker.js"), /getElementById\(\s*"pm-renderer"\s*\)/);
  // The preset file keeps the GRAPHICS button only — the split is the ownership rule.
  assert.doesNotMatch(code("js/perf/quality-preset.js"), /pm-renderer|apex26\.gfxBackend/);
});

test("TLX AUTO may land on three WebGL2 and uses a lite swapchain on WebGPU", () => {
  const src = code("js/render/three/tlx.js");
  assert.match(src, /\bisWebKit\b/);
  assert.match(src, /apex26\.tlxAutoGL/);
  assert.match(src, /\b_autoStayGL\b/);
  // Was pinned on `!_hasGpu`. That is a PRESENCE check — navigator.gpu can
  // exist while three still falls back to its WebGL backend, and on that path
  // three does not throw, so forceWebGL stayed false and bootRenderer skipped
  // the caller-supplied opaque context it is keyed on. The canvas came up
  // alpha-composited and the cars rendered see-through. The gate is now the
  // obtainable WebGPU CONTEXT; renderer-soft-lifecycle.test.mjs holds the rest.
  // 2026-09-03: `|| isWebKit` joined the clause. Two consecutive deploys
  // rendered three-WebGPU wrongly on the owner's iPhone (bodywork missing,
  // then sky-only at c6d8fd3) with ZERO reported GPU/WGSL errors, while
  // three's WebGL2 backend on the same phone is known-good (ed8f41f). AUTO on
  // WebKit takes WebGL2; THREE PATH: WEBGPU (pin "0") still forces WebGPU.
  assert.match(src, /forceWebGL\s*=\s*_glPin\s*===\s*"1"\s*\|\|\s*\(\s*_glPin\s*!==\s*"0"\s*&&\s*\(\s*!_gpuCanvasOk\s*\|\|\s*_autoStayGL\s*\|\|\s*isWebKit\s*\)\s*\)/,
    "AUTO stays on WebGL2 when no WebGPU context is obtainable, after an init failure, or on WebKit; a pin of 1/0 overrides");
  assert.match(src, /async\s+function\s+bootRenderer\b/);
  assert.match(src, /AUTO WebGPU init failed/);
  assert.match(src, /await renderer\.init\(\)[\s\S]{0,200}?disposeKeepingContext\(renderer\)/,
    "failed renderer.init must dispose before AUTO WebGPU→WebGL2 retry");
  assert.match(src, /AUTO stayed on three WebGL2/);
  assert.match(src, /outputType:\s*THREE\.UnsignedByteType/);
  assert.match(src, /powerPreference:\s*"low-power"/);
  assert.match(src, /infoBlob\s*=\s*\[[^\]]*\bdev\b[^\]]*\]/, "the adapter sniff joins the info fields into one blob");
  assert.match(code("js/render/three/tsl-lit.js"), /cubeTexture\(\s*envCubeNode\s*,\s*Rg\s*,\s*rough\.mul\(\s*2\.5\s*\)\s*\)/);
});

test("GLX upscale toggles preserve scene targets at unchanged render resolution", () => {
  const h = bootGlx();
  h.GLX.setRenderScale(0.75);
  h.reset();
  h.GLX.setSpatialUpscale(true);
  assert.equal(h.canvas.width, 640);
  assert.equal(h.GLX.width, 480);
  assert.equal(h.count("texImage2D"), 1, "only the FXAA intermediate is allocated");
  assert.equal(h.count("deleteTexture"), 0, "scene and post textures survive");
  h.reset();
  h.GLX.setSpatialUpscale(true);
  h.GLX.resize();
  assert.equal(h.count("texImage2D"), 0, "reapplying the setting allocates nothing");
  h.GLX.setRenderScale(0.6);
  assert.ok(h.count("texImage2D") > 1, "active upscale resizes scene and AA targets");
  assert.equal(h.canvas.width, 640, "presentation stays full sized");
  h.reset();
  h.GLX.setSpatialUpscale(false);
  assert.equal(h.canvas.width, 384);
  assert.equal(h.count("texImage2D"), 0);
  assert.equal(h.count("deleteTexture"), 1, "only the upscale intermediate is freed");
  h.reset();
  h.GLX.setRenderScale(0.5);
  assert.ok(h.count("texImage2D") > 1, "real scene resizing still rebuilds targets");
});

test("GLX create* / draw* fail closed when the context is lost", () => {
  // BEHAVIOUR on the mock: after `webglcontextlost` every creator returns
  // null and every draw entry (core, chunked, shadow, post) makes NO gl call.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mesh = h.GLX.createMesh(tri);
  const chunked = h.GLX.createChunkedMesh(tri, 72);
  const batch = h.GLX.createInstancedBatch(tri, new Float32Array(32), null, null);
  const tex = h.GLX.createTexture({ width: 2, height: 2 });
  assert.ok(mesh && chunked && batch && tex, "a live context creates");
  const model = new Float32Array(16); model[0] = model[5] = model[10] = model[15] = 1;
  h.GLX.begin(h.frame());
  h.reset();
  h.GLX.draw(mesh, model, {});
  assert.ok(h.calls.length > 0, "a live draw talks to gl");

  h.loseContext();
  assert.equal(h.GLX.createMesh(tri), null);
  assert.equal(h.GLX.createTexMesh({ pos: [0, 0, 0], nrm: [0, 1, 0], uv: [0, 0], idx: [0] }), null);
  assert.equal(h.GLX.createTexture({}), null);
  assert.equal(h.GLX.createTextureArray(4, [{}], 1), null);
  h.reset();
  h.GLX.begin(h.frame());
  h.GLX.draw(mesh, model, {});
  h.GLX.drawChunked(chunked, model, {});
  h.GLX.drawInstanced(batch, {});
  h.GLX.drawDecal(mesh, model, tex, {});
  h.GLX.drawShadow(model, 1, 1);
  h.GLX.drawMark(model, 1, 1);
  h.GLX.drawSkidBatch(new Float32Array(64), 4, true);
  h.GLX.drawGlow([0, 0, 0, 1, 1, 1, 5], 0.2);
  h.GLX.drawParticles(new Float32Array(16), 16, false);
  // Shadow passes run BEFORE begin() in the live frame — they must fail closed
  // too, or INVALID_OPERATION spam continues after CONTEXT_LOST_WEBGL.
  const lightVP = new Float32Array(16); lightVP[0] = lightVP[5] = lightVP[10] = lightVP[15] = 1;
  h.GLX.shadowBegin(lightVP);
  h.GLX.castShadow(mesh, model);
  h.GLX.castShadowChunked(chunked, model);
  h.GLX.castShadowInstanced(batch);
  h.GLX.shadowEnd();
  h.GLX.carShadowBegin(lightVP, 1);
  h.GLX.castShadow(mesh, model);
  h.GLX.carShadowEnd();
  h.GLX.lampShadowBegin(lightVP, 0);
  h.GLX.castShadowInstanced(batch, 1);
  h.GLX.lampShadowEnd();
  h.GLX.present({});
  assert.deepEqual(h.calls.map((c) => c[0]), [], "no entry point touches a lost context");
  assert.equal(h.GLX.updateInstances(batch, new Float32Array(32), 1), 0, "updateInstances reports nothing resident");
  assert.equal(h.GLX.backendState().ctxLost, true, "backendState names the loss for race-start fail-fast");
});

test("GLX chunked create/free and instanced free fail closed after context loss", () => {
  // Track switch calls Tracks.free → freeChunkedMesh / freeInstancedBatch while
  // the 1.2 s restore timer is still pending. Those entry points used to keep
  // talking to a lost context (createVertexArray / deleteBuffer), which is
  // INVALID_OPERATION spam and a leak of JS-side GPU handles. createMesh already
  // returned null; the >2000-tri chunked path never asked ctxGone.
  // createChunkedMesh nulls data.pos/idx after upload unless _keepPositions —
  // rebuild per harness so the second create is not reading a emptied bag.
  const fatGeo = () => {
    const nTri = 2000;
    const pos = [], nrm = [], col = [], idx = [];
    for (let i = 0; i < nTri * 3; i++) {
      pos.push(i, 0, 0); nrm.push(0, 1, 0); col.push(1, 1, 1);
    }
    for (let t = 0; t < nTri; t++) idx.push(t * 3, t * 3 + 1, t * 3 + 2);
    return { pos, nrm, col, idx };
  };
  const h = bootGlx();
  const live = h.GLX.createChunkedMesh(fatGeo(), 72);
  assert.ok(live && live.chunks && live.chunks.length, "live fat mesh is chunked, not the small-mesh fallback");
  h.reset();
  h.GLX.freeChunkedMesh(live);
  assert.ok(h.count("deleteBuffer") >= 2, "a live free releases VBO + IBO");
  assert.ok(h.count("deleteVertexArray") >= 1, "a live free releases the VAO");

  const h2 = bootGlx();
  const fatLive = h2.GLX.createChunkedMesh(fatGeo(), 72);
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const batch = h2.GLX.createInstancedBatch(tri, new Float32Array(32), null, { cellSize: 72 });
  const tex = h2.GLX.createTexture({ width: 2, height: 2 });
  h2.loseContext();
  h2.reset();
  assert.equal(h2.GLX.createChunkedMesh(fatGeo(), 72), null, "chunked upload refuses a lost context");
  h2.GLX.freeChunkedMesh(fatLive);
  h2.GLX.freeInstancedBatch(batch);
  h2.GLX.freeTexture(tex);
  assert.equal(h2.GLX.cullInstances(batch, [new Float32Array(4), new Float32Array(4), new Float32Array(4),
    new Float32Array(4), new Float32Array(4), new Float32Array(4)]), 0);
  assert.deepEqual(h2.calls.map((c) => c[0]), [], "free/cull after loss must not touch gl");
});

test("GLX restores even when sessionStorage is blocked", () => {
  // Loss+restore both used to `return` in the storage catch, so a private-mode
  // tab that got webglcontextrestored never reloaded and sat on _ctxLost=true.
  const h = bootGlx();
  let reloads = 0;
  h.sandbox.location.reload = () => { reloads++; };
  h.sandbox.sessionStorage.getItem = () => { throw new Error("blocked"); };
  h.sandbox.sessionStorage.setItem = () => { throw new Error("blocked"); };
  h.sandbox.__timers.length = 0;
  h.loseContext();
  assert.equal(h.sandbox.__timers.length, 1, "loss still arms a counted reload without storage");
  h.restoreContext();
  assert.ok(reloads >= 1, "webglcontextrestored reloads instead of leaving a dead canvas");
});

test("GLX's third visible context loss says so instead of leaving a silent dead canvas", () => {
  // Two counted reloads per tab, then GLX (nothing beneath it) stopped with
  // no exception, so the error overlay never painted. TLX reports the same
  // cap through __apexReportError; GLX now matches it. Past the budget also
  // opens the Graphics unavailable panel (RETRY / USE WEBGL2).
  for (const prior of ["0", "2"]) {
    const h = bootGlx();
    const reports = [];
    const panels = [];
    h.sandbox.__apexReportError = (where, err) => reports.push([where, err && err.message]);
    h.sandbox.RendererPicker = { showUnavailable: (opts) => panels.push(opts && opts.panel && opts.panel.id) };
    h.sandbox.document.getElementById = (id) => ({ id });
    h.sandbox.sessionStorage.setItem("apex26.ctxLostReloads", prior);
    h.sandbox.__timers.length = 0;
    h.loseContext();
    if (prior === "0") {
      assert.equal(reports.length, 0, "a first loss is a quiet counted reload");
      assert.equal(h.sandbox.__timers.length, 1, "the self-heal reload timer");
      assert.equal(panels.length, 0, "under the budget: no unavailable panel yet");
    } else {
      assert.equal(h.sandbox.__timers.length, 0, "past the cap: no reload loop");
      assert.equal(reports.length, 1, "past the cap the player is told");
      assert.equal(reports[0][0], "gfx");
      assert.match(reports[0][1], /keeps getting lost \(3 times\)/);
      assert.deepEqual(panels, ["nogl"], "past the cap: Graphics unavailable panel");
    }
  }
});

test("TLX aborts program warm on device loss so race-start cannot hang on warming()", () => {
  // compileAsync after a loss often never settles; warming() stuck true made
  // game.js skip present/afterPresent forever (HUD survey hang).
  const src = code("js/render/three/tlx.js");
  assert.match(src, /let _deviceLost = false/);
  assert.match(src, /renderer\.onDeviceLost = function[\s\S]{0,400}?_deviceLost = true/);
  assert.match(src, /_warmRequested = false;\s*_warmPending = null;\s*_warmDone = true/);
  assert.match(src, /warming\(\)\s*\{\s*return !_deviceLost && !!_warmPending/);
  assert.match(src, /ctxLost:\s*!!_deviceLost/);
  assert.match(src, /RendererPicker\.showUnavailable/);
});

test("WGX backendState carries ctxLost, the field game.js gfxContextLost() reads", () => {
  // It exposed only `lost`, so on WebGPU every device-loss fail-fast (loadTrackStepped,
  // render() top, the race-entry handoff card) was blind.
  const src = code("js/render/webgpu/wgx.js");
  assert.match(src, /backendState: \(\) => \(\{[^}]*lost: _lost, ctxLost: !!_lost,/);
});

test("race-start render fail-fasts on backendState.ctxLost (drops handoff)", () => {
  const src = code("js/game.js");
  assert.match(src, /function gfxContextLost\(\)/);
  assert.match(src, /gfxContextLost\(\)[\s\S]{0,250}?loadingScreen\.phase\(\) === "handoff"/);
  assert.match(code("js/perf/race-entry-profile.js"), /handoff:lower-lost/);
  const body = src.slice(src.indexOf("async function startRaceBody()"), src.indexOf("const sessionEntry = SessionEntry.create();"));
  assert.match(body, /loadTrackStepped\(trackIdx, \(\) => !gfxContextLost\(\)\)/,
    "#976 paced load aborts mid-step when the context is already lost");
  assert.match(body, /await yieldMain\(\);[\s\S]{0,80}?if \(gfxContextLost\(\)\)/,
    "fail-closed covers the scheduler.yield gaps between paced startRaceBody legs");
  assert.match(body, /if \(player !== entryPlayer \|\| \(state !== "count" && state !== "race"\)\) return false/,
    "#1085 lights-out during paced entry still counts as reached grid");
});

test("GLX re-reads the canvas box after a viewport change, even when a frame read it too early", () => {
  // THE DEFECT (docs/PERF-FINDINGS.md §2u). cssDirty is edge-triggered and
  // consumed unconditionally, so ONE resize() landing before the canvas box has
  // reflowed caches the OLD box, clears the flag, and nothing ever sets it
  // again: GLX.aspect then reports the PREVIOUS viewport's ratio for the rest
  // of the session. Measured in a browser — a landscape 1.7778 survived a whole
  // portrait session and a hand-called resize() could not shift it, while one
  // synthetic "resize" event fixed it on the next call. It is not cosmetic:
  // aspect feeds the main projection, the FOV cap and the frustum CULL RADIUS.
  //
  // The mock's window.addEventListener is a noop, so markCssDirty is never
  // wired here — which makes this the exact worst case. The only thing that can
  // correct the cache is cssSize() DISTRUSTING it after the viewport moves.
  const h = bootGlx();
  const aspectOf = () => +h.GLX.aspect.toFixed(4);
  const box = (cw, ch) => { h.canvas.clientWidth = cw; h.canvas.clientHeight = ch; };
  const viewport = (w, hh) => { h.sandbox.innerWidth = w; h.sandbox.innerHeight = hh; };

  box(1280, 720); viewport(1280, 720);
  h.GLX.resize();
  assert.equal(aspectOf(), +(1280 / 720).toFixed(4), "baseline landscape");

  // Rotate. The viewport is portrait but the canvas box has NOT reflowed yet,
  // and a frame reads it in that state — the read that used to poison the cache.
  viewport(390, 844);
  h.GLX.resize();

  // Now the box reflows. Nothing dispatches an event, so the dirty flag is
  // still false; only distrust can save this.
  box(390, 844);
  h.GLX.resize();
  assert.equal(aspectOf(), +(390 / 844).toFixed(4),
    "a too-early read must not latch the previous viewport's aspect");
  assert.equal(`${h.GLX.width}x${h.GLX.height}`, "390x844", "and the backing store follows");

  // The distrust must be BOUNDED — the cache exists because clientWidth is a
  // layout read at the top of every frame, and reading it forever would undo
  // the reason it was added. The countdown is in FRAMES (a wall-clock window
  // was tried and measured leaving a rotation stale on a box where one frame
  // takes seconds), so spend it in frames: once exhausted, with the viewport
  // steady, a box change alone is ignored again.
  for (let i = 0; i < 40; i++) h.GLX.resize();   // exhaust the countdown
  box(1000, 500);                                // viewport unchanged: no signal
  h.GLX.resize();
  assert.equal(aspectOf(), +(390 / 844).toFixed(4),
    "once the countdown is spent the cache is still a cache");
});

test("TLX hoists crack fwidth and MAT samples before the detail/live If (WGSL derivative_uniformity)", () => {
  const lit = read("js/render/three/tsl-lit.js");
  const at = lit.indexOf("const cr = abs(vnoise(wp.xz");
  const gate = lit.indexOf("If(matU.detail.greaterThan(0.0)", at);
  assert.ok(at > 0 && gate > at, "fwidth(cr) must be taken before the detail If");
  assert.match(lit.slice(at, gate + 40), /fwidth\(cr\)/);
  const nSamp = lit.indexOf("const nt = matNormalNode.sample(uv)");
  const nAfter = lit.indexOf("If(live.and(fade.greaterThan(0.005))", nSamp);
  assert.ok(nSamp > 0 && nAfter > nSamp, "MAT normal sample must sit before the live/fade If");
  const aSamp = lit.indexOf("const t = matAlbedoNode.sample(uv)");
  const aAfter = lit.indexOf("If(live.and(far.greaterThan(0.001))", aSamp);
  assert.ok(aSamp > 0 && aAfter > aSamp, "MAT albedo sample must sit before the live/far If");
});

test("TLX frame uniforms share one render-group buffer (setGroup loop after the last U member)", () => {
  // A TSL uniform() defaults to objectGroup and three clones non-shared bind
  // groups per render object; the loop moves the whole frame block to
  // renderGroup. It must sit AFTER the last U.* assignment (a member added
  // below it would silently demote camera + U back to per-object clones), and
  // the flag must default ON.
  const lit = read("js/render/three/tsl-lit.js");
  assert.match(lit, /\buniformArray, renderGroup, attribute\b/, "renderGroup is destructured from TSL");
  const last = lit.lastIndexOf("U.lampGeo = uniformArray(lampGeo);");
  const loop = lit.indexOf("if (SHARED_UNIFORMS) for (const k in U) U[k].setGroup(renderGroup);");
  assert.ok(last > 0 && loop > last, "the setGroup loop follows the last U.* assignment");
  assert.ok(lit.indexOf("U.", loop) > 0, "U is still used after the loop (sanity)");
  assert.doesNotMatch(lit.slice(loop, loop + 400), /\bU\.[A-Za-z]+\s*=\s*uniform/, "no U member is assigned after the loop");
  assert.match(lit, /const SHARED_UNIFORMS = !\(ctx && ctx\.sharedUniforms === false\)/, "shared is the default; only an explicit false opts out");
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /apex26\.tlxSharedUniforms/, "the A/B pin is read in tlx.js");
  assert.match(tlx, /sharedUniforms:\s*_sharedUniforms/, "the pin reaches the lit factory ctx");
  // The decal frame block (tsl-fx.js U: sunDir/sunColor/ambSky/ambGround) is
  // the same defect one file over — ~22 decal render objects per frame each
  // carried a copy — under the same pin, so one off-arm covers both.
  const fx = read("js/render/three/tsl-fx.js");
  assert.match(fx, /function fx\(THREE, TSL, opts\)/, "the fx factory takes the options tlx.js already passes");
  assert.match(fx, /\bmrt, renderGroup,/, "renderGroup is destructured from TSL in tsl-fx.js");
  const fxLast = fx.indexOf("ambGround: uniform(");
  const fxLoop = fx.indexOf("if (!(opts && opts.sharedUniforms === false)) for (const k in U) U[k].setGroup(renderGroup);");
  assert.ok(fxLast > 0 && fxLoop > fxLast, "the decal setGroup loop follows the last U member");
  assert.match(tlx, /TLXShaders\.fx\(THREE, TSL, \{ chunks, sharedUniforms: _sharedUniforms, lit \}\)/, "the pin reaches the fx factory too");
});

test("TLX decal cache evicts without Material.dispose (three #33952)", () => {
  const fx = read("js/render/three/tsl-fx.js");
  const start = fx.indexOf("if (decalCache.size >= DECAL_CACHE_CAP)");
  const evict = fx.slice(start, fx.indexOf("m = fxMaterial({ doubleSided: true, key: \"tlx-fx-decal-\"", start));
  assert.match(evict, /decalCache\.delete\(k\)/);
  const code = evict.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /\.dispose\s*\(/);
});

test("TLX decal programs share a material map reference, not the first car's texture node", () => {
  const fx = read("js/render/three/tsl-fx.js");
  assert.match(fx, /materialReference\("map", "texture"\)/);
  assert.match(fx, /m\.map = tex/);
  // One graph PER GLOW VALUE, not one shared graph: a TSL uniform node lives in
  // the shared graph, so a single per-draw uniform would retroactively restyle
  // every decal material already built from it (2026-09 survey, `_decalGraph` in tsl-fx.js).
  // decalCache and the program key are already keyed per glow; the graph now is too.
  assert.match(fx, /const _decalGraph = new Map\(\)/);
  assert.match(fx, /_decalGraph\.get\(glow\)/);
  assert.doesNotMatch(fx, /const smp = texture\(tex\)/,
    "a per-texture node cannot sit behind the shared tlx-fx-decal program key");
});

test("a refused WGX/TLX create does not persist WEBGL2 over the user's pick", () => {
  const game = code("js/game.js");
  assert.match(game, /apex26\.gfxClaimFail/);
  assert.match(game, /armed\s*&&\s*!skipClaim\b/);
  assert.match(game, /const p = backendPreference\(\);\s*backendTried = p === "webgpu" \|\| p === "three"/,
    "claim-fail recovery must include the unset default THREE attempt");
  // The claim-fail reload must READ THE SKIP BACK first: with sessionStorage
  // blocked, removing the probe + reloading replays the claim-and-die boot
  // forever (the probe was the only other escape). And it must reload at most
  // ONCE — a latch already set when the boot started means the previous
  // reload's GLX.init failed too, and reloading again loops forever
  // (measured 236 reloads/64 s under a Vulkan-only browser config).
  const latch = game.search(/if\s*\(\s*!_claimSkipped\s*\)/);
  assert.ok(latch > 0, "the reload is gated on the latch not already being set");
  const latchBody = game.slice(latch, latch + 400);
  assert.match(latchBody, /setItem\(\s*"apex26\.gfxClaimFail"\s*,\s*"1"\s*\)/);
  assert.match(latchBody, /skipped\s*=\s*sessionStorage\.getItem\(\s*"apex26\.gfxClaimFail"\s*\)\s*===\s*"1"/, "the skip is read back before the reload");
  const refused = game.search(/if\s*\(\s*!_claimSkipped\s*\)/);
  assert.ok(refused > 0);
  assert.match(game.slice(refused, refused + 3000), /removeItem\(\s*"apex26\.gfxBackendProbe"\s*\)/, "a refused create disarms the probe");
  assert.doesNotMatch(game, /create\(\)\s*refused[\s\S]{0,250}setItem\(\s*"apex26\.gfxBackend"\s*,\s*"webgl2"\s*\)/);
  // A STORED PICK MUST NOT OUTLIVE ITS FILES. With DEFERRED = {} after the
  // 2026-09-03 spike-out, BACKEND_FILES.three is undefined; the boot armed the
  // probe and then threw inside loadBackendScripts on `files.map`. It was caught
  // and GLX rendered, and the next boot's revert cleared the pick — so it
  // self-healed and no test saw it. The gate below is what stops the throw and
  // the "never presented a frame" warning about a backend that was never
  // fetched. Nothing here executes the boot block, so this is a source pin.
  const bootSrc = code("js/render/renderer-boot.js");
  assert.match(bootSrc, /const group = pref === "three" \? BACKEND_FILES\.three/,
    "the opt-in must resolve its DEFERRED group before arming anything");
  assert.match(bootSrc, /optIn = [^;]*group && group\.length/,
    "optIn must require the group to exist and be non-empty — a pick for files that are gone is not an opt-in");

  const wgx = code("js/render/webgpu/wgx.js");
  assert.match(wgx, /device\.lost[\s\S]{0,600}_wgxEscalate\(/, "device.lost climbs the ladder through _wgxEscalate");
  assert.match(fnBody(wgx, "_wgxEscalate"), /apex26\.gfxClaimFail/, "the last rung surrenders the tab to GLX via the claim-fail latch");
  assert.doesNotMatch(wgx, /device\.lost[\s\S]{0,2200}setItem\(\s*"apex26\.gfxBackend"\s*,\s*"webgl2"\s*\)/);
  assert.match(wgx, /\bWGX_LITE\b/);
  assert.match(wgx, /\bIS_WEBKIT\b/);
  assert.match(wgx, /WGX_LITE\s*&&\s*format\s*===\s*"rgba16float"\s*\)\s*format\s*=\s*"bgra8unorm"/);
  assert.match(wgx, /_sceneProbeOn\s*=\s*!_outProbeOff\s*&&\s*!WGX_LITE\b/);
  // The loss ladder (full → lite → minimal → GLX, persisted in
  // apex26.gfxWgxLevel), the JS strike cap in begin()/present(), the
  // HEAL_SESSIONS step-down, the minimal rung's no-post/no-sky path and the
  // apex26.gfxBound label are all driven on the mock device by
  // tests/unit/webgpu-lifecycle.test.mjs ("device.lost climbs the ladder",
  // "…climbs to minimal", "minimal rung: no post targets…", "a JS throw in
  // begin() strikes out…", "clean sessions heal the ladder") — not repeated
  // here as source text.
  assert.match(wgx, /_allocFail\(\s*"createMesh"/, "lazy mesh creation on the render path degrades to inert, not a throw");
  // createChunkedMesh moved to wgx-chunked.js (GLX-seam peel); it still routes
  // through core.allocFail so a failed upload stays inert, not a throw.
  assert.match(code("js/render/webgpu/wgx-chunked.js"), /allocFail\(\s*"createChunkedMesh"/);
  // allocDrawSlot() returns -1 when the draw ring is full: a chunk must drop
  // its draw, not index the ring at -1 (RangeError mid-frame).
  assert.match(code("js/render/webgpu/wgx-chunked.js"), /if \(slot < 0\) return;/);
  assert.match(code("js/render/webgpu/wgx-chunked.js"), /if \(cslot < 0\) break;/);
  // A hand re-pick of WEBGPU resets the ladder so the player can retry full:
  // BEHAVIOUR through the picker.
  const a = bootPicker({
    ls: { "apex26.gfxBackend": "three", "apex26.gfxWgxLevel": "2", "apex26.gfxWgxLite": "1", "apex26.gfxWgxFail": "device lost", "apex26.gfxWgxOk": "3" },
    ss: { "apex26.gfxClaimFail": "1" },
    gpu: {},
  });
  const sel = a.byId["pm-renderer"];
  sel.value = "webgpu";
  sel.dispatchEvent("change");
  assert.equal(a.ls.getItem("apex26.gfxBackend"), "webgpu");
  for (const k of ["apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxFail", "apex26.gfxWgxOk"]) {
    assert.equal(a.ls.getItem(k), null, `${k} must be cleared by a hand re-pick of WEBGPU`);
  }
  assert.equal(a.ss.getItem("apex26.gfxClaimFail"), null, "the session skip is cleared too");
});

test("RENDERER label names the live backend when WEBGPU fell back to GLX", () => {
  // BEHAVIOUR: the pick stays WEBGPU, the label says what actually paints.
  const a = bootPicker({ ls: { "apex26.gfxBackend": "webgpu" }, ss: { "apex26.gfxBound": "webgl2" }, gpu: {} });
  const sel = a.byId["pm-renderer"];
  assert.equal(sel.value, "webgpu", "the preference is still the player's pick");
  assert.equal(sel.options[2].textContent, "WEBGPU (WEBGL2)", "the live backend is named beside it");
  assert.equal(sel.options[0].textContent, "WEBGL2", "only the fallen-back pick carries the suffix");
  const b = bootPicker({ ls: { "apex26.gfxBackend": "webgpu" }, gpu: {} });
  assert.equal(b.byId["pm-renderer"].options[2].textContent, "WEBGPU", "no fallback, no suffix");
  assert.ok(a.winListeners.includes("apex-gfx-live"), "the label repaints when the backend announces itself");
});

test("TLX HDR accepts iOS half-float and a refused create records why", () => {
  const post = read("js/render/three/tlx-post.js");
  assert.match(post, /EXT_color_buffer_half_float/);
  assert.match(post, /EXT_color_buffer_float/);
  assert.doesNotMatch(post, /keep hdr=true \(WebGPU is always half-float\)/);
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /apex26\.gfxTlxFail/);
  assert.doesNotMatch(tlx, /isMobile\s*&&\s*!post\.hdrOk\(\s*\)/,
    "GLX keeps the 8-bit post chain when half-float is missing; TLX must too");
  assert.match(tlx, /TLX: present failed/);
  assert.match(tlx, /MeshBasicMaterial/);
  assert.match(tlx, /apex26\.gfxClaimFail/);
  // The third context loss in a tab surrenders to GLX (TLX has a floor below
  // it, unlike GLX) instead of freezing on the last frame with the label lying.
  assert.match(tlx, /context lost x/);
  const present = tlx.indexOf("present(opts) {");
  const presentEnd = tlx.indexOf("// debug — the __tlx tooling", present);
  const body = tlx.slice(present, presentEnd);
  assert.ok(present > 0 && presentEnd > present, "present() body found");
  assert.doesNotMatch(body, /post = null;\s*renderer\.setRenderTarget\(null\);\s*renderer\.render/);
  assert.match(read("js/render/three/tlx-shadow.js"), /TLX: shadow pass failed/);
});

test("TLX AO and god-ray blurs cannot share a node-program cache key", () => {
  const post = read("js/render/three/tsl-post.js");
  assert.match(post, /const blurAO = makeBlur\("tlx-post-blur-ao"\)/);
  assert.match(post, /const blurGR = makeBlur\("tlx-post-blur-godray"\)/);
  assert.doesNotMatch(post, /const blur(?:AO|GR) = makeBlur\(\)/,
    "same-shaped node materials still carry distinct texture-node bindings");
});

test("TLX material-map ownership keeps placeholders and reports pack state", () => {
  // Placeholders are always bound so nodes stay complete; materialMapState must
  // key off owned pack textures, and unload must dispose those without killing
  // the placeholders (GLX deleteTexture parity).
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /matPlaceAlbedo/);
  assert.match(tlx, /matOwnedAlbedo/);
  assert.match(tlx, /albedo: !!matOwnedAlbedo/);
  assert.doesNotMatch(tlx, /albedo: !!\(matMaps && matMaps\.albedo\)/);
  assert.match(tlx, /t\.dispose\(\)/);
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /_matOwnedAlbedo/);
  assert.match(wgx, /matPlaceAlbedoView/);
  assert.match(wgx, /_releaseOwnedMatMaps/);
});

test("nextBackend / prevBackend wrap both ways around webgl2 → three → webgpu", () => {
  const src = read("js/perf/renderer-picker.js");
  const ctx = vm.createContext({ window: {}, document: undefined, localStorage: undefined });
  seedLog(ctx);
  seedStore(ctx);
  vm.runInContext(src, ctx, { filename: "js/perf/renderer-picker.js" });
  const G = vm.runInContext("RendererPicker", ctx);
  assert.equal(G.nextBackend("webgl2"), "three");
  assert.equal(G.nextBackend("three"), "webgpu");
  assert.equal(G.nextBackend("webgpu"), "webgl2");
  assert.equal(G.prevBackend("webgl2"), "webgpu");
  assert.equal(G.prevBackend("webgpu"), "three");
  assert.equal(G.prevBackend("three"), "webgl2");
  assert.equal(G.backendLabel("three"), "THREE.JS");
  assert.equal(G.backendLabel("webgpu"), "WEBGPU");
});

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

test("RESET RENDERER is injected next to #pm-renderer, not written into the shell", () => {
  // The injection itself (a <button> created inside #pm-display-adv,
  // labelled RESET RENDERER) is driven below in "RESET RENDERER click wipes
  // storage, disarms the sentinel, and reloads"; this pins only that the
  // shell does not carry a static copy of the recovery row or its submenu.
  assert.doesNotMatch(read("index.html"), /id="pm-renderer-reset"/);
  assert.match(read("index.html"), /id="pm-display-adv"/,
    "RENDERER fold is in the shell; RESET still injects into its body");
});

test("clearRendererStorage drops backend crash flags and leaves GRAPHICS quality", () => {
  const src = read("js/perf/renderer-picker.js");
  const ls = makeStorage({
    "apex26.gfxBackend": "three",
    "apex26.gfxBackendProbe": "three",
    "apex26.gfxWgxLevel": "2",
    "apex26.gfxWgxLite": "1",
    "apex26.gfxWgxOk": "0",
    "apex26.gfxWgxFail": "device lost",
    "apex26.gfxTlxFail": "present failed",
    "apex26.envProbeOff": "1",
    "apex26.perChunkOff": "1",
    "apex26.tlxForceGL": "0",
    "apex26.tlxEnvProbe": "1",
    "apex26.tlxViz": "lit",
    "apex26.wgxCapture": "1",
    "apex26.gfxHigh": "1",
    "apex26.uiScale": "110",
  });
  const ss = makeStorage({
    "apex26.gfxClaimFail": "1",
    "apex26.gfxBound": "webgl2",
    "apex26.ctxLostReloads": "2",
    "apex26.wgxCapture": "0",
    "apex26.tlxAutoGL": "1",
  });
  const ctx = vm.createContext({ window: {}, document: undefined, localStorage: ls, sessionStorage: ss });
  seedLog(ctx);
  seedStore(ctx);
  vm.runInContext(src, ctx, { filename: "js/perf/renderer-picker.js" });
  const G = vm.runInContext("RendererPicker", ctx);
  // Frozen deepEqual, not spot includes(): a round-6 audit found 7 of 12 keys
  // unasserted — a new crash latch omitted from the list would fail nothing
  // and then survive RESET RENDERER. Adding a key now REQUIRES updating this
  // frozen copy and saying what the key holds. apex26.gfxHigh stays out on
  // purpose: GRAPHICS quality is a player pref, not renderer crash state.
  assert.deepEqual(Array.from(G.RENDERER_LS_KEYS), [   // Array.from: vm arrays are another realm's Array
    "apex26.gfxBackend", "apex26.gfxBackendProbe",
    "apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.gfxWgxFail",
    "apex26.gfxTlxFail",
    // The boot canary's latch. gfxProbeStrikes counts loads that died before
    // presenting a frame — one is a memory kill, two retires the pick. A RESET
    // that left a strike behind would hand the next boot a strike it did not
    // earn, and retire the pick on its first real failure. (There is no
    // "remember the retired pick" key: apex26.gfxBackendWas was listed here
    // and in renderer-picker.js long after its only writer left game.js, which
    // is what the WRITER check below now catches.)
    "apex26.gfxProbeStrikes",
    "apex26.envProbeOff", "apex26.perChunkOff",
    "apex26.tlxForceGL", "apex26.tlxEnvProbe", "apex26.tlxViz",
    "apex26.wgxCapture",
  ]);
  assert.deepEqual(Array.from(G.RENDERER_SS_KEYS), [
    "apex26.gfxClaimFail", "apex26.gfxBound", "apex26.ctxLostReloads",
    "apex26.wgxCapture", "apex26.tlxAutoGL", "apex26.wgxHoldPresent",
  ]);
  assert.ok(!G.RENDERER_LS_KEYS.includes("apex26.gfxHigh"), "GRAPHICS quality is not renderer state");

  // MECHANISM, not just the frozen copy: every apex26.* latch a BACKEND writes
  // must be resettable. The deepEqual above catches someone editing the list;
  // it cannot catch someone adding a setItem in js/render/ and never touching
  // renderer-picker.js — which is how apex26.wgxHoldPresent shipped able to
  // survive RESET RENDERER and keep a tab skipping the soft-present copy+map
  // for good. Read-only pins (debug switches the game never writes) are not
  // latches and stay out.
  const READ_ONLY_PINS = new Set([
    "apex26.gfxWgxAllowSoftware", "apex26.glErrDrain", "apex26.instCellCache",
    "apex26.forceMobileTier", "apex26.tlxForceHw", "apex26.tlxForceBatches",
    "apex26.tlxArrayNearest", "apex26.tlxMirrorSweep", "apex26.tlxChunkRelease",
    "apex26.tlxMobile", "apex26.gfxHigh", "apex26.matTexMix",
    // UPSCALE is a SETTINGS display preference (scale.js / __apex.spatialUpscale),
    // not crash state — RESET RENDERER must not wipe the player's SGSR choice.
    // spatialUpscaleGather is an A/B escape pin (tools/bench only writes "0").
    "apex26.spatialUpscale", "apex26.spatialUpscaleGather",
  ]);
  // LANE-AWARE: clearRendererStorage removes each list from ITS OWN store, so a
  // key written to localStorage but listed only in RENDERER_SS_KEYS would pass
  // a merged check and never be cleared. Computed keys (`setItem(_rk, …)`) are
  // invisible to the literal regex and are named here so a new one is noticed.
  const lsResettable = new Set(G.RENDERER_LS_KEYS), ssResettable = new Set(G.RENDERER_SS_KEYS);
  const COMPUTED_OK = new Set(["_rk", "rk", "PROBE_KEY", "STRIKE_KEY"]);   // apex26.ctxLostReloads via a local (glx.js, tlx.js) — in RENDERER_SS_KEYS
  const written = new Set();   // "ls:key" / "ss:key"
  const renderDir = path.join(ROOT, "js/render");
  const stack = [renderDir];
  while (stack.length) {
    for (const e of fs.readdirSync(stack.pop(), { withFileTypes: true })) {
      const abs = path.join(e.parentPath || e.path, e.name);
      if (e.isDirectory()) { stack.push(abs); continue; }
      if (!e.name.endsWith(".js")) continue;
      const src = fs.readFileSync(abs, "utf8");
      for (const m of src.matchAll(/(local|session)Storage\.setItem\(\s*"(apex26\.[A-Za-z0-9_]+)"/g)) {
        written.add((m[1] === "local" ? "ls:" : "ss:") + m[2]);
      }
      for (const m of src.matchAll(/(?:local|session)Storage\.setItem\(\s*([A-Za-z_$][\w$]*)\s*,/g)) {
        assert.ok(COMPUTED_OK.has(m[1]), `${path.relative(ROOT, abs)}: setItem with a computed key "${m[1]}" — name it in COMPUTED_OK and make sure the key it holds is resettable`);
      }
    }
  }
  const unresettable = [...written].filter((k) => {
    const [lane, key] = [k.slice(0, 2), k.slice(3)];
    if (READ_ONLY_PINS.has(key)) return false;
    return lane === "ls" ? !lsResettable.has(key) : !ssResettable.has(key);
  }).sort();
  assert.deepEqual(unresettable, [],
    "these backend-written latches survive RESET RENDERER — add them to RENDERER_LS_KEYS/SS_KEYS (renderer-picker.js) or, if they are read-only debug pins, to READ_ONLY_PINS here");

  // CONVERSE MECHANISM: every key RENDERER_LS_KEYS promises to clear must be
  // WRITTEN somewhere under js/. Without this direction a key whose only
  // writer is deleted stays on the list for good, and its comment keeps
  // describing behaviour the game no longer has — exactly how
  // apex26.gfxBackendWas ("remembers the retired pick so it can be offered
  // back") outlived the game.js write that created it. The scan is js/-wide,
  // not js/render/: gfxBackend and gfxProbeStrikes are written by the boot
  // canary in game.js, and tlxForceGL/wgxCapture by the picker itself.
  const wroteSomewhere = new Set();
  const jsStack = [path.join(ROOT, "js")];
  while (jsStack.length) {
    for (const e of fs.readdirSync(jsStack.pop(), { withFileTypes: true })) {
      const abs = path.join(e.parentPath || e.path, e.name);
      if (e.isDirectory()) { jsStack.push(abs); continue; }
      if (!e.name.endsWith(".js")) continue;
      const src = fs.readFileSync(abs, "utf8");
      // Direct: localStorage.setItem("apex26.x", …) / GameStore.store.rawSet("apex26.x", …)
      for (const m of src.matchAll(/(?:(?:local|session)Storage\.setItem|rawSet)\(\s*"(apex26\.[A-Za-z0-9_]+)"/g)) wroteSomewhere.add(m[1]);
      // Via a named constant in the same file: `const K = "apex26.x"` + `setItem(K, …)`.
      for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*"(apex26\.[A-Za-z0-9_]+)"/g)) {
        if (new RegExp(`(?:setItem|rawSet)\\(\\s*${m[1]}\\s*,`).test(src)) wroteSomewhere.add(m[2]);
      }
    }
  }
  // Dev pins a human sets by hand (or via ?viz=) and the game only reads.
  // RESET RENDERER still has to clear them — that is the way back out.
  const HAND_SET_ONLY = new Set(["apex26.tlxViz"]);
  const neverWritten = Array.from(G.RENDERER_LS_KEYS)
    .filter((k) => !wroteSomewhere.has(k) && !HAND_SET_ONLY.has(k)).sort();
  assert.deepEqual(neverWritten, [],
    "RENDERER_LS_KEYS names keys nothing under js/ writes — delete them (and the comment describing what they hold) or, if a human sets them by hand, name them in HAND_SET_ONLY here");

  const removed = G.clearRendererStorage();
  assert.ok(removed.includes("apex26.gfxBackend"));
  assert.equal(ls.getItem("apex26.gfxBackend"), null);
  assert.equal(ls.getItem("apex26.gfxBackendProbe"), null);
  assert.equal(ls.getItem("apex26.gfxWgxLevel"), null);
  assert.equal(ls.getItem("apex26.gfxTlxFail"), null);
  assert.equal(ls.getItem("apex26.envProbeOff"), null);
  assert.equal(ls.getItem("apex26.perChunkOff"), null);
  assert.equal(ls.getItem("apex26.tlxForceGL"), null);
  assert.equal(ls.getItem("apex26.tlxEnvProbe"), null);
  assert.equal(ls.getItem("apex26.tlxViz"), null);
  assert.equal(ls.getItem("apex26.wgxCapture"), null);
  assert.equal(ss.getItem("apex26.wgxCapture"), null);
  assert.equal(ls.getItem("apex26.gfxHigh"), "1", "mobile GRAPHICS: ULTRA bit must survive");
  assert.equal(ls.getItem("apex26.uiScale"), "110", "unrelated settings must survive");
  assert.equal(ss.getItem("apex26.gfxClaimFail"), null);
  assert.equal(ss.getItem("apex26.gfxBound"), null);
  assert.equal(ss.getItem("apex26.ctxLostReloads"), null);
  assert.equal(ss.getItem("apex26.tlxAutoGL"), null);
  assert.equal(G.readBackend(), "three");
});

test("applyBackend clears session renderer latches before reload", () => {
  // Switching WEBGL2 ↔ THREE ↔ WEBGPU must not inherit wgxHoldPresent /
  // tlxAutoGL from the previous path; RESET already wiped them, a pick did not.
  const src = read("js/perf/renderer-picker.js");
  const fn = span(src, "function applyBackend(", "function rendererSlot(", "applyBackend");
  assert.match(fn, /for \(const k of RENDERER_SS_KEYS\) sessionStorage\.removeItem\(k\)/,
    "applyBackend must clear every RENDERER_SS_KEYS latch, not only gfxBound");
  assert.doesNotMatch(fn, /clearRendererStorage\(\)/,
    "must not wipe LS backend prefs — that would delete the pick just written");
});

test("THREE PATH and SCREENSHOTS clear session renderer latches on reload", () => {
  const src = read("js/perf/renderer-picker.js");
  const three = span(src, "function applyThreePath(", "function readShotMode(", "applyThreePath");
  assert.match(three, /for \(const k of RENDERER_SS_KEYS\) sessionStorage\.removeItem\(k\)/,
    "THREE PATH reload must wipe the same session latches as applyBackend");
  const shot = span(src, "function applyShotMode(", "function presentStatus(", "applyShotMode");
  assert.match(shot, /for \(const k of RENDERER_SS_KEYS\) sessionStorage\.removeItem\(k\)/,
    "SCREENSHOTS reload must drop inherited hold/claim latches before writeShotMode");
});

test("blocked sessionStorage skips the opt-in so this tab never claims the canvas", () => {
  const game = code("js/game.js");
  const boot = game.slice(game.search(/let\s+skipClaim\s*=\s*false/), game.search(/const\s+PROBE_KEY\b/));
  assert.match(boot, /catch\s*\(\s*_?\w*\s*\)\s*\{\s*(?:skipClaim|_claimSkipped)\s*=\s*(?:(?:skipClaim|_claimSkipped)\s*=\s*)?true\b/,
    "a storage throw sets the skip (and the latch that the GLX.init failure path reads)");
  assert.doesNotMatch(boot, /try the opt-in as usual/);
});

test("RESET RENDERER click wipes storage, disarms the sentinel, and reloads", () => {
  const src = read("js/perf/renderer-picker.js");
  const ls = makeStorage({ "apex26.gfxBackend": "webgpu", "apex26.gfxHigh": "0" });
  const ss = makeStorage({ "apex26.gfxClaimFail": "1" });
  const kids = [];
  const resetHost = {
    insertBefore(node, _ref) { kids.push(node); node.parentNode = resetHost; return node; },
    replaceChild(node, old) {
      const i = kids.indexOf(old);
      if (i >= 0) kids[i] = node;
      else kids.push(node);
      node.parentNode = resetHost;
      if (old) old.parentNode = null;
      return old;
    },
  };
  const rendererBtn = { id: "pm-renderer", parentNode: resetHost, nextSibling: null };
  rendererBtn.replaceWith = (next) => { resetHost.replaceChild(next, rendererBtn); };
  const gfxBtn = { id: "pm-gfx", textContent: "", hidden: true, onclick: null, parentNode: resetHost };
  const byId = { "pm-renderer": rendererBtn, "pm-gfx": gfxBtn };
  let reloaded = 0;
  let sentinel = true;
  const timers = [];
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: (tag) => {
        const kids = [];
        const el = {
          tagName: tag, id: "", textContent: "", title: "", onclick: null, children: kids,
          appendChild(c) { kids.push(c); c.parentNode = this; return c; },
          setAttribute() {},
        };
        Object.defineProperty(el, "id", {
          get() { return this._id || ""; },
          set(v) { this._id = v; byId[v] = this; },
        });
        return el;
      },
      readyState: "complete",
      addEventListener() {},
    },
    localStorage: ls,
    sessionStorage: ss,
    location: { reload() { reloaded += 1; } },
    setTimeout: (fn) => { timers.push(fn); return 1; },
    PerfGov: { setUserTier() {}, sentinelArm(on) { sentinel = !!on; } },
    GameStore: { store: { get() { return null; }, set() {} } },
    GLX: { isMobile: true },
    // This inline context has no opts; the backends-present world is what this
    // test is about (RESET RENDERER semantics), so state it directly.
    ApexRoster: { DEFERRED: { webgpu: ["w"], three: ["t"] } },
  });
  seedLog(ctx);
  seedStore(ctx);
  vm.runInContext(src, ctx, { filename: "js/perf/renderer-picker.js" });
  const G = vm.runInContext("RendererPicker", ctx);
  G.init();
  const btn = byId["pm-renderer-reset"];
  assert.ok(btn, "reset button was injected");
  assert.equal(btn.textContent, "RESET RENDERER");
  assert.ok(byId["pm-display-adv"], "ADVANCED disclosure was injected on the host");
  assert.ok(kids.includes(byId["pm-display-adv"]), "ADVANCED sits on the DISPLAY host, after the picker row");
  assert.equal(btn.parentNode && btn.parentNode.id, "pm-display-adv-body");
  btn.onclick();
  assert.equal(ls.getItem("apex26.gfxBackend"), null);
  assert.equal(ss.getItem("apex26.gfxClaimFail"), null);
  assert.equal(ls.getItem("apex26.gfxHigh"), "0");
  assert.equal(sentinel, false, "settings reload must not count as a crash strike");
  assert.match(btn.textContent, /RELOADING/);
  assert.equal(reloaded, 0);
  timers.forEach((fn) => fn());
  assert.equal(reloaded, 1);
});

test("GLX pins the per-chunk uploadLightSet revert (arity 3)", () => {
  // Arity 3 is the DECISION, not an oversight: the 6-arg tail-light forwarding
  // was reverted pending a crash repro (see the decision record above
  // uploadLightSet in glx.js core). This canary used to pin the 6-arg form —
  // it was added with the fix and survived the revert being lost in the
  // build-1496 squash merge. Re-land the forwarding WITH a repro, and flip
  // this regex in the same commit. (The lost-context no-ops of draw() and
  // present() are behaviour in "GLX create* / draw* fail closed" above.)
  const glx = code("js/render/glx/glx.js");
  assert.match(glx, /uploadLightSet:\s*\(\s*L\s*,\s*idx\s*,\s*n\s*\)\s*=>\s*uploadLightSet\(\s*L\s*,\s*idx\s*,\s*n\s*\)/);
});

test("the GPU-census gate scopes hardware expectations, and only those", () => {
  // Two checks are hardware-only ON PURPOSE: a software image may legitimately
  // fail to bring a backend up, and failing the job for that is noise. The rest
  // must stay unconditional — a real GPU error, a run that did not finish, or a
  // missing artifact is a defect on ANY image. Driven by EXECUTING the Verdict
  // script against fixtures (verdictScript / runVerdict below), so the split
  // cannot quietly spread. docs/PERF-FINDINGS.md 2f.
  const script = verdictScript();
  const hw = { anyHardware: true, runs: [] }, sw = { anyHardware: false, runs: [] };
  const legs = (over = {}) => ({ webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx: wgxLegJson(), ...over });
  // Hardware-only: a missing gpuErrors count, a failed gfx read, a software adapter.
  let r = runVerdict(script, { census: hw, legs: legs({ webgl2: tlxLegJson({ gpuErrors: null }) }) });
  assert.equal(r.code, 1, `hardware + no gpuErrors count must fail:\n${r.out}`);
  r = runVerdict(script, { census: sw, legs: legs({ webgl2: tlxLegJson({ gpuErrors: null }) }) });
  assert.equal(r.code, 0, `software + no gpuErrors count is noise, not a failure:\n${r.out}`);
  r = runVerdict(script, { census: hw, legs: legs({ glx: { ...glxLegJson(), gfxReadFailed: "boom" } }) });
  assert.equal(r.code, 1, "hardware + gfxReadFailed must fail");
  r = runVerdict(script, { census: sw, legs: legs({ glx: { ...glxLegJson(), gfxReadFailed: "boom" } }) });
  assert.equal(r.code, 0, "software + gfxReadFailed passes");
  r = runVerdict(script, { census: hw, legs: legs({ webgpu: tlxLegJson({ backendState: { api: "webgpu", softAdapter: true, headless: false } }) }) });
  assert.equal(r.code, 1, "a software adapter on a hardware image is the defect the census exists to catch");
  r = runVerdict(script, { census: sw, legs: legs({ webgpu: tlxLegJson({ backendState: { api: "webgpu", softAdapter: true, headless: false } }) }) });
  assert.equal(r.code, 0, "a software adapter on a software image is expected");
  // …and these must NOT be scoped, or the gate stops gating.
  for (const census of [hw, sw]) {
    r = runVerdict(script, { census, legs: legs({ glx: { ...glxLegJson(), ok: false, phase: "boot" } }) });
    assert.equal(r.code, 1, "a run that did not finish must fail on every image");
    r = runVerdict(script, { census, legs: legs({ glx: glxLegJson({ gpuErrors: 3, gpuFirstError: "INVALID_OPERATION" }) }) });
    assert.equal(r.code, 1, "a real GPU error must fail on every image");
    const missing = legs(); delete missing.glx;
    r = runVerdict(script, { census, legs: missing });
    assert.equal(r.code, 1, "a missing leg artifact must fail on every image");
  }
  // The reason a leg is empty must always be PRINTED, even where it is not
  // blocking — that is the whole point of 2f.
  r = runVerdict(script, { census: sw, legs: legs({ webgpu: { ...tlxLegJson(), error: "launch failed", gfx: undefined } }) });
  assert.match(r.out, /launch failed/, "a leg's error is printed even when it does not block");
  const wf = read(".github/workflows/gpu-census.yml");
  assert.match(wf, /rows\.push\(\s*`\$\{" "\.repeat\(8\)\}gfx:/);
});

test("GLX exports a real gpuErrors counter and the workflow fails on a missing one", () => {
  // The real-GPU gate checked `(gfx.gpuErrors || 0) > 0` while ONLY WGX defined
  // gpuErrors, so on the GLX leg it read null and passed vacuously from the day
  // that leg was added (PERF-FINDINGS 2e). Both halves are pinned: the GLX
  // counter as BEHAVIOUR on the mock, the Verdict's null handling by executing
  // it (above), plus the banned `|| 0` shape as a lint.
  const h = bootGlx();
  assert.equal(h.GLX.gpuErrors(), 0);
  assert.equal(h.GLX.gpuFirstError(), null);
  let pending = [1282, 1281];   // INVALID_OPERATION, INVALID_VALUE
  h.answers.getError = () => (pending.length ? pending.shift() : 0);
  h.GLX.begin(h.frame());
  assert.equal(h.GLX.gpuErrors(), 0, "the counter is drained at present(), not mid-frame");
  h.GLX.present({});
  assert.equal(h.GLX.gpuErrors(), 2, "every queued GL error is counted once per present");
  assert.ok(h.GLX.gpuFirstError(), "the first error is kept for the report");
  h.GLX.begin(h.frame()); h.GLX.present({});
  assert.equal(h.GLX.gpuErrors(), 2, "a clean present adds nothing");
  const wf = read(".github/workflows/gpu-census.yml");
  assert.doesNotMatch(wf, /if\s*\(\s*\(\s*gfx\.gpuErrors\s*\|\|\s*0\s*\)\s*>\s*0\s*\)/,
    "the || 0 form treats an absent counter as zero — that was the bug");
});

// The Verdict step is a `node -e` script embedded in YAML, so nothing ever ran
// it — every guard on it was a regex over its SOURCE. That is how three
// vacuous clauses lived in it at once. Lift the real script out and execute it
// against fixtures, so the tests below are about behaviour, not spelling.
function verdictScript() {
  const wf = read(".github/workflows/gpu-census.yml");
  const at = wf.indexOf("Verdict — fail the job on what the game reported");
  assert.ok(at > 0, "the Verdict step is gone from gpu-census.yml");
  const open = wf.indexOf("node -e '", at);
  assert.ok(open > at, "the Verdict step no longer runs an inline node script");
  const lines = wf.slice(wf.indexOf("\n", open) + 1).split("\n");
  const end = lines.findIndex((l) => l.trim() === "'");
  assert.ok(end > 0, "could not find the end of the inline script");
  const body = lines.slice(0, end).join("\n");
  // A silent empty extraction would make every case below pass vacuously —
  // the exact failure this whole round is about. Refuse to hand one back.
  assert.ok(body.length > 2000, `extracted only ${body.length} chars of Verdict script`);
  assert.match(body, /const bad = \[\];/, "extracted text is not the Verdict script");
  return body;
}

// Fixtures shaped like what tools/gfx/gpu-game-check.mjs actually writes: it reads
// backendState/envState ONLY when g.__tlx exists (gpu-game-check.mjs 205-207),
// so the GLX leg legitimately carries neither.
const tlxLegJson = (gfxOver = {}) => ({
  phase: "done", ok: true,
  gfx: {
    glx: true, gpuErrors: 0, gpuFirstError: null,
    backendState: { api: "webgpu", softAdapter: false, headless: false },
    envState: { on: true, face: 6, ready: true, blank: false, fail: 0, failMsg: "", gaveUp: false },
    ...gfxOver,
  },
  frame: { meanLuma: 0.4 },
});
const glxLegJson = (gfxOver = {}) => ({
  phase: "done", ok: true,
  gfx: { glx: true, gpuErrors: 0, gpuFirstError: null, ...gfxOver },
  frame: { meanLuma: 0.4 },
});
// The native WGX leg (2026-09-02): gpu-game-check reports wgx (GLX.softPresent
// exists — WGX bound), wgxSoftPresent and headlessUa; no TLX env/backend state.
const wgxLegJson = (gfxOver = {}) => ({
  phase: "done", ok: true,
  gfx: { glx: true, gpuErrors: 0, gpuFirstError: null, wgx: true, wgxSoftPresent: true, headlessUa: true, ...gfxOver },
  frame: { meanLuma: 0.4 },
});

function runVerdict(script, { census, legs }) {
  const image = "macos-latest";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-verdict-"));
  try {
    if (census !== undefined) fs.writeFileSync(path.join(dir, `census-${image}.json`), JSON.stringify(census));
    for (const [leg, json] of Object.entries(legs)) {
      fs.writeFileSync(path.join(dir, `game-${leg}-${image}.json`), JSON.stringify(json));
    }
    const r = spawnSync(process.execPath, ["-e", script], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, IMAGE: image, GITHUB_STEP_SUMMARY: path.join(dir, "summary.md") },
    });
    return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("gpu-game-check reports appearance, and can say when it could not measure it", () => {
  // The census printed `meanLuma=n/a` on EVERY leg of every image because this
  // tool never wrote out.frame — the string "frame" did not appear in the file
  // at all. The gate does not block on appearance (a brightness floor goes
  // flaky and then gets widened, which AGENTS.md forbids), but "reported for a
  // human" was untrue: there was nothing to report. Both halves are pinned,
  // because writing the field WITHOUT the absence path just recreates a
  // silently-empty column. docs/PERF-FINDINGS.md 2l.
  const ggc = read("tools/gfx/gpu-game-check.mjs");
  assert.match(ggc, /out\.frame = n\s*\?/, "the tool must write out.frame");
  assert.match(ggc, /meanLuma: \+\(sum \/ n\)\.toFixed\(1\)/);
  assert.match(ggc, /out\.frameReadFailed = /,
    "an appearance read that failed must be NAMED, not left as an empty column");
  assert.match(ggc, /await import\("sharp"\)/,
    "sharp is loaded dynamically so a missing binary degrades to frameReadFailed");

  const wf = read(".github/workflows/gpu-census.yml");
  assert.match(wf, /if \(g\.frameReadFailed\) rows\.push/,
    "the Verdict must print WHY appearance is missing, like the gfx:/ovl: rows");
});

test("gpu-game-check's finally can actually reach the console buffer", () => {
  // `const console_ = []` was declared INSIDE the try while the finally read
  // it — sibling scopes, so the finally threw ReferenceError on EVERY run,
  // success or failure. Everything after that line was dead: out.console (the
  // diagnostic lines a previous round moved into the finally precisely so a
  // FAILING run would keep them), out.root (added to name the Windows path bug
  // — never once set on a real run), the bounded browser/server teardown, and
  // the final process.exit, so the tool always exited non-zero even on ok:true.
  // `continue-on-error: true` on all four census steps swallowed the exit code
  // and checkpoint() had already written the JSON, so nothing looked wrong.
  // Measured after the fix: exit 0, root set, 7 console lines. PERF-FINDINGS 2l.
  const ggc = read("tools/gfx/gpu-game-check.mjs");
  const decl = ggc.indexOf("const console_ = [];");
  const tryAt = ggc.indexOf("\ntry {");
  const useAt = ggc.indexOf("out.console = console_");
  assert.ok(decl > -1, "the console buffer declaration is gone");
  assert.ok(tryAt > -1 && useAt > -1);
  assert.ok(decl < tryAt,
    "console_ must be declared ABOVE the try, or the finally cannot see it " +
    `(decl at ${decl}, try at ${tryAt})`);
  assert.ok(useAt > tryAt, "sanity: the read really is inside/after the try");
  // A declaration at column 0 is top-level; an indented one is inside a block.
  assert.match(ggc, /\nconst console_ = \[\];/,
    "console_ must be a TOP-LEVEL declaration, not indented inside the try");
});

test("the GPU gate passes a hardware run whose GLX leg reports no env probe", () => {
  // THE FALSE-FAILURE CASE. Making an absent env count fail on hardware is
  // right for the two TLX legs and wrong for GLX, which has no env probe to
  // report at all — an unscoped absence check would have failed macOS forever
  // for a leg behaving exactly as designed. This is the counter-test that
  // keeps the fix below honest; without it "fail on absence" looks free.
  const r = runVerdict(verdictScript(), {
    census: { anyHardware: true, runs: [] },
    legs: { webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx: wgxLegJson() },
  });
  assert.equal(r.code, 0, `a healthy hardware run must pass:\n${r.out}`);
});

test("the GPU gate fails a census that measured nothing instead of calling it software", () => {
  // anyHardware was `runs.some(...)`, so four failed launches produced false —
  // and false is what switches OFF the hardware-only clauses. A census that
  // measured nothing therefore DOWNGRADED this gate to a software gate and
  // reported success. Tri-state; null must fail. docs/PERF-FINDINGS.md 2j.
  const script = verdictScript();
  const legs = { webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx: wgxLegJson() };

  const nulled = runVerdict(script, { census: { anyHardware: null, runs: [] }, legs });
  assert.equal(nulled.code, 1, `a null census must fail the job:\n${nulled.out}`);
  assert.match(nulled.out, /measured NOTHING/);

  const missing = runVerdict(script, { census: undefined, legs });
  assert.equal(missing.code, 1, `an unreadable census must fail the job:\n${missing.out}`);

  // …and a census that really did measure a software image still passes, or
  // the fix has just made every software run red.
  const soft = runVerdict(script, {
    census: { anyHardware: false, runs: [] },
    legs: { webgpu: tlxLegJson({ envState: undefined, gpuErrors: null }), webgl2: tlxLegJson(), glx: glxLegJson({ gpuErrors: null }), wgx: wgxLegJson({ wgx: false, gpuErrors: null }) },
  });
  assert.equal(soft.code, 0, `a measured software image must still pass:\n${soft.out}`);
});

test("the GPU gate holds the native WGX leg to bind + swapchain, but only a HEADED run to the swapchain", () => {
  // Run 19 (2026-09-02, macos-latest) was the first census that ran WGX at all:
  // bound, 0 GPU errors, the brightest leg — and soft-presenting, because WGX
  // sniffs a HeadlessChrome UA as software by design. That is expected on a
  // headless runner and a regression on a headed one; a fallback to GLX is a
  // regression on any hardware run.
  const script = verdictScript();
  const hw = { anyHardware: true, runs: [] }, sw = { anyHardware: false, runs: [] };
  const legs = (wgx) => ({ webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson(), wgx });
  let r = runVerdict(script, { census: hw, legs: legs(wgxLegJson()) });
  assert.equal(r.code, 0, `headless hardware + soft-present is the documented shape:\n${r.out}`);
  assert.match(r.out, /expected: WGX blits under a headless UA by design/);
  r = runVerdict(script, { census: hw, legs: legs(wgxLegJson({ headlessUa: false })) });
  assert.equal(r.code, 1, "HEADED hardware + soft-present must fail");
  assert.match(r.out, /WGX is soft-presenting/);
  r = runVerdict(script, { census: hw, legs: legs(wgxLegJson({ headlessUa: false, wgxSoftPresent: false })) });
  assert.equal(r.code, 0, `headed hardware on the swapchain passes:\n${r.out}`);
  r = runVerdict(script, { census: hw, legs: legs(wgxLegJson({ wgx: false })) });
  assert.equal(r.code, 1, "hardware + WGX not bound must fail");
  assert.match(r.out, /WGX did not bind/);
  r = runVerdict(script, { census: sw, legs: legs(wgxLegJson({ wgx: false, gpuErrors: null })) });
  assert.equal(r.code, 0, `a software image that cannot bring WGX up is noise:\n${r.out}`);
  r = runVerdict(script, { census: hw, legs: { webgpu: tlxLegJson(), webgl2: tlxLegJson(), glx: glxLegJson() } });
  assert.equal(r.code, 1, "a missing wgx artifact must fail like any other missing leg");
});

test("the GPU gate fails a hardware TLX leg that stopped reporting an env count", () => {
  // `(env.fail || 0) > 0` was the SAME banned shape as the gpuErrors fix twelve
  // lines above it in the same file, on the same object: a build that stops
  // exporting envState().fail read as clean. Scoped to the TLX legs, which are
  // `--backend three` by construction and must bring an env probe with them —
  // so a TLX leg that fell back to GLX fails here too, which is the point.
  const script = verdictScript();
  const gone = runVerdict(script, {
    census: { anyHardware: true, runs: [] },
    legs: { webgpu: tlxLegJson({ envState: undefined }), webgl2: tlxLegJson(), glx: glxLegJson() },
  });
  assert.equal(gone.code, 1, `a TLX leg with no env count must fail on hardware:\n${gone.out}`);
  assert.match(gone.out, /webgpu: NO env-probe fail count/);

  // The count itself still gates, on every image.
  const failed = runVerdict(script, {
    census: { anyHardware: true, runs: [] },
    legs: { webgpu: tlxLegJson({ envState: { fail: 81, failMsg: "boom", gaveUp: false } }), webgl2: tlxLegJson(), glx: glxLegJson() },
  });
  assert.equal(failed.code, 1);
  assert.match(failed.out, /81 env-probe faces FAILED/);

  // Both banned shapes pinned out of the source, so neither can return quietly.
  const wf = read(".github/workflows/gpu-census.yml");
  assert.doesNotMatch(wf, /if \(\(env\.fail \|\| 0\) > 0\)/,
    "the || 0 form treats an absent env counter as zero — that was the bug");
  assert.doesNotMatch(wf, /const hardware = !!\(census && census\.anyHardware\);/,
    "coercing anyHardware collapses 'measured no hardware' into 'measured nothing'");
  assert.match(wf, /census\.anyHardware === true/);
});

test("the instancing gate is declared through the cache, never bracketed per draw", () => {
  // uInstanced was 54.8 uniform1f/frame for a value that changes 3.1 times: the
  // 1/0 bracket around each instanced draw alternates, so a redundancy cache
  // collapses none of it (PERF-FINDINGS 2e). litMaterial declares the kind
  // instead — BEHAVIOUR: consecutive draws of one kind upload nothing.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mesh = h.GLX.createMesh(tri);
  const batch = h.GLX.createInstancedBatch(tri, new Float32Array(32), null, null);
  const model = new Float32Array(16); model[0] = model[5] = model[10] = model[15] = 1;
  const instUploads = () => h.calls.filter((c) => c[0] === "uniform1f" && c[1][0].name === "uInstanced").map((c) => c[1][1]);
  h.GLX.begin(h.frame());
  h.reset();
  h.GLX.draw(mesh, model, {}); h.GLX.draw(mesh, model, {});
  h.GLX.drawInstanced(batch, {}); h.GLX.drawInstanced(batch, {}); h.GLX.drawInstanced(batch, {});
  h.GLX.draw(mesh, model, {});
  assert.deepEqual(instUploads(), [0, 1, 0], "one upload per KIND transition — never a 1/0 bracket per instanced draw");
  assert.equal(h.count("useProgram"), 0, "the lit program stays bound across the run — no rebind per draw");
  // Source lints that the behaviour above cannot see: a raw write beside the
  // cache would desync it, and a lit draw bound outside litMaterial would skip
  // the declaration.
  const glx = code("js/render/glx/glx.js");
  assert.doesNotMatch(glx, /gl\.uniform1f\(\s*litU\.uInstanced/, "uInstanced must go through uf1, not a raw uniform1f");
  const binds = glx.match(/useProg\(\s*litProg\s*\)/g) || [];
  assert.equal(binds.length, 2, "a new useProg(litProg) site must also declare uInstanced — see PERF-FINDINGS 2e");
});

test("uModel goes through the redundancy cache, not a raw upload", () => {
  // PERF-FINDINGS 2h: uModel was 103.2 uploads/frame for 50.3 distinct values,
  // because drawChunked calls litMaterial once per chunk RUN and every run of
  // one mesh shares that mesh's matrix. BEHAVIOUR: an equal matrix skips.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mesh = h.GLX.createMesh(tri);
  const model = new Float32Array(16); model[0] = model[5] = model[10] = model[15] = 1;
  const uploads = () => h.count("uniformMatrix4fv", (a) => a[0].name === "uModel");
  h.GLX.begin(h.frame());
  h.reset();
  h.GLX.draw(mesh, model, {}); h.GLX.draw(mesh, model, {}); h.GLX.draw(mesh, model, {});
  assert.equal(uploads(), 1, "three draws of one matrix upload it once");
  // The cache must COPY. Callers hand in scratch matrices they mutate in place
  // (game.js _wheelWorld/_ringWorld, DebrisWorld _mat); retaining the reference
  // would compare a value against itself and silently skip a real change —
  // a wrong TRANSFORM, which no call counter would catch.
  h.reset();
  model[12] = 5; h.GLX.draw(mesh, model, {});
  model[12] = 9; h.GLX.draw(mesh, model, {});
  assert.equal(uploads(), 2, "the same array mutated in place re-uploads every time it changes");
  h.reset();
  h.GLX.draw(mesh, new Float32Array(model), {});
  assert.equal(uploads(), 0, "an equal COPY is a hit — the cache compares values, not references");
  assert.doesNotMatch(code("js/render/glx/glx.js"), /gl\.uniformMatrix4fv\(\s*litU\.uModel/,
    "uModel must go through ufM4, not a raw uniformMatrix4fv");
});

test("updateInstances clears the cull snapshots it did not produce", () => {
  // cullInstances memoises on _cullPlanes (the frustum that physically wrote the
  // resident bytes) and _cellKeyN (the surviving cell set), and a hit SKIPS the
  // re-upload. updateInstances writes bytes produced by no frustum at all, so
  // leaving either snapshot standing lets a later cullInstances hit its cache
  // and draw this pack as though it were that frustum's. PERF-FINDINGS 2h.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mats = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1]);
  const batch = h.GLX.createInstancedBatch(tri, mats, null, { cellSize: 50 });
  const planes = (d) => Array.from({ length: 6 }, () => [0, 0, 0, d]);
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  assert.equal(h.count("bufferSubData"), 1, "a fresh frustum packs and uploads");
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  assert.equal(h.count("bufferSubData"), 0, "the same frustum is a hit: no re-upload");
  // Now hand the batch a caller-packed set (the debris pools' path)…
  h.reset();
  assert.equal(h.GLX.updateInstances(batch, new Float32Array(32), 1), 1);
  assert.equal(batch.visible, 1);
  assert.equal(h.count("bufferSubData", (a) => a[4] === 16), 1, "one instance (16 floats) is uploaded");
  assert.equal(batch._cullPlanes, null, "updateInstances must invalidate the frustum snapshot");
  assert.equal(batch._cellKeyN, -1, "updateInstances must invalidate the cell-set snapshot");
  // …so the next cull with the OLD frustum cannot claim the resident bytes.
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  assert.equal(h.count("bufferSubData"), 1, "the frustum re-packs over the caller's bytes instead of hitting a stale cache");
  assert.equal(typeof h.GLX.updateInstances, "function", "updateInstances is exported");
});

test("GLX shadow cull upload:false leaves the camera pack and cache alone", () => {
  // Same class WGX pinned in 2026-09-02: a light-frustum cull that wrote ibo
  // forced the camera cull to miss every shadow recentre. upload:false packs
  // into shadowIbo and must not touch _cullPlanes / _cellKeyN / ibo.
  const h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const mats = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1]);
  const batch = h.GLX.createInstancedBatch(tri, mats, null, { cellSize: 50 });
  const planes = (d) => Array.from({ length: 6 }, () => [0, 0, 0, d]);
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  const camPlanes = batch._cullPlanes;
  const camN = batch._cullN;
  const camKeyN = batch._cellKeyN;
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6), { upload: false }), 2);
  assert.ok(batch.shadowIbo, "shadow path allocates its own instance buffer");
  assert.equal(batch._shadowN, 2);
  assert.equal(batch._cullPlanes, camPlanes, "camera frustum snapshot untouched");
  assert.equal(batch._cullN, camN);
  assert.equal(batch._cellKeyN, camKeyN, "camera cell-set cache untouched");
  assert.equal(h.count("bufferSubData"), 1, "one upload — to shadowIbo, not a second stomping of ibo");
  h.reset();
  assert.equal(h.GLX.cullInstances(batch, planes(1e6)), 2);
  assert.equal(h.count("bufferSubData"), 0, "camera cull still hits after a shadow cull");
});

test("the debris pools instance behind a capability read, with the loop as fallback", () => {
  // Four per-body loops reaching 98 draws at desktop caps — and 17 every frame
  // of every lap from cones alone, which have no liveness test (PERF-FINDINGS
  // 2h). GLX ships updateInstances; WGX and TLX have not been ported and MUST
  // keep the per-body path rather than silently drawing nothing.
  const dw = code("js/physics/debris-world.js");
  assert.match(dw, /gfx\.updateInstances\(/);
  assert.match(dw, /gfx\.drawInstanced\(/);
  assert.match(dw, /!gfx\.createInstancedBatch\s*\|\|\s*!gfx\.updateInstances\s*\|\|\s*!gfx\.drawInstanced/,
    "the capability read must test every method the instanced path calls");
  assert.match(dw, /for\s*\(\s*const\s+\w+\s+of\s+list\s*\)\s*if\s*\(\s*!liveOnly\s*\|\|\s*\w+\.live\s*\)\s*drawBody\(/,
    "the per-body fallback must survive for backends without updateInstances");
  // Both paths must build a pose the same way, or a backend switch moves debris.
  assert.equal((dw.match(/function\s+packBody\s*\(/g) || []).length, 1);
  assert.match(fnBody(dw, "drawBody"), /packBody\(/, "drawBody must share packBody, not carry a second copy of the quaternion maths");
});

test("the interleaved uLight[] lanes agree between glx.js and shaders/lit.js", () => {
  // ONE uniform4fv per chunk instead of four (PERF-FINDINGS 2d) only works if
  // both halves agree on the stride-16 lane order. A swapped lane keeps the GL
  // CALL COUNTS byte-identical and the render statistically indistinguishable
  // on a coarse metric — it moves or recolours lamp pools, which no counter
  // and no unit test would catch. This is the guard for that.
  const glx = code("js/render/glx/glx.js");
  const lit = code("js/render/glx/shaders/glsl-lit.js");

  // The four arrays must be GONE from both halves, or a stale reader survives.
  for (const n of ["uLightA", "uLightB", "uLightC", "uLightD"]) {
    assert.doesNotMatch(glx, new RegExp(n), `glx.js still references ${n}`);
    assert.doesNotMatch(lit, new RegExp(n), `lit.js still references ${n}`);
  }

  // Shader side: one array, 4 vec4s per light, read at li+0..3 off i*4.
  assert.match(lit, /uniform\s+vec4\s+uLight\s*\[\s*MAX_LIGHTS\s*\*\s*4\s*\]\s*;/);
  assert.match(lit, /int\s+li\s*=\s*i\s*\*\s*4\s*;/);
  assert.match(lit, /vec4\s+la\s*=\s*uLight\[\s*li\s*\]\s*,\s*lb\s*=\s*uLight\[\s*li\s*\+\s*1\s*\]\s*,\s*lc\s*=\s*uLight\[\s*li\s*\+\s*2\s*\]\s*;/);
  assert.match(lit, /smoothstep\(\s*uLight\[\s*li\s*\+\s*3\s*\]\.x\s*,/);

  // JS side: BEHAVIOUR. One stride-15 light record through begin() lands in
  // the uniform4fv payload at exactly the lanes the shader reads:
  //   +0 la = pos.xyz | radius   +1 lb = rgb | bleed
  //   +2 lc = aim.xyz | cosInner +3 x = cosOuter
  const h = bootGlx();
  const rec = [1, 2, 3, /*rgb*/ 4, 5, 6, /*radius*/ 7, /*aim*/ 8, 9, 10, /*cosInner*/ 11, /*cosOuter*/ 12, /*bleed*/ 13, 14, 15];
  h.GLX.begin(h.frame({ lights: rec }));
  const ups = h.calls.filter((c) => c[0] === "uniform4fv" && c[1][0].name === "uLight[0]");
  assert.equal(ups.length, 1, "expected exactly one uLight upload per begin()");
  const [, L4, off, len] = ups[0][1];
  assert.equal(off, 0);
  assert.equal(len, 16, "sized in whole lights: nL * 16 floats");
  assert.deepEqual(Array.from(L4.subarray(0, 16)), [1, 2, 3, 7, 4, 5, 6, 13, 8, 9, 10, 11, 12, 0, 0, 0],
    "lane +0 pos|radius, +1 rgb|bleed, +2 aim|cosInner, +3 cosOuter|pad");
  assert.equal(h.count("uniform1i", (a) => a[0].name === "uNumLights" && a[1] === 1), 1, "the count is uploaded once for one light");
  h.reset();
  h.GLX.begin(h.frame({ lights: rec.concat(rec) }));
  const two = h.calls.find((c) => c[0] === "uniform4fv" && c[1][0].name === "uLight[0]");
  assert.equal(two[1][3], 32, "two lights → 32 floats");
});

test("WGX sky ports GLX overcast grey-shift, horizon bank, and azimuthal variation", () => {
  const sky = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(sky, /nightLid/);
  assert.match(sky, /greyZ/);
  assert.match(sky, /bankThresh/);
  assert.match(sky, /atan2\(dir\.z,\s*dir\.x\)/);
  console.log("[gfx-canary] checking WGX sky night-corona gate: wgsl-chunks.js");
  assert.match(sky, /if \(nightSky < 0\.5\)/,
    "night corona/disc must skip (GLX SKY_FS) — do not mul-to-zero");
  assert.doesNotMatch(sky, /Deliberately reduced vs GLX SKY_FS/);
});

test("TLX sky gates night corona and the day-band atan like GLX", () => {
  console.log("[gfx-canary] checking TLX sky night-corona + day-band gate: tsl-sky.js");
  const sky = read("js/render/three/tsl-sky.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sky, /If\(nightSky\.lessThan\(0\.5\)/,
    "night corona/disc must skip (GLX SKY_FS) — do not mul-to-zero");
  assert.match(sky, /If\(daytime\.greaterThan\(0\.0\)/,
    "day-band atan+vnoise must skip when daytime is 0");
  console.log("[gfx-canary] TLX sky gates: OK");
});

test("TLX shadow cull packs CPU-side without uploading the lit InstancedMesh", () => {
  console.log("[gfx-canary] checking TLX shadow cull upload:false: tlx.js");
  const tlx = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  // fnBody, never a fixed window. cullInstances is ~1560 chars in tlx.js and
  // the slice(at, at + 3600) this replaces read 2000 chars PAST its closing
  // brace, so an assertion here could pass on code in a different function
  // entirely. The under-reading half of the same bug took the deploy branch
  // red on 2026-09-02 (tests/helpers/fn-source.mjs has the write-up).
  const body = fnBody(tlx, "cullInstances");
  assert.match(body, /opts && opts\.upload === false/,
    "shadow path must be able to skip the lit imesh setMatrixAt walk");
  console.log("[gfx-canary] checking TLX shadow cull upload:false call site: js/render/shared/shadow-pass.js");
  const game = read("js/render/shared/shadow-pass.js");   // the shadow passes left game.js
  // The call site passes a hoisted constant (the literal was rebuilt per prop
  // batch per shadow rebuild), so pin BOTH halves — the call passes the const,
  // and the const is still {upload:false}. Matching only the name would let the
  // value drift to true and this guard would never notice.
  assert.match(game, /cullInstances\([^)]*planes,\s*CULL_NO_UPLOAD\)/,
    "sun/lamp prop-shadow must pass the no-upload cull opts");
  assert.match(game, /const CULL_NO_UPLOAD = \{ upload: false \};/,
    "…and those opts must still be upload:false");
  console.log("[gfx-canary] TLX shadow cull upload:false: OK");
});

test("WGX phone post targets use the slim GLX-equivalent formats", () => {
  const wgx = read("js/render/webgpu/wgx.js");
  const post = read("js/render/webgpu/wgx-post.js");
  assert.match(wgx, /SSAO_FORMAT\s*=\s*"r8unorm"/);
  assert.match(wgx, /POST_HDR_FORMAT\s*=\s*"rg11b10ufloat"/);
  // Blur pipelines live in wgx-post.js after the GLX-seam peel; they use an
  // explicit dynamic-offset layout (not fsPipe) so H/V passes do not share one
  // writeBuffer slot before submit.
  assert.match(post, /pBlurHDR\s*=\s*blurPipe\((?:core\.)?POST_HDR_FORMAT\)/);
  assert.match(post, /pBlur\s*=\s*blurPipe\((?:core\.)?SSAO_FORMAT\)/);
});

test("TLX present() records gfxBound when a fallback still paints", () => {
  const tlx = read("js/render/three/tlx.js");
  const persist = tlx.slice(tlx.indexOf("const persistFail"), tlx.indexOf("const paintCanvas"));
  assert.match(persist, /apex26\.gfxBound/);
});

function makePickerDom(byId, hostKids) {
  const makeEl = (tag) => {
    const kids = [];
    const el = {
      tagName: String(tag).toUpperCase(),
      textContent: "",
      title: "",
      type: "",
      value: "",
      hidden: false,
      onclick: null,
      parentNode: null,
      nextSibling: null,
      children: kids,
      options: String(tag).toUpperCase() === "SELECT" ? kids : undefined,
      _listeners: {},
      setAttribute() {},
      appendChild(c) { kids.push(c); c.parentNode = this; return c; },
      addEventListener(type, fn) {
        (this._listeners[type] || (this._listeners[type] = [])).push(fn);
      },
      dispatchEvent(type) {
        const list = this._listeners[type] || [];
        for (let i = 0; i < list.length; i++) list[i]();
      },
      replaceWith(node) {
        const host = this.parentNode;
        if (host && host.children) {
          const i = host.children.indexOf(this);
          if (i >= 0) host.children[i] = node;
        }
        node.parentNode = host;
        node.nextSibling = this.nextSibling;
        if (this._id && byId[this._id] === this) delete byId[this._id];
      },
    };
    Object.defineProperty(el, "id", {
      get() { return this._id || ""; },
      set(v) {
        if (this._id && byId[this._id] === this) delete byId[this._id];
        this._id = v;
        if (v) byId[v] = this;
      },
    });
    return el;
  };
  const host = {
    children: hostKids,
    insertBefore(node, ref) {
      const i = ref ? hostKids.indexOf(ref) : -1;
      if (i >= 0) hostKids.splice(i, 0, node);
      else hostKids.push(node);
      node.parentNode = host;
      return node;
    },
    replaceChild(node, old) {
      const i = hostKids.indexOf(old);
      if (i >= 0) hostKids[i] = node;
      node.parentNode = host;
      return old;
    },
  };
  const btn = makeEl("button");
  btn.id = "pm-renderer";
  btn.parentNode = host;
  hostKids.push(btn);
  return { host, btn, makeEl };
}

function bootPicker(opts) {
  const src = read("js/perf/renderer-picker.js");
  const ls = makeStorage(opts.ls || {});
  const ss = makeStorage(opts.ss || {});
  const hostKids = [];
  const byId = {};
  const { makeEl } = makePickerDom(byId, hostKids);
  const gfxBtn = makeEl("button");
  gfxBtn.id = "pm-gfx";
  gfxBtn.hidden = true;
  let reloaded = 0;
  const timers = [];
  const winListeners = [];
  const ctx = vm.createContext({
    window: { addEventListener(type) { winListeners.push(type); } },
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: makeEl,
      readyState: "complete",
      addEventListener() {},
    },
    localStorage: ls,
    sessionStorage: ss,
    location: { reload() { reloaded += 1; } },
    setTimeout: (fn) => { timers.push(fn); return 1; },
    navigator: { gpu: opts.gpu || undefined },
    PerfGov: { setUserTier() {}, sentinelArm() {} },
    GameStore: { store: { get() { return null; }, set() {} } },
    GLX: opts.glx || { isMobile: true },
    // The picker asks the roster whether a backend's files are in the tree, so
    // a stop whose files are gone can say UNAVAILABLE rather than write a pref
    // boot would ignore. These tests are about picker SEMANTICS, so the default
    // is the backends-present world they were written for; pass `deferred: {}`
    // to exercise the spiked-out one.
    ApexRoster: { DEFERRED: opts.deferred !== undefined ? opts.deferred
      : { webgpu: ["js/render/webgpu/wgx.js"], three: ["js/render/three/tlx.js"] } },
  });
  seedLog(ctx);
  seedStore(ctx);
  vm.runInContext(src, ctx, { filename: "js/perf/renderer-picker.js" });
  const G = vm.runInContext("RendererPicker", ctx);
  // readyState is "complete", so the IIFE already called init().
  return { G, ls, ss, byId, hostKids, reloaded: () => reloaded, timers, winListeners };
}

test("WGX/TLX-only DISPLAY controls are not injected when their files are gone", () => {
  // THREE PATH and SCREENSHOTS steer the three.js GPU path and the soft-present
  // blit — nothing GLX can use. Shipping them inert is worse than not shipping
  // them: they read as controls that do nothing. SAVE SCREENSHOT and COPY DIAG
  // must survive, though: SAVE SCREENSHOT waits on awaitSoftPresent, prefers
  // #game-soft when the overlay exists, then falls through to #game.toDataURL,
  // and COPY DIAG is the phone bug-report path.
  const gone = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" }, deferred: {} });
  assert.equal(gone.byId["pm-three-path"], undefined, "THREE PATH is WGX/TLX-only");
  assert.equal(gone.byId["pm-screenshots"], undefined, "SCREENSHOTS is WGX/TLX-only");
  assert.ok(gone.byId["pm-save-shot"], "SAVE SCREENSHOT works on GLX and must stay");
  assert.ok(gone.byId["pm-copy-diag"], "COPY DIAG is backend-agnostic and must stay");

  // ...and they come back with the backends, with no code change.
  const back = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" } });
  assert.ok(back.byId["pm-three-path"], "re-attaching the backends restores the control");
  assert.ok(back.byId["pm-screenshots"]);
});

test("a stop whose files left the tree says UNAVAILABLE instead of writing the pref", () => {
  // The spiked-out world: DEFERRED is {} (tools/manifest.cjs), so neither
  // alternate can bind. The header's rule is that a stop stays VISIBLE and
  // names itself unavailable — the same affordance a phone without
  // navigator.gpu already got — rather than persisting a pick that boot
  // silently ignores. Derived from the roster, so the stops come back on their
  // own if the backends are ever re-attached.
  const a = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" }, gpu: {}, deferred: {} });
  const sel = a.byId["pm-renderer"];
  assert.equal(sel.options.length, 3, "the stop is still SHOWN — hiding it is what the header argues against");
  sel.value = "three";
  sel.dispatchEvent("change");
  assert.equal(a.ls.getItem("apex26.gfxBackend"), "webgl2", "the dead pick is not persisted");
  assert.match(sel.options[1].textContent, /UNAVAILABLE/, "and the stop says why");
});

test("a STORED pick whose files left the tree is labelled (WEBGL2), not left claiming the backend", () => {
  // The case the UNAVAILABLE test above does NOT cover: the pick was already in
  // localStorage before the spike-out. Anyone who tried the stops is in it.
  //
  // The "(WEBGL2)" suffix exists for exactly this, but it was gated on
  // sessionStorage apex26.gfxBound — and the ONLY writers of that key were
  // wgx.js and tlx.js, which left with the backends. Nothing in the shipped
  // tree has written it since, so boundIsGlx() is permanently false and the
  // label read a flat "THREE.JS" while GLX drew every frame. `available()` is
  // the signal gfxBound used to be.
  for (const stale of ["three", "webgpu"]) {
    const a = bootPicker({ ls: { "apex26.gfxBackend": stale }, gpu: {}, deferred: {} });
    const sel = a.byId["pm-renderer"];
    const label = sel.options.find((o) => o.value === stale).textContent;
    assert.match(label, /\(WEBGL2\)/, `a stored ${stale} pick painted no fallback marker`);
    assert.equal(a.ls.getItem("apex26.gfxBackend"), stale,
      "the stored pick must SURVIVE — it is what a re-attach restores");
  }
  // With the backends present the marker must NOT appear: gfxBound is unset and
  // the pick is genuinely bindable, so nothing has fallen back.
  const ok = bootPicker({ ls: { "apex26.gfxBackend": "three" }, gpu: {} });
  const okSel = ok.byId["pm-renderer"];
  assert.doesNotMatch(okSel.options.find((o) => o.value === "three").textContent, /\(WEBGL2\)/);
});

test("the metrics panel reports what is DRAWING, not what is stored", () => {
  // js/perf/metrics-overlay.js reads this for its `backend` line. It called
  // readBackend(), the PICK, and so agreed with the picker's lie — the one
  // panel someone would open to check whether the switch worked.
  const gone = bootPicker({ ls: { "apex26.gfxBackend": "three" }, gpu: {}, deferred: {} });
  assert.equal(gone.G.liveBackend(), "webgl2");
  assert.equal(gone.G.readBackend(), "three", "readBackend stays the PICK — the select's value");

  const back = bootPicker({ ls: { "apex26.gfxBackend": "three" }, gpu: {} });
  assert.equal(back.G.liveBackend(), "three", "a bindable pick is what is drawing");

  const stale = bootPicker({
    ls: { "apex26.gfxBackend": "three" },
    ss: { "apex26.gfxBound": "webgl2" },
    gpu: {},
  });
  assert.equal(stale.G.liveBackend(), "webgl2", "the successful GLX bind overrides a still-bindable THREE pick");

  const tlx = bootPicker({
    ls: { "apex26.gfxBackend": "webgpu" },
    gpu: {},
    glx: { __tlx: { backendState: () => ({ api: "webgl2" }) } },
  });
  assert.equal(tlx.G.liveBackend(), "three", "the TLX seam overrides a mismatched stored pick");
  assert.equal(tlx.byId["pm-renderer"].options[2].textContent, "WEBGPU (THREE.JS)",
    "the picker names the renderer actually bound beside the stored pick");
});

test("boot and picker normalize invalid renderer preferences to WEBGL2", () => {
  const stored = fnBody(code("js/render/renderer-boot.js"), "storedBackendPreference");
  assert.match(stored, /pref === "webgl2"/);
  assert.match(stored, /pref === "three"/);
  assert.match(stored, /pref === "webgpu"/);
  assert.match(stored, /localStorage\.setItem\(\s*"apex26\.gfxBackend"\s*,\s*"webgl2"\s*\)/,
    "boot must scrub invalid persisted values instead of carrying raw garbage");

  const picker = bootPicker({ ls: { "apex26.gfxBackend": "garbage" }, gpu: {} });
  assert.equal(picker.G.readBackend(), "webgl2");
  assert.equal(picker.ls.getItem("apex26.gfxBackend"), "webgl2",
    "SETTINGS must persist the same normalized preference boot consumes");
});

test("diagnostics use Three as the unset default and report the live bind", () => {
  const apex = code("js/agent/apex.js");
  const diag = apex.slice(apex.indexOf("backend: safe("), apex.indexOf("mobile:", apex.indexOf("backend: safe(")));
  assert.match(diag, /RendererPicker\.liveBackend\(\)/,
    "__apex.diag must share the picker/metrics live-backend source");
  assert.match(diag, /raw\s*==\s*null\s*\?\s*"three"/, "unset diagnostic preference is the product default");
  assert.doesNotMatch(diag, /raw\s*==\s*null\s*\?\s*"webgl2"/);

  const overlay = code("js/perf/gfx-debug-overlay.js");
  const picks = fnBody(overlay, "picks");
  assert.match(picks, /RendererPicker\.liveBackend\(\)/,
    "gfx-debug must print the actual bind, not only the stored pick and latch");
  assert.match(picks, /"three \(default\)"/);
  assert.doesNotMatch(picks, /"webgl2 \(default\)"/);
});

test("terminal graphics failure hides interactive game UI and offers recovery controls", () => {
  const game = code("js/game.js");
  const unavailable = fnBody(game, "showGraphicsUnavailable");
  const recovery = fnBody(code("js/perf/renderer-picker.js"), "showUnavailable");
  assert.match(unavailable, /RendererPicker\.showUnavailable/);
  assert.match(unavailable, /hud:\s*els\.hud/);
  assert.match(unavailable, /overlay:\s*els\.overlay/);
  assert.match(unavailable, /ensureDataHub/);
  assert.match(recovery, /Graphics unavailable/);
  assert.match(recovery, /USE WEBGL2/);
  assert.match(recovery, /COPY DIAGNOSTICS/);
  assert.match(recovery, /location\.reload\(\)/);
  assert.match(recovery, /get\.call\(document, "loading"\)/,
    "the fallback drops #loading so the recovery panel is not under a busy plate");
  assert.match(recovery, /get\.call\(document, "race-settings"\)/,
    "and closes the settings dialog that would otherwise sit in the top layer");
  const recoveryCss = code("css/overlays.css");
  assert.match(recoveryCss, /#nogl \[data-gfx-recovery-actions\] button[^}]*min-height:\s*var\(--tap\)/);
  assert.match(recoveryCss, /@media\s*\(max-width:\s*480px\)[^{]*\{[^}]*data-gfx-recovery-actions[^}]*grid-template-columns:\s*1fr/);
  assert.match(game, /showGraphicsUnavailable\(\);\s*return/);
});

test("terminal graphics recovery works before the late menu wiring", async () => {
  const src = read("js/game.js");
  const from = src.indexOf("function showGraphicsUnavailable()");
  const to = src.indexOf("async function start()", from);
  assert.ok(from >= 0 && to > from, "early graphics-recovery block found");

  function element(tag, id) {
    const listeners = {};
    return {
      tagName: tag.toUpperCase(), id: id || "", hidden: true, inert: false, open: false,
      disabled: false, children: [], style: {}, attributes: {}, textContent: "", value: "",
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
      async click() {
        let result;
        if (this.onclick) result = this.onclick();
        for (const fn of (listeners.click || [])) fn({ target: this });
        return result;
      },
      dispatch(type, event) { for (const fn of (listeners[type] || [])) fn(event || {}); },
      focus() { this.focused = true; },
      showModal() { this.open = true; },
      close() { this.open = false; },
      select() { this.selected = true; },
      remove() { this.removed = true; },
    };
  }
  const byId = {
    nogl: element("div", "nogl"),
    loading: element("div", "loading"),
    "race-settings": element("dialog", "race-settings"),
    "htp-close": element("button", "htp-close"),
    "dh-close-btn": element("button", "dh-close-btn"),
  };
  byId.loading.hidden = false;
  byId["race-settings"].hidden = false;
  const helpDialog = element("dialog", "howtoplay");
  const dataDialog = element("dialog", "datahub");
  const hud = element("div", "hud"), overlay = element("div", "overlay");
  const body = element("body", "body");
  const stored = new Map(), session = new Map([
    ["apex26.gfxClaimFail", "1"], ["apex26.gfxBound", "three"]
  ]);
  let reloads = 0, copied = "", dataLoads = 0, dataOpens = 0;
  const storage = (map) => ({
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  });
  const document = {
    body, readyState: "loading",
    createElement: tag => element(tag),
    getElementById: id => byId[id] || null,
    execCommand: () => true,
    addEventListener() {},
  };
  const ctx = vm.createContext({
    document,
    localStorage: storage(stored), sessionStorage: storage(session),
    navigator: { gpu: {}, clipboard: { async writeText(text) { copied = text; } } },
    window: { isSecureContext: true },
    WebGL2RenderingContext: function () {},
    location: { reload() { reloads++; } },
    queueMicrotask,
    $: id => byId[id] || null,
    els: { hud, overlay, howtoplay: helpDialog, datahub: dataDialog },
    async ensureDataHub() {
      dataLoads++;
      byId["dh-close-btn"].onclick = () => { dataDialog.hidden = true; };
      return true;
    },
    DataHub: { open() { dataOpens++; dataDialog.hidden = false; } },
  });
  seedClipboard(ctx);
  vm.runInContext(read("js/perf/renderer-picker.js"), ctx, { filename: "js/perf/renderer-picker.js" });
  ctx.RendererPicker = vm.runInContext("RendererPicker", ctx);
  vm.runInContext(src.slice(from, to) + "\nglobalThis.__showGraphicsUnavailable = showGraphicsUnavailable;", ctx);
  ctx.__showGraphicsUnavailable();

  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  const controls = descendants(byId.nogl).filter(node => node.tagName === "BUTTON");
  const button = text => controls.find(node => node.textContent === text);
  assert.deepEqual(controls.map(node => node.textContent),
    ["RETRY", "USE WEBGL2", "COPY DIAGNOSTICS", "HELP", "DATA HUB"]);
  assert.equal(byId.nogl.hidden, false);
  assert.equal(byId.loading.hidden, true, "busy plate is down before the fallback");
  assert.equal(byId["race-settings"].hidden, true, "settings dialog is closed so it cannot cover #nogl");
  assert.equal(hud.hidden, true); assert.equal(hud.inert, true);
  assert.equal(overlay.hidden, true); assert.equal(overlay.inert, true);
  assert.equal(button("RETRY").focused, true, "keyboard focus starts on the primary recovery action");

  await button("COPY DIAGNOSTICS").click();
  const diagnostic = JSON.parse(copied);
  assert.deepEqual(Object.keys(diagnostic), ["renderer", "browser"]);
  assert.deepEqual(diagnostic.renderer, { stored: null, requested: "three" });
  assert.deepEqual(diagnostic.browser, { webgl2API: true, webgpuAPI: true });
  assert.doesNotMatch(copied, /userAgent|language|platform|location/i,
    "the recovery payload is capability/preference only");

  await button("HELP").click();
  assert.equal(helpDialog.hidden, false); assert.equal(helpDialog.open, true);
  await byId["htp-close"].click(); await Promise.resolve();
  assert.equal(helpDialog.hidden, true); assert.equal(helpDialog.open, false);
  await button("HELP").click();
  let prevented = false;
  helpDialog.dispatch("cancel", { preventDefault() { prevented = true; } });
  await Promise.resolve();
  assert.equal(prevented, true); assert.equal(helpDialog.open, false, "Escape closes early help");

  await button("DATA HUB").click();
  assert.equal(dataLoads, 1); assert.equal(dataOpens, 1);
  assert.equal(dataDialog.hidden, false); assert.equal(dataDialog.open, true);
  await byId["dh-close-btn"].click(); await Promise.resolve();
  assert.equal(dataDialog.hidden, true); assert.equal(dataDialog.open, false);

  await button("USE WEBGL2").click();
  assert.equal(stored.get("apex26.gfxBackend"), "webgl2");
  assert.equal(session.has("apex26.gfxClaimFail"), false);
  assert.equal(session.has("apex26.gfxBound"), false);
  assert.equal(reloads, 1);
  await button("RETRY").click();
  assert.equal(reloads, 2);
});

test("RENDERER control becomes a select with prev/next, not a one-way cycle", () => {
  const { byId, hostKids } = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" } });
  const sel = byId["pm-renderer"];
  assert.equal(sel.tagName, "SELECT");
  assert.equal(sel.value, "webgl2");
  assert.equal(sel.options.length, 3);
  assert.equal(sel.options[0].value, "webgl2");
  assert.equal(sel.options[1].value, "three");
  assert.equal(sel.options[2].value, "webgpu");
  assert.ok(byId["pm-renderer-prev"], "‹ steps backward");
  assert.ok(byId["pm-renderer-next"], "› steps forward");
  // A setting row (css .set-row): label, then the ‹ select › cluster.
  assert.equal(byId["pm-renderer-row"].children.length, 2);
  assert.equal(byId["pm-renderer-row"].children[1].children.length, 3);
  assert.ok(byId["pm-display-adv"], "ADVANCED disclosure is JS-built");
  assert.ok(byId["pm-display-adv-body"]);
  assert.ok(byId["pm-renderer-reset"]);
  assert.equal(byId["pm-renderer-reset"].parentNode && byId["pm-renderer-reset"].parentNode.id, "pm-display-adv-body",
    "RESET RENDERER lives in ADVANCED, not on the DISPLAY sheet");
  assert.ok(hostKids.some((n) => n.id === "pm-display-adv"));
  assert.ok(!hostKids.some((n) => n.id === "pm-renderer-reset"));
});

test("selecting THREE persists the pick and reloads; WEBGPU without gpu does not", () => {
  const a = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" } });
  const sel = a.byId["pm-renderer"];
  sel.value = "three";
  sel.dispatchEvent("change");
  assert.equal(a.ls.getItem("apex26.gfxBackend"), "three");
  assert.equal(a.reloaded(), 0);
  a.timers.forEach((fn) => fn());
  assert.equal(a.reloaded(), 1);

  const b = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" }, gpu: undefined });
  const selB = b.byId["pm-renderer"];
  selB.value = "webgpu";
  selB.dispatchEvent("change");
  assert.equal(b.ls.getItem("apex26.gfxBackend"), "webgl2", "unavailable WEBGPU must not persist");
  assert.match(selB.options[2].textContent, /UNAVAILABLE/);
  assert.equal(b.reloaded(), 0);
});

test("‹ from WEBGL2 jumps to WEBGPU without opening THREE", () => {
  const { byId, ls, timers, reloaded } = bootPicker({
    ls: { "apex26.gfxBackend": "webgl2" },
    gpu: {},
  });
  byId["pm-renderer-prev"].onclick();
  assert.equal(ls.getItem("apex26.gfxBackend"), "webgpu");
  assert.equal(ls.getItem("apex26.gfxWgxFail"), null);
  timers.forEach((fn) => fn());
  assert.equal(reloaded(), 1);
});

test("THREE PATH and SCREENSHOTS are injected, and only reload when live", () => {
  const a = bootPicker({
    ls: { "apex26.gfxBackend": "webgl2" },
    ss: { "apex26.tlxAutoGL": "1" },
  });
  assert.ok(a.byId["pm-three-path"], "THREE PATH button");
  assert.ok(a.byId["pm-screenshots"], "SCREENSHOTS button");
  assert.ok(a.byId["pm-save-shot"], "SAVE SCREENSHOT button");
  assert.ok(a.byId["pm-gfx-status"], "status line");
  assert.match(a.byId["pm-three-path"].textContent, /THREE PATH: AUTO/);
  assert.match(a.byId["pm-screenshots"].textContent, /SCREENSHOTS: AUTO/);
  assert.match(a.byId["pm-gfx-status"].textContent, /WEBGL2 paints/);

  a.byId["pm-three-path"].onclick();
  assert.equal(a.G.readThreePath(), "webgl2");
  assert.equal(a.ls.getItem("apex26.tlxForceGL"), "1");
  assert.equal(a.ss.getItem("apex26.tlxAutoGL"), null, "THREE PATH cycle drops the AUTO stay-GL latch");
  assert.equal(a.reloaded(), 0, "THREE PATH must not reload on WEBGL2");
  assert.match(a.byId["pm-gfx-status"].textContent, /WEBGL2 paints/);

  a.byId["pm-screenshots"].onclick();
  assert.equal(a.G.readShotMode(), "blit");
  assert.equal(a.ls.getItem("apex26.wgxCapture"), "1");
  assert.equal(a.ss.getItem("apex26.wgxCapture"), "1");
  assert.equal(a.reloaded(), 0, "SCREENSHOTS must not reload on WEBGL2");

  const b = bootPicker({ ls: { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "1" } });
  assert.match(b.byId["pm-three-path"].textContent, /WEBGL2/);
  assert.match(b.byId["pm-gfx-status"].textContent, /pinned to WebGL2/);
  b.byId["pm-three-path"].onclick();
  assert.equal(b.G.readThreePath(), "webgpu");
  assert.equal(b.ls.getItem("apex26.tlxForceGL"), "0");
  assert.match(b.byId["pm-three-path"].textContent, /RELOADING/);
  b.timers.forEach((fn) => fn());
  assert.equal(b.reloaded(), 1, "THREE PATH reloads when THREE.JS is live");

  const c = bootPicker({
    ls: { "apex26.gfxBackend": "webgpu" },
    ss: { "apex26.wgxCapture": "1" },
    gpu: {},
  });
  assert.equal(c.G.readShotMode(), "blit");
  assert.match(c.byId["pm-screenshots"].textContent, /2D BLIT/);
  assert.match(c.byId["pm-gfx-status"].textContent, /2D BLIT/);
  c.byId["pm-screenshots"].onclick();
  assert.equal(c.G.readShotMode(), "native");
  assert.match(c.byId["pm-screenshots"].textContent, /RELOADING/);
  c.timers.forEach((fn) => fn());
  assert.equal(c.reloaded(), 1, "SCREENSHOTS reloads when WEBGPU is live");

  const d = bootPicker({
    ls: { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "0" },
  });
  d.byId["pm-screenshots"].onclick();
  assert.equal(d.G.readShotMode(), "blit");
  assert.match(d.byId["pm-screenshots"].textContent, /RELOADING/);
  d.timers.forEach((fn) => fn());
  assert.equal(d.reloaded(), 1, "SCREENSHOTS reloads when THREE.JS WebGPU is live");

  const e = bootPicker({
    ls: { "apex26.gfxBackend": "three" },
    glx: { isMobile: true, __tlx: { backendState: () => ({ api: "webgpu" }) } },
  });
  e.byId["pm-screenshots"].onclick();
  assert.match(e.byId["pm-screenshots"].textContent, /RELOADING/);
  e.timers.forEach((fn) => fn());
  assert.equal(e.reloaded(), 1, "SCREENSHOTS reloads when THREE AUTO actually bound WebGPU");
});

test("presentStatus names the three screenshot paths in plain language", () => {
  const src = read("js/perf/renderer-picker.js");
  const ctx = vm.createContext({
    window: {}, document: undefined,
    localStorage: makeStorage({ "apex26.gfxBackend": "webgpu", "apex26.wgxCapture": "0" }),
    sessionStorage: makeStorage(),
  });
  seedStore(ctx);
  vm.runInContext(src, ctx, { filename: "js/perf/renderer-picker.js" });
  const G = vm.runInContext("RendererPicker", ctx);
  assert.match(G.presentStatus(), /native swapchain/);
  G.applyShotMode("blit", { noReload: true });
  assert.match(G.presentStatus(), /copied onto the canvas/);
  ctx.localStorage.setItem("apex26.gfxBackend", "three");
  ctx.localStorage.setItem("apex26.tlxForceGL", "0");
  assert.match(G.presentStatus(), /pinned to WebGPU/);
  G.applyThreePath("webgl2", { noReload: true });
  assert.match(G.presentStatus(), /pinned to WebGL2/);
  G.applyThreePath("auto", { noReload: true });
  assert.match(G.presentStatus(), /can be WebGPU or three WebGL2/);
  assert.equal(G.threePathLabel("auto"), "AUTO");
  assert.equal(G.liveThreeApi(), null);

  ctx.GLX = {
    __tlx: { backendState() { return { api: "webgpu" }; } },
    softPresent() { return true; },
  };
  assert.equal(G.liveThreeApi(), "webgpu");
  assert.equal(G.threePathLabel("auto"), "AUTO (WEBGPU)");
  assert.match(G.presentStatus(), /AUTO is WebGPU/);

  ctx.GLX.__tlx.backendState = () => ({ api: "webgl2" });
  ctx.GLX.softPresent = () => false;
  assert.equal(G.liveThreeApi(), "webgl2");
  assert.equal(G.threePathLabel("auto"), "AUTO (WEBGL2)");
  assert.match(G.presentStatus(), /AUTO is three WebGL2/);
});

test("TLX shadow depth camera remaps GL clip z to WebGPU's [0,1] (Z01), like the main camera", () => {
  // The shadow camera loads the game's GL lightVP verbatim. On three's WebGPU
  // backend (the default desktop path) that clipped casters nearer than
  // mid-depth and stored raw z where tsl-lit compares 0.5z+0.5.
  const sh = code("js/render/three/tlx-shadow.js");
  const body = fnBody(sh, "beginPass");
  assert.match(body, /if\s*\(\s*isWebGPU\s*\)/, "beginPass branches on the WebGPU backend");
  assert.match(body, /\[c \* 4 \+ 2\]\s*=\s*0\.5 \* lightVP\[c \* 4 \+ 2\]\s*\+\s*0\.5 \* lightVP\[c \* 4 \+ 3\]/, "row 2 := 0.5*row2 + 0.5*row3 (Z01 * lightVP)");
  assert.match(body, /projectionMatrix\.fromArray\(\s*isWebGPU\s*\?\s*_lvpZ01\s*:\s*lightVP\s*\)/, "the depth camera gets the remapped matrix on WebGPU only");
  assert.match(body, /dst\.set\(\s*lightVP\s*\)/, "the shader-side matrix stays the raw GL lightVP");
  // Behaviour: Z01 * M maps M's clip z in [-w, w] to [0, w] for every column.
  const M = Float32Array.from({ length: 16 }, (_, i) => (i * 7 % 11) - 5);
  const out = Float32Array.from(M);
  for (let c = 0; c < 4; c++) out[c * 4 + 2] = 0.5 * M[c * 4 + 2] + 0.5 * M[c * 4 + 3];
  for (const p of [[1, 2, 3, 1], [-4, 0.5, 2, 1]]) {
    const clip = (m) => [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r] * p[3]);
    const a = clip(M), b = clip(out);
    assert.ok(Math.abs(b[2] - (0.5 * a[2] + 0.5 * a[3])) < 1e-4, "z' = 0.5 z + 0.5 w");
    assert.deepEqual([b[0], b[1], b[3]].map((v) => +v.toFixed(4)), [a[0], a[1], a[3]].map((v) => +v.toFixed(4)), "x, y, w unchanged");
  }
});

test("TLX publishes capturePixels / awaitSoftPresent as the three.js screenshot API", () => {
  const tlx = code("js/render/three/tlx.js");
  const post = code("js/render/three/tlx-post.js");
  assert.match(tlx, /\bcapturePixels\s*\(\s*\)\s*\{/);
  assert.match(tlx, /\breadRenderTargetPixelsAsync\b/, "the blit goes through three's readback (copyTextureToBuffer + mapAsync), not the swapchain");
  // ForceGL / WebGL2 path: readPixels must not run in the Promise executor —
  // Appearance's MutationObserver → previewScene used to freeze 10–15 s on that
  // turn under llvmpipe (2026-10-05). setTimeout(run, 0) yields one macrotask.
  const capBody = fnBody(tlx, "capturePixels");
  assert.match(capBody, /setTimeout\s*\(\s*run\s*,\s*0\s*\)/,
    "WebGL capturePixels defers sync readPixels off the caller's turn");
  assert.match(capBody, /gl\.readPixels/, "the deferred run still readPixels");
  assert.match(fnBody(tlx, "softPresent"), /return\s+!!\s*_softBlit\b/);
  assert.match(fnBody(tlx, "softPresentState"), /\bon:\s*!!\s*_softBlit\b/,
    "softPresentState must be OWN so descriptor-copy does not keep GLX's");
  assert.match(tlx, /_softBlit\s*=\s*!forceWebGL\s*&&\s*_capPref\s*!==\s*"0"/);
  assert.doesNotMatch(tlx, /[.]\s*getCurrentTexture\s*\(/, "never getCurrentTexture on software — the swapchain never composites and it breaks mapAsync");
  assert.match(tlx, /await\s+renderer\.init\(\s*\)/);
  assert.match(tlx, /\bgame-soft\b/);
  assert.match(tlx, /\b__apexWriteBuf\b/);
  assert.match(tlx, /queue\.writeBuffer\(\s*buf\s*,\s*0\s*,\s*staging\s*\)/);
  assert.match(tlx, /function\s+_instColorAttr\b/);
  assert.match(tlx, /\bisInstancedBufferAttribute\b/);
  assert.match(post, /ldrTarget:\s*\(\s*\)\s*=>\s*ldrRT\b/);
});

test("TLX coalesces window resize to one target realloc per frame", () => {
  const tlx = code("js/render/three/tlx.js");
  assert.match(tlx, /function\s+applyResize\s*\(/, "size work is factored out of the public resize()");
  assert.match(tlx, /function\s+resizeNow\s*\(/, "begin/setRenderScale force an immediate apply");
  assert.match(tlx, /_resizeRaf/, "window/settings storms coalesce through one rAF");
  assert.match(fnBody(tlx, "begin"), /resizeNow\s*\(/, "the draw path still applies size on this turn");
  assert.match(fnBody(tlx, "setRenderScale"), /resizeNow\s*\(/);
});

test("TLX WebGPU remaps the RASTER projection with Z01, but hands post the GL invProj", () => {
  const tlx = code("js/render/three/tlx.js");
  // Rasterisation: three's WebGPU backend wants z in [0,1], same as WGX.
  assert.match(tlx, /const Z01 = new Float32Array\(\[1,0,0,0,\s*0,1,0,0,\s*0,0,0\.5,0,\s*0,0,0\.5,1\]\)/);
  assert.match(tlx, /_mul4Col\(_projGpu, Z01, frame\.proj\)/);
  assert.match(fnBody(tlx, "begin"), /renderer\.backend\.isWebGPUBackend/);

  // Post is the OTHER convention, and the split is real, not an oversight.
  // This test used to assert `_mul4Col(_invProjGpu, frame.invProj, Z01INV)` —
  // inv(Z01·P), the partner for RAW [0,1] depth. But TLX's consumers do the
  // remap themselves: tsl-post.js's ssaoViewPosFromD builds its NDC z with
  // `d.mul(2.0).sub(1.0)`, so by the time invProj is applied the z is already
  // GL-convention and a second remap reconstructed every SSAO/SSR sample at
  // roughly half depth. The WGSL port is the control: its ssaoViewPosFromD
  // feeds raw `d` ("depth already 0..1") and therefore DOES want inv(Z01·P).
  // Same depth texture on both (0.5*z_gl+0.5), different shader entry point.
  // Fixed 2026-09 survey (`_postF.invProj` in tlx.js); Z01INV/_invProjGpu had no other reader.
  assert.match(tlx, /_postF\.invProj = \(frame && frame\.invProj\) \|\| null/);
  assert.doesNotMatch(tlx, /Z01INV/,
    "inv(Z01·P) is the WGSL partner; feeding it to tsl-post double-remaps the depth");

  const tslPost = read("js/render/three/tsl-post.js");
  assert.match(tslPost, /d\.mul\(2\.0\)\.sub\(1\.0\)/,
    "if tsl-post stops remapping depth itself, TLX must go back to inv(Z01·P)");
});

test("WGX remaps off-axis proj (garage lens shift) with Z01·P before V", () => {
  const wgx = code("js/render/webgpu/wgx.js");
  const body = fnBody(wgx, "_writeFrame");
  assert.match(body, /pj\[8\]\s*!==\s*0\s*\|\|\s*pj\[9\]\s*!==\s*0/);
  assert.match(body, /f\.view\s*&&\s*f\.view\.length\s*>=\s*16/);
  assert.match(body, /_mul4\(_projZ01,\s*Z01,\s*pj\)/);
  assert.match(body, /_mul4\(_vpGpu,\s*_projZ01,\s*_viewScratch\)/);
});

test("setup preview passes explicit view for garage off-axis backends", () => {
  const cam = code("js/garage/setup-camera.js");
  assert.match(cam, /viewProj:\s*_spVP,\s*view:\s*_spView/);
});

test("TLX WebGPU path never claims #game as WebGL2 after renderer.init()", () => {
  const tlx = read("js/render/three/tlx.js");
  // MDN: one context type per canvas for life. three r185.1 configure() is
  // lazy on first present(); sniffing WebGL2 on #game after init() made
  // getContext("webgpu") return null (mcp-probe 2026-08-18).
  assert.match(tlx, /softwareGL\s*=\s*forceWebGL\s*\?\s*detectSoftwareGL\(\s*\)\s*:\s*!!\s*_softAdapter\b/);
  const initAt = tlx.search(/await\s+renderer\.init\(\s*\)/);
  const sniffAt = tlx.search(/softwareGL\s*=\s*forceWebGL\s*\?\s*detectSoftwareGL\(/);
  assert.ok(initAt > 0 && sniffAt > initAt, "software sniff stays after init");
  assert.match(tlx, /getContext\("webgpu"\)===null/);
});

/* ── TLX canvas opacity — the "transparent cars on iPhone" guard ─────────
 *
 * The defect this pins, end to end:
 *
 *   1. The lit fragment writes the SSR car-paint TAG — 0.35 — into ALPHA
 *      (js/render/three/tsl-lit.js, gated on ctx.ssrTag). It is a CHANNEL for
 *      the post chain, not an opacity, and the post chain's own passes all
 *      output alpha 1.0, so the canvas never normally sees it.
 *   2. present() has a "post-only death" path: when the post chain throws it
 *      sets post = null and paints the scene STRAIGHT TO THE CANVAS with the
 *      same lit materials. Nothing rebuilds them, so from that frame on the tag
 *      is written to the canvas — for the rest of the session.
 *   3. three's canvas is alpha-composited by default. So the browser reads that
 *      0.35 as opacity and the painted bodywork of every car goes 35%
 *      see-through. Only the bodywork: tyres, carbon, glass and wings keep
 *      alpha = the material's own, which is 1.
 *
 * GLX cannot hit this because it asks for `alpha: false` (js/render/glx/glx.js), so
 * the compositor ignores whatever it writes to alpha. TLX has to say the same
 * thing, and — the part worth a test — it has to say it TWICE, because three's
 * two backends read different inputs and neither reads the other's. Those two
 * vendor behaviours are asserted against the bundled three below, so a three
 * upgrade that changes either one fails HERE, next to the reason, instead of
 * turning back into a bug report from a phone.
 *
 */
const TLX = read("js/render/three/tlx.js");
const GLX = read("js/render/glx/glx.js");
const TSL_LIT = read("js/render/three/tsl-lit.js");
const THREE_BUNDLE = read("vendor/three-0.186.0/three.webgpu.min.js");

// ── The LOCAL PATCHES carried on the vendored bundle (vendor/three-0.186.0/
// PATCHES.md, applied to the readable build by tools/gen/vendor-three.mjs and
// minified with the pinned terser). A vendor re-drop that silently reverts one
// must fail HERE, not in production. The needles below are property names and
// string literals — terser's local names change between runs of the tool.
test("GLX's env probe cannot latch _envActive against a disabled/null framebuffer", () => {
  // The completeness check (2026-09-03) can disable the probe DURING the first
  // envFaceBegin, because the lazy envInit() runs after the _envDisabled gate.
  // If envFaceBegin then armed _envActive anyway, begin() would bind the
  // DEFAULT framebuffer at a 64px viewport and clear it every frame for the
  // life of the tab: a black canvas with a 64-pixel corner, no exception, no
  // console error. Two invariants keep that shut.
  const glx = read("js/render/glx/glx.js");
  const beginFn = fnBody(glx, "envFaceBegin");
  assert.match(beginFn, /if \(!envTex\) \{ envInit\(\); if \(_envDisabled \|\| !envTex \|\| !envFBO\) return null; \}/,
    "envFaceBegin must re-test the disable latch AFTER the lazy envInit, and bail before arming _envActive");
  const armAt = beginFn.indexOf("_envActive = true");
  const testAt = beginFn.indexOf("if (!envTex) { envInit()");
  assert.ok(testAt >= 0 && armAt > testAt, "the re-test must precede the arm");
  const endFn = fnBody(glx, "envFaceEnd");
  const clearAt = endFn.indexOf("_envActive = false");
  const bailAt = endFn.indexOf("if (!gl || !envTex) return;");
  assert.ok(clearAt >= 0 && bailAt >= 0 && clearAt < bailAt,
    "envFaceEnd must lower _envActive BEFORE any early return — a texture that vanished mid-cycle is the same brick one frame later");
});

test("latches come down BEFORE early returns — the shape that bricked the GLX env probe", () => {
  // 2026-09-03: envFaceEnd returned early with _envActive still set and the
  // canvas went black for the life of the tab. Two more latches share the
  // shape and are pinned here so the next early return cannot re-create it.
  const shadow = read("js/render/glx/shadow.js");
  for (const fn of ["carShadowEnd", "lampShadowEnd"]) {
    const body = fnBody(shadow, fn);
    const clearAt = body.indexOf("S.castCullVP = null");
    const bailAt = body.indexOf("return;");
    assert.ok(clearAt >= 0 && bailAt >= 0 && clearAt < bailAt,
      `${fn}: castCullVP must be cleared before the enabled-check return — chunked.js reads castCullVP || lightVP for every caster`);
  }
  // A tab RETURN is not a race start: it must re-arm the sentinel without
  // resetting the derived frame budget (sentinelArm(true) does both).
  const game = read("js/game.js");
  assert.match(game, /else if \(G.state === "race" \|\| G.state === "count"\) PerfGov\.sentinelResume\(\);/,
    "the visibilitychange handler re-arms with sentinelResume(), not sentinelArm(true)");
  assert.match(read("js/perf/governor.js"), /function sentinelResume\(\)/);
  // The env-probe latch has the same player-reachable reset as the chunk latch.
  assert.match(game, /id === "carEnvCube" && \+v > 0 && !\(\+LT\[id\] > 0\) && _envProbeOff/,
    "ENV REFLECTION 0 -> >0 clears apex26.envProbeOff, like the chunk knobs clear perChunkOff");
});

test("the vendored three carries the swizzle patch — Chromium 141 rejects r185's string swizzle", () => {
  // r185's pooled GPUTextureViewDescriptor stamps swizzle:"rgba" (constructor +
  // reset()) into EVERY createView; Chromium 141 validates the member as a
  // GPUTextureComponentSwizzle dictionary, so the pristine bundle throws on
  // every render pass — shadows dead, env probe dead, present() throws on the
  // first race frame, TLX refuses the tab and reloads. The patch omits the
  // member (identity swizzle carries no information). Re-apply per PATCHES.md.
  assert.doesNotMatch(THREE_BUNDLE, /this\.swizzle="rgba"/,
    "pristine swizzle default is back — the vendor bundle was re-dropped without the patch (see vendor/three-0.186.0/PATCHES.md §1)");
  assert.equal(THREE_BUNDLE.split('this.swizzle=void 0').length - 1, 2,
    "the swizzle patch must cover BOTH sites (constructor + reset())");
});
test("getDynamicCacheKey fills a scratch array instead of minting one per draw (PATCHES.md §6)", () => {
  // three.js r186 ships `hash$1 = ( ...params ) => cyrb53( params )`, and
  // RenderObject.getDynamicCacheKey() calls it up to three times. `get
  // needsUpdate()` calls getDynamicCacheKey() for EVERY render object on EVERY
  // draw, so the rest arrays are minted at (objects x frames) and are garbage
  // the instant cyrb53 returns. Measured on the three.js/WebGPU path before the
  // patch: 255 KB/frame, 28.4 MB/s, a collection roughly once a second freeing
  // a median 25.8 MB. Upstream fixed it in r187 (PR #34553) by filling one
  // module-scope array by index and hashing it with hashArray.
  //
  // Pinned on PROPERTY NAMES and a backreference for the scratch array's local
  // name — terser renames the local between runs of the generator, so naming it
  // would make this test fail on a re-vendor that changed nothing.
  assert.match(THREE_BUNDLE,
    /getDynamicCacheKey\(\)\{[^}]*?(\w+)\[0\]=\w+,\1\[1\]=this\.camera\.isArrayCamera\?this\.camera\.cameras\.length:0,\1\[2\]=this\.object\.receiveShadow\?1:0,\1\[3\]=this\.renderer\.contextNode\.id,\1\[4\]=this\.renderer\.contextNode\.version,\w+\(\1\)/,
    "getDynamicCacheKey no longer fills a scratch array (vendor/three-0.186.0/PATCHES.md §6)");
  // And the form it replaced must be GONE, or a half-applied patch would pass
  // the check above while still allocating on the shadow-receiving path.
  assert.doesNotMatch(THREE_BUNDLE, /getDynamicCacheKey\(\)\{[^}]*?this\.object\.receiveShadow&&/,
    "the nested per-call hash survives in getDynamicCacheKey (PATCHES.md §6)");
});

test("TextureNode clones share the BASE node's flipY / uv-matrix uniforms (PATCHES.md §10)", () => {
  // r186 minted a flipY uniform per texture node (three's WebGL2 backend always
  // flips) and marked every node OBJECT-update; the lit shader's 20 PCF taps
  // were 20 per-object updates per draw. The uniforms now live on getBase() and
  // update themselves; the node no longer needs an OBJECT update.
  assert.match(THREE_BUNDLE, /(\w+)=this\.getBase\(\);null===\1\._flipYUniform&&\(\1\._flipYUniform=\w+\(!1\)\.onObjectUpdate\(/,
    "the flipY uniform is per-clone again (vendor/three-0.186.0/PATCHES.md §10)");
  assert.match(THREE_BUNDLE, /(\w+)=this\.getBase\(\);return null===\1\._matrixUniform&&\(\1\._matrixUniform=\w+\(\1\.value\.matrix\)\.onObjectUpdate\(/,
    "the uv-matrix uniform is per-clone again (PATCHES.md §10)");
  assert.doesNotMatch(THREE_BUNDLE, /this\.updateType=null!==this\._matrixUniform\|\|null!==this\._flipYUniform/,
    "TextureNode still marks itself OBJECT-update (PATCHES.md §10)");
  // And the lit shader samples each shadow map through ONE base node.
  const lit = code("js/render/three/tsl-lit.js");
  assert.doesNotMatch(lit, /texture\(SHD\.(sunTex|carTex|lampTex|blockerTex), /, "a PCF tap mints its own texture node again");
  for (const m of ["sunTex", "carTex", "lampTex", "blockerTex"])
    assert.match(lit, new RegExp(`shadowMapNode\\(SHD\\.${m}\\)`), m + " taps must share one base node");
});

test("shadow-bug batch: lamp/car targets warmed, caster key from the cast matrix, thrown-pass recovery", () => {
  const sh = code("js/render/three/tlx-shadow.js");
  const warm = sh.slice(sh.indexOf("async warm()"), sh.indexOf("async warm()") + 1200);
  assert.match(warm, /for \(const rt of \[lampRT, lampStaticRT, carRT\]\)/, "warm() must compile the lamp/car targets' pipelines too");
  assert.match(sh, /_lampStaticValid = _lastPassOk;/, "lampStaticEnd judges its own render, not the sticky S.enabled");
  const begin = fnBody(sh, "beginPass");
  assert.match(begin, /_passKeepsDepth = false;/, "a thrown car-only pass must not skip the next target's clear");
  assert.match(begin, /if \(_passOpen\)/, "a thrown pass's casters must be hidden before the next target draws");
  const lamp = fnBody(code("js/render/shared/shadow-pass.js"), "lampPass");
  assert.match(lamp, /let _carKey = _playerIn \? _lampCasterKey\(1, _pm\) : 0;/, "the player is keyed from the matrix it is cast with");
  assert.match(code("js/render/shared/shadow-pass.js"), /Math\.round\(m\[8\] \* 8\)[\s\S]{0,80}Math\.round\(m\[9\] \* 8\)[\s\S]{0,80}Math\.round\(m\[10\] \* 8\)/,
    "orientation (the forward axis: heading AND pitch) is part of the lamp caster key");
  // warm() must show the hidden casters, or compileAsync skips them.
  assert.match(warm, /m\.visible = true; shown\.push/, "warm() compiles hidden casters too");
  // Each End renders only the pass its own Begin opened.
  assert.match(sh, /function endPass\(rt\) \{[\s\S]{0,600}\(rt !== undefined && rt !== target\)\) return;/);
  assert.match(sh, /shadowEnd: \(\) => endPass\(sunRT\),/);
  assert.match(code("js/render/three/tlx.js"), /if \(lim\.length\) _glMaxDim = Math\.min\(\.\.\.lim\);/, "a lost-context 0 must not latch");
});

test("lit material scalars ride two packed per-object vec4s, not seven materialReference nodes", () => {
  // Seven materialReference nodes = seven updateReference + property-path walks
  // per render object per pass (census 289: updateReference 4.6-5.6 % of the
  // three.js/WebGL2 leg). makeMaterial packs them once; the shared graph reads two.
  const lit = code("js/render/three/tsl-lit.js");
  assert.doesNotMatch(lit, /materialReference\("userData\.tlx/, "a per-material scalar went back to a materialReference node");
  assert.match(lit, /ud\.tlxPackA = new THREE\.Vector4\(ud\.tlxRoughness, ud\.tlxMetalness, ud\.tlxSpecular, ud\.tlxDetail\);/);
  assert.match(lit, /ud\.tlxPackB = new THREE\.Vector4\(ud\.tlxClearcoat, ud\.tlxCarPaint, ud\.tlxSparkle, 0\);/);
  // One per-object callback feeds the per-draw scalars AND both packed vectors.
  assert.match(lit, /const \{ draw, pA, pB \} = perDrawUniforms\(\);/);
  assert.match(lit, /pA\.value = \(mud && mud\.tlxPackA\) \|\| _PACK_A_DEF;/);
  assert.doesNotMatch(lit, /const perObject = /, "the per-key OBJECT uniforms are back (five callbacks per lit draw)");
});

test("TextureNode.update rebuilds the UV matrix only for a node that samples through it (PATCHES.md §9)", () => {
  // r186 called texture.updateMatrix() (setUvTransform) from every per-object
  // TextureNode.update() whenever matrixAutoUpdate was on, even with no matrix
  // uniform to read it; three's WebGL2 backend gives every texture node a flipY
  // uniform, so every shadow compare / material / bake sample paid it per draw
  // (census 289: 293 ms of setUvTransform in a 21.9 s WebGL2 leg).
  assert.match(THREE_BUNDLE, /update\(\)\{const (\w+)=this\.value,(\w+)=this\._matrixUniform;null!==\2&&\(\2\.value=\1\.matrix\),null!==\2&&!0===\1\.matrixAutoUpdate&&\1\.updateMatrix\(\)/,
    "TextureNode.update rebuilds the uv matrix without a matrix uniform again (vendor/three-0.186.0/PATCHES.md §9)");
});

test("the vendored three emits render-stage node variables at FUNCTION scope (WebKit 8 KB private cap, PATCHES.md §4)", () => {
  // iOS/Safari 26 refuses a module whose module-scope var<private> sum passes
  // 8,192 bytes ("The combined byte size of all variables in the private
  // address space exceeds 8192 bytes"); r185 declared every node variable that
  // way and the lit fragment carried 1,597 of them. The patch routes the
  // vertex/fragment stages through getVars(stage, false) and moves the block
  // inside main(). Dawn never checks the sum, so only this pin and a phone can.
  assert.match(THREE_BUNDLE, /getVars\((\w+),"compute"===\1&&\w+\)/,
    "render stages must take the function-scope getVars form (compute keeps allowGlobalVariables)");
  assert.match(THREE_BUNDLE, /@vertex\\nfn main\( \$\{(\w+)\.attributes\} \) -> VaryingsStruct \{\\n\\n\\t\/\/ vars\\n\\t\$\{\1\.vars\}/,
    "vertex template must declare the node variables inside main()");
  assert.match(THREE_BUNDLE, /@fragment\\nfn main\( \$\{(\w+)\.varyings\} \) -> \$\{\1\.returnType\} \{\\n\\n\\t\/\/ vars\\n\\t\$\{\1\.vars\}/,
    "fragment template must declare the node variables inside main()");
  assert.doesNotMatch(THREE_BUNDLE, /\/\/ vars\\n\$\{(\w+)\.vars\}\\n\\n\/\/ codes\\n\$\{\1\.codes\}\\n\\n@(vertex|fragment)/,
    "a module-scope // vars block before @vertex/@fragment is the pristine upstream emission");
  // The graph-side half: the shared noise helpers are layouted (real functions),
  // not inlined ~50× into the lit shader.
  const chunks = read("js/render/three/tsl-chunks.js");
  for (const name of ["apexHash21", "apexVnoise", "apexIgnoise"]) {
    assert.match(chunks, new RegExp(`setLayout\\(\\{ name: "${name}", type: "float", inputs: \\[\\{ name: "\\w+", type: "vec2" \\}\\] \\}\\)`),
      `${name} must carry a setLayout so it compiles once instead of per call`);
  }
  // The two biggest remaining inliners, measured on the Dawn dumps: three
  // inlined matBumpHeight's 15-branch chain at all SIX applyMaterialNormal call
  // sites (5.2 KB + ~25 node vars each — 31 KB of the 99 KB lit fragment), and
  // the sky's hash2 68x (fbm->4 vnoise->4 hash2, fbm called 4x, plus one
  // direct). A dropped layout re-inflates the shader silently: nothing fails.
  assert.match(read("js/render/three/tsl-lit.js"), /setLayout\(\{ name: "apexMatBumpHeight", type: "float",/,
    "matBumpHeight must stay layouted — 6 inlines is 26% of the lit fragment");
  const skyF = read("js/render/three/tsl-sky.js");
  for (const name of ["apexSkyHash2", "apexSkyVnoise", "apexSkyFbm", "apexSkyHash3"]) {
    assert.match(skyF, new RegExp(`setLayout\\(\\{ name: "${name}", type: "float"`),
      `${name} must carry a setLayout (the sky noise family is SEPARATE from tsl-chunks')`);
  }
});
test("the vendored three has upstream's #33954 bind-group fix (patch 2 retired in r186)", () => {
  // _destroyBindings must delete the destroyed bind group from the shared
  // texture's bindGroups Set, or the Set grows unboundedly holding
  // NodeSampledTexture refs — TLX's shared-texture-node pattern. r185 carried
  // this as a local backport; r186 ships it. A re-drop of an older release
  // fails here.
  assert.match(THREE_BUNDLE, /bindGroups\.delete\(/,
    "the #33954 fix is missing from the vendor bundle — evicted-material dispose() now leaks (vendor/three-0.186.0/PATCHES.md §2)");
});
test("the vendored three keys WebGPU pipelines on polygonOffset (patch 3 retired in r186, PR #34406)", () => {
  // TLX's bias-only material variants (tsl-fx road decals −4/−8, tsl-lit
  // o.depthBias) shared one GPURenderPipeline on r185 and one of each pair drew
  // with the other's bias. Upstream carries the three fields in the cache key
  // and in needsRenderUpdate's compare chain since r186.
  assert.match(THREE_BUNDLE, /\.stencilWriteMask,(\w+)\.polygonOffset,\1\.polygonOffsetFactor,\1\.polygonOffsetUnits,\1\.side/,
    "cache key lacks polygonOffset* (vendor/three-0.186.0/PATCHES.md §3)");
  assert.match(THREE_BUNDLE, /\.polygonOffset===(\w+)\.polygonOffset&&\w+\.polygonOffsetFactor===\1\.polygonOffsetFactor&&\w+\.polygonOffsetUnits===\1\.polygonOffsetUnits/,
    "needsRenderUpdate does not compare polygonOffset* (PATCHES.md §3)");
});
test("the vendored three matches its MANIFEST.json — generated by tools/gen/vendor-three.mjs, never hand-edited", () => {
  // The .min.js files are terser output of the PATCHED readable build; a hand
  // edit or a re-drop that skipped the generator changes a hash. The pinned
  // terser in package.json is the one the manifest names, so a regeneration on
  // another box reproduces the same bytes.
  const dir = "vendor/three-0.186.0";
  const m = JSON.parse(read(`${dir}/MANIFEST.json`));
  assert.equal(m.three, "0.186.0");
  assert.deepEqual(m.patches, [1, 4, 5, 6, 9, 10], "patch ids applied (2 and 3 retired in r186; 7 and 8 were #228's reverted skip-draw pair)");
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.devDependencies.terser, m.terser, "package.json must pin the terser the manifest was generated with");
  for (const [file, rec] of Object.entries(m.files)) {
    const h = createHash("sha256").update(fs.readFileSync(path.join(ROOT, dir, file))).digest("hex");
    assert.equal(h, rec.sha256, `${dir}/${file} differs from MANIFEST.json — regenerate with node tools/gen/vendor-three.mjs 0.186.0`);
  }
  for (const name of [
    "three.webgpu.min.js", "three.core.min.js", "three.tsl.min.js", "LICENSE.txt",
    "addons/tsl/display/BloomNode.js",
    "addons/webxr/XRButton.js", "addons/webxr/VRButton.js", "addons/webxr/WebGLXRFallback.js",
  ]) {
    assert.ok(m.files[name], `${name} must be a manifest file`);
  }
  assert.match(THREE_BUNDLE, /from"\.\/three\.core\.min\.js"/, "the internal core import must point at the minified chunk, as upstream's min build did");
  assert.match(THREE_BUNDLE.slice(0, 300), /@license/, "the MIT banner survives minification");
});

/** The object literal passed to `new THREE.WebGPURenderer({...})`, brace-matched
 *  (it spans ~40 lines of comment, so a regex over one line cannot see it). */
function rendererParams() {
  const at = TLX.indexOf("new THREE.WebGPURenderer(");
  assert.notEqual(at, -1, "the renderer construction moved");
  const open = TLX.indexOf("{", at);
  let depth = 0;
  let i = open;
  for (; i < TLX.length; i++) {
    if (TLX[i] === "{") depth++;
    else if (TLX[i] === "}" && --depth === 0) break;
  }
  // Comments quote `alpha: false` when explaining it; only code may answer.
  return TLX.slice(open, i + 1).replace(/^[ \t]*\/\/.*$/gm, "");
}

test("GLX asks for an opaque canvas — the behaviour TLX has to match", () => {
  const h = bootGlx();
  const ctx = h.contextAttrs.find((c) => c.type === "webgl2");
  assert.ok(ctx, "GLX asks the canvas for a webgl2 context");
  assert.equal(ctx.attrs.alpha, false,
    "GLX dropped `alpha: false` — then the tag can ghost cars on BOTH backends " +
    "and this whole guard needs rethinking, not updating");
  assert.equal(ctx.attrs.antialias, false, "no browser MSAA — the post path resolves its own");
});

test("GLX keeps the drawing buffer under HeadlessChrome so captures see the car", () => {
  // Without this, CDP / chrome-devtools screenshots race the cleared
  // backbuffer and paint solid black while the garage is actually drawing
  // (garage-frame.mjs freezes the loop for the same reason). Source-pin the
  // UA sniff + the attr — bootGlx's mock navigator is not HeadlessChrome, so
  // the recorded attrs stay false there; the wiring is what this holds.
  const src = read("js/render/glx/glx.js");
  assert.match(src, /HeadlessChrome/,
    "GLX must sniff HeadlessChrome for the preserveDrawingBuffer gate");
  assert.match(src, /navigator\.webdriver/,
    "Playwright Desktop Chrome spoofs headed UA — webdriver still arms capture");
  assert.match(src, /preserveDrawingBuffer:\s*headlessUa/,
    "preserveDrawingBuffer must follow the headless UA sniff, not a bare true");
});

test("GLX soft-presents under HeadlessChrome so CDP sees the car", () => {
  // preserveDrawingBuffer alone is not enough on SwiftShader: in-frame
  // readPixels has picture, chrome_take_screenshot of the garage gap is
  // still solid black. WGX already 2D-blits; GLX must too under the same UA.
  const src = code("js/render/glx/glx.js");
  assert.match(src, /_softPresent\s*=\s*headlessUa/,
    "soft-present must arm from the HeadlessChrome sniff");
  assert.match(src, /navigator\.webdriver/,
    "webdriver arms soft when the project UA hides HeadlessChrome");
  assert.match(src, /drawingBufferWidth/,
    "softBlit must size from the drawing buffer (present size under spatial upscale)");
  assert.match(src, /game-soft/,
    "soft-present needs a 2D overlay canvas id for CDP/page shots");
  assert.match(src, /putImageData/,
    "soft-present must blit readPixels into the 2D overlay");
  assert.match(src, /awaitSoftPresent/,
    "garage settle / SAVE SCREENSHOT wait on awaitSoftPresent");
  assert.match(src, /if\s*\(\s*!_softPresentWaiters\.length\s*&&\s*!_softCaptureDue\s*\)\s*return/,
    "soft-present must read back only when a capture explicitly waits for it");
  assert.match(src, /softPresent:\s*\(\)\s*=>\s*!!_softPresent/,
    "softPresent() capability bit for renderer-picker / probes");
  assert.match(src, /function invalidateSoftPresent\(/,
    "snapCam calls gfx.invalidateSoftPresent — GLX must define it (WGX already does)");
  assert.match(src, /invalidateSoftPresent,/,
    "invalidateSoftPresent must be on the GLX export surface");
  const awaitFn = span(src, "function awaitSoftPresent", "function init(canvasEl)", "awaitSoftPresent");
  assert.match(awaitFn, /const start = _softBlitGen/,
    "GLX must wait for a newer blit, not return the last gen already on the overlay");
  assert.doesNotMatch(awaitFn, /_softLastMaxPx\s*>=\s*8\s*&&\s*_softBlitGen\s*>\s*0/,
    "a stale early-return makes SAVE SCREENSHOT byte-identical across a camera move");
  assert.match(awaitFn, /_softPresentWaiters\.push\(waiter\)/,
    "timeout splice must find the same function push() stored");
  assert.doesNotMatch(awaitFn, /_softPresentWaiters\.push\(wrap\)/,
    "do not push a wrapper the timeout cannot indexOf");
});

test("menuBlank hides #game-soft with #game", () => {
  const src = code("js/game.js");
  assert.match(src, /getElementById\("game-soft"\)/,
    "soft-present overlay must follow menuBlank visibility with #game");
});

test("SAVE SCREENSHOT reads #game-soft when the overlay exists", () => {
  const src = read("js/perf/renderer-picker.js");
  const fn = span(src, "function saveScreenshot()", "function ensureAdvHost()", "saveScreenshot");
  assert.match(fn, /getElementById\("game-soft"\)/,
    "HeadlessChrome GLX hides #game; the PNG must come from the 2D overlay");
  assert.match(fn, /hrefFromPixels/,
    "the two capturePixels sites share hrefFromPixels; do not merge the awaits");
});

test("the alpha tag that makes canvas opacity load-bearing still exists", () => {
  // If this ever stops being true the coupling is gone and the two assertions
  // below are merely tidy rather than load-bearing. Worth knowing which.
  const src = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /SSR_TAG\s*\?[\s\S]{0,160}float\(0\.35\)/,
    "the SSR car-paint alpha tag moved — re-derive whether an alpha canvas can " +
    "still ghost the cars before touching the guards below");
});

test("TLX pack sampling skips car surface ids, matching GLX matTexUV", () => {
  // The baked array is 17 layers (MAT 0..16). Car surfaces are 20-27.
  // GLX/WGX refuse mid>16 before the fetch. TLX used to sample layer=mid
  // on every car fragment; SwiftShader returns black and the car vanishes
  // while the road (MAT 16) still draws.
  const glxLit = read("js/render/glx/shaders/glsl-lit.js");
  assert.match(glxLit, /mid <= 0 \|\| mid > 16/,
    "GLX matTexUV lost its 1..16 pack gate — re-derive the TLX clamp");
  const src = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /matTexInPack/,
    "TLX must name the 1..16 pack gate so car ids cannot enable a live sample");
  assert.match(src, /lessThanEqual\(16\.0\)/,
    "the pack gate must refuse mid>16 (car surfaces 20-27)");
  assert.match(src, /depth\(int\(matTexLayer\(mid\)\)\)/,
    "the hoisted array sample must clamp the layer, not pass raw mid");
});

test("TLX pooled meshes write matrixWorld — scene auto-update is off", () => {
  // scene.matrixWorldAutoUpdate = false so renderer.render() does not walk
  // the graph. The comment above that flag says every pooled mesh writes
  // matrixWorld; the shadow caster pool does (tlx-shadow.js cast()). The
  // visible acquireMesh pool used to write only `matrix`. Reused slots
  // kept the identity world matrix they were born with (track), so race
  // cars sat at the origin while the chase camera looked at Monza.
  const tlx = TLX.replace(/^[ \t]*\/\/.*$/gm, "");
  const at = tlx.indexOf("function acquireMesh(");
  assert.ok(at > 0, "acquireMesh is gone");
  const body = tlx.slice(at, tlx.indexOf("function buildGeometry(", at));
  assert.match(body, /matrixWorld\.copy\(\s*m\.matrix\s*\)/,
    "acquireMesh must stamp matrixWorld — scene auto-update will not");
  assert.match(body, /matrixWorldAutoUpdate\s*=\s*false/,
    "pool meshes must not let a later graph walk clobber the stamp");
  const sh = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sh, /matrixWorld\.copy\(\s*m\.matrix\s*\)/,
    "shadow casters are the working reference for this stamp");
});

test("the SSR tag is not three's opacity socket — that is what made cars vanish", () => {
  // NodeMaterial.setupDiffuseColor does diffuseColor.a *= opacityNode.
  // NodeBuilder.isOpaque() is (transparent===false && blending===NormalBlending).
  // Opaque car paint uses NoBlending so the tag writes verbatim (GLX parity),
  // which makes isOpaque() FALSE, so a 0.35 opacityNode is left as coverage:
  // painted bodywork disappears; tyres/carbon/glass (alpha 1) stay. The tag
  // belongs on outputNode; opacityNode is the real material alpha.
  const src = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.doesNotMatch(src, /opacityNode\s*=\s*packed\.a/,
    "opacityNode = packed.a feeds the 0.35 paint tag into three as coverage");
  assert.match(src, /opacityNode\s*=\s*packed\.opacity/,
    "opacityNode must be the real tlxAlpha, not the SSR channel");
  assert.match(src, /outputNode\s*=\s*packed\.out/,
    "outputNode must be the shared-graph vec4 (RGB + real alpha)");
  assert.match(src, /vec4\(packed\.rgb,\s*matU\.alpha\)/,
    "output.a must be tlxAlpha — the 0.35 tag is coverage on NoBlending");
  assert.doesNotMatch(src, /out:\s*packed(?:\s|,|\})/,
    "do not emit packed (RGB + tag) as the written vec4");
  assert.match(src, /opacity:\s*matU\.alpha/,
    "shared graph must expose matU.alpha as the opacity socket");
  assert.match(src, /m\.fog\s*=\s*false/,
    "three scene-fog on top of the lit fog stack darkens bodywork a second time");
  assert.match(src, /m\.premultipliedAlpha\s*=\s*false/,
    "premultiply would scale RGB by the tag if it ever re-enters the output");
});

test("three still treats NoBlending as non-opaque (why the tag cannot live in opacityNode)", () => {
  // Makes the assertion above NECESSARY. If isOpaque() starts ignoring
  // blending, NoBlending would force alpha back to 1 and the outputNode
  // split would be tidy rather than load-bearing — worth knowing which.
  assert.match(THREE_BUNDLE,
    /isOpaque\(\)\{const \w+=this\.material;return!1===\w+\.transparent&&\w+\.blending===\w+&&!1===\w+\.alphaToCoverage\}/,
    "bundled three isOpaque() no longer requires NormalBlending — re-derive " +
    "whether NoBlending + opacityNode=tag still ghosts cars");
});

test("the garage floor reflection is a noDepthTest ghost on all three backends", () => {
  // #1025's opaque+depthBias resolve hid the contact sheen (polygon offset
  // cannot lift a mesh metres below y=0). Restore the planar ghost; backends
  // must still honour noDepthTest so the slab cannot bury it.
  const scene = code("js/garage/scene.js");
  assert.match(scene, /const MIRROR_OPTS = \{ alpha: 0\.26/,
    "garage mirror is the accepted planar ghost");
  assert.match(scene, /noDepthTest:\s*true/,
    "ghost must skip depth test so the floor cannot hide it");
  assert.doesNotMatch(scene, /MIRROR_RESOLVE|mirrorSheen|ensureMirrorFade/,
    "do not reintroduce the #1025 fade path that erased the reflection");

  const glx = code("js/render/glx/glx.js");
  assert.match(glx, /opts\.noDepthTest/, "GLX draw() must read opts.noDepthTest");

  const wgx = code("js/render/webgpu/wgx.js");
  assert.match(wgx, /noDepthTest/, "WGX must map noDepthTest onto always-pass depth");

  const lit = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(lit, /o\.noDepthTest/, "tsl-lit makeMaterial must read o.noDepthTest");
  assert.match(TLX, /o\.noDepthTest\s*\?\s*"\|nd"/,
    "tlx materialFor key must distinguish noDepthTest variants");
});

test("TLX asks for an opaque canvas on the WebGPU backend", () => {
  assert.match(rendererParams(), /(^|[{,\s])alpha:\s*false/,
    "TLX must pass alpha:false — three's WebGPU backend turns it into " +
    'alphaMode "opaque"');
  assert.match(rendererParams(), /(^|[{,\s])premultipliedAlpha:\s*false/,
    "TLX must pass premultipliedAlpha:false — default true premultiplies the " +
    "SSR tag into car RGB");
});

test("TLX world-frame Color clear prefers skyZenith over fog (missed TSL sky is not beige)", () => {
  // scene.background is the fallback when backgroundNode misses (software-GL
  // TSL compile, HDR-target skip). Clearing to fogColor made every dusk
  // probe a washed beige void ([0.68,0.64,0.54]). Zenith is the sky the
  // node would have drawn; fog stays the no-track menu fallback only.
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const begin = src.indexOf("begin(frame)");
  assert.notEqual(begin, -1, "begin(frame) moved");
  const body = src.slice(begin, begin + 900);
  assert.match(body, /skyZenith/, "begin() must read frame.skyZenith for the Color fallback");
  assert.match(body, /background\.setRGB/, "begin() still sets scene.background");
  const zAt = body.indexOf("skyZenith");
  const fogAssign = body.indexOf("fogColor) || [0.04");
  assert.ok(zAt >= 0 && fogAssign > zAt,
    "zenith must be preferred; fogColor is the no-zenith fallback");
  const drawSky = src.indexOf("drawSky(frameSky)");
  assert.notEqual(drawSky, -1, "drawSky moved");
  assert.match(src.slice(drawSky, drawSky + 1100), /frameSky\.zenith\s*\|\|\s*frameSky\.skyZenith/,
    "drawSky must keep the Color fallback in lockstep with the sky node");
  // softContent("sky") IS (softwareGL || softGpu()), with the apex26.tlxForceHw
  // escape folded in — the fallback stays the software default for players.
  assert.match(src.slice(drawSky, drawSky + 1100), /softContent\("sky"\) && sky\.fallbackNode/,
    "software GL and software WebGPU must arm the zenith-only fallback, not the full SKY_FS node");
  assert.match(read("js/render/three/tsl-sky.js"), /fallbackNode/,
    "tsl-sky must publish a zenith-only fallbackNode for the software-GL path");
});

test("TLX late sky depth-tests less-equal and does not write depth", () => {
  // WGX's late sky used depthCompare "always" and erased the world. The
  // saving is the covered fraction only when the far-plane triangle tests
  // less-equal and leaves the depth buffer alone.
  const src = read("js/render/three/tlx.js");
  const i = src.indexOf("function makeSkyMat");
  assert.notEqual(i, -1, "makeSkyMat moved");
  const body = src.slice(i, i + 900);
  assert.match(body, /depthTest = true/);
  assert.match(body, /depthWrite = false/);
  assert.match(body, /depthFunc = THREE\.LessEqualDepth/);
  assert.doesNotMatch(body, /AlwaysDepth|depthCompare:\s*"always"/);
});

test("TLX pins the sky material before the HDR scene render, not only the canvas fallback", () => {
  const src = read("js/render/three/tlx.js");
  const present = src.indexOf("present(opts)");
  const hdr = src.indexOf("post.sceneTarget()", present);
  assert.ok(present > 0 && hdr > present, "HDR present path moved");
  const pinBefore = src.lastIndexOf("pinSkyMaterial()", hdr);
  assert.ok(pinBefore > present && pinBefore < hdr,
    "HDR target render must pin the TSL sky or a missed compile leaves the Color clear");
});

test("TLX software-WebGPU soft-presents like WGX (never getCurrentTexture)", () => {
  // Dawn on SwiftShader/Lavapipe executes shaders but the native swapchain
  // never composites, and the first getCurrentTexture() breaks mapAsync
  // device-wide. TLX sniffs the adapter (info fields are not JSON-
  // enumerable), keeps #game as the GPU canvas, and blits onto #game-soft.
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(src, /navigator\.gpu\.requestAdapter\(\)/,
    "soft-adapter sniff must use requestAdapter — getContext('webgl2') is null after WebGPU claims the canvas");
  assert.match(src, /info\.vendor/,
    "adapter.info fields are not enumerable — read vendor/device/architecture directly");
  assert.match(src, /swiftshader\|llvmpipe\|lavapipe\|microsoft basic render\|soft/,
    "sniff regex must match WGX's software-adapter list");
  assert.match(src, /apex26\.wgxCapture/,
    "sessionStorage apex26.wgxCapture=1 must force the blit (gfx-probe --tlx-webgpu)");
  assert.match(src, /game-soft/,
    "#game stays the GPU canvas; visible present is the #game-soft sibling");
  assert.match(src, /_displayCanvas\.getContext\("2d"/,
    "soft-present overlay is a 2D sibling — never getContext(2d) on #game");
  assert.match(src, /softDest:\s*(?:function\s*\(\s*\)\s*\{\s*return|\(\s*\)\s*=>)\s*softOutRT\b/,
    "post chain must receive softDest so FXAA never targets the swapchain");
  assert.match(src, /awaitSoftPresent/,
    "backend must expose awaitSoftPresent (copied onto GLX by game.js)");
  assert.match(src, /capturePixels/,
    "backend must expose capturePixels for gfx-probe frame.png");
  assert.match(src, /readRenderTargetPixelsAsync/,
    "blit must go through three's copyTextureToBuffer + mapAsync, not the swapchain");
  // TLX must hear Dawn. WGX has hooked onuncapturederror since it shipped; TLX
  // hooked nothing, so a black three-on-WebGPU frame was chased for a whole
  // session against probes reporting `gpuErrors: null` — which read as "no
  // errors" and meant "no reader". An unheard backend is an undebuggable one.
  assert.match(src, /onuncapturederror/,
    "the three backend must hook device.onuncapturederror — WGX has always had it");
  assert.match(fnBody(src, "gpuErrors"), /return\s+_gpuErrors\b/,
    "the error tally must be exposed (GLX.gpuErrors() after the descriptor-copy)");
  assert.match(src, /function drawInstanced[\s\S]{0,400}if \(skipBatches/,
    "software WebGPU must skip InstancedMesh draws — they poison the frame encoder");
  // skipBatches() is softGpu() AND NOT the apex26.tlxForceBatches escape. The
  // skip stays the default, so the assertion above still holds for players; the
  // switch exists because gating the workaround on softGpu() meant the code
  // path REAL GPUs take was the one CI never executed — which is how a black
  // three.js WebGPU screen shipped. Keep both halves: default skips, opt-in runs.
  // CONTENT gates ask _softAdapter, never softGpu(): softGpu() folds in
  // _softBlit, which is a PRESENTATION need (headless has no compositing
  // swapchain even on real hardware). Conflating them made the Apple/Metal
  // runner — the project's only real GPU — run the software half of every
  // skip, so the machine that could finally test a player's path tested the
  // other one instead. softOutRT keeps asking softGpu(); these must not.
  // …AND it must ask which backend actually bound. The defect it works around
  // is Dawn poisoning the frame ENCODER, and there is no encoder on three's
  // WebGL2 backend — but `_softAdapter` is sniffed off navigator.gpu BEFORE the
  // bind decision, so without isWebGPU() the skip fired on WebGL2 too. WebKit
  // takes three's WebGL2 backend on AUTO by construction, so desktop Safari ran
  // it every boot and lost the whole TrackGraph prop set (graph.js skips the
  // FUSE for a batched node, so nothing is left behind it).
  // The AUTOMATIC term is unchanged and still pinned character for character.
  // `apex26.tlxSkipBatches` (2026-09-08) may short-circuit ahead of it — an
  // explicit, default-off, localStorage opt-in so the owner can A/B the
  // instanced batches on the phone that reported `Invalid CommandEncoder` on
  // HARDWARE, which this gate assumes cannot happen. An opt-in cannot make the
  // automatic path fire on WebGL2, which is what this assertion exists to stop;
  // widening the automatic term still fails here.
  assert.match(fnBody(src, "skipBatches"),
    /^(?:\s*if\s*\(\s*_skipBatchesPin\s*\)\s*return\s+true\s*;[^\n]*\n)?\s*return\s+_softAdapter\s*&&\s*isWebGPU\(\s*\)\s*&&\s*!_forceBatches\s*&&\s*!_forceHw\.has\(\s*"batches"\s*\)/,
    "the batch skip is _softAdapter AND the WebGPU bind — a Dawn workaround must not gate the WebGL2 path");
  // …and the escape hatch is OPT-IN. A pin that defaulted true would strip the
  // instanced scenery from every real GPU (48 % of all prop geometry) while
  // reading as a diagnostic switch.
  assert.match(src, /_skipBatchesPin\s*=\s*\(function \(\) \{[\s\S]{0,200}?localStorage\.getItem\("apex26\.tlxSkipBatches"\)\s*===\s*"1"[\s\S]{0,120}?catch \(_\) \{ return false; \}/,
    "apex26.tlxSkipBatches must be an explicit opt-in that defaults FALSE, including when storage throws");
  assert.match(fnBody(src, "isWebGPU"), /renderer\.backend[\s\S]*isWebGPUBackend/,
    "isWebGPU() must read the BOUND backend, not the adapter sniff");
  // softOutRT may early-return or ternary, but the gate must still be softGpu()
  // (presentation), not _softAdapter alone — headless needs the blit even on
  // real hardware. Size args may be presentW/H when spatial upscale is active.
  assert.match(fnBody(src, "softOutRT"), /(?:^|\n)\s*(?:return|if\s*\()\s*!?\s*softGpu\(\s*\)/,
    "presentation still follows softGpu() — the blit is needed whenever the swapchain is not composited");
  assert.match(src, /apex26\.tlxForceBatches/,
    "the real-GPU code path must stay reachable from a software run for debugging");
  // THE NODE-PROGRAM CACHE KEY MUST KEEP AN INSTANCED OBJECT'S IDENTITY.
  // tlx.js replaces three's getForRenderCacheKey with the program family plus
  // the attribute layout, on the premise that everything dropped is a uniform
  // at draw time. That premise fails for exactly one thing: three compiles the
  // instance-matrix SOURCE BUFFER into the node graph (vendored r185, the
  // `16*count*4 <= getUniformBufferLimit()` branch), so a shared program is a
  // shared instance buffer. Every TrackGraph prop batch draws with one
  // lit-instanced material over same-named attributes, so without this term all
  // 28 hashed to one entry and all but the first rendered through the first
  // batch's transforms — barriers, fencing, crowd and tyre stacks gone on both
  // three backends with zero GPU errors and a cull that agreed with GLX
  // instance for instance. Confirmed on real Apple hardware (gpu-census,
  // macos-latest) and by a same-camera A/B on lavapipe.
  const ck = fnBody(src, "getForRenderCacheKey = function");
  assert.match(ck, /isInstancedMesh[\s\S]{0,80}ro\.object\.id/,
    "the cache key must carry ro.object.id for an instanced mesh — three bakes the instance buffer into the node graph");
  // THE KEY IS STABLE PER RENDER OBJECT. three calls getForRenderCacheKey to
  // STORE a node-builder state (inside the pass that draws the object) and to
  // DELETE it when the object is disposed (from a track free, between passes).
  // The key ends with attachKey(), the CURRENT attachment state, so the delete
  // missed and every freed prop batch's node graph and shader text stayed in
  // nodeBuilderCache: +14 MB per round of picker picks, 65 entries at usedTimes
  // 0 after three rounds (tools/gfx/mem-census.mjs, 2026-10-04). Run the real
  // body with an attachment state that changes between the two calls.
  let attach = "2m";
  const keyFn = new Function("attachKey", "return function (ro) {" + ck + "};")(() => attach);
  const ro = { material: { customProgramCacheKey: () => "tlx-lit-instanced-mrt" },
    geometry: { attributes: { position: 1, normal: 1 }, index: {} },
    object: { isInstancedMesh: true, id: 215 } };
  const stored = keyFn(ro);
  attach = "1";   // the free happens outside the pass that created the state
  assert.equal(keyFn(ro), stored,
    "the delete-time key must equal the store-time key, or freed batches' builder states are never released");
  assert.match(stored, /\|I215\|2m$/, "the stored key still carries the instance identity and the creating pass's attachment state");
  const other = { material: ro.material, geometry: ro.geometry, object: { isInstancedMesh: true, id: 216 } };
  assert.notEqual(keyFn(other), stored, "a different instanced object still gets its own key");
  // apex26.tlxForceHw is the same argument generalised: EVERY software skip in
  // this file hides a path only a player's GPU executes, so each one needs a
  // switch that puts it back. softContent() must always take a part name —
  // a bare softContent() would force all the gates together and a timeout
  // would not say which path did it.
  assert.match(src, /apex26\.tlxForceHw/,
    "the per-gate hardware-path switch must stay reachable from a software run");
  // _softAdapter must classify the ADAPTER. Headless is a presentation fact —
  // headless Chromium on a real GPU is hardware — and putting it here made the
  // Apple/Metal runner, the project's only real GPU, take the software half of
  // every content skip. It belongs to _softBlit, which exists precisely because
  // a headless swapchain does not composite.
  const sniff = span(src, "let _softAdapter = false;", "let forceWebGL", "adapter sniff block");
  // The VERDICT expression itself, not the surrounding block: _headless is
  // declared in this region on purpose (the blit needs it), so slicing wider
  // would assert against its own definition.
  // The start needle is the ASSIGNMENT, not the expression that follows it:
  // pinning `_softAdapter = !!(` broke the moment a `!isMobile &&` guard was
  // inserted ahead of the `!!(`, and took both assertions below with it.
  const verdict = spanBack(src, "_softAdapter =", "} catch (_) { _softAdapter = false;",
    "adapter verdict expression");
  // ANTI-VACUITY. The span must be the ASSIGNMENT, not the `let _softAdapter =
  // false;` declaration a forward search lands on — both contain the needle,
  // and only one is the verdict. If this stops matching, the two pins below
  // are asserting about the wrong region and must be re-anchored, not deleted.
  assert.match(verdict, /!!\s*\(/,
    "the adapter verdict must be the sniff EXPRESSION — re-anchor this span, the pins below depend on it");
  assert.doesNotMatch(verdict, /HeadlessChrome/,
    "the adapter verdict must not treat headless as software — that is a presentation fact");
  assert.match(src, /_softBlit\s*=\s*!forceWebGL\s*&&\s*_capPref\s*!==\s*"0"\s*&&\s*!!\s*\(\s*_softAdapter\s*\|\|\s*_headless\s*\|\|\s*_capPref\s*===\s*"1"\s*\)/,
    "the blit must follow headless: a headless swapchain does not composite even on real silicon");
  assert.match(src, /_headless\s*=\s*\/HeadlessChrome\/i\.test\(ua\)\s*\|\|\s*\([\s\S]{0,80}?navigator\.webdriver/,
    "webdriver must arm soft blit like GLX (headed Playwright project UA)");
  assert.match(src, /_abortDisplay|_abortRenderer/,
    "TLX create catch must be able to tear down a half-booted soft overlay / renderer");
  assert.match(src, /_abortDisplay\.parentNode\.removeChild\(_abortDisplay\)/,
    "failed TLX boot must remove #game-soft before GLX fallback");
  // An empty adapter.info is UNKNOWN, not software. Browsers trim those fields
  // for fingerprinting reasons, so a player with no vendor string must not be
  // handed the degraded path on real hardware.
  assert.doesNotMatch(verdict, /infoEmpty/,
    "empty adapter.info must not be a software verdict on its own");
  assert.match(sniff, /maxTextureDimension2D <= 8192/,
    "the tie-break is measured LIMITS — SwiftShader/llvmpipe 8192, Apple 16384");
  // …on `softwareGL` ALONE. That constant is already backend-aware —
  // `forceWebGL ? detectSoftwareGL() : _softAdapter` — so ORing `_softAdapter`
  // back in only ever applied the WEBGPU verdict to a WEBGL2 bind, degrading
  // content on hardware the backend was not asking about (fallback sky, cleared
  // env probe, shrunk shadow maps). WebKit takes three's WebGL2 backend on AUTO,
  // so that was every desktop Safari boot. On the WebGPU path the two terms are
  // the same value, so this narrows nothing that was ever correct.
  assert.match(fnBody(src, "softContent"), /^\s*return\s+softwareGL\s*&&\s*!_forceHw\.has\(\s*part\s*\)/,
    "content skips ask softwareGL, which already answers for the BOUND backend");
  assert.match(src, /softwareGL\s*=\s*forceWebGL\s*\?\s*detectSoftwareGL\(\s*\)\s*:\s*!!\s*_softAdapter\b/,
    "…and softwareGL stays the backend-aware constant the line above relies on");
  assert.doesNotMatch(src, /softContent\(\)/,
    "softContent() must never be called without a part name");
  for (const part of ["sky", "env", "chunked", "shadow"]) {
    assert.ok(src.includes(`softContent("${part}")`),
      `the ${part} software skip must be forceable — it is a path only real GPUs take`);
  }
  assert.match(src, /renderer\.setRenderTarget\(softOutRT/,
    "env / post restore must rebind the blit RT, not the native swapchain");
  const envEnd = src.indexOf("envFaceEnd(face)");
  assert.notEqual(envEnd, -1, "envFaceEnd moved");
  const envBody = src.slice(envEnd, envEnd + 4200);
  assert.doesNotMatch(envBody, /setRenderTarget\(\s*null\s*\)/,
    "envFaceEnd must not restore the swapchain on the software-WebGPU path");
  // A probe face that throws must NOT be counted: six swallowed throws used to
  // latch envReady over a cube nothing wrote, and every lit surface sampled
  // black. That is invisible on software (the faces are skipped there), which
  // is exactly why it needs a static pin.
  assert.match(envBody, /catch\s*\(\s*\w+\s*\)\s*\{[\s\S]{0,400}faceOk\s*=\s*false\b/,
    "envFaceEnd must record a failed probe face, not swallow it silently");
  // The `{` is optional because envFaceEnd also bumps the ENDS counter here
  // (envState().begins/ends, added to settle PERF-FINDINGS 2t). What is pinned
  // is the guard: the mask update stays inside `if (faceOk)`.
  assert.match(envBody, /if\s*\(\s*faceOk\s*\)\s*\{?\s*envFacesMask\s*\|=\s*1\s*<<\s*\(\s*face\s*&\s*7\s*\)/,
    "a failed probe face must not be counted towards the six");
  assert.match(envBody, /if\s*\(\s*faceOk\s*&&\s*envFacesMask\s*===\s*63\s*&&\s*probeErrored\s*\)/,
    "envReady must not latch on a face that threw");
  // Dawn does NOT throw when it rejects a pipeline — render() returns normally
  // and the command buffer is discarded, so faceOk alone cannot see it. The
  // uncaptured-error tally across the six faces is the only in-page signal
  // that the probe's own commands never ran, and binding that cube is what
  // lights a whole world from black.
  assert.match(envBody, /_envErrBase\s*=\s*_gpuErrors\b/,
    "the probe must baseline the GPU error tally at its first face");
  // Per-FACE window (bug hunt 2026-09-02): the cycle-wide compare discarded a
  // good cube for any unrelated error in the ~20 main frames between face 0
  // and face 5; each face now samples the tally around its own render.
  assert.match(envBody, /const _errAtFace = _gpuErrors;/,
    "each face must sample the error tally before its render");
  assert.match(envBody, /if \(_gpuErrors > _errAtFace\) _envFaceErr = true;/,
    "and flag the cycle when the tally moved DURING the face");
  assert.match(envBody, /probeErrored\s*=\s*_envFaceErr\b/,
    "and compare that flag at the latch — a silent rejection has no other tell");
  assert.match(envBody, /_envGaveUp\s*=\s*true\s*;\s*envReady\s*=\s*false\b/,
    "a probe that keeps erroring must stand down instead of binding the cube");
  assert.match(fnBody(src, "envProbeReady"), /return\s+envReady\s*\|\|\s*_envGaveUp\b/,
    "standing down must read as ready so the caller stops re-probing forever");
  // three's node builder reads attribute.array.constructor to type an attribute
  // whenever it compiles a program for a pass it has not seen before, so a
  // chunk freed before the env probe's first face makes EVERY face throw.
  // Measured on real hardware (macos-latest/Metal): 41 failed faces on WebGL2,
  // 81 on WebGPU. Two things about that have since changed, and the gate is
  // re-pinned rather than relaxed:
  //   1. releaseMirrors() no longer NULLS the array — it assigns a zero-length
  //      array of the same class, so .constructor still resolves and .count (a
  //      plain property set once in the BufferAttribute constructor) is
  //      untouched. The original crash was `reading 'constructor'` of null.
  //   2. `envReady || _envGaveUp || !envRT` can never open on a phone: game.js
  //      gates the probe on PerfGov.tier() < 1, so envFaceBegin is never called,
  //      envReady cannot latch and _envGaveUp cannot flip while envRT is
  //      allocated anyway. Measured gate "--T", 23 drains, 0 sweeps — the
  //      release was DEAD on exactly the devices it exists for, and no test
  //      saw it because a gate that never opens looks like a gate with nothing
  //      to do. `_envNeverComing()` (no face asked in 5 s of painting) is the
  //      missing "the probe is not coming" term.
  // On macos-latest, where the 41/81 regression was measured, tier < 1 holds:
  // the probe runs, _envEverAsked flips in the first frames, _envNeverComing()
  // is false and this gate behaves exactly as it did. The new term changes
  // behaviour only where the probe is tier-disabled. STILL OWED: a real-GPU
  // confirmation run (gpu-census.yml, macos-latest) — this box cannot prove it.
  // REVERTED 2026-09-02: `|| _envNeverComing()` is out. It let the chunked
  // release run on a phone for the first time (the shipped gate can never open
  // there — game.js gates the probe on PerfGov.tier() < 1) and TLX on a real
  // handset then drew sky, cars and markers but NO ROAD AND NO TERRAIN. Neither
  // the in-container WebGL2 run nor macos-latest/Metal reproduced it: both have
  // tier < 1, so both took the ordinary gate and never exercised the path the
  // term opened. The gate is back to what shipped.
  // `_chunkRelOptIn ||` is an A/B override, not a loosening: the gate is shut on
  // a phone (the env probe is tier-gated off at PerfGov.tier() < 1), so the
  // configuration that blanked a player's road and terrain cannot be reproduced
  // at all without it. The knob must stay DEFAULT OFF — asserted below.
  // `|| !envRT` is OUT (2026-09-10): it opened the gate on exactly the devices
  // where the env target failed to allocate, before any later pass had
  // compiled against the attribute. Those devices keep their mirrors.
  assert.match(src, /!rec\.chunked\._mirrorsFreed\s*&&\s*!vizMat\s*&&\s*\(\s*_chunkRelOptIn\s*\|\|\s*envReady\s*\|\|\s*_envGaveUp\s*\)/,
    "the CPU mirrors must not be freed while the env probe still has passes to compile");
  assert.doesNotMatch(src, /_envGaveUp\s*\|\|\s*!envRT/,
    "a failed env-target allocation must not free the chunk mirrors");
  assert.match(src, /_chunkRelOptIn[\s\S]{0,200}apex26\.tlxChunkRelease"\)\s*===\s*"1"[\s\S]{0,80}return false/,
    "and the chunk-release override must default OFF, reachable only by an explicit opt-in");
  // Nulling is what shipped and rendered; assigning a zero-length array instead
  // is the ONLY delta between gpu-census run 26 on macos-latest/Metal (8x
  // "Index range ... does not fit in index buffer size (0)") and run 27, which
  // passed. Real-hardware A/B, and enough on its own. The mechanism first
  // asserted here — that three sizes buffers from array.byteLength with a
  // count*itemSize*4 fallback for null — came from misreading
  // _getAttributeMemorySize(), which is renderer.info ACCOUNTING, not
  // allocation. The claim is withdrawn; the guard stands on the A/B.
  // COMMENTS STRIPPED. The first version of this check matched the prose that
  // explains the rule — the words "new array.constructor(0)" in the comment
  // beside the code — and failed on a correct file. A guard that reads comments
  // is asserting the documentation, not the behaviour.
  const chunkSrc = read("js/render/three/tlx-chunked.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(fnBody(chunkSrc, "releaseMirrors"), /atts\[k\]\.array\s*=\s*null/,
    "releaseMirrors must NULL the mirror, never assign a zero-length array");
  assert.doesNotMatch(fnBody(chunkSrc, "releaseMirrors"), /\.array\s*=\s*new\s+\S*constructor\(0\)/,
    "a zero-length array is what Metal refused (gpu-census 26 vs 27)");
  assert.match(src, /if\s*\(\s*_envFailN\s*>=\s*ENV_FAIL_CAP\s*\)\s*_envGaveUp\s*=\s*true\b/,
    "a probe that cannot succeed must stop retrying — it threw every frame forever");
  const post = read("js/render/three/tlx-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /ctx\.softDest/,
    "tlx-post must honour ctx.softDest for the FXAA / viz dest");
  assert.match(post, /if\s*\(\s*!dest\s*\)/,
    "finally must skip setRenderTarget(null) when a soft dest is bound");
});

test("TLX soft-present overlay is opaque — SSR tag 0.35 is not compositor opacity", () => {
  // Same hole as the iPhone alpha-canvas guard, on the #game-soft path:
  // car-paint alpha is the SSR mask. A default 2D overlay composites that
  // as 35% opacity and the bodywork ghosts (tyres/wings stay solid).
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const at = src.indexOf('_displayCanvas.getContext("2d"');
  assert.notEqual(at, -1, "overlay getContext moved");
  assert.match(src.slice(at, at + 120), /alpha:\s*false/,
    "#game-soft must be an opaque 2D context");
  assert.match(src, /_unstrideIntoSoft\(/,
    "soft blit must fold unstride + opaque alpha into ImageData (audit #3)");
  assert.match(src, /dest\[i \+ 3\] = 255/,
    "fused soft unstride must force opaque pixels");
  assert.match(src, /data\[i\] = 255/,
    "_unstrideRgba / capturePixels must force opaque alpha too");
});

test("TLX InstancedMesh preserves vertex colour and owns a capped placement tint", () => {
  // three WebGPU binds a 1-instance dummy color buffer when instanceColor is
  // missing; DrawIndexed with count>1 fails validation (Lavapipe, 2026-08-18).
  // A dedicated instanceTint avoids that path without replacing canonical
  // per-vertex `color` (brown trunks / billboard frames must survive).
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  // fnBody, never a fixed window — createInstancedBatch is ~2550 chars, so the
  // slice(at, at + 2200) this replaces was ALREADY truncating 350 of them and
  // any assertion aimed at its tail had gone quietly vacuous.
  const body = fnBody(src, "createInstancedBatch");
  assert.match(body, /_instColorAttr\(\s*imesh/,
    "every batch must get an instanced tint, not only when colors[] is present");
  assert.doesNotMatch(body, /imesh\.instanceColor\s*=/,
    "do not also set imesh.instanceColor — that is the slot-5 dummy-buffer trap");
  const attrAt = src.indexOf("function _instColorAttr");
  const attrBody = src.slice(attrAt, attrAt + 1200);
  assert.match(attrBody, /setAttribute\(\s*"instanceTint"/,
    "placement colour must use its own instance-rate attribute");
  assert.doesNotMatch(attrBody, /setAttribute\(\s*"color"/,
    "instancing must not overwrite canonical per-vertex colour");
  const lit = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(lit, /vertexColor\.mul\(attribute\(\s*"instanceTint"/,
    "the instanced lit graph must multiply base colour by placement tint");
  assert.match(lit, /tlx-lit-instanced/,
    "the extra attribute requires its own stable program family");
  const shadow = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const cast = shadow.indexOf("function castInstanced");
  assert.notEqual(cast, -1, "castInstanced moved");
  const castBody = shadow.slice(cast, cast + 1800);
  assert.doesNotMatch(castBody, /m\.instanceColor\s*=/,
    "shadow InstancedMesh must not set instanceColor — the lit geo already has instanceTint");
});

test("instanced cull cache only hits the transform pack resident in the GPU buffer", () => {
  for (const file of ["js/render/glx/glx.js", "js/render/webgpu/wgx.js", "js/render/three/tlx.js"]) {
    const src = read(file).replace(/^[ \t]*\/\/.*$/gm, "");
    // fnBody, never a fixed window: the three backends' cullInstances are 1559
    // / 2446 / 2497 chars, so one 2800 window over-read all three by a
    // different amount and would silently truncate the first to grow.
    const body = fnBody(src, "cullInstances");
    assert.doesNotMatch(body, /_cullSig[01]/,
      `${file}: a second cached count cannot restore a second physical transform pack`);
    assert.match(body, /_cullPlanes/,
      `${file}: resident pack must be identified by its complete frustum`);
    assert.match(body, /k\s*<\s*4/,
      `${file}: compare x/y/z/d, not the old x/d-only collision-prone hash`);
    assert.match(body, /_cullN\b/,
      `${file}: the resident pack's count should be cached with it`);
    // The cell-set key (apex26.instCellCache) identifies the resident pack by
    // WHICH CELLS produced it. Its hit path must NOT stamp the plane snapshot:
    // _cullPlanes has to keep describing the frustum that PHYSICALLY wrote the
    // buffer, or the cheap plane compare above starts claiming a pack it never
    // produced — the same "right count, wrong transforms" defect the _cullSig
    // assertion above exists to prevent, reintroduced through the side door.
    const cellHit = body.indexOf("_cellKeyN === k");
    if (cellHit !== -1) {
      const hitBlock = body.slice(cellHit, cellHit + 600);
      assert.doesNotMatch(hitBlock, /_cullPlanes\s*(=|\[)/,
        `${file}: a cell-set cache HIT must not write the plane snapshot`);
    }
  }
  const glShadow = read("js/render/glx/shadow.js");
  const wgxSh = read("js/render/webgpu/wgx-shadow.js");
  assert.match(glShadow, /bufferSubData\([^]*?batch\._cullPlanes\s*=\s*null/,
    "GLX full-set shadow restore must invalidate the resident cull pack");
  // WGX (bug hunt 2026-09-02): the shadow pass packs into the batch's OWN
  // buffer and never writes instBuf, so there is nothing to invalidate — and
  // writing instBuf here WAS the bug: the shadow encoder rides the frame
  // submit while the camera cull's writeBuffer is queue-ordered before it, so
  // every shadow pass drew the camera's pack. Pin the separation.
  // castShadowInstanced lives in wgx-shadow.js after the GLX-seam peel.
  const wgxCast = wgxSh.slice(wgxSh.indexOf("function castShadowInstanced("), wgxSh.indexOf("function castShadowInstanced(") + 2200);
  assert.doesNotMatch(wgxCast, /writeBuffer\(batch\.instBuf/,
    "WGX castShadowInstanced must never write instBuf (frame-order bug)");
  assert.match(wgxCast, /writeBuffer\(batch\.shadowInstBuf/,
    "WGX full-set cast packs into the batch's own shadow instance buffer");
  assert.match(wgxCast, /(?:_setVB1|core\.setVB1)\(shadowPass, vb \|\| batch\.instBuf \|\| (?:core\.)?identInstanceBuf\)/,
    "the shadow draw binds the shadow buffer when it has one");
  const wgx = read("js/render/webgpu/wgx.js");
  const wgxCull = wgx.slice(wgx.indexOf("function cullInstances(batch, planes, opts)"), wgx.indexOf("function cullInstances(batch, planes, opts)") + 4200);
  assert.match(wgxCull, /const shadow = !!\(opts && opts\.upload === false\);/,
    "cullInstances must recognise the shadow cull (upload:false)");
  assert.match(wgxCull, /if \(shadow\) \{[^]*?batch\._shadowN = n;[^]*?writeBuffer\(batch\.shadowInstBuf/,
    "the shadow cull uploads to shadowInstBuf and leaves the camera pack/cache alone");
  // GLX caught up (2026-09-09): same upload:false contract, WebGL2 buffer names.
  const glx = read("js/render/glx/glx.js");
  const glxCull = glx.slice(glx.indexOf("function cullInstances(batch, planes, opts)"), glx.indexOf("function cullInstances(batch, planes, opts)") + 4200);
  assert.match(glxCull, /const shadow = !!\(opts && opts\.upload === false\);/,
    "GLX cullInstances must recognise upload:false");
  assert.match(glxCull, /if \(shadow\) \{[^]*?batch\._shadowN = n;[^]*?batch\.shadowIbo/,
    "GLX shadow cull uploads to shadowIbo and leaves the camera pack/cache alone");
  assert.match(glShadow, /batch\.shadowIbo && batch\._shadowN === n/,
    "GLX castShadowInstanced draws from shadowIbo when the light cull packed it");

  // AND THE SEPARATION IS ONLY HALF OF IT. shadowInstBuf is per BATCH, not per
  // LIGHT, and the sun, car and lamp passes all reach it through one caller
  // (game.js _castPropBatchesShadow) that re-culls and re-uploads for whichever
  // light is active. So a single deferred encoder shared by all three passes
  // reproduces the same frame-order bug one level up: every writeBuffer lands
  // before the one submit, and the sun's recorded draw reads the LAMP's pack.
  // _shadowEncoderBegin must therefore submit ANY pending encoder, not only one
  // whose model ring is nearly full — that ring threshold is a memory concern
  // and says nothing about which light packed the instance buffer.
  const beginFn = fnBody(code("js/render/webgpu/wgx-shadow.js"), "_shadowEncoderBegin");
  assert.match(beginFn, /if\s*\(\s*_pendingShadowEnc\s*\)\s*\{[^]*?queue\.submit/,
    "each shadow pass must submit the previous one — an unconditional submit, not a ring-threshold one");
  assert.doesNotMatch(beginFn, /_pendingShadowEnc\s*&&\s*_shadowSlot\s*>/,
    "the submit must not be gated on the model ring: a pass whose ring is not full still repacked shadowInstBuf");
  assert.doesNotMatch(beginFn, /shadowEncoder\s*=\s*_pendingShadowEnc\s*\|\|/,
    "a shadow pass must not inherit the previous pass's encoder — that is what let the writes alias");
});

// A cadence skip is not a stop, and only the producer knows which it is.
test("all three backends take a shadow KEEP, and game.js says which skips are cadence", () => {
  for (const [file, fn] of [
    ["js/render/glx/shadow.js", "carShadowKeep"],
    ["js/render/webgpu/wgx-shadow.js", "carShadowKeep"],
    ["js/render/three/tlx-shadow.js", "carShadowKeep"],
  ]) {
    const src = code(file);
    assert.ok(src.includes(fn), `${file} must expose ${fn}`);
    // arms > 0 is the anti-black guard: GLX and WGX never prime these depth
    // targets, so an unwritten map reads fully SHADOWED under a LEQUAL compare.
    // Arming one before its first real pass paints black under the car.
    // Anchor on the DEFINITION, not the first mention: GLX and TLX list the
    // keep in an export block above the function, and slicing from there reads
    // a neighbouring function's guard instead of this one's. That is exactly
    // how the first version of this assertion stayed green with the guard gone.
    const at = src.indexOf("function " + fn) >= 0
      ? src.indexOf("function " + fn)
      : src.indexOf(fn + ": (");
    assert.ok(at > 0, `${file}: could not find the ${fn} definition`);
    // Bound the window at the next sibling too, so a long window cannot reach
    // the following accessor and pass on ITS guard.
    const sibAt = src.indexOf("carShadowState", at + 1);
    const body = src.slice(at, sibAt > at ? Math.min(sibAt, at + 320) : at + 320);
    assert.match(body, /Arms\s*<=\s*0/,
      `${file}: ${fn} must decline until that pass has run at least once`);
  }
  // THE LAMP KEEP IS BACK, KEYED ON CONTENT. Its first version keyed on
  // (slot into frame.lights, 12 m eye cell) and was reverted the same day: the
  // slot cannot see a lamp handover, because frame-lights.js re-sorts that array
  // every frame, so it bound one lamp's depth under another lamp's VP. The eye
  // cell was not an input either — the props cast is culled to the LAMP's
  // frustum, so the static half of that map is a function of the lamp alone.
  // The key is now the two things the content actually depends on: WHICH LAMP
  // (world position, exact — static fixtures, copied coordinates) and WHERE THE
  // CARS ARE (quantised). Pin all three so neither half can quietly come back.
  const gsrc = code("js/render/shared/shadow-pass.js");   // the lamp pass lives in the shadow-pass seam
  assert.doesNotMatch(gsrc, /flBest === _lampShBest/,
    "the lamp snap must not compare SLOTS into frame.lights — that array is re-sorted every frame");
  assert.match(gsrc, /_lx === _lampShX && _ly === _lampShY && _lz === _lampShZ/,
    "the lamp snap must key on the lamp's own position, which is its identity");
  assert.match(gsrc, /_sameLamp && _carKey === _lampShCarKey/,
    "and on the cars in the map: the lamp map rasterises cars, so a lamp-only key goes stale");
  // The key must be computed over the SAME set the cast loop rasterises. A key
  // over a different set than the content is how this class of cache goes wrong,
  // so they share one bound rather than each computing their own.
  assert.equal((gsrc.match(/const _lsR = rad \+ 8/g) || []).length, 1,
    "the content key and the cast loop must share one radius bound, not compute two");
  for (const file of ["js/render/glx/shadow.js", "js/render/webgpu/wgx-shadow.js",
                      "js/render/three/tlx-shadow.js"]) {
    assert.ok(code(file).includes("lampShadowKeep"), `${file} must expose lampShadowKeep`);
  }
  assert.match(gsrc, /gfx\.lampShadowKeep\(flBest\)/,
    "and the producer must arm on the frames it skips, or the lit pass reads a false 0");

  // And the producer must actually call the car keep, on exactly the branch that
  // skips for cadence rather than for a stop.
  const g = code("js/render/shared/shadow-pass.js");
  assert.match(g, /_carShadowWanted\s*&&\s*!_carShadowFrame\s*&&\s*G\.gfx\.carShadowKeep/,
    "the halved car pass must keep the map on the frames it skips");
});

// The flag the shader reads must be observable, or a strobe is invisible.
test("shadow state reports the frame-live armed flag, not just a lifetime count", () => {
  // BOUND EACH WINDOW AT THE SIBLING. carShadowState and lampShadowState are
  // adjacent one-liners in the owning module — GLX/TLX keep them in the main
  // backend file; WGX peels them into wgx-shadow.js. A flat 300-char window
  // let the car assertion pass on the LAMP accessor's armed field, and deleting
  // `armed: …` stayed green on two of the three backends.
  for (const file of ["js/render/glx/glx.js", "js/render/webgpu/wgx-shadow.js", "js/render/three/tlx.js"]) {
    const src = code(file);
    for (const [which, sib] of [["carShadowState", "lampShadowState"],
                                ["lampShadowState", "carShadowState"]]) {
      const at = src.indexOf(which);
      assert.ok(at > 0, `${file}: no ${which}`);
      const sibAt = src.indexOf(sib, at + 1);
      const body = src.slice(at, sibAt > at ? Math.min(sibAt, at + 300) : at + 300);
      assert.match(body, /armed/,
        `${file}: ${which} must expose armed — arms stays true straight through a strobe`);
    }
  }
  // WGX still re-exports the accessors from wgx.js so game.js / surface parity
  // keep calling through the backend façade.
  assert.match(code("js/render/webgpu/wgx.js"), /carShadowState\s*=\s*\(\)\s*=>\s*SHD\.carShadowState/);
  assert.match(code("js/render/webgpu/wgx.js"), /lampShadowState\s*=\s*\(\)\s*=>\s*SHD\.lampShadowState/);
});

// A hidden or closing tab is not a crash, and the canary must not read one as one.
test("the boot probe disarms on hide and on a clean exit", () => {
  const g = code("js/game.js");
  // PerfGov's sentinel already encodes this rule for the same reason — a hidden
  // tab that never comes back was killed in the BACKGROUND, which is normal iOS
  // housekeeping and not a backend failure. Holding the probe across PROVE_FRAMES
  // also widened the window from one frame to ~5 s, so without this a player who
  // quits inside those 5 s is silently reverted to WebGL2 on their next boot.
  assert.match(g, /function _disarmProbeOnLeave\(\)/,
    "there must be one place that drops the probe when the tab leaves");
  assert.match(g, /if \(document\.hidden\) disarmProbeOnLeave\(\)/,
    "a hidden tab disarms: a background kill is housekeeping, not a crash");
  assert.match(g, /pagehide[\s\S]{0,120}disarmProbeOnLeave\(\)/,
    "and a clean exit disarms, which visibilitychange does not always precede");
});

// A latch must be cleared only by a caller that can re-arm it.
test("WGX's static shadow latch is NOT cleared by envProbeReset", () => {
  const src = code("js/render/webgpu/wgx.js");
  const at = src.indexOf("function envProbeReset");
  assert.ok(at > 0, "envProbeReset moved — check this test, not the code");
  // This shipped and came back out. envProbeReset has two callers. On a track
  // change loadTrack has ALREADY nulled the sun snap keys, so the next frame
  // rebuilds and re-sets the latch — there was no stale-circuit window. On the
  // TIER SHED the snap keys are untouched, so clearing the latch feeds IDENT to
  // the LIT pass and the god-ray march with nothing scheduled to restore it:
  // static sun shadows go off until the eye crosses a 20 m cell, indefinitely
  // for a parked car. It also runs after the sun snap block in the same frame,
  // clobbering a rebuild that just landed. GLX and TLX have no such latch, so
  // this was WGX-only divergence too.
  assert.doesNotMatch(src.slice(at, at + 900), /_shadowRendered = false/,
    "the tier-shed caller cannot re-arm this latch, so it must not clear it");
  // The producer side of the argument still has to hold: loadTrack must keep
  // invalidating the snap keys, which is what makes the reset unnecessary.
  // The keys live in js/render/shared/shadow-pass.js now: loadTrack calls its
  // reset(), and reset() is what nulls them.
  assert.match(code("js/game.js"), /shadowPass\.reset\(\);/,
    "the track change must invalidate the sun snap keys — that is the re-arm path");
  const sp = code("js/render/shared/shadow-pass.js");
  const rs = sp.slice(sp.indexOf("function reset()"), sp.indexOf("function beginFrame()"));
  assert.match(rs, /_shadowSnapX = _shadowSnapZ = _shadowBox = null;/,
    "ShadowPass.reset() must null the sun snap keys");
});

// One presented frame is not proof that a backend works.
test("the boot canary holds across a run of frames, and no path arms it behind skipClaim", () => {
  const g = code("js/game.js");
  assert.match(g, /const PROVE_FRAMES = \d{2,}/,
    "proof must be a RUN of frames: a backend that draws one and dies had no protection");
  assert.match(g, /!_backendProved && \+\+_provedFrames >= PROVE_FRAMES/,
    "the counter, not a single present, decides when the probe clears");
  // Storage is touched on the arm and the clear only. Writing the probe every
  // frame until proved would put a localStorage write in the render loop.
  assert.match(g, /!_backendProved && _backendBound && !_probeArmed/,
    "the arm must be guarded by a flag so the render loop never re-writes storage");
  // AND NOTHING ARMS THE PROBE ON A PATH THAT ALSO SETS gfxClaimFail. This
  // shipped for three hours on the claim of parity with WGX; WGX does the
  // opposite — it arms in the ELSE of its reload and removeItem()s on the reload
  // itself, and TLX's own refuseTab() removes it, commented "skipClaim still
  // blocks revert". gfxClaimFail forces skipClaim next boot, so `armed &&
  // !skipClaim` never fires, the probe is never cleared, and it survives the
  // whole GLX session to fire on the next COLD boot — permanently rewriting the
  // player's renderer choice to webgl2 because of one context loss. Worse, the
  // hide/pagehide disarm only covers the first PROVE_FRAMES, so the case the
  // canary exists for (bound, drew a while, then died) was the one it broke.
  const tlx = code("js/render/three/tlx.js");
  const cf = tlx.indexOf("gfxClaimFail");
  assert.ok(cf > 0, "TLX's claim-fail escalation moved — check this test, not the code");
  assert.doesNotMatch(tlx.slice(cf, cf + 900), /setItem\("apex26\.gfxBackendProbe"/,
    "a path that sets gfxClaimFail must not arm the canary: skipClaim blocks the revert " +
    "that would clear it, so it fires on an unrelated cold boot instead");
});

// RendererBoot.start() itself, booted in a VM: the canary's strike ledger
// across cold boots that share one localStorage. `bindPick` = the deferred
// backend's create() succeeds; GLX always attaches.
function rendererBootRun(ls, { bindPick = true, xrPick = null, realGfx = false, calls = [] } = {}) {
  const ss = new Map();
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED: { three: ["tlx.js"], webgpu: ["wgx.js"], webgl2: ["glx.js"] } },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); },
    },
    sessionStorage: {
      getItem: (k) => (ss.has(k) ? ss.get(k) : null),
      setItem: (k, v) => { ss.set(k, String(v)); }, removeItem: (k) => { ss.delete(k); },
    },
    ApexXR: { bootPick: () => xrPick },
    // requestAdapter must resolve: unset default skips three.webgpu when it is null.
    navigator: { gpu: { requestAdapter: async () => ({}) } },
    location: { reload() { throw new Error("no reload expected"); } },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    Event: class { constructor(type) { this.type = type; } },
    GLX: { init: () => { calls.push("GLX.init"); return true; } },
    Gfx: { create: async () => (bindPick ? { api: "three" } : null) },
  });
  ctx.window = ctx;
  ctx.dispatchEvent = () => true;
  seedLog(ctx);
  if (realGfx) vm.runInContext(readFile("js/render/gfx.js"), ctx);
  vm.runInContext(readFile("js/render/renderer-boot.js").replace(/^const\b/gm, "var"), ctx);
  return vm.runInContext("RendererBoot", ctx).create({
    $: () => null, els: {}, canvas: {}, ensureDataHub() {}, loadBackendScripts: async (files) => {
      calls.push(...files);
      if (files.includes("tlx.js")) ctx.TLX = { create: async () => { calls.push("TLX.create"); return { api: "three" }; } };
    },
  });
}

test("unset default skips three.webgpu when requestAdapter is null", async () => {
  const ls = new Map(), calls = [];
  const ss = new Map();
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED: { three: ["tlx.js"], webgpu: ["wgx.js"], webgl2: ["glx.js"] } },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); },
    },
    sessionStorage: {
      getItem: (k) => (ss.has(k) ? ss.get(k) : null),
      setItem: (k, v) => { ss.set(k, String(v)); }, removeItem: (k) => { ss.delete(k); },
    },
    ApexXR: { bootPick: () => null },
    navigator: { gpu: { requestAdapter: async () => null } },
    location: { reload() { throw new Error("no reload expected"); } },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    Event: class { constructor(type) { this.type = type; } },
    GLX: { init: () => { calls.push("GLX.init"); return true; } },
    Gfx: { create: async () => ({ api: "three" }) },
  });
  ctx.window = ctx;
  ctx.dispatchEvent = () => true;
  seedLog(ctx);
  vm.runInContext(readFile("js/render/renderer-boot.js").replace(/^const\b/gm, "var"), ctx);
  const rb = vm.runInContext("RendererBoot", ctx).create({
    $: () => null, els: {}, canvas: {}, ensureDataHub() {},
    loadBackendScripts: async (files) => { calls.push(...files); },
  });
  const boot = await rb.start();
  assert.equal(boot.bound, false, "no-adapter unset boot stays on GLX");
  assert.deepEqual(calls, ["GLX.init"], "must not fetch TLX / three.webgpu");
  assert.equal(ls.has("apex26.gfxBackend"), false, "must not persist webgl2 over unset");
});

test("XR's resolved backend reaches Gfx without changing the saved 2D renderer", async () => {
  for (const saved of [null, "webgl2", "webgpu", "three"]) {
    const ls = new Map(saved ? [["apex26.gfxBackend", saved]] : []), calls = [];
    const rb = rendererBootRun(ls, { xrPick: "three", realGfx: true, calls });
    const boot = await rb.start();
    assert.equal(boot.bound, true, "XR binds TLX over saved " + saved);
    assert.equal(boot.gfx.api, "three");
    assert.deepEqual(calls, ["tlx.js", "TLX.create"]);
    assert.equal(ls.get("apex26.gfxBackend") ?? null, saved, "the 2D choice survives XR");
  }
  const ls = new Map([["apex26.gfxBackend", "three"]]), calls = [];
  assert.equal((await rendererBootRun(ls, { xrPick: "webgl2", realGfx: true, calls }).start()).bound, false);
  assert.deepEqual(calls, ["GLX.init"], "ordinary VR still selects GLX without loading TLX");
  assert.equal(ls.get("apex26.gfxBackend"), "three");
});

test("a GLX fallback boot that proves itself does not erase the pick's crash strike", async () => {
  // A phone whose THREE dies inside its first ~5 s (before PROVE_FRAMES). The
  // first strike reverts ONE boot to GLX and keeps the pick; game.js then
  // calls proved() after 300 GLX frames. That used to clear the strike, so the
  // second kill read as a first one again: crash → GLX → crash → GLX, forever.
  const ls = new Map([["apex26.gfxBackend", "three"], ["apex26.gfxBackendProbe", "three"]]);
  let rb = rendererBootRun(ls);
  let boot = await rb.start();
  assert.equal(boot.bound, false, "first strike: this boot runs GLX");
  assert.equal(ls.get("apex26.gfxProbeStrikes"), "1");
  assert.equal(ls.get("apex26.gfxBackend"), "three", "one strike keeps the pick");
  assert.equal(rb.proved(), false, "GLX presenting 300 frames proves nothing about THREE");
  assert.equal(ls.get("apex26.gfxProbeStrikes"), "1", "the strike must survive the GLX fallback boot");
  // Next cold boot: THREE binds, game.js re-arms the probe at the first world
  // present, and the tab is killed again before the run of frames completes.
  rb = rendererBootRun(ls);
  boot = await rb.start();
  assert.equal(boot.bound, true);
  ls.set("apex26.gfxBackendProbe", "three");   // armBackendProbe(); no proved()
  rb = rendererBootRun(ls);
  boot = await rb.start();
  assert.equal(boot.bound, false);
  assert.equal(ls.get("apex26.gfxBackend"), "webgl2", "the second consecutive strike retires the pick");
  assert.equal(ls.has("apex26.gfxProbeStrikes"), false, "retiring resets the ledger");
});

test("a pick that proves itself still pays off an older strike", async () => {
  const ls = new Map([["apex26.gfxBackend", "three"], ["apex26.gfxProbeStrikes", "1"]]);
  const rb = rendererBootRun(ls);
  assert.equal((await rb.start()).bound, true);
  assert.equal(rb.proved(), true);
  assert.equal(ls.has("apex26.gfxProbeStrikes"), false, "a proved THREE run owes nothing for a months-old kill");
  // A refused create() lands on GLX with the pick kept: not proof either.
  const refused = new Map([["apex26.gfxBackend", "three"], ["apex26.gfxProbeStrikes", "1"]]);
  const rb2 = rendererBootRun(refused, { bindPick: false });
  assert.equal((await rb2.start()).bound, false);
  assert.equal(rb2.proved(), false);
  assert.equal(refused.get("apex26.gfxProbeStrikes"), "1");
  // game.js owns WHEN (PROVE_FRAMES); RendererBoot owns WHETHER. A second
  // unconditional removeItem in game.js would reopen the loop.
  const game = readFile("js/game.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(game, /gfxProbeStrikes/, "game.js must not touch the strike ledger itself");
  const at = game.indexOf("++_provedFrames >= PROVE_FRAMES");
  assert.ok(at > 0, "the PROVE_FRAMES block moved — check this test, not the code");
  assert.match(game.slice(at, at + 400), /rendererBoot\.proved\(\);/,
    "the PROVE_FRAMES block hands the strike clear to rendererBoot.proved()");
});

// The canary must describe what BOUND, not what was picked.
test("the boot canary re-arms from the bind, never from the saved pick alone", () => {
  const src = code("js/game.js");
  // Two boots deliberately run GLX while KEEPING a three/webgpu pick: a tab that
  // already claimed-and-died (skipClaim) and a create() that refused. Both say so
  // in their own comments. Arming the probe from the pick on those boots meant a
  // failure with nothing to do with three.js reverted the player's renderer on the
  // next load. gfx === GLX on both paths, so only the bind site can tell them apart.
  assert.match(src, /let _backendBound = false;/,
    "a flag must record that a DEFERRED backend actually took the canvas");
  assert.match(src, /if \(gfx\) \{ _backendBound = true;/,
    "and it must be set at the bind site, beside the disarm");
  assert.match(src, /if \(!_backendProved && _backendBound\b/,
    "the re-arm must require the bind, not just an unproved latch");
});

// The producer side of the same class of bug: a cadence gate on a pass that is
// ALREADY snap-cached does not halve the work, it corrupts half the maps.
test("the instanced prop shadow cast carries no frame-parity gate", () => {
  const src = code("js/render/shared/shadow-pass.js");   // the caster moved here with the passes
  const at = src.indexOf("function _castPropBatchesShadow");
  assert.ok(at > 0, "the instanced prop shadow caster moved — check this test, not the code");
  const body = src.slice(at, src.indexOf("\n    }", at));   // module-body indent: the function's own closing brace
  // The sun caller sits INSIDE the snap-cached static pass, which runs only when
  // the eye crosses its cell or the sun moves. A `(_frameNo & 1)` skip therefore
  // never fires on a frame the function is called on for saving's sake — it fires
  // on odd-numbered REBUILD frames, where the chunked props, terrain and road land
  // in the map and the instanced batches (trees, barriers, signs) do not. That map
  // is then sampled until the next rebuild, so scenery shadows blink out for a
  // whole snap cell at tier >= 1.
  assert.doesNotMatch(body, /_frameNo\s*&\s*1/,
    "no frame-parity skip here: the pass is snap-cached, so half a rebuild is a corrupt map, not a saving");
  assert.doesNotMatch(body, /PerfGov\.tier\(\)\s*>=\s*1/,
    "and no tier gate that only drops the instanced half of an otherwise complete map");
  // Both callers pass nothing: the parameter that carried the gate is gone.
  assert.doesNotMatch(src, /_castPropBatchesShadow\((?:true|false)\)/,
    "neither caller may re-introduce a cadence argument");
});

test("TLX instanced shadows consume the light-frustum packed slice", () => {
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const at = src.indexOf("function castShadowInstanced");
  assert.notEqual(at, -1, "TLX castShadowInstanced moved");
  assert.match(src.slice(at, at + 350), /castInstanced\(batch,\s*count\)/,
    "TLX wrapper must forward game.js's culled count");
  const shadow = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const castAt = shadow.indexOf("function castInstanced");
  const body = shadow.slice(castAt, castAt + 2600);
  assert.match(body, /culled[^]*?batch\.packMatrices/,
    "explicit count must copy the light-frustum packed transforms");
  assert.match(body, /m\.count\s*=\s*n/,
    "shadow draw count must be the culled count, not batch.instances");
});

test("env cube 4× anisotropy is on all three backends (grazing clearcoat)", () => {
  // GLX sets TEXTURE_MAX_ANISOTROPY_EXT on the env cube so clearcoat rays at
  // grazing angles do not over-blur — BEHAVIOUR on a mock that advertises the
  // extension. TLX is per-texture; WGX needs a dedicated sampler (binding 14)
  // because envSamp is shared with SSR + the PCSS blocker.
  const h = bootGlx({ aniso: true });
  h.GLX.envFaceBegin(0, [0, 1, 0], h.frame());
  const cube = h.calls.filter((c) => c[0] === "texParameterf" && c[1][0] === h.gl.TEXTURE_CUBE_MAP && c[1][1] === h.ANISO.TEXTURE_MAX_ANISOTROPY_EXT);
  assert.equal(cube.length, 1, "the env cube gets one anisotropy setting");
  assert.equal(cube[0][1][2], 4, "GLX env cube must keep 4× anisotropy (capped, not the driver max of 16)");
  const none = bootGlx();
  none.GLX.envFaceBegin(0, [0, 1, 0], none.frame());
  assert.equal(none.count("texParameterf"), 0, "without the extension nothing is set — no invalid enum");
  const tlx = code("js/render/three/tlx.js");
  assert.match(tlx, /envRT\.texture\.anisotropy\s*=\s*4\b/, "TLX env cube must match GLX 4× anisotropy");
  const wgx = code("js/render/webgpu/wgx.js");
  assert.match(wgx, /\benvCubeSamp\b/, "WGX must own a dedicated env-cube sampler");
  assert.match(wgx, /maxAnisotropy:\s*4\b/, "WGX env-cube sampler must request 4× anisotropy");
  const wgsl = code("js/render/webgpu/wgsl-chunks.js");
  assert.match(wgsl, /binding\(\s*14\s*\)\s*var\s+envCubeSamp\b/, "WGSL must sample the cube through the aniso sampler, not shared envSamp");
  assert.match(wgsl, /textureSampleLevel\(\s*envCube\s*,\s*envCubeSamp\b/, "env cube taps must use envCubeSamp");
  assert.doesNotMatch(wgsl, /textureSampleLevel\(\s*envCube\s*,\s*envSamp\b/, "do not sample the cube with the shared SSR/blocker sampler");
});

test("WGX car-paint flake and orange-peel key in object space like GLX", () => {
  // World-space cells swam as the car translated (floor(wpos*45) + hash3).
  // GLX / TLX weld glitter to vObjPos / positionGeometry at 220 Hz + hash21.
  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  const lit = read("js/render/glx/shaders/glsl-lit.js");
  const tsl = read("js/render/three/tsl-lit.js");
  // location 3 is the road trk vec3; objPos shifted 7 → 5 with that pack.
  assert.match(chunks, /@location\(5\)\s+objPos\s*:\s*vec3<f32>/,
    "LIT VSOut must carry object-space position (GLX vObjPos)");
  assert.match(chunks, /o\.objPos\s*=\s*aPos/,
    "vs_main must write aPos into objPos, not the world-space wp");
  assert.match(chunks, /fn paintPeelN\(/,
    "orange-peel must live in a helper so SAA can hoist it in uniform CF");
  assert.match(chunks, /objPos\.xz \* 34\.0 \+ objPos\.y \* 29\.0/,
    "orange-peel coarse scale must match GLX vObjPos.xz * 34");
  assert.match(chunks, /objPos\.xz \* 130\.0 \+ objPos\.y \* 111\.0/,
    "orange-peel fine scale must match GLX vObjPos.xz * 130");
  assert.match(chunks, /svnoise\(puv\) \* 0\.6 \+ svnoise\(fuv\) \* 0\.4/,
    "peel must use surface-family svnoise (hash21), not sky vnoise (hash2)");
  assert.match(chunks, /floor\(in\.objPos \* 220\.0\)/,
    "flake cells must use the GLX 220 Hz object-space grid");
  assert.match(chunks, /hash21\(cell\.xy \+ cell\.z \* 19\.7\)/,
    "flake hash must match GLX hash21(cell.xy + cell.z * 19.7)");
  assert.doesNotMatch(chunks.replace(/^[ \t]*\/\/.*$/gm, ""), /floor\(in\.wpos \* 45\.0\)/,
    "do not cell flake in world space — that is the swim");
  assert.match(lit, /vObjPos = aPos/,
    "GLX still keys paint to object space — WGX is the port");
  assert.match(tsl, /positionGeometry/,
    "TLX still keys paint to object space — WGX is the port");
});

test("WGX SAA mixes geometric N with a uniform-CF peel hoist", () => {
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(chunks, /let Npeel = paintPeelN\(topNgeo, in\.objPos, vDist, peelAmt\)/,
    "peel normal for SAA must be computed at fs_main top (uniform CF)");
  // The peel's cost gate is a uniform early return INSIDE paintPeelN (amt from
  // D.mat1.w), so non-paint draws skip the 6-svnoise body while the caller's
  // derivatives stay at fs_main top level.
  assert.match(chunks, /let peelAmt = select\(0\.0, 1\.0, D\.mat1\.w > 0\.001\)/,
    "peel amt gates on the per-draw carPaint uniform");
  assert.match(chunks, /fn paintPeelN[\s\S]{0,600}?if \(amt <= 0\.0\) \{ return N; \}/,
    "paintPeelN early-returns (uniform) when the peel is mixed by 0 anyway");
  assert.match(chunks, /let saaDxPeel = dpdx\(Npeel\)/,
    "SAA must take peel derivatives, not only geometric N");
  assert.match(chunks, /mix\(saaVarGeo, saaVarPeel, saturate\(carPaint\)\)/,
    "paint fragments get peel SAA; carbon/rubber stay on geometric N");
});

test("WGX hoists every pack layer with textureSample so walls match GLX aniso", () => {
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(chunks, /fn matUvLit\(/,
    "constant-layer UV helper for the fs_main hoist");
  // The per-layer hoist collapsed to ONE dynamic-layer tap (WGSL allows
  // non-uniform layer/UV expressions; only the CALL must sit in uniform CF —
  // GLX's texture() path exactly). The invariant that matters is unchanged:
  // implicit-LOD textureSample, never SampleLevel, so walls keep aniso.
  assert.match(chunks, /textureSample\(matAlbedoTex, matSamp, uvSel, midClamp\)/,
    "pack albedo must use implicit-LOD textureSample, not SampleLevel");
  assert.match(chunks, /textureSample\(matNormalTex, matSamp, uvSel, midClamp\)/,
    "pack normal must use implicit-LOD textureSample, not SampleLevel");
  assert.match(chunks, /let uvSel = matUvLit\(midClamp, topNgeo, in\.wpos\)/,
    "the tap's UV keeps matUvLit's wall-vs-ground plane selection");
  // (glass/flag — mids 3/15 — keep their explicit-LOD fallback inside
  // applyMaterial's non-uniform branch; that path is deliberate.)
  assert.match(chunks, /let hoisted = packOn && mid >= 1 && mid <= 16 && mid != 3 && mid != 15/,
    "glass/flag stay off the hoist; everything else picks the hoisted tap");
  const peelLit = chunks.indexOf("N = paintPeelN(N, in.objPos, vDist, carPaint)");
  const bump = chunks.indexOf("applyMaterialNormal(i32(vMatId + 0.5), &N, vDist, in.wpos, fwWpos)");
  assert.ok(peelLit > 0 && bump > peelLit,
    "wall bump must run after peel like GLX, not before detail");
});

test("GLX/TLX SAA snapshot N before wall bump so walls match WGX", () => {
  // WGX cannot dpdx after applyMaterialNormal (non-uniform matId). GLX used
  // to dFdx the bumped N, which widened roughness on every brick/concrete
  // seam and made WebGL2 walls duller than WebGPU. Snapshot after peel,
  // before the material bump; lighting still uses the bumped N.
  const lit = read("js/render/glx/shaders/glsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const post = read("js/render/glx/post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(lit, /vec3 Nsaa = N;/,
    "GLX must snapshot N after peel, before applyMaterialNormal");
  assert.match(lit, /saaDx = dFdx\(Nsaa\)/,
    "GLX SAA must differentiate the pre-material snapshot");
  assert.doesNotMatch(lit, /saaDx = dFdx\(N\)/,
    "do not dFdx the bumped wall N — that is the dull-wall look");
  assert.match(tsl, /const Nsaa = vec3\(N\)\.toVar\(\)/,
    "TLX must snapshot N after peel, before applyMaterialNormal");
  assert.match(tsl, /dFdx\(Nsaa\)/,
    "TLX SAA must differentiate the pre-material snapshot");
  assert.match(post, /Math\.min\(4, cMax, dMax\)/,
    "desktop GLX MSAA starts from min(4, cMax, dMax); the preset cap (ULTRA 4×, else 2×) is applied AFTER, see the gfxPreset test");
});

test("GLX MSAA cap decodes the JSON-encoded gfxPreset (ULTRA 4×, HIGH 2×, unset 2×)", () => {
  // GameStore JSON-encodes every value: the key holds "\"ultra\"" WITH the
  // quotes. 0a31155 compared the raw string to "ultra", so every desktop that
  // had ever pressed the preset button — ULTRA included — shipped at 2×. The
  // mock answers 4 samples for both formats, so the cap is the only thing
  // that can move the number; behaviour, not source text, is what's pinned.
  const msaaFor = (ls) => bootGlx({ ls }).GLX.msaa();
  assert.equal(msaaFor({ "apex26.gfxPreset": JSON.stringify("ultra") }), 4,
    "ULTRA stored the way GameStore stores it must keep 4×");
  assert.equal(msaaFor({ "apex26.gfxPreset": JSON.stringify("high") }), 2,
    "HIGH caps at 2×");
  assert.equal(msaaFor({ "apex26.gfxPreset": "ultra" }), 4,
    "a raw (unencoded) 'ultra' — a probe's --ls or an older writer — still reads as ULTRA");
  assert.equal(msaaFor({}), 2,
    "unset = the desktop default HIGH = capped");
  assert.equal(msaaFor({ "apex26.gfxHigh": "1" }), 4,
    "the legacy phone key is honoured only when the preset was never stored");
  assert.equal(msaaFor({ "apex26.gfxPreset": JSON.stringify("high"), "apex26.gfxHigh": "1" }), 2,
    "a stored preset outranks the legacy key");
  // WGX makes the same decision at module scope; pin that it decodes too.
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /_p = JSON\.parse\(_p\)/, "WGX must JSON-decode apex26.gfxPreset before comparing");
  assert.match(wgx, /_wgxMsaa4 = _p === "ultra" \|\| \(_p == null && localStorage\.getItem\("apex26\.gfxHigh"\) === "1"\)/,
    "WGX: ULTRA → 4×, unset → legacy key, anything else 1× (agreeing with GLX's cap)");
});

test("TLX shadow pool parks idle wrappers on an empty geometry; GLX road bias is one shared array", () => {
  // A hidden Mesh still references its geometry: after a track switch every
  // shadow-pool slot the new track did not refill kept an old chunk alive.
  const sh = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sh, /const parkedGeo = new THREE\.BufferGeometry\(\)/, "one shared empty geometry for parked wrappers");
  // One pool per target since 2026-09-24 (PERF-FINDINGS §2ak): endPass parks
  // the slots this target stopped using, and beginPass parks the slots the
  // previous target's pass showed — both release geometry, not only hide.
  assert.match(sh, /for \(let i = used; i < cur\.prevUsed; i\+\+\) \{ pool\[i\]\.visible = false; pool\[i\]\.geometry = parkedGeo; \}/,
    "endPass must release the discrete casters' geometry, not only hide them");
  assert.match(sh, /for \(let i = 0; i < shown\.prevUsed; i\+\+\) \{ shown\.pool\[i\]\.visible = false; shown\.pool\[i\]\.geometry = parkedGeo; \}/,
    "a pass parks the other target's shown casters, so a target that never runs again pins nothing");
  assert.match(sh, /const pools = new Map\(\);/, "one caster pool per shadow target");
  // Instanced casters are keyed one per batch (a slot pool recompiled programs
  // mid-race); freeing the batch must release its caster and geometry.
  assert.match(sh, /const iByBatch = new Map\(\)/, "instanced casters are keyed per batch, not a slot pool");
  assert.doesNotMatch(sh, /iPool/, "no instanced slot pool");
  assert.match(sh, /function freeInstanced\(batch\) \{[\s\S]*?iByBatch\.delete\(batch\);[\s\S]*?castScene\.remove\(m\);[\s\S]*?m\.dispose\(\)/,
    "freeInstanced drops the batch's caster from the cast scene and disposes it");
  const tlxSrc = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tlxSrc, /function freeInstancedBatch\(batch\) \{\s*if \(!batch\) return;\s*if \(shadowSys && shadowSys\.freeInstanced\) shadowSys\.freeInstanced\(batch\);/,
    "and TLX frees it with the batch");
  // A released geometry (freeMesh / chunked free) is parked out of every slot
  // AT ONCE: a slot is otherwise parked only by its target's next pass, which
  // cannot run while the next track builds — so every chunk geometry of the
  // old track stayed reachable through a hidden caster across the build peak.
  assert.match(sh, /function releaseGeometry\(geo\) \{[\s\S]*?for \(const pl of pools\.values\(\)\)[\s\S]*?if \(m\.geometry !== geo\) continue;\s*m\.visible = false; m\.geometry = parkedGeo;\s*try \{ m\.dispatchEvent\(\{ type: "dispose" \}\); \}/,
    "shadowSys.releaseGeometry parks every slot still pointing at the geometry AND drops its render object");
  assert.match(sh, /releaseGeometry,\n/, "and exports it");
  assert.match(tlxSrc, /function releaseGeometry\(geo\) \{[\s\S]*?meshByGeo\.delete\(geo\);\s*if \(shadowSys && shadowSys\.releaseGeometry\) shadowSys\.releaseGeometry\(geo\);/,
    "TLX's own releaseGeometry hands the geometry to the shadow pools too");
  // THE LEAK ITSELF (2026-10-02): three keeps a RenderObject — geometry, vertex
  // buffers, GPU buffers — until the OBJECT or MATERIAL dispatches "dispose";
  // geometry.dispose() alone only nulls an attribute mirror. A pooled wrapper
  // dropped without the event pinned every chunk of every freed track (~17 MB
  // of JS heap per picker pick, measured). Both drop paths go through one helper.
  assert.match(tlxSrc, /function dropWrapper\(m\) \{[\s\S]*?if \(_warmPending\) \{ _dropQueue\.push\(m\); return; \}\s*try \{ m\.dispatchEvent\(\{ type: "dispose" \}\); \}[\s\S]*?m\.geometry = null; m\.material = null;\s*\}/,
    "dropWrapper dispatches three's dispose event before nulling the wrapper — and defers while a warm's compileAsync may still hold the mesh");
  assert.match(tlxSrc, /function flushDropped\(\) \{\s*if \(_warmPending \|\| !_dropQueue\.length\) return;/, "the queue drains only once the warm settled");
  assert.match(tlxSrc, /prunePool\(_poolNow\);\s*flushDropped\(\);/, "and it drains every present, after the prune");
  assert.equal((tlxSrc.match(/dropWrapper\(m\);/g) || []).length, 3, "releaseGeometry, prunePool and the flush all drop through it");
  assert.doesNotMatch(tlxSrc.replace(/function dropWrapper[\s\S]*?\n      \}/, ""), /m\.geometry = null; m\.material = null;/,
    "no wrapper is nulled behind three's back");
  // GLX: drawShadow/drawMark/drawSkidBatch built a fresh [-4,-8] per call —
  // one array per skid mark per frame.
  const glx = read("js/render/glx/glx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(glx, /setPolyOffset\(\[-4/, "no per-draw bias literal");
  // Four since 2026-09-08: shadow, mark, skid batch, and the DRIVING LINE ribbon.
  assert.equal((glx.match(/setPolyOffset\(ROAD_BIAS\)/g) || []).length, 4, "the four road decal draws share ROAD_BIAS");
  // TLX: three honours any depthBias a material carries. The fx decals must sit
  // nearer than the road (they were -4/-8 over a [-8,-16] road and vanished,
  // gpu-census 48, 2026-09-08), and the road is now unbiased on every backend.
  const tslFx = read("js/render/three/tsl-fx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const fxF = +tslFx.match(/polygonOffsetFactor = (-?[\d.]+)/)[1], fxU = +tslFx.match(/polygonOffsetUnits = (-?[\d.]+)/)[1];
  const road = read("js/game.js").match(/_wmRoadDryD = \{[^}]*\}/);
  assert.ok(road, "the dry road material exists");
  const rb = road[0].match(/depthBias: \[(-?[\d.]+), (-?[\d.]+)\]/) || [0, 0, 0];
  assert.ok(fxF < +rb[1] && fxU < +rb[2],
    `tsl-fx fx decal offset (${fxF},${fxU}) must be nearer the camera than the road's (${rb[1]},${rb[2]})`);
});

test("all three backends carry the driving line's colour-blind palette", () => {
  // The speed cue is green/amber/red, whose two ends are the pair the common
  // red-green deficiencies cannot separate, so SETTINGS offers the IBM
  // colour-blind-safe triple instead. A backend that forgot it would signal a
  // DIFFERENT thing to the same player depending on which renderer they got —
  // the exact class of drift the parity snapshot exists for (2026-09-08).
  // Pinned by the safe triple's blue, which no other fx colour uses.
  for (const [what, file] of [["GLX", "js/render/glx/shaders/glsl-fx.js"],
                              ["WGX", "js/render/webgpu/wgsl-fx.js"],
                              ["TLX", "js/render/three/tsl-fx.js"]]) {
    const src = read(file).replace(/^[ \t]*\/\/.*$/gm, "");
    assert.match(src, /0\.392,\s*0\.561,\s*1\.0/,
      `${what} (${file}) must carry the colour-blind-safe ON-PACE blue`);
    assert.match(src, /0\.863,\s*0\.149,\s*0\.498/,
      `${what} (${file}) must carry the colour-blind-safe BRAKE magenta`);
  }
});

test("WGX cloud deck carries GLX's overcast / golden / twilight / moon shading", () => {
  // The deck used to ignore overcast entirely (no clamped sun, no grey mix),
  // so heavy cloud read flatter and brighter on WGX than on GLX/TLX. Pin the
  // terms that were missing, in the same shape GLX SKY_FS writes them.
  const glx = read("js/render/glx/shaders/glsl-sky.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const wgsl = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  for (const [name, g, w] of [
    ["overcast sun clamp", /mix\(sunBright, min\(sunBright, 0\.55\), overcast\)/, /mix\(sunBright, min\(sunBright, 0\.55\), overcast\)/],
    ["grey tops", /vec3\(0\.62, 0\.63, 0\.65\), overcast \* 0\.65\)/, /vec3<f32>\(0\.62, 0\.63, 0\.65\), overcast \* 0\.65\)/],
    ["grey bases", /vec3\(0\.19, 0\.19, 0\.22\), overcast \* 0\.60\)/, /vec3<f32>\(0\.19, 0\.19, 0\.22\), overcast \* 0\.60\)/],
    ["golden tops", /mix\(1\.45, 2\.6, golden\)/, /mix\(1\.45, 2\.6, goldenCl\)/],
    ["pink undersides", /vec3\(0\.9, 0\.42, 0\.5\) \* \(0\.22 \* golden/, /vec3<f32>\(0\.9, 0\.42, 0\.5\)\s*\* \(0\.22 \* goldenCl/],
    ["day cap/base contrast", /cloudBot \* 0\.80, cloudTop \* 1\.14, capf\), daytime \* 0\.45\)/, /cloudBot \* 0\.80, cloudTop \* 1\.14, capf\), daytime \* 0\.45\)/],
    ["twilight wash", /pow\(sd, 2\.5\) \* twilight \* 0\.30 \* \(1\.0 - overcast \* 0\.6\)/, /pow\(sd, 2\.5\) \* twilight \* 0\.30 \* \(1\.0 - overcast \* 0\.6\)/],
    ["moon silver", /vec3\(0\.08, 0\.10, 0\.16\)/, /vec3<f32>\(0\.08, 0\.10, 0\.16\)/],
  ]) {
    assert.match(glx, g, `GLX still carries the ${name} term`);
    assert.match(wgsl, w, `WGX must carry the ${name} term`);
  }
});

test("boot audit: scenery loads are memoised, car assets warm in startRace, decal key prefix is cached", () => {
  const game = read("js/game.js").replace(/^[ \t]*\/\/.*$/gm, "");
  // ensureScenery: four callers race the same circuit at boot; the promise memo
  // is what stops each of them injecting its own copy of the closure.
  const lazy = read("js/core/lazy-bundles.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const fetchAt = lazy.indexOf("function fetchScenery(");
  assert.ok(fetchAt >= 0, "LazyBundles owns the shared scenery fetch");
  const fetch = lazy.slice(fetchAt, lazy.indexOf("\n}\n", fetchAt));
  assert.match(fetch, /_sceneryLoads\.get\(id\)/, "fetchScenery must consult the in-flight memo");
  assert.match(fetch, /_sceneryLoads\.set\(id, p\)/, "the pending fetch is shared by every caller");
  assert.match(fetch, /_sceneryLoads\.delete\(id\)/, "and clear it on settle so a dropped fetch retries");
  const ensureAt = lazy.indexOf("async function ensureScenery(");
  assert.ok(ensureAt >= 0);
  assert.match(lazy.slice(ensureAt, lazy.indexOf("\n}\n", ensureAt)), /await fetchScenery\(def\.id\)/,
    "ensureScenery awaits the memoised fetch helper");
  // warmCarAssets: the caches were lazy, so the first countdown frame built
  // every mesh and atlas; startRace now does it before the first render.
  // startRace() itself is a re-entrancy-latch wrapper (start-race-latch
  // .test.mjs) around startRaceBody(), which still carries this whole flow.
  const sr = game.slice(game.indexOf("async function startRaceBody("), game.indexOf("function showTouchControls("));
  assert.match(sr, /RaceEntryProfile\.span\("warmCarAssets", \(\) => warmCarAssets\(\)\);[\s\S]{0,160}?RaceEntryProfile\.span\("debrisPrime"/,
    "startRace warms car assets right before DebrisWorld.prime()");
  // The warm-up and the decal atlas cache live in the car-draw seam (js/car/car-draw.js).
  const cd = read("js/car/car-draw.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const wa = cd.slice(cd.indexOf("function warmCarAssets("), cd.indexOf("function drawCarDecals("));
  assert.match(wa, /if \(c\.isPlayer\) playerBodyMesh\(c\.team, c\); else teamBodyMesh\(c\.team, c\);/, "same mesh cache keys the draw uses — the CAR, so the warm-up fills the per-driver key the draw asks for");
  assert.match(wa, /getCarDecalTexture\(c\.team, carDecalNum\(c\.team, c\), !!c\.isPlayer\)/, "same atlas key the draw queues");
  // decal key: the livery half is memoised on store.rev, the teamMeshKey pattern.
  // …and each FULL key (prefix + seat [+ ":P"]) is memoised on that entry, so a hit concatenates nothing.
  assert.match(cd, /const key = decalKeyFor\(team, num, isPlayer\);/, "getCarDecalTexture builds its key from the memoised prefix");
  assert.match(cd, /k = e\.val \+ \(num == null \? "_" : num\) \+ \(isPlayer \? ":P" : ""\)/, "the full key is the prefix + seat (+ :P), as before");
  assert.match(cd, /if \(c && c\.rev === G\.store\.rev\) return c;[\s\S]{0,200}team\.id \+ ":" \+ G\.getLiveryId\(team\.id\) \+ ":"/, "decalKeyEntry invalidates on store.rev");
});

test("GLX links its core programs as one parallel batch when KHR_parallel_shader_compile exists", () => {
  // Reading LINK_STATUS right after linkProgram forces the compile to finish
  // before the next program is even issued — 18 programs in strict series.
  // With the extension, the eight core links are issued first and their
  // statuses read afterwards; without it, link() behaves exactly as before.
  const order = (h) => {
    const links = [], statuses = [];
    h.calls.forEach((c, i) => {
      if (c[0] === "linkProgram") links.push(i);
      if (c[0] === "getProgramParameter" && c[1][1] === h.enums.LINK_STATUS) statuses.push(i);
    });
    return { links, statuses };
  };
  const parallel = bootGlx({ parallel: true });
  const par = order(parallel);
  assert.equal(parallel.count("getShaderParameter"), 0,
    "successful shaders must not block the pending batch on COMPILE_STATUS");
  assert.ok(par.links.length >= 8, "the core batch links at least eight programs");
  assert.ok(par.statuses.length >= 8, "every program's LINK_STATUS is still read (failures still surface)");
  assert.ok(par.statuses[0] > par.links[7],
    `parallel: the first LINK_STATUS read (call #${par.statuses[0]}) must come after the eighth linkProgram (call #${par.links[7]})`);
  // Serial pairs: a LINK_STATUS read between one linkProgram and the next. The
  // post chain's eight (glx/post.js setup) are a second batch: in parallel mode
  // only the single lazy links (depth, SGSR, mirror) and the batch ends stay serial.
  const serial = (o) => o.links.slice(0, -1).filter((l, i) => o.statuses.some((st) => st > l && st < o.links[i + 1])).length;
  const seq = order(bootGlx());
  assert.ok(par.links.length >= 16, "core + post links both issued (got " + par.links.length + ")");
  assert.ok(serial(par) <= serial(seq) - 12,
    `parallel: the core and post batches issue their links back to back (serial pairs ${serial(par)} vs ${serial(seq)} without the extension)`);
  assert.ok(seq.statuses[0] < seq.links[1],
    "without the extension each link is checked before the next is issued (unchanged contract)");
  const glx = read("js/render/glx/glx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(glx, /getExtension\("KHR_parallel_shader_compile"\)/, "init() requests the extension");
});

test("GLX still diagnoses and releases a failed shader after linking", () => {
  for (const parallel of [false, true]) {
    const calls = [];
    assert.throws(() => bootGlx({ parallel, shaderFailure: true, calls }), /refused/);
    const firstLink = calls.findIndex(([name]) => name === "linkProgram");
    const firstStatus = calls.findIndex(([name]) => name === "getShaderParameter");
    assert.ok(firstStatus > firstLink, "compiler diagnostics are deferred until link failure");
    assert.ok(calls.some(([name]) => name === "getShaderInfoLog"));
    const deleted = calls.filter(([name, args]) => name === "deleteProgram" && args[0].shaders.some((sh) => sh.id === 1));
    assert.equal(deleted.length, 1, "the failed program is released exactly once");
  }
});

test("GLX chunked road draws honor depth bias and back faces, then restore state", () => {
  const h = bootGlx();
  const model = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const tri = { pos: [0,0,0, 0.1,0,0, 0,0.1,0], nrm: [0,0,1, 0,0,1, 0,0,1], col: [1,1,1, 1,1,1, 1,1,1], idx: [0,1,2] };
  const mesh = h.GLX.createMesh(tri);
  h.GLX.begin(h.frame({ viewProj: model }));
  const road = { surfaceId: 16, doubleSided: true, depthBias: [-8, -16] };
  for (const chunked of [false, true]) {
    mesh.chunks = chunked ? [{ byteOffset: 0, count: 3, indexType: mesh.indexType, min: [0,0,0], max: [0.1,0.1,0] }] : null;
    for (const fail of [false, true]) {
      h.reset();
      let drew = false;
      h.answers.drawElements = () => {
        drew = true;
        assert.ok(h.calls.some(([n, a]) => n === "disable" && a[0] === h.gl.CULL_FACE));
        assert.ok(h.calls.some(([n, a]) => n === "enable" && a[0] === h.gl.POLYGON_OFFSET_FILL));
        assert.ok(h.calls.some(([n, a]) => n === "polygonOffset" && a[0] === -8 && a[1] === -16));
        if (fail) throw new Error("injected draw failure");
      };
      if (fail) assert.throws(() => h.GLX.drawChunked(mesh, model, road), /injected/);
      else h.GLX.drawChunked(mesh, model, road);
      assert.ok(drew, "the visible road was drawn");
      const lastState = (cap) => h.calls.filter(([n, a]) => (n === "enable" || n === "disable") && a[0] === cap).at(-1)?.[0];
      assert.equal(lastState(h.gl.CULL_FACE), "enable");
      assert.equal(lastState(h.gl.POLYGON_OFFSET_FILL), "disable");
    }
  }
  h.answers.drawElements = () => {};
  h.reset();
  h.GLX.drawChunked(mesh, model, {});
  assert.equal(h.count("polygonOffset"), 0, "ordinary scenery needs no depth bias");
});

test("the flyby plays on the pre-race loading screen only; the picker pre-builds it hidden once the pick settles", () => {
  const game = read("js/game.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const raceSettings = read("js/race/race-settings.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const menus = read("js/ui/select-screen.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(game, /\n\s*scheduleFlybyTrack\(\);\s*\n\s*window\.addEventListener\("resize"/,
    "the boot builds no world for the title");
  assert.match(raceSettings, /\$\("race-settings"\)\.hidden = false;\s*scheduleFlybyTrack\(\);/,
    "opening race settings schedules the flyby of the chosen circuit (120 ms)");
  // The TIME OF DAY row's write (js/ui/setting-row.js): every write repaints the
  // screen through wireRaceSettings' `after`, so only the flyby call is pinned.
  assert.match(raceSettings, /wire\("rs-time", \(\) => G\.raceTimeOfDay, \(v\) => \{ G\.raceTimeOfDay = v; scheduleFlybyTrack\(\); \}\)/,
    "a time-of-day pick re-lights the race-settings flyby (memoised build, so GO pays nothing twice)");
  assert.match(menus, /scheduleFlybyTrack\(true\)/,
    "a circuit tile pre-builds after the settle delay, never on the tap itself");
  // 400 ms, not the old 1.5 s: the idle gate (menuIdle) is what keeps the build
  // off a tapping player; the settle only holds back the scenery fetch, and at
  // 1.5 s it made a RACE! tap within ~5 s of the picker meet the build card.
  assert.match(game, /settle \? 400 : 120/);
  // Under a menu that draws nothing the canvas is hidden — so neither a finished
  // race's last frame nor the garage's car sits behind the title. Since
  // 2026-09-16 RACE SETTINGS is no longer an exception: the warmed world is
  // spent on the LOADING SCREEN's cinematic instead, between RACE! and the grid,
  // so the settings rows are read against black rather than a moving world.
  // The gate runs before every early return, and a freshly built world still
  // gets its warm-up frames hidden.
  assert.match(game, /const menuBlank = \(state === "menu" && !setupPreviewOn && !homeTrack && \(!track \|\| !loadingScreen\.active\(\) \|\| !menuWorld\(\)\)\)\s*\|\| \(\(loadingScreen\.phase\(\) === "build" \|\| loadingScreen\.phase\(\) === "busy"\) && !setupPreviewOn\);/);
  assert.match(raceSettings, /else if \(raceIntro\) \{[\s\S]{0,200}?try \{ raceIntro\(startRace, sheet, \$\("rs-go"\)\); \} catch \(e\) \{[^}]*startRace\(\); \}/,
    "RACE! goes through the loading screen; the QUALIFYING branch above it does not (sheet to sheet)");
  assert.match(game, /function clearMenuScreens\(\) \{\s*cancelIntro\(\);\s*loadingScreen\.stop\(\);/,
    "the screen is disarmed before the sweep hides it, or its pending timer fires into a running race");
  assert.match(game, /if \(menuBlank && !\(track && _menuGate\.warm > 0\)\) return;/);
  assert.match(game, /if \(state === "results"(?: && !resultsCam\.live\(\))?\) return;/,
    "results keeps the last race present — physics already stopped, re-drawing is unpaid (ResultsCam.live is the orbit/highlights exception)");
  // endRace's OWN call: over all of game.js the match began at startRaceBody's
  // rainShow(false), so deleting endRace's still passed (audit 2026-09-29).
  assert.match(fnSource(game, "function endRace(forcedOrder)"), /Particles\.rainShow\(false\);\s*if \(soundOn\) GameAudio\.finish\(\);/,
    "endRace clears the 2D rain overlay the way quitToMenu already did");
  // ResultsCam.live() + heldWarm: order pins below use the full render body.
  const renderBody = fnSource(game, "function render(dt)");
  for (const boundary of ["const menuBlank", "if (setupPreviewOn && !heldWarm)", "if (!track) return;"]) {
    assert.ok(renderBody.includes(boundary), "render contains the boundary: " + boundary);
  }
  assert.ok(renderBody.indexOf("const menuBlank") < renderBody.indexOf("if (setupPreviewOn && !heldWarm) {"),
    "the visibility gate precedes the garage-preview return");
  const resultsGate = renderBody.search(/if \(state === "results"(?: && !resultsCam\.live\(\))?\) return;/);
  assert.ok(resultsGate >= 0 && resultsGate < renderBody.indexOf("if (setupPreviewOn && !heldWarm)"),
    "results freeze precedes the garage-preview return");
  assert.match(renderBody, /!resultsCam\.live\(\)/,
    "ResultsCam.live() keeps redrawing chequered/orbit/highlights");
  assert.ok(renderBody.indexOf("const menuBlank") < renderBody.indexOf("if (!track) return;"),
    "the visibility gate precedes the no-track return");
  assert.match(game, /builtTrackId !== def\.id \|\| builtTrackNight !== sessionDark/,
    "loadTrack's memo still makes a repeat build free");
});

test("driving feel: the player tows on car positions only, the fronts lock, every car pops on lift", () => {
  const game = read("js/game.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const human = game.slice(game.indexOf("throttleLvl = inp ? (inp.throttleLevel ?? 1)"), game.indexOf("AiDrive.beginLook();"));
  assert.match(human, /c\.wake = wakeOf\(tg, tc\._snapX - c\.x\)/, "the player's tow uses the AI's window and fade");
  assert.match(human, /vmax \*= 1 \+ AiDrive\.towGain\(!!track\.street\) \* c\.towing/, "and the AI's gain");
  assert.doesNotMatch(human, /Tracks\.curvature|kMax/, "the player's gate is driver state, never the arc");
  // Combined-slip / wheelLock live in PlayerForces (carve-headroom A).
  const forces = read("js/physics/player-forces.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(forces, /c\.wheelLock = braking && c\.speed > 0 && axFracF > 0\.60/, "a lock-up fires only rolling forwards (brake-held reverse is not a stop), inside the REACHABLE front-axle budget: axFracF peaks at 0.638 dry / 0.887 rain (0.638 even at 62 % front bias), so a 0.92 gate can never fire and the flat-spot system behind it is dead code");
  // The planted wheels spin in the car-draw seam (js/car/car-draw.js), which reads WHEEL_R off PhysicsConsts.
  const cd = read("js/car/car-draw.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(cd, /c\.wheelSpinF = \(\(c\.wheelSpinF \|\| 0\) \+ \(c\.speed \/ PhysicsConsts\.WHEEL_R\) \* dt \* \(1 - \(c\.wheelLock \|\| 0\)\)\)/, "locked fronts stop turning");
  assert.match(game, /const thr = c\.human \? onThrottle : !braking;/, "AI cars lift when they start braking");
  // The flame moved into the car-draw seam (drawExhaustFx); rivals past 60 m drop it (FieldLod).
  assert.match(cd, /if \(\(c\.exhaustPop \|\| 0\) > 0\.05 && flameOk\) \{/, "the flame draws for every car, not only the player");
  assert.match(game, /carDraw\.drawExhaustFx\(c, tmpMat, c\.isPlayer && isErsDeploying\(c\), FieldLod\.flame\(_lodD2\)\)/, "for every drawn car");
  const eng = read("js/audio/engine.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(eng, /\(1 - 0\.35 \* tow\) \* windOpen/, "the wind drops in a tow");
});

test("pcssPen help names desktop three.js WebGL2 as live", () => {
  const lighting = read("js/lighting/knobs.js");
  assert.match(lighting, /three\.js desktop WebGL2/,
    "SHADOW SOFTEN help must not still say three.js WebGL2 is a no-op");
  assert.doesNotMatch(lighting, /this slider does nothing on that path only/,
    "phones / software WebGL2 now scale Poisson R — do not call the slider a no-op");
  assert.match(lighting, /scales the fixed Poisson radius/,
    "help must name the software/phone R-scale so the slider is not a mystery");
});

test("GLX present reuses scratch vectors and skip-equals grade", () => {
  const h = bootGlx();
  const opts = { grade: { shadow: [0.9, 0.95, 1.0], hi: [1, 1, 1], str: 0.3 } };
  h.GLX.begin(h.frame()); h.GLX.present(opts);
  h.reset();
  h.GLX.begin(h.frame()); h.GLX.present(opts);
  assert.equal(h.count("uniform3f", (a) => a[0].name === "uGradeShadow"), 0, "an unchanged split-tone grade is not re-uploaded");
  h.reset();
  h.GLX.begin(h.frame()); h.GLX.present({ grade: { shadow: [0.8, 0.95, 1.0], hi: [1, 1, 1], str: 0.3 } });
  assert.equal(h.count("uniform3f", (a) => a[0].name === "uGradeShadow"), 1, "a changed grade uploads once");
  const post = code("js/render/glx/post.js");
  assert.match(post, /\b_ONE3\s*=\s*\[\s*1\s*,\s*1\s*,\s*1\s*\]/, "neutral grade / sunColor fallback must not allocate [1,1,1] per frame");
  assert.match(post, /\b_NEGZ\s*=\s*\[\s*0\s*,\s*0\s*,\s*-1\s*\]/, "sunVS fallback must not allocate [0,0,-1] per frame");
  assert.doesNotMatch(post, /uniform3fv\(\s*compU\.uGradeShadow/, "do not bypass _compUf for uGradeShadow");
});

test("WGX COMPOSITE declares ssrWet and does not remul wetness", () => {
  // d6c8fa17 dropped `let ssrWet = U.lift.w` and left `if (ssrWet > 0.001)` —
  // Dawn rejected the identifier and shed COMPOSITE. Deploy re-declares the
  // let so a leftover use compiles; wetness still lives in the SSR pass .a,
  // so the consume gate must not remultiply it.
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /let ssrWet = U\.lift\.w/,
    "COMPOSITE must declare ssrWet so Dawn does not reject a leftover use");
  assert.doesNotMatch(post, /ssrWet \* ssrRefl/,
    "do not remultiply wetness * reflect — that zeros dry sheen");
  assert.match(post, /if \(ssrRefl > 0\.001 \|\| ssrCar > 0\.001\)/,
    "SSR consume gate is reflect || carReflect, not the wetness lane");
});

test("WGX bloom final upsample overwrites mip0 like GLX/TLX", () => {
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /loadOp: last \? "clear" : "load"/,
    "mip0 upsample must clear (overwrite the sharp bright-pass), not load+add");
});

test("WGX screen sun-shaft is zero when bloom is shed", () => {
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /shaftMul = \(bloomAmt > 0 && sun && sun\.shaft > 0\)/,
    "shaft pass reads the bloom chain — producer must say 0 when bloomAmt is 0");
});

test("WGX godray requires invViewProj like GLX/TLX", () => {
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /godrayBG && lastFrame && lastFrame\.invViewProj/,
    "haveGR without invVP marches IDENT world rays");
});

test("TLX godray uses partial nearest-K, not a full sort", () => {
  // _grKeepNearest itself (present in all three backends, swap-not-overwrite
  // eviction) is driven by tests/unit/godray-keep-nearest.test.mjs.
  const tlx = code("js/render/three/tlx-post.js");
  assert.match(tlx, /grNL\s*=\s*_grKeepNearest\(\s*total\s*,\s*6\s*\)/, "uploader cap must stay 6 (TSL march bound)");
  assert.doesNotMatch(tlx, /_grSel\.sort\(/, "do not full-sort the floodlight list every night frame");
});

test("TLX software/phone WebGL2 scales Poisson R from pcssPen", () => {
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tsl, /R\.assign\(float\(3\.0\)\.mul\(U\.pcssPen\.div\(80\.0\)\)\)/,
    "blocker-off path must scale R by pcssPen/80 (identity at the shipped def)");
  assert.match(tsl, /\}\)\.Else\(\(\) => \{/,
    "desktop blocker-on / PCSS-off path must also scale R (not freeze at 3.0)");
  assert.equal((tsl.match(/R\.assign\(float\(3\.0\)\.mul\(U\.pcssPen\.div\(80\.0\)\)\)/g) || []).length, 2,
    "both the no-blocker else and the PCSS-off Else must scale R");
});

test("lamp bounce ALU is gated when bounceK is 0 on all three backends", () => {
  const glx = read("js/render/glx/shaders/glsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const wgsl = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(glx, /if \(uBounceK > 0\.0\)/,
    "GLX lamp bounce must skip when LAMP BOUNCE is 0");
  assert.match(wgsl, /if \(F\.params3\.x > 0\.0\)/,
    "WGX lamp bounce must skip when bounceK is 0");
  assert.match(tsl, /If\(U\.bounceK\.greaterThan\(0\.0\)/,
    "TLX lamp bounce must skip when bounceK is 0");
});

test("WGX SSAO kernel is the GLX/TLX K[0..7] fan, not an even ring", () => {
  const post = read("js/render/webgpu/wgsl-post.js");
  assert.match(post, /const SSAO_K = array<vec2<f32>, 8>/,
    "WGX SSAO must name the shared 8-tap fan");
  assert.match(post, /vec2<f32>\(0\.0, 1\.0\).*vec2<f32>\(-0\.5, -0\.866\)/s,
    "kernel must be the first 8 of GLX K[12]");
  assert.doesNotMatch(post.replace(/^[ \t]*\/\/.*$/gm, ""),
    /\(f32\(i\) \+ 0\.5\) \/ 8\.0 \* 6\.2832/,
    "do not rebuild an even 2π ring — that is the look gap vs GLX/TLX");
});

test("HDR grade is gated on all three backends when knobs are neutral", () => {
  // applyHdrGrade at shipped defaults is an identity that still costs ~20 ALU
  // + transcendentals per full-res pixel. GLX/TLX skip it; WGX used to always
  // run it (and the max(c,0) clamp is the only non-identity).
  const glx = read("js/render/glx/shaders/glsl-post.js");
  assert.match(glx, /if \(uHdrGradeOn > 0\.5\) c = applyHdrGrade\(c\)/,
    "GLX composite must keep the uHdrGradeOn gate");
  const wgsl = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgsl, /if \(U\.tone1\.w > 0\.5\) \{ c = applyHdrGrade\(c\); \}/,
    "WGX must gate applyHdrGrade on tone1.w (hdrGradeOn)");
  assert.doesNotMatch(wgsl, /^\s*c = applyHdrGrade\(c\);/m,
    "do not always run applyHdrGrade — that is the skip-path drift vs GLX/TLX");
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /s\[43\] = _hg \? 1 : 0/,
    "WGX must pack hdrGradeOn into the tone1.w pad");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /hdrGradeOn\.greaterThan\(0\.5\)/,
    "TLX composite must keep the hdrGradeOn gate");
  const tlxPost = read("js/render/three/tlx-post.js");
  assert.match(tlxPost, /C\.hdrGradeOn\.value = _hg \? 1 : 0/,
    "TLX must still compute the same off-neutral _hg mask as GLX");
});

test("TLX software sky fallback is a zenith-horizon mix, not a flat lid", () => {
  const sky = read("js/render/three/tsl-sky.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sky, /mix\(U\.zenith,\s*U\.horizon,\s*t\)/,
    "fallbackNode must mix the same zenith/horizon uniforms the full sky reads");
  assert.doesNotMatch(sky, /fallbackNode = Fn\(\(\) => vec4\(U\.zenith, 1\.0\)\)/,
    "do not fall back to a flat zenith lid — that is the washed software-GL sky");
});

test("TLX desktop WebGL2 builds a color-depth PCSS blocker", () => {
  const sh = read("js/render/three/tlx-shadow.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(sh, /colorPcss/,
    "WebGL2 desktop must take the depth-in-color blocker path");
  assert.match(sh, /TSL\.depth/,
    "sun casters must write TSL.depth into the R16F color attachment");
  assert.match(sh, /colorPcss \? sunRT\.texture : sunRT\.depthTexture/,
    "WebGL2 blocker taps the color attachment, WebGPU still textureLoads depth");
});

test("WGX SSR car streak uses carGloss like GLX/TLX", () => {
  // A single tap left CAR GLOSS dead on WebGPU and night lamps as hard dots.
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const glx = read("js/render/glx/shaders/glsl-post.js");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(post, /gloss\s*:\s*vec4<f32>/,
    "SsrU must carry carGloss");
  assert.match(post, /clamp\(\(1\.4 - U\.gloss\.x\) \* 0\.5, 0\.0, 1\.0\)/,
    "carSoft must match GLX (1.4 - uCarGloss) * 0.5");
  assert.match(post, /carReflect \* \(0\.006 \+ 0\.030 \* carSoft\)/,
    "car streak width must match GLX uCarReflect * (0.006 + 0.030 * carSoft)");
  assert.match(post, /hitDist \/ 25\.0/,
    "contact hardening must scale the streak by march hit distance");
  assert.match(glx, /float carSoft = clamp\(\(1\.4 - uCarGloss\) \* 0\.5/,
    "GLX still owns the carSoft formula — WGX is the port");
  assert.match(tsl, /float\(1\.4\)\.sub\(C\.carGloss\)\.mul\(0\.5\)/,
    "TLX still owns the carSoft formula — WGX is the port");
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /s\[48\] = PostCommon\.knob\(T, "carGloss"\)/,
    "WGX must pack carGloss into SsrU gloss.x");
});

test("WGX SSR is consumed same-frame in COMPOSITE, not next-frame LIT", () => {
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /binding\(8\) var ssrPostTex/,
    "COMPOSITE must bind this-frame ssrTex");
  assert.match(post, /ssrPostTex/,
    "COMPOSITE must sample the SSR target");
  const lit = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(lit, /wetSheen > 0\.001 && ssrStrength > 0\.001/,
    "LIT must not still mix last frame's ssrTex into wet road");
});

test("WGX SSR consume/march/sinT match GLX (no wetness remul, dry sheen lives)", () => {
  const post = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(post, /ssrWet \* ssrRefl/,
    "COMPOSITE must not remultiply wetness * reflect — that zeros dry sheen");
  assert.match(post, /ssr\.rgb \* aoV \* aoV/,
    "COMPOSITE must apply Lagarde ao² to reflected RGB like GLX");
  assert.match(post, /clamp\(ssr\.a, 0\.0, 0\.85\)/,
    "COMPOSITE must mix by the pass .a (already gated + dry-faded)");
  assert.match(post, /sinT > 0\.08/,
    "SSR Nv must use the GLX/TLX scale-free sinT fallback");
  assert.match(post, /var stepLen = 0\.55/,
    "march start must match GLX 0.55 m, not the old 0.40");
  assert.match(post, /stepLen = stepLen \* 1\.16/,
    "march growth must match GLX 1.16, not the old 1.15");
  assert.match(post, /for \(var j = 0; j < 4; j = j \+ 1\)/,
    "binary refine must be 4 like GLX, not 5");
  assert.match(post, /min\(gateSrc \/ 0\.20, 1\.0\)/,
    "SSR pass must apply the dry-sheen fade once so COMPOSITE can trust .a");
  assert.match(post, /let ssrWet = U\.lift\.w/,
    "COMPOSITE must declare ssrWet = U.lift.w so Dawn does not reject a leftover use");
  assert.equal((post.match(/let gateSrc/g) || []).length, 1,
    "do not redeclare gateSrc — Dawn refuses SSR and sheds the whole post chain");
  assert.equal((post.match(/min\(gateSrc \/ 0\.20, 1\.0\)/g) || []).length, 1,
    "a merge leftover applied the dry damp twice (and squared the sheen)");
});

test("WGX SAA widens roughness before wet like GLX", () => {
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const saa = chunks.indexOf("let saaVar = mix(saaVarGeo, saaVarPeel");
  // Prefix, not the full condition: the road block is gated off car surfaces
  // ("&& !classifiedCar") and the car wet look follows it — both after SAA.
  const wet = chunks.indexOf("if (wetness > 0.001");
  assert.ok(saa > 0 && wet > saa,
    "SAA after wet extra-widens puddle edges — GLX widens, then polishes");
  assert.match(chunks, /a = rough \* rough;/,
    "wet must recompute a after polishing, like GLX lit.js");
});

test("TLX FS mat stays a smooth attribute (flat varying blanks the garage car)", () => {
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tsl, /const matA = float\(attribute\("mat", "float"\)\)\.toVar\(\)/,
    "FS must read attribute(mat) directly — varying()+FLAT made the garage car vanish");
  assert.doesNotMatch(tsl, /InterpolationSamplingType\.FLAT/,
    "do not setInterpolation(FLAT) on mat — three r185 compiled it and drew nothing");
  assert.match(tsl, /const matA = attribute\("mat", "float"\)/,
    "FLAG VS wave must keep the per-vertex attribute (fract(aMat) weight)");
  assert.match(tsl, /const ridgePhase0 = hc\.mul\(7\.5\)/,
    "corrugation fwidth must match GLX hc*7.5, not abs(hc)*5.5");
});

test("TLX SSAO does not flip N.z; SSR self-hit still does", () => {
  const tsl = read("js/render/three/tsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const ssao = tsl.slice(0, tsl.indexOf("Contact shadows"));
  assert.doesNotMatch(ssao, /If\(N\.z\.lessThan\(0\.0\)/,
    "GLX SSAO does not flip N.z — the coin toss darkens walls");
  assert.match(tsl, /If\(hN\.z\.lessThan\(0\.0\)/,
    "SSR grazing self-hit reject still flips hN like GLX");
});

test("road-marking mip uses unclamped fwX on all three backends", () => {
  const glx = read("js/render/glx/shaders/glsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(glx, /float fwX = max\(fwidth\(x\), 1e-4\)/,
    "GLX mip must read raw fwidth, not the clamped aaX (0.30 ceiling → mip 0)");
  assert.match(glx, /1\.0 - \(fwX - 0\.10\) \/ 0\.55/,
    "GLX mip knee must match WGX 0.10/0.55");
  assert.match(tsl, /const fwX = max\(fwidth\(x\), 1e-4\)/,
    "TLX mip must read raw fwidth like WGX/GLX");
  assert.match(tsl, /fwX\.sub\(0\.10\)\.div\(0\.55\)/,
    "TLX mip knee must match WGX 0.10/0.55");
  assert.match(chunks, /let fwX = max\(fwTrk\.y, 1e-4\)/,
    "WGX still owns the unclamped form");
});

test("SSAO tap setup is skipped when strength is 0 on all three backends", () => {
  // Contact shadows keep the pass live at aoStr=0; the 8 dependent depth
  // fetches must not still run. strength/uStrength is a uniform.
  const glx = read("js/render/glx/shaders/glsl-post.js");
  assert.match(glx, /if \(uStrength > 0\.0\)/,
    "GLX SSAO must keep the uStrength tap gate");
  const wgsl = read("js/render/webgpu/wgsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgsl, /if \(strength > 0\.0\)/,
    "WGX SSAO must skip the 8-tap loop when AO strength is 0");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /ssaoU\.strength\.greaterThan\(0\.0\)/,
    "TLX SSAO must skip the 8-tap loop when AO strength is 0");
});

test("Gfx seam lists instancing on all three backends", () => {
  const gfx = read("js/render/gfx.js");
  assert.match(gfx, /GLX \+ WGX \+ TLX implement the family/,
    "gfx.js must not still say TLX exports instancing as undefined");
});

test("TLX garage (noEnv) paints the canvas, not the HDR scene target", () => {
  // Setup preview sets noEnv (and may still pass proj for SSAO). The HDR RT
  // stayed black on software GL (viz=scene was empty) so the turntable
  // vanished while GLX was fine — gate the post chain on !noEnv.
  const src = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(src, /if \(post && _postF\.proj && !_postF\.noEnv\)/,
    "post chain must skip noEnv garage frames — they must not render into sceneRT");
  assert.match(src, /_postF\.noEnv\s*=/,
    "begin() must latch frame.noEnv onto _postF for present()");
});

test("TLX copies matrix → matrixWorld on every pooled mesh (cars otherwise sit at origin)", () => {
  // scene.matrixWorldAutoUpdate is false; three uploads matrixWorld as the
  // model matrix. Writing only `.matrix` left cars/flaps/shadows at identity —
  // invisible on track (world-space chase cam), fine in the garage (car near
  // origin). World-baked track still looked correct with identity.
  const src = TLX.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /matrixWorldAutoUpdate\s*=\s*false/,
    "matrixWorldAutoUpdate latch moved — re-check whether acquireMesh still must promote");
  const acq = src.indexOf("function acquireMesh");
  assert.notEqual(acq, -1, "acquireMesh moved");
  const body = src.slice(acq, acq + 2800);   // skip-unchanged matrix path (perf(frame)) lengthened the stamp
  assert.match(body, /matrixWorld\.copy\(\s*m\.matrix\s*\)/,
    "acquireMesh must promote m.matrix into matrixWorld on a dirty write — without it every " +
    "draw() with a non-identity model (cars) renders at the world origin");
  assert.match(body, /__tlxIdent/,
    "identity/dirty skip latch must remain so unchanged MAT_IDENT draws skip the copy");
});

test("three's WebGPU backend still maps the alpha parameter to the canvas alphaMode", () => {
  // Makes the assertion above SUFFICIENT for that backend. If three stops
  // reading the parameter, alpha:false becomes a no-op and cars ghost again on
  // desktop WebGPU with nothing failing.
  assert.match(THREE_BUNDLE, /alpha\s*\?\s*"premultiplied"\s*:\s*"opaque"/,
    "bundled three no longer derives alphaMode from the alpha parameter");
});

test("TLX supplies its own WebGL2 context, because three hardcodes alpha there", () => {
  const params = rendererParams();
  assert.match(params, /context:/,
    "the WebGL path needs a caller-supplied context: three ignores alpha:false there");

  // The context TLX makes must itself be opaque, and must only be made for the
  // WebGL path — three's WebGPU backend reads parameters.context too and would
  // try to configure a WebGL2 context as a WebGPU one.
  const at = TLX.indexOf('getContext("webgl2"');
  assert.notEqual(at, -1, "TLX no longer creates its own WebGL2 context");
  const call = TLX.slice(at, at + 500);
  assert.match(call, /alpha:\s*false/, "TLX's own context must be opaque");
  const guard = TLX.slice(Math.max(0, at - 400), at);
  assert.match(guard, /if\s*\(\s*forceWebGL\s*\)/,
    "the hand-made WebGL2 context must be gated on forceWebGL");
});

test("the hand-made WebGL2 context still matches three's own attribute set", () => {
  // Supplying `context` means three stops deriving the attributes and we own
  // ALL of them, not just the one we came to change. Today ours is three's set
  // byte for byte except alpha:
  //   three: { antialias: currentSamples > 0, alpha: !0, depth: e.depth, stencil: e.stencil }
  //   ours:  { antialias: false,               alpha: false, depth: true,  stencil: false }
  // and those agree only because TLX overrides neither depth nor stencil, so
  // the renderer holds three's defaults — depth true, stencil false. Should a
  // three bump default stencil back to true, its passes would want a stencil
  // buffer that our context never asked for, and nothing else would notice.
  assert.match(THREE_BUNDLE, /depth:\w+=!0,stencil:\w+=!1/,
    "three's depth/stencil defaults moved — re-derive the context TLX hands it");

  const tlx = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const ctx = tlx.match(/getContext\("webgl2",\s*\{([^}]*)\}/);
  assert.ok(ctx, "TLX no longer makes its own WebGL2 context");
  assert.match(ctx[1], /depth:\s*true/, "context must request depth (three's default)");
  assert.match(ctx[1], /stencil:\s*false/, "context must match three's stencil default");
  // Not cosmetic either: three's antialias becomes samples>0 on the DEFAULT
  // canvas target, so a context that disagrees with the renderer gets a
  // multisample resolve mismatch on the very path this fix exists to protect.
  // 2026-10-04: false on BOTH (GLX parity, glx.js antialias:false). The canvas
  // only receives the FXAA quad; a 4x multisampled default framebuffer there
  // was ~75 MB at 1080p of resolve bought for nothing.
  assert.match(ctx[1], /antialias:\s*false/, "context AA must track the renderer's forceWebGL path (off)");
  assert.match(tlx, /antialias:\s*forceWebGL\s*\?\s*false\s*:\s*!_liteGpu\b/,
    "the WebGL2 path asks for no canvas MSAA; lite WebGPU (phone / WebKit / software) must not ask for MSAA 4");
});

test("GLX and TLX road-marking mip use the raw footprint, like WGX", () => {
  const glx = read("js/render/glx/shaders/glsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsl = read("js/render/three/tsl-lit.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(glx, /float fwX = max\(fwidth\(x\), 1e-4\);/,
    "GLX must keep the unclamped lateral footprint for mip");
  assert.match(glx, /float mip = clamp\(1\.0 - \(fwX - 0\.10\) \/ 0\.55, 0\.0, 1\.0\);/,
    "GLX mip must match the WGX knee — not the clamped aaX");
  assert.match(tsl, /fwX\.sub\(0\.10\)\.div\(0\.55\)\.oneMinus\(\)/,
    "TLX mip must match the WGX knee — not the clamped aaX");
});

test("WGX's canvas is opaque too — it writes the same tag with NO gate", () => {
  // The tag is not a TLX idea: WGX writes it from the same GLX lineage —
  //   return vec4<f32>(color, select(alpha, 0.35, carPaint > 0.001));
  // — and unlike TLX's, that line has no ssrTag gate at all, so EVERY WGX frame
  // carries 0.35 over car paint whether or not anything reads it. What makes
  // that safe is one word in the context configure, and nothing was checking
  // it. All three backends now hold the same invariant for the same reason:
  // GLX `alpha: false`, WGX `alphaMode: "opaque"`, TLX both spellings.
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /\.configure\(\{[^}]*alphaMode:\s*"opaque"/,
    "WGX must configure an OPAQUE canvas — it tags alpha on every frame");

  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(chunks, /select\(alpha,\s*0\.35,\s*carPaint\s*>\s*0\.001\)/,
    "the ungated WGX car-paint tag moved — recheck what its canvas opacity is carrying");
});

test("three's WebGL backend still hardcodes an alpha canvas (why we pass a context)", () => {
  // Makes the assertion above NECESSARY. When three starts honouring the
  // parameter on this backend, the hand-made context can go — and this is the
  // test that says so, instead of it sitting there forever as cargo cult.
  const at = THREE_BUNDLE.indexOf('getContext("webgl2",');
  assert.notEqual(at, -1, "three's WebGL context creation moved");
  const attrs = THREE_BUNDLE.slice(Math.max(0, at - 260), at);
  assert.match(attrs, /alpha:\s*!0/,
    "bundled three no longer hardcodes alpha:true for WebGL — drop TLX's " +
    "hand-made context and pass alpha:false alone");
  assert.match(THREE_BUNDLE.slice(at, at + 60), /getContext\("webgl2",\s*\w+\)/);
});

test("TLX env probe culls and lights like GLX — not the chase camera", () => {
  // envFaceBegin used to return only invViewProj. drawWorldMeshes then
  // frustum-culled propBatches against the MAIN view, and envFaceEnd ran
  // before gfx.begin() so the cube baked last-frame (or default) lighting.
  // Software faces still latch envReady for M9, but a black cube must not
  // raise uEnvStr (clearcoat absorb toward black).
  const src = TLX.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  const beginAt = src.indexOf("envFaceBegin(face, eye, frame)");
  assert.notEqual(beginAt, -1, "envFaceBegin moved");
  const beginBody = src.slice(beginAt, beginAt + 1800);
  assert.match(beginBody, /frame\.viewProj\s*=\s*_envVPArr/,
    "probe must publish the face VP so propBatches cull against the cube face");
  assert.match(beginBody, /frame\.eye\s*=\s*eye/,
    "probe eye must be the car, not the chase camera");
  assert.match(beginBody, /ENV_CULL_M/,
    "probe must cap draw distance like GLX (150 m when envCull is on)");
  assert.match(beginBody, /lit\.updateFrame\(frame\)/,
    "probe runs before gfx.begin — updateFrame must push this frame's lighting");
  const endAt = src.indexOf("envFaceEnd(face)");
  assert.notEqual(endAt, -1, "envFaceEnd moved");
  const endBody = src.slice(endAt, endAt + 3600);
  assert.match(endBody, /_restoreEnvFrame\(\)/,
    "envFaceEnd must restore the main-camera VP/eye/cullDist");
  assert.match(endBody, /_envBlank\s*=\s*true/,
    "software black-clear cycle must mark the cube blank");
  assert.match(src, /envReady && !_envBlank && !frame\.noEnv/,
    "uEnvStr must stay 0 while the cube is a software black stub");
});

test("TLX car SSR tag lives on a second HDR attachment, not scene alpha", () => {
  // r185 isOpaque() is false for NoBlending, so output.a is coverage.
  // The 0.35 paint tag therefore cannot share the colour target. It is
  // written to sceneRT.textures[1] (name ssrTag) via mrtNode, armed only
  // for the main HDR render so the env cube stays a single-target RT.
  const lit = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(lit, /mrt\(\{\s*output:\s*out,\s*ssrTag:\s*packed\.a\s*\}\)/,
    "lit mrtNode must write packed.a (the 0.35 tag) to the ssrTag attachment");
  assert.match(lit, /function setSsrMrt\(on\)/,
    "env / canvas paths must be able to drop mrtNode");
  assert.match(lit, /mrtNode \? "-mrt"/,
    "program key must fork when MRT is armed — one program cannot target both RTs");
  const post = read("js/render/three/tlx-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(post, /count:\s*2/,
    "HDR scene target must allocate the ssrTag colour attachment");
  assert.match(post, /textures\[1\]\.name\s*=\s*"ssrTag"/,
    "MRTNode.setup matches attachments by texture.name");
  const tsl = read("js/render/three/tsl-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tsl, /tagT\.sample\(TL\(vUV\)\)\.r/,
    "heat haze must skip car pixels using the tag RT, not scene alpha");
  assert.match(tsl, /tagT\.sample\(TL\(hazeUV\)\)\.r/,
    "carPx / car SSR must read the tag RT");
  assert.doesNotMatch(tsl.replace(/\/\*[\s\S]*?\*\//g, ""), /carPx = smoothstep\([^)]*scn\.a/,
    "carPx must not still key off scn.a");
  const tlx = TLX.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  const hdr = tlx.indexOf("post.sceneTarget()", tlx.indexOf("present(opts) {"));
  assert.notEqual(hdr, -1, "HDR present path moved");
  const window = tlx.slice(Math.max(0, hdr - 800), hdr + 400);
  assert.match(window, /setSsrMrt\(true\)/,
    "main HDR render must arm the ssrTag MRT");
  assert.match(window, /renderer\.setMRT\(/,
    "renderer.getMRT() is what NodeMaterial.setup merges into");
  const envEnd = tlx.indexOf("envFaceEnd(face)");
  const envBody = tlx.slice(envEnd, envEnd + 3600);
  assert.doesNotMatch(envBody, /setSsrMrt\(true\)/,
    "env cube must not arm the 2-attachment program");
  assert.doesNotMatch(envBody, /setMRT\(/,
    "env cube render must not install a renderer MRT");
});

// uNumLights is uploaded 111 times a frame (vegas night, full field in a pack)
// for 53.7 distinct values — uploadLightSet sets the count unconditionally, and
// the per-chunk path calls it once per visible chunk, including the many that
// return immediately on a count of 0. The redundancy cache that collapses that
// is only sound because of two facts, and this pins both:
//
//  1. ONE WRITER. A WebGL uniform is per-PROGRAM state, so the cached value
//     survives every unbind — but only while nothing else writes it on the lit
//     program. post.js's godray pass has its own uNumLights on its own program
//     and cannot collide; a SECOND writer on the lit program would make the
//     cache lie, and this is the assertion that would catch it.
//  2. RESET AT RELINK. A relink resets every uniform on the program, so the
//     cache has to be cleared where the locations are re-fetched.
test("GLX caches uNumLights, and nothing else writes it on the lit program", () => {
  const h = bootGlx();
  const one = Array.from({ length: 15 }, (_, i) => i + 1);
  const nl = () => h.count("uniform1i", (a) => a[0].name === "uNumLights");
  h.GLX.begin(h.frame({ lights: one }));
  h.reset();
  h.GLX.begin(h.frame({ lights: one }));
  h.GLX.begin(h.frame({ lights: one }));
  assert.equal(nl(), 0, "uploadLightSet skips an unchanged uNumLights");
  h.reset();
  h.GLX.begin(h.frame({ lights: one.concat(one) }));
  assert.equal(nl(), 1, "a changed count uploads once");
  assert.equal(h.calls.find((c) => c[0] === "uniform1i" && c[1][0].name === "uNumLights")[1][1], 2);
  h.reset();
  h.GLX.begin(h.frame({ lights: [] }));
  assert.equal(nl(), 1, "a drop to zero is a change too — the per-chunk path's long tail of 0 must still be written once");
  // ONE WRITER. A WebGL uniform is per-PROGRAM state, so the cached value
  // survives every unbind — but only while nothing else writes it on the lit
  // program. post.js's godray pass has its own uNumLights on its own program
  // and cannot collide; a SECOND writer on the lit program would make the
  // cache lie, and this is the assertion that would catch it.
  const bare = code("js/render/glx/glx.js");
  const writers = bare.match(/uniform1i\(\s*litU\.uNumLights/g) || [];
  assert.equal(writers.length, 1,
    `litU.uNumLights has ${writers.length} writers — the cache is only valid with one; ` +
    "route the new one through uploadLightSet or drop the cache");
  // RESET AT RELINK. A relink resets every uniform on the program, so the
  // cache has to be cleared where the locations are re-fetched.
  const at = bare.search(/litU\s*=\s*locs\(\s*litProg\b/);
  assert.notEqual(at, -1, "the lit program's locs() call moved");
  assert.match(bare.slice(Math.max(0, at - 300), at), /_luNL\s*=\s*-1\b/,
    "the uNumLights cache must be cleared where the lit program's locations are re-fetched");
  assert.doesNotMatch(bare, /_matEmissive\s*=[^;]*_luNL/,
    "uNumLights is program state, not per-frame material state — do not reset it in begin()");
});

// uniform3fv ran 32.4 times a frame with 24.3 of those re-sending a value the
// program already held (vegas night, full field). The frame-global sun /
// ambient / fog / sky terms are identical in every begin() — six env-cube
// faces, the shadow pass, the main camera — and identical again next frame on
// a steady condition. uf3 collapses them: measured 31.5 -> 16.3 per frame with
// every other census counter unchanged.
//
// THE TRAP THIS TEST EXISTS FOR: the first version stored into a
// Float32Array(3), mirroring ufM4, and skipped ZERO of 17.5 calls a frame. A
// Float32Array rounds on store, so the compare was the rounded float32 against
// the float64 the caller passed — `cached=0.11999999731779099 in=0.12` — and
// could never match. ufM4 is safe only because M4 hands it Float32Array
// matrices already; these vec3s are plain JS arrays off `frame`. A cache that
// never hits is worse than none: it pays the branch and the allocation to
// change nothing, and NOTHING GOES RED when it regresses, because the render
// is identical either way. Only a call count can tell, so pin the store type.
test("GLX's uf3 cache keeps float64 precision, and owns every lit/sky vec3", () => {
  // THE TRAP THIS TEST EXISTS FOR: the first version stored into a
  // Float32Array(3), mirroring ufM4, and skipped ZERO of 17.5 calls a frame. A
  // Float32Array rounds on store, so the compare was the rounded float32 against
  // the float64 the caller passed — `cached=0.11999999731779099 in=0.12` — and
  // could never match. BEHAVIOUR: a value that is not f32-representable still
  // hits on the second begin().
  const h = bootGlx();
  const f = h.frame({ ambientSky: [0.12, 0.31, 0.47], sunColor: [0.97, 0.91, 0.83] });
  h.GLX.begin(f);
  h.reset();
  h.GLX.begin(h.frame({ ambientSky: [0.12, 0.31, 0.47], sunColor: [0.97, 0.91, 0.83] }));
  assert.equal(h.count("uniform3fv"), 0, "equal float64 vec3s are skipped — a Float32Array store would round and never hit");
  // …and it COPIES: a scratch array mutated in place is a real change.
  const scratch = [0.12, 0.31, 0.47];
  h.GLX.begin(h.frame({ ambientSky: scratch }));
  h.reset();
  scratch[0] = 0.5;
  h.GLX.begin(h.frame({ ambientSky: scratch }));
  assert.equal(h.count("uniform3fv", (a) => a[0].name === "uAmbSky"), 1, "the cache compares values, not the caller's reference");
  // Single writer, the same property the uNumLights and uModel caches need: a
  // raw gl.uniform3fv on either program would desync the cache behind its back.
  const bare = code("js/render/glx/glx.js");
  const raw = bare.match(/gl\.uniform3fv\(\s*(litU|skyU)\./g) || [];
  assert.equal(raw.length, 0,
    `${raw.length} raw gl.uniform3fv call(s) remain on the lit/sky programs (${raw.join(", ")}) — ` +
    "every one must go through uf3 or the cache goes stale");
  // The cache lives in the same two objects uf1/ufM4 use, so it is already
  // cleared where the programs are relinked.
  assert.match(bare, /_clearUf\(\s*_litUf\s*\)\s*;\s*_clearUf\(\s*_skyUf\s*\)/,
    "the lit/sky uniform caches must still be cleared together on relink");
});

// ── The phone route (docs/PERF-FINDINGS.md §2m) ───────────────────────────
// three retains the CPU copy of every geometry attribute after upload —
// measured 71.5 MB across 5,665 buffers against GLX's 17.8 MB / 253 — and an
// iPhone tab has been OOM-killed mid-race for it. Releasing those arrays was
// built and DISPROVED live (three re-reads attribute.array in draw() and
// updateAttribute()). The gate declined phones by default until 2026-09-02;
// the owner then chose three on phones DESPITE the risk, so the gate is an
// opt-OUT (apex26.tlxMobile="0") and the boot canary is the safety net.
// Four things have to stay true.
test("TLX binds on a phone by default, declines only on apex26.tlxMobile=0 with a REASON, before importing three", () => {
  const tlx = read("js/render/three/tlx.js");

  // 1. The decline route still exists and goes through _fail — the seam that
  //    records apex26.gfxTlxFail and flips gfxBound so SETTINGS can show why.
  const route = tlx.match(/if\s*\(isMobile\s*&&\s*_mobileOptOut\)\s*\{\s*\n\s*return _fail\((["'`])([\s\S]*?)\1\s*\);/);
  assert.ok(route, "the phone opt-out route is gone — a phone can no longer decline TLX");

  // 2. The reason names the key: it is the player's only way to learn how to
  //    get three back after declining.
  const reason = route[2];
  assert.ok(reason.length > 40, `decline reason too thin to act on: ${JSON.stringify(reason)}`);
  assert.match(reason, /apex26\.tlxMobile/, "the decline reason must name the override key");

  // 3. The gate is an opt-OUT: only an explicit "0" declines; blocked storage
  //    falls to the chosen default (TLX), and the old opt-in is gone.
  const optOut = tlx.match(/const _mobileOptOut = \(function \(\) \{[\s\S]*?\}\)\(\);/);
  assert.ok(optOut, "the apex26.tlxMobile opt-out is gone");
  assert.match(optOut[0], /localStorage\.getItem\("apex26\.tlxMobile"\) === "0"/,
    "phones bind TLX unless the key is explicitly \"0\" — the owner's 2026-09-02 decision");
  assert.match(optOut[0], /catch \(_\) \{ return false; \}/,
    "blocked storage must fall to the chosen default (TLX), not decline");
  assert.doesNotMatch(tlx, /_mobileOptIn/, "the old default-decline opt-in must not linger beside the opt-out");
  // The risk is still said out loud on every phone bind.
  assert.match(tlx, /if \(isMobile\) Log\.warn\("gfx", "TLX on a phone/, "a phone bind must log the memory risk");

  // 4. Order matters: the decline has to happen before create() imports three
  //    and builds a renderer, or the phone pays the memory anyway.
  const declineAt = tlx.indexOf("if (isMobile && _mobileOptOut)");
  const importAt = tlx.indexOf('await import("three/webgpu")');
  assert.ok(declineAt > 0 && importAt > 0 && declineAt < importAt,
    "the phone decline must come BEFORE three is imported — otherwise the tab still pays for it");
});

// The release approach is disproved, not merely unused. If a future round
// reaches for it again, these two three.js source facts are why it cannot
// work — asserted against the VENDORED bundle so a version bump re-checks them
// rather than letting the comment go stale.
test("three still re-reads attribute.array after upload (why the release fix is impossible)", () => {
  const three = read("vendor/three-0.186.0/three.webgpu.min.js");

  // draw(): firstVertex *= index.array.BYTES_PER_ELEMENT, every indexed draw.
  assert.match(three, /\*=\s*\w+\.array\.BYTES_PER_ELEMENT/,
    "three no longer scales firstVertex by index.array — re-evaluate releasing index arrays");

  // BufferAttribute.onUpload is a legacy WebGLRenderer hook: the WebGPU
  // bundle never calls it. This is the assertion that would have saved the
  // first attempt, which shipped nothing and looked like a fix.
  assert.ok(!three.includes("onUploadCallback"),
    "three.webgpu now has onUploadCallback — the CPU-array release may finally be viable");
});

// ── TLX vertex-attribute packing (docs/PERF-FINDINGS.md §2n) ──────────────
// three retains the CPU copy of every attribute array forever. Packing them
// down (Int16 normals, half-float colours and MAT ids, one shared zero buffer
// behind absent sources, Uint16 indices) took montreal's deduped attribute
// bytes from 50.0 to 28.6 MB. The risk is not that it fails loudly — it is
// that it quietly shifts a value the shader BRANCHES on.
test("the attribute packer proves its precondition instead of assuming it", () => {
  const ch = read("js/render/three/tlx-chunked.js");

  // A blanket quantise is the bug. Colours carry emissive to 3.4 and MAT ids
  // are not whole (measured 15.4) — both must be range-scanned and kept wider
  // when they do not fit, never clamped into the small type.
  assert.match(ch, /function packAttr\(/, "packAttr is gone — TLX is back to Float32 everything");
  assert.match(ch, /if \(kind === "unorm"\) \{ if \(v < 0 \|\| v > 1\) \{ fits = false; break; \} \}/,
    "the unorm range scan is gone — an emissive colour above 1 would be clamped");
  assert.match(ch, /\(v \| 0\) !== v/,
    "the id check no longer rejects fractional MAT — 15.4 would round to a different material");

  // `trk` must NEVER go half-float: its arc length reaches 5382 m, where a
  // half's 11-bit mantissa is worth about ±2.6 m and road markings need far
  // better. The half path is restricted to unorm/id for exactly that reason.
  assert.match(ch, /kind === "unorm" \|\| kind === "id"/,
    "the half-float path is no longer restricted — trk arc length would lose metres");

  // Constructor, not a post-hoc assignment: BufferAttribute derives `count`
  // from the array it is GIVEN, so `new Float16BufferAttribute([], n)` followed
  // by `.array = h` leaves count 0 and the mesh draws NOTHING. That was a real
  // bug in this function's first draft.
  assert.match(ch, /return new THREE\.Float16BufferAttribute\(h, itemSize\);/,
    "half-float attributes must be built through the constructor or count stays 0");
  assert.ok(!/Float16BufferAttribute\(\[\]/.test(ch),
    "an empty-array Float16BufferAttribute leaves count 0 — the mesh silently draws nothing");
  // WebGPU has no 1- or 3-wide 8/16-bit vertex format: a packed 3-wide colour
  // reached createRenderPipeline as 'float16x3' and TLX REFUSED on Metal
  // (gpu-census 21/22, 2026-09-02; PERF-FINDINGS 2n). The pack must keep
  // those widths Float32 under the renderer's isWebGPU.
  assert.match(ch, /function packAttr\(THREE, src, len, itemSize, kind, fmt24\)/,
    "packAttr lost its fmt24 (WebGPU vertex-format) parameter");
  assert.match(ch, /if \(fmt24 && itemSize !== 2 && itemSize !== 4\) kind = null;/,
    "under fmt24, 1- and 3-wide attributes must stay Float32 — 'float16x3' is not a GPUVertexFormat");
  assert.match(ch, /packAttr\(THREE, src, len, itemSize, kind, fmt24\(\)\)/,
    "attrOrZero no longer passes the per-build fmt24 rule");
  const tlxSrc = read("js/render/three/tlx.js");
  // buildGeometry (the non-chunked meshes) packs through the same function
  // under the alias _pk — both call sites must carry the rule, or the props
  // refuse while the road draws.
  assert.match(tlxSrc, /_pk\(THREE, data\.mat, verts, 1, "id", fmt24\)/,
    "tlx.js buildGeometry must pass fmt24 to every _pk call — the non-chunked meshes refused on Metal too");
  assert.match(tlxSrc, /const fmt24 = !!\(renderer\.backend && renderer\.backend\.isWebGPUBackend\);/,
    "buildGeometry's fmt24 must read the live backend");
  assert.match(tlxSrc, /TLXShaders\.chunked\(THREE, \{\s*isWebGPU: \(\) => !!\(renderer\.backend && renderer\.backend\.isWebGPUBackend\),\s*releaseGeometry,\s*\}\)/,
    "tlx.js must hand the chunked factory its format rule and geometry-owner release callback");

  // The shared zero buffer is only safe while nothing writes it.
  assert.match(ch, /function _zeros\(len\)/, "the shared zero buffer is gone — absent trk goes back to 5.88 MB of per-mesh zeros");

  // An off-switch that defaults ON, and fails to the SAFE side when storage
  // is blocked (packing is the verified path, so its default is 'on').
  assert.match(ch, /localStorage\.getItem\("apex26\.tlxPack"\) !== "0"/,
    "the apex26.tlxPack escape hatch is gone");
});

test("the packing round-trip check is wired to the shader's own decisions", () => {
  const tool = read("tools/gfx/tlx-pack-check.cjs");
  const chunked = read("js/render/three/tlx-chunked.js");
  // packAttr gained an optional fmt24 arg (WebGPU pad4). The lift regex must
  // still match the shipping signature or the CLI throws before any check runs.
  assert.match(chunked, /function packAttr\(THREE, src, len, itemSize, kind, fmt24\)/,
    "tlx-chunked packAttr signature drifted — update tools/gfx/tlx-pack-check.cjs");
  assert.match(tool, /kind\(\?:, fmt24\)\?/,
    "tlx-pack-check lift regex must allow the optional fmt24 arg");
  // The tool must LIFT the packer out of the shipping file. A reimplementation
  // drifts, and then it verifies its own copy rather than what ships.
  assert.match(tool, /readFileSync\(path\.join\(ROOT, "js\/render\/three\/tlx-chunked\.js"\)/,
    "the check no longer reads the real packer — it would be testing a copy");
  // And it must gate on DECISIONS, not on raw error: MAT is legitimately
  // fractional, so a zero-error gate is wrong and would fail forever.
  for (const decision of [/floor\(o \+ 0\.5\) !== Math\.floor\(d \+ 0\.5\)/, /o >= 15 && o < 16/, /\(o \| 0\) === o && d !== o/])
    assert.match(tool, decision, "a shader decision is no longer checked by tools/gfx/tlx-pack-check.cjs");
  assert.match(tool, /if \(layerChanges \|\| flips \|\| intInexact\) \{/, "the check no longer FAILS on a changed decision");
});

// ── the mesh pool is keyed, not indexed (docs/PERF-FINDINGS.md §2o) ───────
// A flat `meshPool[poolUsed]` gave wrapper #0 whatever geometry was first that
// frame, and three's WebGPURenderer caches a render object and its bind groups
// keyed on the object TOGETHER WITH its material and geometry — so the churn
// minted a cache entry per frame that was never released. Measured against the
// flat pool: createRenderObject -45%, _createBindings -27%, drift -28%.
test("TLX pools meshes by (geometry, material), and prunes on a clock", () => {
  const raw = read("js/render/three/tlx.js");
  // Negative assertions run against CODE, never against prose. The comment in
  // tlx.js explaining this fix quotes `meshPool[poolUsed]` verbatim, and the
  // first draft of this test failed on its own documentation — the same trap
  // that made a revert-check pass earlier in this file's history.
  const tlx = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  // Keyed lookup, not an index. `poolUsed` may survive as a counter, but it
  // must never index the pool again.
  assert.match(tlx, /const meshByGeo = new Map\(\)/, "the keyed pool is gone — the render-object cache is unbounded again");
  assert.ok(!/meshPool\[poolUsed\]/.test(tlx),
    "meshPool is being indexed by poolUsed again — that is the exact churn §2o measured");
  assert.match(tlx, /let list = byMat\.get\(mat\);/, "acquireMesh no longer looks the wrapper list up by its (geometry, material) pair");
  assert.match(tlx, /const k = list\.n\+\+;\s*\n\s*let m = list\[k\];/,
    "acquireMesh must key on the OCCURRENCE within the batch as well — one wrapper per pair dropped every same-pair draw but the last (audit 2026-09-02)");

  // The hide sweep must follow the batch stamp. An index range cannot work on
  // a keyed pool — it would hide live meshes and show dead ones.
  assert.match(tlx, /pm\.__tlxBatch !== _poolBatch/, "the hide sweep is not stamp-based");
  assert.ok(!/for \(let i = poolUsed; i < meshPool\.length; i\+\+\)/.test(tlx),
    "an index-range hide sweep is back, which is incoherent with a keyed pool");

  // Pruning, or the map pins every geometry it has ever seen and we have
  // simply moved the leak from three's cache into ours.
  assert.match(tlx, /function prunePool\(now\)/, "the pool prune is gone — freed geometry would be pinned alive by the pool map");
  assert.match(tlx, /now - _pruneLast < PRUNE_EVERY_MS/, "the prune no longer throttles on the CLOCK");
  assert.ok(!/_pruneLast[\s\S]{0,200}% \d+\) === 0/.test(tlx),
    "the prune is gated on a frame count — measured to fire either never or constantly (§2n)");

  // The prune owns the WRAPPER only. Disposing the caller's geometry or
  // material here would free live resources out from under tracks.js.
  const prune = tlx.match(/function prunePool\(now\)[\s\S]*?\n      \}/)[0];
  assert.ok(!/\.dispose\(\)/.test(prune),
    "prunePool disposes something — geometry and material belong to the caller, not the pool");
});

// ── the MRT node is built ONCE (docs/PERF-FINDINGS.md §2p) ────────────────
// `renderer.setMRT(TSL.mrt({…}))` sat inline in present(), minting a NEW node
// every frame. three keys its render-context cache on a STRING containing
// mrt.id and stores the result in a plain object that never evicts, so each
// frame created a permanent context and forced every object/material to be
// re-created against it. Measured: distinct renderContexts 40 → 148 dead
// linear, ~2,150 createRenderObject per 15 s, 4-minute drift +124 MB.
// Hoisted: 1 → 2 contexts, 2 creates per 15 s, drift +4.5 MB (GLX +1.3).
test("TLX builds its SSR MRT node once, not once per frame", () => {
  const raw = read("js/render/three/tlx.js");
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  // The node must come from a memoised factory, never constructed at the call.
  assert.match(code, /function _ssrMrtNode\(\)/, "the memoised MRT factory is gone");
  assert.match(code, /renderer\.setMRT\(_ssrMrtNode\(\)\)/,
    "setMRT no longer takes the hoisted node");
  assert.ok(!/setMRT\(\s*TSL\.mrt\(/.test(code),
    "TSL.mrt() is being constructed inside setMRT again — that is the §2p leak, " +
    "one permanent render context per frame");

  // Constructing an mrt() anywhere inside present() reintroduces it even if the
  // call above stays tidy, so pin the construction count in the whole file.
  const built = (code.match(/TSL\.mrt\(/g) || []).length;
  assert.equal(built, 1,
    `TSL.mrt( is constructed ${built} times in tlx.js; exactly one construction site ` +
    `(the memoised factory) is allowed — every extra one is a per-frame node id`);
});

// ── The mirror release must never outlive the data it measures ────────────
// A phone on the LOW preset (tier 4) rendered NO road and a car in
// disconnected pieces while terrain and sky drew normally, 2026-09-02. Tier
// >= 3 is the only configuration that exposes a plain ROAD mesh to the
// sweep — game.js chunks ribbons only below tier 3, and chunk geometries are
// skipped because chunkedSys owns them — and no software probe reproduces it
// (lavapipe draws the road at every tier). Two rules keep it shut.
test("the geometry mirror sweep caches bounds before it frees, and never runs on a phone", () => {
  const tlx = read("js/render/three/tlx.js");

  // 1. Bounds are computed BEFORE any array is emptied. three's render walk
  //    computes a bounding sphere for every drawn object when sortObjects is
  //    on, culled or not, and it reads position.array to do it.
  const rel = tlx.slice(tlx.indexOf("function releaseGeoMirrors("));
  const body = rel.slice(0, rel.indexOf("\n      }"));
  const boundsAt = body.indexOf("computeBoundingSphere()");
  // The free is `a.array = null`, and it MUST be null rather than a zero-length
  // typed array — the same rule releaseMirrors carries above, for the same
  // reason and on the same evidence: nulling shipped and rendered for months,
  // and a zero-length array is the ONLY delta between gpu-census run 26 on
  // macos-latest/Metal (8x "Index range ... does not fit in index buffer size
  // (0)") and run 27, which passed. A mechanism was asserted for this and then
  // WITHDRAWN — it came from _getAttributeMemorySize(), which is renderer.info
  // accounting, not allocation — so this guard stands on the hardware A/B alone.
  // COMMENTS STRIPPED, for the reason recorded above: the first version of the
  // sibling check matched the prose explaining the rule and failed a good file.
  const bodyCode = fnBody(code("js/render/three/tlx.js"), "releaseGeoMirrors");
  const dropAt = bodyCode.indexOf("a.array = null");
  assert.ok(boundsAt > 0, "releaseGeoMirrors no longer caches the bounding sphere");
  assert.ok(dropAt > 0, "releaseGeoMirrors no longer frees anything — check this test, not the code");
  assert.doesNotMatch(bodyCode, /\.array\s*=\s*new\s+\S*constructor\(0\)/,
    "a zero-length array is what Metal refused (gpu-census 26 vs 27) — NULL the mirror");
  assert.ok(bodyCode.indexOf("computeBoundingSphere()") < dropAt,
    "the bounds must be computed BEFORE the arrays are freed, or three computes a NaN sphere from a missing array");
  assert.match(body, /radius >= 0/,
    "a geometry whose bounds will not compute must keep its mirror rather than be freed unmeasured");

  // 2. The sweep declines on mobile outright. Re-open only with handset
  //    evidence; a software probe cannot see this failure.
  const sweep = tlx.slice(tlx.indexOf("function sweepGeoMirrors("));
  const sweepBody = sweep.slice(0, sweep.indexOf("\n      }"));
  assert.match(sweepBody, /if \(isMobile\) return;/,
    "the mirror sweep must decline on a phone — it shipped the missing road on a real handset");
  const mobileAt = sweepBody.indexOf("if (isMobile) return;");
  const throttleAt = sweepBody.indexOf("_mirrorSweepAt");
  assert.ok(mobileAt >= 0 && mobileAt < throttleAt,
    "the mobile decline must come before the throttle, so it cannot be reached by a clock edge");
});

// ── The placeholder material arrays decide the WGSL access mode ─────────────
// three r185's WGSLNodeBuilder.isUnfilterable() emits `textureLoad` (integer
// texel, mip 0, the placeholder's wrap baked into a tsl_coord_* helper) for a
// texture whose min AND mag filters are Nearest — the DataTexture default. The
// lit graph is compiled against the 1×1 placeholders and setMaterialMaps() only
// swaps `.value`, so the program keeps that access forever: every baked
// fragment more than a tile from the origin read the layer's EDGE texel on the
// WebGPU path (flat asphalt / grass / walls — the phone "see-through track").
// Pin: the placeholder sets the SAME wrap/filter/mipmap/anisotropy lines as
// createTextureArray, so the compiled program is a repeat-wrapped
// `textureSample`. Sabotage-proven: delete any one placeholder line, red.
test("TLX placeholder material arrays carry the pack's sampling state (WGSL access mode is compiled in)", () => {
  const src = code("js/render/three/tlx.js");
  const greyAt = src.indexOf("const grey = (v) =>");
  assert.ok(greyAt > 0, "tlx.js no longer builds the placeholder arrays with grey() — re-anchor this pin");
  const placeholder = src.slice(greyAt, src.indexOf("matPlaceAlbedo = grey(", greyAt));
  const packAt = src.indexOf("createTextureArray(size, images, layers) {");
  assert.ok(packAt > 0, "createTextureArray moved — re-anchor this pin");
  const pack = src.slice(packAt, src.indexOf("return t;", packAt));
  for (const line of [
    "t.wrapS = t.wrapT = THREE.RepeatWrapping",
    "t.minFilter = THREE.LinearMipmapLinearFilter",
    "t.magFilter = THREE.LinearFilter",
    "t.generateMipmaps = true",
    "t.anisotropy = 4",
  ]) {
    assert.ok(pack.includes(line), "createTextureArray lost `" + line + "` — the pack sampling state changed; mirror it in the placeholder");
    assert.ok(placeholder.includes(line), "placeholder array lacks `" + line + "` — three compiles the lit program against the placeholder, and a Nearest/Nearest ClampToEdge placeholder bakes textureLoad+clamp into the WGSL for the life of the program");
  }
});

// ── GLX spatial upscale spike (SGSR1) ───────────────────────────────────────
// Flag OFF by default; WebGL2 must not ship raw textureGather (ES 3.1). Size
// split + present pass are gated on wantSpatialUpscale (flag ∧ scale<~1 ∧
// linked program). See docs/research/UPSCALING-2026-09.md §6.
test("GLX spatial upscale spike: SGSR1, no textureGather, flag-gated size split", () => {
  const sh = read("js/render/glx/shaders/glsl-post.js");
  assert.match(sh, /const SGSR_FS =/, "SGSR_FS must ship in glsl-post.js");
  assert.match(sh, /SPDX-License-Identifier: BSD-3-Clause/,
    "Qualcomm SGSR1 attribution must stay on the adapted shader");
  const shCode = sh.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(shCode, /textureGather\s*\(/,
    "WebGL2 has no textureGather — emulate with textureLod taps");
  assert.match(shCode, /gatherComp\s*\(/, "gather emulation helper must remain");
  const post = read("js/render/glx/post.js");
  assert.match(post, /sgsrProg/, "post chain must link the SGSR program");
  assert.match(post, /spatialOk:\s*\(\)\s*=>\s*!!sgsrProg/,
    "post must expose spatialOk so resize fail-closes without a linked program");
  assert.match(post, /uViewport/, "SGSR present pass must upload source viewport");
  const glx = read("js/render/glx/glx.js");
  assert.match(glx, /apex26\.spatialUpscale/, "flag key must stay namespaced");
  assert.match(glx, /wantSpatialUpscale/, "size split must go through wantSpatialUpscale");
  assert.match(glx, /PST\.spatialOk/,
    "wantSpatialUpscale must require the linked SGSR program (no letterbox)");
  assert.match(glx, /renderScale < 0\.98/,
    "upscale must not run at scale≈1 (pure waste)");
  const apex = read("js/agent/apex.js");
  assert.match(apex, /spatialUpscale\s*\(/, "__apex.spatialUpscale must exist");
});

test("UPSCALE SettingRow + TLX spatial API markers", () => {
  const html = read("index.html");
  assert.match(html, /id="pm-upscale"/, "shell must ship the UPSCALE set-row");
  assert.match(html, /id="pm-upscale-label">UPSCALE</, "label must be UPSCALE");
  const scale = read("js/ui/scale.js");
  assert.match(scale, /SettingRow\.wire\("pm-upscale"/, "scale.js must wire the row");
  assert.match(scale, /setSpatialUpscale/, "row must call the backend API");
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /setSpatialUpscale/, "TLX must export setSpatialUpscale");
  assert.match(tlx, /wantSpatialUpscale/, "TLX must gate size split");
  const post = read("js/render/three/tlx-post.js");
  assert.match(post, /spatialOk:\s*\(\)\s*=>/, "TLX post must expose spatialOk");
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /tlx-post-sgsr/, "TSL SGSR pass must exist");
  const wgsl = read("js/render/webgpu/wgsl-post.js");
  assert.match(wgsl, /const SGSR =/, "WGX WGSL SGSR shader must ship");
  assert.match(wgsl, /const SGSR_GATHER = SGSR/, "WGX must ship the textureGather SGSR variant");
  // Strip comments then isolate the 4-tap SGSR string (ends before SGSR_GATHER).
  const wgslCode = wgsl.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const sgsrTap = wgslCode.match(/const SGSR = `([\s\S]*?)`;\s*const SGSR_GATHER/);
  assert.ok(sgsrTap, "SGSR 4-tap string must precede SGSR_GATHER");
  assert.doesNotMatch(sgsrTap[1], /textureGather\s*\(/,
    "4-tap SGSR must not use textureGather (parity with GLX/TLX)");
  assert.match(wgslCode, /textureGather\s*\(\s*1i\s*,\s*srcTex\s*,\s*srcSamp\s*,\s*p\s*\)/,
    "SGSR_GATHER must call textureGather(component, tex, samp, uv) — WGSL arg order");
  // Dawn/Naga reserves `std` — the shared SGSR port must use edgeStd (validate caught this).
  assert.match(wgsl, /fn weightY\([^)]*edgeStd/, "SGSR WGSL weightY must not use reserved std");
  const wgx = read("js/render/webgpu/wgx.js");
  const wgxPost = read("js/render/webgpu/wgx-post.js");
  assert.match(wgx, /setSpatialUpscale/, "WGX must export setSpatialUpscale");
  assert.match(wgx, /wantSpatialUpscale/, "WGX must gate size split");
  assert.match(wgx, /!!pSGSR/, "WGX wantSpatialUpscale must require linked SGSR pipeline");
  // SGSR pipeline link + gather escape live in wgx-post.js after the peel.
  assert.match(wgxPost, /SGSR_GATHER/, "WGX must try the gather pipeline first");
  assert.match(wgxPost, /spatialUpscaleGather/, "gather escape pin apex26.spatialUpscaleGather=0");
  assert.match(wgx, /getSpatialUpscaleGather/, "WGX must export gather active state");
});

test("spatial upscale persists once through GameStore at the UI boundary", () => {
  const scale = read("js/ui/scale.js");
  const writes = scale.match(/rawSet\("spatialUpscale"/g) || [];
  assert.equal(writes.length, 1, "UiScale owns the one persistence write");
  const apply = scale.slice(scale.indexOf("function applyUpscale"), scale.indexOf("// OCCLUSION CULLING"));
  assert.ok(apply.indexOf('rawSet("spatialUpscale"') < apply.indexOf("setSpatialUpscale"),
    "persistence is attempted before the active renderer changes session state");
  const apex = read("js/agent/apex.js");
  const hook = apex.slice(apex.indexOf("spatialUpscale(v)"), apex.indexOf("perf() {"));
  assert.ok(hook.indexOf('rawSet("spatialUpscale"') < hook.indexOf("setSpatialUpscale(on)"),
    "the dev API uses the same health-reporting persistence lane before changing state");
  for (const file of ["js/render/glx/glx.js", "js/render/three/tlx.js", "js/render/webgpu/wgx.js"]) {
    assert.doesNotMatch(read(file), /localStorage\.setItem\("apex26\.spatialUpscale"/,
      `${file} setter must remain state-only so failures cannot bypass GameStore health`);
  }
});

// Execute the bundled API: mocks alone cannot catch a renamed/wrong owner API.
test("TLX timing enables the bundled backend, not a shadow renderer property", async () => {
  const THREE = await import("../../vendor/three-0.186.0/three.webgpu.min.js");
  const renderer = new THREE.WebGPURenderer({ canvas: { width: 1, height: 1, style: {} } });
  let _gpuTimerOn = false, _gpuMs = 12, _gpuTimerEpoch = 0;
  const _gpuSupported = () => true;
  const body = fnBody(code("js/render/three/tlx.js"), "gpuTimer");
  const timer = eval("(function(on){" + body + "})");
  assert.equal(timer(true).on, true);
  assert.equal(renderer.backend.trackTimestamp, true);
  timer(false);
  assert.equal(renderer.backend.trackTimestamp, false);
  assert.equal(_gpuMs, -1);
});

test("TLX cube readback selects all six faces of attachment zero", async () => {
  const THREE = await import("../../vendor/three-0.186.0/three.webgpu.min.js");
  const renderer = new THREE.WebGPURenderer({ canvas: { width: 1, height: 1, style: {} } });
  const envRT = new THREE.CubeRenderTarget(1), ENV_SIZE = 1;
  let _envCubeRead = false, _envCube = null;
  const post = { hdrOk: () => false }, seen = [];
  renderer.backend.copyTextureToBuffer = async (texture, x, y, w, h, face) => {
    assert.equal(texture, envRT.texture);
    seen.push(face);
    return new Uint8Array([face * 20, face * 20, face * 20, 255]);
  };
  const body = fnBody(code("js/render/three/tlx.js"), "readEnvCube");
  const readCube = eval("(function(){" + body + "})");
  readCube();
  for (let i = 0; i < 20 && !_envCube; i++) await Promise.resolve();
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5]);
  assert.equal(_envCube.faces.length, 6);
  assert.ok(_envCube.faces[5].m > _envCube.faces[0].m);
  readCube();
  assert.equal(seen.length, 6, "readback remains once per session");
});

test("TLX registry pruning preserves live refs and is independent of mirror release", () => {
  const live = {}, keep = { deref: () => live };
  const _geoReg = [{ deref: () => undefined }, keep, { deref: () => undefined }];
  let _geoPruneAt = -Infinity;
  const body = fnBody(code("js/render/three/tlx.js"), "pruneGeoRegistry");
  const prune = eval("(function(now){" + body + "})");
  prune(0);
  assert.deepEqual(_geoReg, [keep]);
  _geoReg.push({ deref: () => undefined });
  prune(1000); assert.equal(_geoReg.length, 2, "throttled");
  prune(2000); assert.deepEqual(_geoReg, [keep]);
  const present = fnBody(code("js/render/three/tlx.js"), "present");
  assert.match(present, /pruneGeoRegistry\(_now\)/);
  assert.doesNotMatch(body, /isMobile|releaseGeoMirrors|_sweepOptIn/);
});

test("TLX warm holds renderer state across awaits and restores it on rejection", async () => {
  let _warmRequested = true, _warmPending = null, _warmAttempts = 0, _warmAt = 0, _warmDone = false;
  // Fix C: the warm's finally sets _warmDone and the try calls the caster warm.
  // Fix D: the ORDER is the contract — the post chain compiles under the scene
  // MRT (present() runs post.present() before restoring it, and three keys the
  // render context, hence the program cache, on the MRT node's id), the MRT is
  // nulled only after it, and the casters compile under null (sunPass runs before
  // present(), with the MRT restored).
  let shadowCalls = 0, postCalls = 0, fxCalls = 0, mirrorCalls = 0;
  let _mirUsed = false; const mirRT = { texture: "mirrorTex" };
  const wantMirrorWarm = () => true, prepareMirrorTarget = () => {};
  // The FX warm (particles, skid marks — PERF-FINDINGS §2ah) runs after the
  // scene warm, under the SAME target and ssrTag MRT the scene compiled with.
  const warmFxPrograms = async () => {
    fxCalls++; await Promise.resolve();
    assert.equal(target, "HDR"); assert.equal(mrt, "tag", "FX programs compile under the scene MRT, the variant present() draws");
    assert.equal(postCalls, 0, "the FX warm runs before the post warm");
  };
  let minted = false;
  const mintLateLit = () => { assert.equal(tag, false, "late lit variants are minted BEFORE setSsrMrt stamps the MRT"); minted = true; };
  const warmLateLit = async () => { assert.ok(minted); assert.equal(mrt, "tag", "late lit variants compile under the scene MRT"); };
  const warmPlusOn = () => true;   // apex26.tlxWarmPlus=1 or three's WebGL2 backend: the full warm
  // The stage timeline memState().warm reports (census 207 spent its window
  // inside the warm with no row saying so): the sandbox owns the record.
  const _warmStages = { at: 0, scene: null, post: null, shadow: null, total: null, attempts: 0, failed: 0 };
  const shadowSys = { warm: async () => {
    shadowCalls++; await Promise.resolve();
    assert.equal(postCalls, 1, "the caster warm runs after the post warm");
    assert.equal(mrt, null, "the caster warm runs with the MRT nulled");
    assert.equal(target, "HDR");
  } };
  let _gpuLastOperation = "boot";
  const _postF = { proj: [] }, vizMat = null, scene = {}, camera = {};
  let target = "canvas", mrt = "previous", tag = false, rejectMain;
  const renderer = {
    getRenderTarget: () => target, getMRT: () => mrt,
    setRenderTarget: v => { target = v; }, setMRT: v => { mrt = v; },
    compileAsync: async () => {
      await Promise.resolve(); // r185 builds later objects after yielding
      if (target === mirRT) {
        assert.equal(mrt, null); assert.equal(tag, false, "mirror world compiles without the scene MRT");
        return;
      }
      assert.equal(target, "HDR"); assert.equal(mrt, "tag"); assert.equal(tag, true);
      if (_warmAttempts === 1) await new Promise((_, reject) => { rejectMain = reject; });
    },
  };
  const post = { enabled: () => true, sceneTarget: () => "HDR", warmMirror: async tex => {
    mirrorCalls++; await Promise.resolve();
    assert.equal(tex, "mirrorTex"); assert.equal(mrt, "tag", "mirror composite compiles under the main MRT");
    assert.equal(shadowCalls, 1); assert.equal(tag, false);
  }, warm: async () => {
    postCalls++; await Promise.resolve();
    assert.equal(shadowCalls, 0, "the post warm runs before the caster warm");
    assert.equal(mrt, "tag", "the post warm runs under the scene MRT, the variant present() draws");
    assert.equal(target, "HDR");
  } };
  const lit = { setSsrMrt: v => { tag = v; } }, fx = null;
  const pinSkyMaterial = () => {}, _ssrMrtNode = () => "tag", softOutRT = () => null, Log = { warn() {} };
  const body = fnBody(code("js/render/three/tlx.js"), "startProgramWarm");
  // Source pins for the same order: exactly one setMRT(null), between the post
  // warm and the caster warm, and the caster warm still guarded on the module.
  const iPost = body.indexOf("await post.warm(opts, _postF)"), iNull = body.indexOf("renderer.setMRT(null)"),
    iShadow = body.indexOf("shadowSys.warm()");
  assert.ok(iPost > 0 && iNull > iPost && iShadow > iNull, "setMRT(null) must sit between the post warm and the caster warm");
  assert.equal(body.indexOf("renderer.setMRT(null)", iNull + 1), -1, "startProgramWarm nulls the MRT exactly once");
  assert.match(body, /if \(warmPlusOn\(\) && shadowSys && shadowSys\.warm\)/, "the caster warm is skipped when the module offers none or apex26.tlxWarmPlus is not 1");
  assert.match(body, /post\.warm && \(warmPlusOn\(\) \|\| performance\.now\(\) - _warmAt < 3000\)/, "without tlxWarmPlus=1 the post warm keeps its 3 s gate");
  const warm = eval("(function(opts){" + body + "})");
  warm({}); await Promise.resolve();
  assert.equal(target, "HDR"); assert.equal(mrt, "tag"); assert.equal(postCalls, 0);
  rejectMain(new Error("transient")); await _warmPending;
  assert.equal(target, "canvas"); assert.equal(mrt, "previous"); assert.equal(tag, false);
  assert.equal(_warmRequested, true); assert.equal(_warmPending, null);
  warm({}); await _warmPending;
  assert.equal(_warmRequested, false); assert.equal(postCalls, 1); assert.equal(shadowCalls, 1); assert.equal(fxCalls, 1); assert.equal(mirrorCalls, 1); assert.equal(_mirUsed, true);
  assert.equal(target, "canvas"); assert.equal(mrt, "previous"); assert.equal(tag, false);
  // Two attempts, one failed; every stage of the successful one is a number.
  assert.equal(_warmStages.attempts, 2); assert.equal(_warmStages.failed, 1);
  for (const k of ["scene", "fx", "post", "shadow", "mirror", "total"]) assert.ok(Number.isFinite(_warmStages[k]) && _warmStages[k] >= 0, k + " stage timed");
  assert.ok(_warmStages.at > 0, "warm start stamped");
});

test("TLX post warm compiles serially and holds each target across awaits", async () => {
  let compileJobs = null, target = "scene", mrt = "tag", active = 0, calls = 0;
  const _last = { pass: "live" }; let _lastPresentRT = "liveRT", _vizDest = "viz";
  const THREE = { QuadMesh: class { constructor(mat) { this.material = mat; this.camera = {}; } } };
  // Fix C: warm() compiles the module's own `quad` with each job's material rather
  // than a snapshot per job, so the sandbox owns one — the pairing assertion below
  // (target === q.material) is unchanged and now checks the live object.
  const quad = new THREE.QuadMesh(null);
  const renderer = {
    getRenderTarget: () => target, getMRT: () => mrt,
    setRenderTarget: v => { target = v; }, setMRT: v => { mrt = v; },
    compileAsync: async q => {
      assert.equal(++active, 1); calls++;
      await Promise.resolve();
      assert.equal(target, q.material);
      assert.equal(mrt, "tag", "the post warm compiles under whatever MRT the caller set — never nulls it");
      active--;
      if (q.material === "blur") throw new Error("compile failed");
    },
  };
  const present = () => {
    compileJobs.push({ mat: "AO", target: "AO" }, { mat: "blur", target: "blur" });
    _last.pass = "warm"; _lastPresentRT = "warmRT"; _vizDest = null;
  };
  const body = fnBody(code("js/render/three/tlx-post.js"), "warm");
  // Fix D: three keys the render context (and so the program cache) on the MRT
  // node's id, and present() runs the post chain under the scene MRT; a warm
  // that nulled it built sixteen programs the race never drew (gpu-census 206).
  assert.doesNotMatch(body, /setMRT\(\s*null\s*\)/, "post.warm must not null the MRT — it compiles the variant present() draws");
  const warm = eval("(async function(opts, frame){" + body + "})");
  await assert.rejects(warm({}, {}), /compile failed/);
  assert.equal(calls, 2); assert.equal(compileJobs, null);
  assert.equal(target, "scene"); assert.equal(mrt, "tag");
  assert.deepEqual(_last, { pass: "live" }); assert.equal(_lastPresentRT, "liveRT"); assert.equal(_vizDest, "viz");
});

test("GPU verdict rejects captured compilation errors even with zero uncaptured errors", () => {
  const gpu = tlxLegJson();
  gpu.console = ["error: THREE.WebGPURenderer: Async render pipeline creation failed: Color target has no corresponding fragment stage output"];
  const result = runVerdict(verdictScript(), {
    census: { anyHardware: true, runs: [] },
    legs: { webgpu: gpu, webgl2: tlxLegJson(), glx: glxLegJson(), wgx: wgxLegJson() },
  });
  assert.equal(result.code, 1); assert.match(result.out, /shader\/pipeline console errors/);
});

test("TLX defers resize during compilation and applies the latest requested size afterward", () => {
  let _warmPending = {}, cssDirty = false;
  let cssW = 1136, cssH = 524, presentW = 1704, presentH = 786, W = 852, H = 393;
  let renderScale = 0.5, _softReadEpoch = 0, _softReadQueued = null, _softReadPending = false;
  let _gpuLastResize = null, _gpuLastOperation = "compile-scene";
  let _glMaxDim = -1, _glMaxTries = 0;   // resize()'s once-per-device WebGL2 texture ceiling
  let _xrActive = false;                 // immersive-vr skip (tlx.js attachXrSession)
  // begin()/setRenderScale set _resizeNow so size applies on this turn; the
  // warm gate still lives on resize() (window storms coalesce via _resizeRaf).
  let _resizeNow = true, _resizeRaf = 0;
  const DPR_CAP = 1.5;
  const window = { innerWidth: 1100, innerHeight: 500, devicePixelRatio: 3 };
  const _layoutCanvas = { clientWidth: 1100, clientHeight: 500 }, _displayCanvas = null;
  const cssSizeCache = {
    markDirty() { cssDirty = true; },
    read() {
      if (cssDirty) { cssW = _layoutCanvas.clientWidth; cssH = _layoutCanvas.clientHeight; cssDirty = false; }
      return { width: cssW, height: cssH };
    },
  };
  const wantSpatialUpscale = () => false, calls = [];
  const renderer = { domElement: { width: 852, height: 393 }, setSize(w, h) {
    calls.push(["canvas", w, h]); this.domElement.width = w; this.domElement.height = h;
  } };
  const post = { resize(w, h) { calls.push(["post", w, h]); } };
  let _postRebuild = false;              // a retired post chain owes a rebuild at the next realloc
  const buildPost = () => post;
  const src = code("js/render/three/tlx.js");
  const applyResize = eval("(function(){" + fnBody(src, "applyResize") + "})");
  const resize = eval("(function(){" + fnBody(src, "resize") + "})");
  resize();
  renderScale = 0.75; _layoutCanvas.clientWidth = window.innerWidth = 1000;
  resize();
  assert.deepEqual(calls, []);
  assert.deepEqual([W, H], [852, 393]);
  _softReadPending = true;               // a read in flight at the old size
  _warmPending = null; resize();
  assert.deepEqual(calls, [["canvas", 1125, 563], ["post", 1125, 563]]);
  assert.equal(_softReadPending, false, "the voided old-size read must not hold the gate");
  resize(); assert.equal(calls.length, 2, "deferred changes apply once");
});

test("TLX ignores a timing result after disabling or restarting its measurement session", async () => {
  let _gpuTimerOn = false, _gpuMs = -1, _gpuTimerEpoch = 0;
  const pending = [], _gpuSupported = () => true;
  const renderer = { backend: {}, resolveTimestampsAsync: () => new Promise(r => pending.push(r)) };
  const src = code("js/render/three/tlx.js");
  const timer = eval("(function(on){" + fnBody(src, "gpuTimer") + "})");
  const resolve = eval("(function(){" + fnBody(src, "resolveGpuTimer") + "})");
  timer(true); resolve(); timer(false); pending.shift()(7.25); await Promise.resolve();
  assert.equal(_gpuMs, -1);
  timer(true); resolve(); timer(false); timer(true);
  pending.shift()(8); await Promise.resolve(); assert.equal(_gpuMs, -1);
  resolve(); pending.shift()(4); await Promise.resolve(); assert.equal(_gpuMs, 4);
});

test("all track loaders release selector ownership before building, even on failure", () => {
  const _menuGate = { track: { old: true }, ready: "0|default|dry", warm: 2 };
  // LAZY_CIRCUIT: loadTrack refuses meta-only stubs — give a minimal path so
  // the ownership-clear + _loadTrackBody throw path is what we assert.
  const Tracks = { LIST: [{ id: "stub", path: { pts: [[0, 0, 0]] } }] };
  const PerfGov = { sentinelArm() {} }, state = "menu";
  const _loadTrackBody = () => {
    assert.equal(_menuGate.track, null);
    assert.equal(_menuGate.ready, "");
    assert.equal(_menuGate.warm, 0);
    throw new Error("build failed");
  };
  const load = eval("(function(idx){" + fnBody(read("js/game.js"), "loadTrack") + "})");
  assert.throws(() => load(0), /build failed/);
  assert.equal(_menuGate.track, null, "failed replacement cannot retain a stale world");
});

test("three warm-up fallback yields tasks without waiting for display frames", async () => {
  const core = read("vendor/three-0.186.0/three.core.min.js");
  const alias = core.match(/\b(\w+) as yieldToMain\b/);
  assert.ok(alias, "three.core.min.js must export yieldToMain under a minified alias");
  const body = fnBody(core, alias[1]);
  const queued = [], channels = [];
  let frames = 0, timers = 0;
  const raf = () => { frames++; throw new Error("must not wait for a frame"); };
  class Channel {
    constructor() {
      const rec = { closed: 0 }; channels.push(rec);
      this.port1 = { close: () => rec.closed++ };
      this.port2 = { close: () => rec.closed++, postMessage: () => queued.push(() => this.port1.onmessage()) };
    }
  }
  const timer = (fn, delay) => { assert.equal(delay, 0); timers++; queued.push(fn); };
  const factory = new Function("self", "MessageChannel", "setTimeout", "requestAnimationFrame", "return function(){" + body + "}");
  const fallback = factory({}, Channel, timer, raf);
  let completed = 0;
  const pending = Array.from({ length: 8 }, () => fallback().then(() => completed++));
  assert.equal(completed, 0); assert.equal(queued.length, 8, "each yield waits for a task");
  while (queued.length) queued.shift()();
  await Promise.all(pending);
  assert.equal(completed, 8); assert.ok(channels.every(c => c.closed === 2));
  assert.equal(frames, 0); assert.equal(timers, 0);
  const timed = factory(undefined, undefined, timer, raf)();
  assert.equal(timers, 1); queued.shift()(); await timed;
  const nativePromise = Promise.resolve("native");
  const scheduler = { yield() { assert.equal(this, scheduler); return nativePromise; } };
  assert.equal(factory({ scheduler }, Channel, timer, raf)(), nativePromise);
  assert.equal(channels.length, 8, "native scheduler does not allocate fallback channels");
  const realChannel = (await import("node:worker_threads")).MessageChannel;
  await Promise.all(Array.from({ length: 3 }, () => factory({}, realChannel, timer, raf)()));
});

test("menu player and cockpit preparation reuse the real race mesh keys", () => {
  let playerVisualKey = "previous-setup", carModelBuf = null, builds = 0;
  const playerBodies = {}, playerBodyOrder = [], PLAYER_BODY_CACHE_MAX = 3;
  const cockpitBodies = {}, cockpitBodyOrder = [], COCKPIT_BODY_CACHE_MAX = 3;
  let cockpitStyle = "standard";
  const CockpitOpts = { halo: () => true, haloSize: () => 2, body: () => cockpitStyle }, Parts = { getVisualTiers: () => ({}) };
  const Car3D = { build: () => { builds++; return {}; } };
  // js/car/car-draw.js reads the backend and the parts through the G façade and the livery through deps.
  const G = { gfx: { createMesh: x => x }, getTeamParts: () => ({}) };
  const deps = { resolveLivery: () => ({ c1: [], c2: [] }) };
  const carDecalNum = (t, c) => c.num;
  const putBoundedMesh = (cache, order, key, make) => cache[key] || (cache[key] = make());
  const body = eval("(function(team, car, visualKey = playerVisualKey){" + fnBody(read("js/car/car-draw.js"), "playerBodyMesh") + "})");
  // cockpitBodyMesh memoises its key on the last inputs and builds through a hoisted factory.
  let _cbTeam = null, _cbId = null, _cbVk = null, _cbHalo = null, _cbBody = null, _cbNum = null, _cbKey = "", _cbShKey = "";
  const buildPendingCockpitBody = eval("(function(){" + fnBody(read("js/car/car-draw.js"), "buildPendingCockpitBody") + "})");
  const cockpitKey = eval("(function(team, car, visualKey){" + fnBody(read("js/car/car-draw.js"), "cockpitKey") + "})");
  const cockpit = eval("(function(team, car, visualKey = playerVisualKey){" + fnBody(read("js/car/car-draw.js"), "cockpitBodyMesh") + "})");
  const team = { id: "mclaren" }, car = { num: 81 };
  const preparedBody = body(team, car, "selected-setup"), preparedCockpit = cockpit(team, car, "selected-setup");
  assert.equal(playerVisualKey, "previous-setup", "menu preparation does not mutate race globals");
  playerVisualKey = "selected-setup";
  assert.equal(body(team, car), preparedBody); assert.equal(cockpit(team, car), preparedCockpit);
  assert.equal(builds, 2, "race reuses both prepared meshes instead of rebuilding");
  cockpitStyle = "wide";
  assert.notEqual(cockpit(team, car), preparedCockpit, "a body change selects a distinct mesh cache entry");
  assert.equal(builds, 3);
  cockpitStyle = "standard";
  assert.equal(cockpit(team, car), preparedCockpit, "switching back reuses the original body");
});

test("selector car assets yield for costly work, skip cached waits, and cancel stale settings", async () => {
  for (const cancel of ["none", "screen", "store", "team", "driver", "compile", "model", "solo", "headless"]) {
    let carModelBuf = null;
    let active = true, compiling = false, solo = false, yields = 0;
    // js/car/car-draw.js reads race state through the G façade; the seam's four
    // game.js helpers arrive through deps.
    const G = { headlessMode: false, teamIdx: 0, driverIdx: 1, camMode: 0, store: { rev: 1 },
                cars: [{ live: true }], gfx: { warming: () => compiling } };
    const cars = G.cars, player = cars[0];
    const Teams = { LIST: [
      { id: "a", drivers: [{ num: 1 }, { num: 2 }] },
      { id: "b", drivers: [{ num: 3 }] },
      { id: "custom", custom: true, drivers: [{ num: 4 }] }
    ], isReal: (t) => !!t && !t.custom && !t.legends };   // mirrors js/data/teams.js
    const Career = { gridDrivers: t => t.drivers, driverOverride: (id, di) => id === "a" && di === 1 ? { num: 99 } : null,
                     inCareer: () => false };
    const calls = [], CamModes = { CAM_MODES: [{ id: "cockpit" }] };
    let clock = 0;
    const Log = { info() {}, warn() {} }, performance = { now: () => (clock += 8) };
    const current = () => active;
    const deps = { isTimeTrial: () => solo, isQuali: () => false, partsVisualKey: id => "parts:" + id };
    const carDecalNum = (t, c) => c.num;
    const playerBodyMesh = (t, c, key) => calls.push(["player", c.num, key]);
    const cockpitBodyMesh = (t, c, key) => calls.push(["cockpit", c.num, key]);
    const teamBodyMesh = (t, c) => calls.push(["field", c.num]);
    const getCarDecalTexture = (t, num, p) => calls.push(["atlas", num, p]);
    // The shadow casters (warmCarAssets' gate): OFF for the cancel matrix, ON below.
    let casters = false;
    const shadowCastersWanted = () => casters;
    const teamMesh = (t, c, sil) => calls.push(["caster", c.num, sil, c.visSh || "sh"]);
    const cockpitShadowMesh = (t, c, key) => calls.push(["fpCaster", c.num, key]);   // the first-person caster (car-draw.js)
    const WORKS = { aero: "w", tyres: "w" };
    const Parts = { CATALOG: [{ id: "aero" }, { id: "tyres" }], getFactorySetup: () => WORKS,
                    resolveSetup: (s) => ({ ids: Object.assign({}, WORKS, s) }) };
    G.getTeamParts = () => ({ aero: "hi" });
    // makeCars' and the prep's ONE stamp helper, the real one (it reads Career / Parts above).
    const carVisual = eval("(" + fnSource(read("js/car/car-draw.js"), "function carVisual(") + ")");
    const setTimeout = fn => {
      yields++;
      if (yields === 2) {
        if (cancel === "screen") active = false;
        if (cancel === "store") G.store.rev++;
        if (cancel === "team") G.teamIdx = 1;
        if (cancel === "driver") G.driverIdx = 0;
        if (cancel === "compile") compiling = true;
        if (cancel === "model") carModelBuf = {};
        if (cancel === "solo") solo = true;
        if (cancel === "headless") G.headlessMode = true;
      }
      Promise.resolve().then(fn);
    };
    const prepare = eval("(async function(current){" + fnBody(read("js/car/car-draw.js"), "prepareMenuCarAssets") + "})");
    await prepare(current);
    assert.deepEqual(calls.slice(0, 3), [["player", 99, "parts:a"], ["cockpit", 99, "parts:a"], ["atlas", 99, true]]);
    assert.equal(calls.length, cancel === "none" ? 7 : 3, cancel);
    assert.equal(yields, cancel === "none" ? 3 : 2, "one driver per yielded task");
    assert.equal(cars[0], player); assert.deepEqual(cars, [{ live: true }]);
    calls.length = 0; active = true; compiling = false; carModelBuf = null; G.headlessMode = false;
    G.teamIdx = 0; G.driverIdx = 1; solo = true; yields = 10;
    await prepare(current);
    assert.equal(calls.length, 3, "solo sessions prepare only their player");
    performance.now = () => 0;
    calls.length = 0; yields = 0; solo = false;
    await prepare(current);
    assert.equal(calls.length, 7, "cheap cache lookups still consult current assets");
    assert.equal(yields, 0, "cache hits do not pay one timer per driver");
    if (cancel !== "none") continue;
    // THE CASTERS in the same sliced loop: each its own step after its car (one
    // build per yielded task, as before), keyed (team, car, true) like the shadow
    // passes; the player's on its OWN build, makeCars' stamp + ":sh".
    casters = true; calls.length = 0; yields = 0; clock = 0;
    performance.now = () => (clock += 8);
    await prepare(current);
    assert.deepEqual(calls.filter(c => c[0] === "caster"),
      [["caster", 99, true, "hi,:sh"], ["caster", 1, true, "sh"], ["caster", 3, true, "sh"]]);
    // In a first-person camera the player's step also builds its first-person caster, on the prepared key.
    assert.deepEqual(calls.filter(c => c[0] === "fpCaster"), [["fpCaster", 99, "parts:a"]]);
    assert.deepEqual(calls.map(c => c[0]), ["player", "cockpit", "atlas", "fpCaster", "caster", "field", "atlas", "caster", "field", "atlas", "caster"]);
    assert.equal(yields, 6, "a caster takes a slice of its own");
  }
});

test("selector preparation waits for the player's hands before the build and the warm frames", async () => {
  // A TIME OF DAY step that crosses dark rebuilds the circuit (1-3 s on the
  // main thread) and the warm frames that follow upload and compile for seconds
  // more; both ran 120 ms after the tap, so the RACE SETTINGS sheet froze under
  // the player's next tap (2026-09-24). Both now wait for MENU_IDLE_MS of quiet.
  const src = read("js/game.js");
  const body = fnBody(src, "scheduleFlybyTrack");
  // The build no longer waits for idle (2026-10): it is stepped, so it starts at once.
  assert.match(body, /return;\s*\}\s*(\/\/[^\n]*\s*)*if \(!\(await loadTrackStepped\(want, current\)\)\) return;/,
    "the build starts at once, in steps (a tap on the sheet mid-build is answered)");
  assert.ok(!/menuIdle/.test(body.slice(0, body.indexOf("loadTrackStepped("))), "no idle wait before the build");
  assert.match(body, /if \(!\(gfx\.warming && gfx\.warming\(\)\) && state === "menu" && track && Tracks\.LIST\[trackIdx\] && builtTrackId !== Tracks\.LIST\[trackIdx\]\.id\) dropTrackWorld\(\);/,
    "picking another circuit frees the last world immediately only after compilation releases it");
  assert.equal((body.match(/await menuFinish\(current, key\);/g) || []).length, 2,
    "both paths finish through menuFinish (car assets, warm frames, lamp pre-bake, flyby plans)");
  const fin = src.match(/async function menuFinish\(current, key\) \{[\s\S]*?\n\}/)[0];
  // warmPrograms() first: the hidden frame that follows starts TLX's program
  // warm, so it runs here instead of holding the card at the lights.
  assert.match(fin, /await prepareMenuCarAssets\(current\);\s*if \(!current\(\)\) return;\s*if \(await menuIdle\(current\)\) \{ warmPrograms\(\); FlybySeq\.reset\(\); _menuGate\.warm = 2; \}/,
    "the warm frames follow the paced car assets, on an idle menu, with the program warm requested first");
  assert.ok(fin.indexOf("_menuGate.warm = 2") < fin.indexOf("menuLampBake(current)"),
    "…and come BEFORE the lamp pre-bake: a RACE! tap mid-bake met cold shaders");
  const idle = eval("(function(){ let _menuInputAt = 0; const MENU_IDLE_MS = 1200; let now = 0;" +
    " const performance = { now: () => now }; const waits = [];" +
    " const setTimeout = (fn, ms) => { waits.push(ms); now += ms; fn(); };" +
    src.match(/async function menuIdle\(current\) \{[\s\S]*?\n\}/)[0] +
    " return { menuIdle, waits, tap: (t) => { _menuInputAt = t; now = t; } }; })()");
  idle.tap(5000);
  assert.equal(await idle.menuIdle(() => true), true);
  assert.deepEqual(idle.waits, [1200], "a tap pushes the build a full idle window out");
  assert.equal(await idle.menuIdle(() => false), false, "a stale selection never builds");
});

test("selector preparation rejects stale requests, reuses the world, and waits for compilation", async () => {
  const _menuGate = { warm: 0, generation: 0, ready: "", track: null };
  let flybyBuildTimer = 0, trackIdx = 0, raceTimeOfDay = "default", raceWeather = "dry";
  const menuKey = (idx) => [idx, raceTimeOfDay, raceWeather, 22].join("|");   // the real one adds fieldSize()
  let state = "menu", setupPreviewOn = false, track = null, compiling = false, builtTrackId = null;
  const Tracks = { LIST: [{ id: 0 }, { id: 1 }] }, drops = [];
  const dropTrackWorld = () => { drops.push(track && track.id); track = null; builtTrackId = null; _menuGate.track = null; _menuGate.ready = ""; };
  const els = { select: { hidden: false } }, settings = { hidden: true }, $ = () => settings;
  const timers = new Map(), requests = [], builds = [];
  let timerId = 0;
  const setTimeout = (fn) => { timers.set(++timerId, fn); return timerId; };
  const clearTimeout = id => timers.delete(id);
  const gfx = { warming: () => compiling }, Log = { warn() {} };
  const warmed = []; const warmPrograms = () => warmed.push(_menuGate.warm);   // the real one asks gfx.warm() (GLX here: none)
  const prepareMenuCarAssets = async () => {};
  const menuLampBake = async () => {};   // the lamp prebake is LampBake.prebake's (lamp-bake.test.mjs)
  // The REAL menuFinish, with the flyby planning stubbed (flyby-shots.test.mjs covers it).
  let _menuFly = null;
  const FlybySeq = { DEFAULT: [], vary: () => [], planSteps: () => () => true, reset() {}, setDuration() {} };
  const loadingScreen = { nextFlyMs: () => 24000 };
  // The idle gate and the upload slice are module-level policy (tested below);
  // here the player is idle and a slice is immediate.
  const menuIdle = async (current) => current(), menuSlice = async () => {};
  const ensureScenery = id => new Promise(resolve => requests.push({ id, resolve }));
  const loadTrack = id => { builds.push(id); track = { id }; builtTrackId = id; };
  const loadTrackStepped = async (id, cur) => { if (!cur()) return false; loadTrack(id); return true; };   // the real one: tracks.js buildPaced + build-steps.test.mjs
  const garagePrewarm = async () => {};   // garage-arrival.test.mjs pins it
  const menuFinish = eval("(" + read("js/game.js").match(/async function menuFinish\(current, key\) \{[\s\S]*?\n\}/)[0] + ")");
  const uiExperience = null;
  const schedule = eval("(function(settle){" + fnBody(read("js/game.js"), "scheduleFlybyTrack") + "})");
  const fire = () => { const [id, fn] = [...timers].pop(); timers.delete(id); return fn(); };
  schedule(true); const old = fire();
  trackIdx = 1; schedule(true); trackIdx = 0; schedule(true); const latest = fire();
  requests.shift().resolve(); await old; assert.deepEqual(builds, [], "A-B-A cannot revive old work");
  requests.shift().resolve(); await latest; assert.deepEqual(builds, [0]);
  schedule(); const reuse = fire(); requests.shift().resolve(); await reuse;
  assert.deepEqual(builds, [0], "NEXT reuses the prepared world");
  assert.equal(_menuGate.warm, 2, "NEXT resumes hidden warming interrupted by rescheduling");
  assert.ok(warmed.length >= 1 && warmed.every((w) => w !== 2), "the program warm is requested BEFORE the hidden frames are armed, every time");
  raceTimeOfDay = "night"; compiling = true; schedule(); const downloading = fire();
  assert.equal(requests.length, 1, "scenery downloads while the previous world compiles");
  requests.shift().resolve(); await downloading;
  assert.deepEqual(builds, [0], "no scene replacement during compilation");
  compiling = false; const night = fire(); requests.shift().resolve(); await night;
  assert.deepEqual(builds, [0, 0], "time-of-day changes prepare again");
  assert.deepEqual(drops, [], "a time-of-day change on the same circuit frees nothing up front");
  trackIdx = 1; schedule(); assert.deepEqual(drops, [0], "another circuit frees the last world the moment it is picked");
  const leaving = fire(); els.select.hidden = true;
  requests.shift().resolve(); await leaving; assert.deepEqual(builds, [0, 0]);
  trackIdx = 0; schedule(); assert.deepEqual(drops, [0], "nothing built: nothing to free");
  trackIdx = 1; els.select.hidden = false; schedule(); const changed = fire(); raceWeather = "rain";
  requests.shift().resolve(); await changed; assert.deepEqual(builds, [0, 0]);
});

test("selector retains a different circuit during compilation, then releases it and starts the stepped build without an idle wait", async () => {
  const src = read("js/game.js"), previous = { id: "a", meshes: {} }, freed = [], builds = [];
  let track = previous, builtTrackId = "a", builtTrackNight = false, builtGridSlots = 22, compiling = true, _menuFly = {};
  const _menuGate = { generation: 0, warm: 0, track, ready: "0|default|dry|22" };
  const state = "menu", setupPreviewOn = false, trackIdx = 1, raceTimeOfDay = "default", raceWeather = "dry";
  const gfx = { warming: () => compiling }, els = { select: { hidden: false } }, $ = () => ({ hidden: true });
  const menuKey = idx => [idx, raceTimeOfDay, raceWeather, 22].join("|"), fieldSize = () => 22;
  const sessionDarkFor = () => false, trackBuildOpts = () => ({}), sceneryResident = () => false;
  const PerfGov = { sentinelArm() {} }, Log = { warn() {} };
  const freeTrackMeshes = t => { assert.equal(compiling, false, "compileAsync still owns the old geometries"); freed.push(t); };
  const shadowPass = { reset() { assert.equal(compiling, false, "shadow programs also retain ownership until compile settles"); } };
  // path stubs: loadTrackStepped → loadTrack short-circuit needs a payload.
  const Tracks = {
    LIST: [{ id: "a", path: { pts: [[0, 0, 0]] } }, { id: "b", path: { pts: [[1, 0, 0]] } }],
    buildPaced: async def => { builds.push(def.id); return { id: def.id, meshes: {} }; },
  };
  const _loadTrackBody = (idx, def, built) => { track = built; builtTrackId = def.id; };
  const dropTrackWorld = eval("(function(){" + fnBody(src, "dropTrackWorld") + "})");
  // LAZY_CIRCUIT: stepped loader awaits ensureCircuit before Tracks.buildPaced.
  const ensureCircuit = async () => {};
  const loadTrackStepped = eval("(async function(idx, live){" + fnBody(src, "loadTrackStepped") + "})");
  const ensureScenery = async () => {}, menuSlice = async () => {}, menuFinish = async () => {}, garagePrewarm = async () => {};
  const menuIdle = () => { throw new Error("the stepped build must not wait for menu idle"); };
  let flybyBuildTimer = 0, timerId = 0;
  const timers = new Map(), setTimeout = (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout = id => timers.delete(id);
  const schedule = eval("(function(settle){" + fnBody(src, "scheduleFlybyTrack") + "})");
  const fire = async () => { const [id, timer] = [...timers][0]; timers.delete(id); await timer.fn(); };
  schedule();
  assert.strictEqual(track, previous, "changing circuit preserves resources while compilation is pending");
  assert.deepEqual(freed, []);
  await fire();
  assert.strictEqual(track, previous); assert.deepEqual(builds, []); assert.deepEqual(freed, []);
  assert.equal([...timers.values()][0].ms, 100, "only the compile retry is queued");
  compiling = false; await fire();
  assert.deepEqual(freed, [previous], "the real stepped loader releases the previous world once");
  assert.deepEqual(builds, ["b"], "the next compile retry starts the stepped build directly");
  assert.equal(_menuGate.ready, menuKey(1)); assert.strictEqual(_menuGate.track, track);
  assert.equal(track.id, "b"); assert.equal(_menuFly, null, "old flyby plans retire with their circuit");
});

test("TLX bounds GPU error history and preserves resize context at receipt", () => {
  let _gpuFirstError = null, _gpuErrors = 0, _gpuErrLastPresent = -1, _gpuErrFrames = 0, _presentN = 12;
  let _warmPending = {}, _gpuLastOperation = "compile-post", _gpuLastResize = { width: 852, height: 393 };
  const _gpuRecentErrors = [], GPU_ERR_LOG_CAP = 8, Log = { warn() {} };
  const src = code("js/render/three/tlx.js").replace("const onErr = function", "function onErr");
  const onErr = eval("(function(ev){" + fnBody(src, "onErr") + "})");
  for (let i = 0; i < 10; i++) onErr({ error: new Error("error " + i) });
  _gpuLastResize = { width: 1278, height: 590 };
  assert.equal(_gpuErrors, 10); assert.equal(_gpuFirstError, "error 0");
  assert.equal(_gpuRecentErrors.length, 8); assert.equal(_gpuRecentErrors[0].message, "error 2");
  assert.equal(_gpuRecentErrors[0].lastResize.width, 852);
  assert.equal(_gpuRecentErrors[0].warmingAtReceipt, true);
  assert.equal(_gpuRecentErrors[0].presentAtReceipt, 12);
  assert.equal(_gpuErrFrames, 1, "receipt counters retain their existing semantics");
});

test("tick()'s fatal catch arms the boot-canary probe before rethrowing (a pre-present crash must not go unrecorded)", () => {
  // render() used to arm the probe only right before its own gfx.present(po)
  // call, at the very end of the function. If render() throws BEFORE
  // reaching that line — a deterministic fault, not the transient kind
  // LoopHealth.fault() absorbs — the probe was never written, so the
  // next-boot strike logic (armed && !skipClaim, near backendPreference())
  // never saw evidence of the crash. armBackendProbe() extracts the same
  // body so tick()'s fatal branch can call it too, on the way out.
  const game = code("js/game.js");
  const helper = fnBody(game, "armBackendProbe");
  assert.match(helper, /_backendProved/, "the extracted helper must keep the proved-backend short-circuit");
  assert.match(helper, /_backendBound/, "the extracted helper must keep the bound-backend gate");
  assert.match(helper, /_probeArmed\s*=\s*true/, "the extracted helper must still set the armed latch");
  assert.match(helper, /try\s*\{[^]*catch\s*\([^)]*\)\s*\{/, "armBackendProbe must keep the original try/catch — a jetsam mid-arm must not throw");
  const tickBody = fnBody(game, "tick");
  assert.match(tickBody, /LoopHealth\.fault\(e\)/, "tick()'s catch must still run the bounded-tolerance check first");
  const afterFault = tickBody.slice(tickBody.indexOf("LoopHealth.fault(e)"));
  const armIdx = afterFault.indexOf("armBackendProbe(");
  const throwIdx = afterFault.lastIndexOf("throw e");
  assert.ok(armIdx >= 0, "tick()'s fatal branch must call armBackendProbe()");
  assert.ok(throwIdx > armIdx, "armBackendProbe() must run BEFORE the rethrow, not after (a thrown error never returns to run it later)");
  assert.match(afterFault.slice(armIdx - 60, armIdx), /_backendBound\s*&&\s*!_backendProved/,
    "the fatal-branch call site must gate on the same latch state as the render() call site");
});

test("the startline mesh beats the unbiased road without burying the cars", () => {
  // The start line, grid boxes and pit paint ride one OPAQUE decal mesh drawn
  // with _startBias, and the grid boxes lie under the cars. A slope factor of -f
  // pulls paint behind a car forward by f px of its depth gradient and hides the
  // car's bottom f px: at -12 (over a road at [-8, -16]) whole cars vanished at
  // range (2026-09-24). So: the road carries NO depthBias, and _startBias is a
  // small negative bias that still beats it.
  const src = read("js/game.js");
  const start = src.match(/const _startBias = \[(-?[\d.]+), (-?[\d.]+)\]/);
  assert.ok(start, "_startBias not found in js/game.js");
  const roads = [...src.matchAll(/const _wmRoad\w+ = \{[^}]*\}/g)];
  assert.ok(roads.length >= 4, `expected the four _wmRoad* materials, found ${roads.length}`);
  for (const r of roads) assert.doesNotMatch(r[0], /depthBias/, `road material must not carry a depth bias: ${r[0]}`);
  const f = Number(start[1]), u = Number(start[2]);
  assert.ok(f < 0 && u < 0, `_startBias [${f}, ${u}] must pull the paint toward the camera`);
  assert.ok(f >= -4, `_startBias factor ${f} would bury the cars standing on the grid boxes`);
});

test("TLX FX: double-sided FX draw in ONE pass and their programs warm on the stream layouts (PERF-FINDINGS §2ah)", () => {
  // three splits a transparent DoubleSide material into back + front passes
  // unless forceSinglePass: two draws, two pipelines, and compileAsync builds
  // neither — the particle groups compiled mid-race even when warmed.
  const fxSrc = code("js/render/three/tsl-fx.js");
  assert.match(fxSrc, /if \(o\.doubleSided\) \{ m\.side = THREE\.DoubleSide; m\.forceSinglePass = true; \}/,
    "double-sided FX materials must set forceSinglePass (GLX draws them in one pass, cull off)");
  const tlx = code("js/render/three/tlx.js");
  const body = fnBody(tlx, "warmFxPrograms");
  for (const pair of [/\[skidStream, fx\.skidMat\]/, /\[partStreams\[0\], fx\.particleMats/, /\[partStreams\[1\], fx\.particleMats/])
    assert.match(body, pair, "the FX warm compiles " + pair + " on its real stream geometry");
  assert.match(body, /ensureStream\(stream, 1\)/, "the stream geometry (its vertex layout) exists before the compile");
  assert.match(fnBody(tlx, "startProgramWarm"), /await warmFxPrograms\(\);\s*await warmLateLit\(\);/, "startProgramWarm runs the FX warm, then the late lit variants");
  assert.match(tlx, /const _LATE_LIT = \[\{ roughness: 0\.9, specular: 0, noAlphaWrite: true, alpha: 0\.5 \}\]/,
    "the brake-ring transparent variant (census 245 minted t,0.9,0,0,0,0,0,1|na) is pre-minted during the lights");
});

test("lamp shadow: the player takes the AI cars' lamp-radius bound in BOTH the key and the cast (TLX-PERF-PLAN L0)", () => {
  // Hashed and cast unconditionally, the player changed the key every 0.25 m, so a
  // night drive rebuilt the whole static prop set 30-60 times a second even far
  // outside the lamp's reach. The key must cover exactly the set the pass draws.
  const sp = code("js/render/shared/shadow-pass.js");
  const lamp = fnBody(sp, "lampPass");
  assert.match(lamp, /const _playerIn = _hasLivePlayerShadow && \(_pdx \* _pdx \+ _pdy \* _pdy \+ _pdz \* _pdz\) <= _lsR2;/,
    "the player is tested against the same _lsR2 as the AI casters");
  assert.match(lamp, /let _carKey = _playerIn \? _lampCasterKey\(1, _pm\) : 0;/, "the key hashes the player only when it is cast");
  assert.match(lamp, /if \(_playerIn\) _castPlayer\(\);/,
    "the cast draws the player only when it is within reach");
  assert.match(lamp, /const _pm = _playerMat\(\);/, "…and tests and keys it at the matrix _castPlayer draws it with");
  assert.doesNotMatch(lamp, /if \(_hasLivePlayerShadow\) G\.gfx\.castShadow/, "no unconditional player cast left in the lamp pass");
});

test("lamp static map: car-only rebuilds copy the static props depth and draw the cars alone (TLX-PERF-PLAN L1)", () => {
  const sh = code("js/render/three/tlx-shadow.js");
  // WebGPU cannot copyTextureToTexture a depth24plus texture: both lamp targets
  // carry depth32float when the static map is on.
  assert.match(sh, /if \(floatDepth\) depthTexture\.type = THREE\.FloatType;/);
  assert.match(sh, /const lampRT = isMobile \? null : makeDepthTarget\(LAMP_SIZE, "TLXLampShadow", false, lampStaticOn\);/);
  assert.match(sh, /const lampStaticRT = lampStaticOn \? makeDepthTarget\(LAMP_SIZE, "TLXLampStatic", false, true\) : null;/);
  // AUTO is WebGPU only: three's WebGL copy does five synchronous gl.getParameter
  // reads per call (census 289: 2 s of WebGL2 spike frames inside lampCarsBegin).
  assert.match(sh, /let lampStaticOn = isWebGPU;/, "the depth copy must not default on for three's WebGL2 backend");
  // The car-only pass: copy first, then draw onto the copied depth with the clear off,
  // and autoClear restored in a finally so a throwing caster cannot leave it off.
  const cars = fnBody(sh, "lampCarsBegin");
  assert.match(cars, /renderer\.copyTextureToTexture\(lampStaticRT\.depthTexture, lampRT\.depthTexture\)/);
  assert.match(cars, /!_lampStaticValid \|\| !_lampRendered\) return false;/, "no copy before a valid static map AND a rendered lampRT");
  const end = fnBody(sh, "endPass");
  assert.match(end, /if \(keepDepth\) renderer\.autoClear = false;/);
  assert.match(end, /finally \{ renderer\.autoClear = autoClear0; \}/);
  // shadow-pass: cars-only on a car-only change, the full pass otherwise, and the
  // static map refreshed after every full pass (a lamp change or the first).
  const lamp = fnBody(code("js/render/shared/shadow-pass.js"), "lampPass");
  assert.match(lamp, /const _carsOnlyPass = _carOnly && G\.gfx\.lampCarsBegin && G\.gfx\.lampCarsBegin\(_mFlVP, flBest\);/);
  assert.match(lamp, /if \(!_carsOnlyPass\) G\.gfx\.lampShadowBegin\(_mFlVP, flBest\);/);
  assert.match(lamp, /if \(!_carsOnlyPass && G\.gfx\.lampStaticBegin && G\.gfx\.lampStaticBegin\(_mFlVP\)\) \{/);
});

test("godray: lamp beams alone take one blur pair, sun shafts keep two, on TLX and GLX alike (TLX-PERF-PLAN G1)", () => {
  // The second H+V pair removes the sun march's shadow-slice stripes; a lamp
  // cone has none, so night frames with only lamp beams skip it: -2 half-res
  // passes. One backend-neutral knob, apex26.grLite=0, restores two pairs.
  const tlx = code("js/render/three/tlx-post.js"), glx = code("js/render/glx/post.js");
  for (const [name, src] of [["tlx-post", tlx], ["glx/post", glx]]) {
    // opts.grLite (MEDIUM/LOW) OR (!sunGR && _grLite) → one pair; sun shafts on
    // HIGH/ULTRA still take two unless apex26.grLite=0 is unset (default on).
    assert.match(src, /const grPairs = /, name + ": grPairs local");
    assert.match(src, /grLite/, name + ": opts.grLite or _grLite in the pair gate");
    assert.match(src, /!sunGR && _grLite/, name + ": lamp-only one-pair arm");
    assert.match(src, /\? 1 : 2/, name + ": one pair vs two");
    assert.match(src, /for \(let bp = 0; bp < grPairs; bp\+\+\)/, name + ": the blur loop runs grPairs");
    assert.match(src, /_grLite = localStorage\.getItem\("apex26\.grLite"\) !== "0"/, name + ": the shared knob");
  }
});

// The boot fallback runs the actual game.js selection block against a stable
// GLX facade and injected loader outcomes, without claiming a real canvas.
{
const lazyRequire = createRequire(import.meta.url);
const LAZY_ROOT = new URL("../../", import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, LAZY_ROOT), "utf8");
const manifest = lazyRequire("../../tools/manifest.cjs");
const game = source("js/render/renderer-boot.js");
const begin = game.indexOf("\nif (!gfx) {");
const end = game.indexOf("\nreturn { gfx, bound:", begin);
assert.ok(begin > 0 && end > begin, "boot's GLX fallback must remain identifiable");
const fallback = `(async function () { let gfx = null; ${game.slice(begin, end).replace(/return null;/g, "return;")} return gfx; })()`;

test("the eager GLX handle preserves eval-time mobile tier and live backend getters", () => {
  const storage = new Map([["apex26.forceMobileTier", "1"]]);
  const context = vm.createContext({
    navigator: { userAgent: "Desktop Test", maxTouchPoints: 0 },
    localStorage: { getItem: (k) => storage.get(k) || null },
  });
  context.window = context;
  vm.runInContext(source("js/render/shared/glx-facade.js"), context);
  const handle = context.GLX;
  assert.equal(handle.isMobile, true);
  assert.equal(handle.mobileTier, true);
  assert.equal(typeof handle.init, "undefined", "GLX implementation should remain deferred");
  const backend = { init: () => true, get width() { return 42; } };
  handle.install(backend);
  assert.equal(context.GLX, handle, "consumers must retain their GLX object identity");
  assert.equal(handle.width, 42, "descriptor-copy must preserve live getters");
  assert.equal(handle.init(), true);
  storage.set("apex26.gfxHigh", "1");
  const next = vm.createContext({
    navigator: { userAgent: "iPad", maxTouchPoints: 5 },
    localStorage: { getItem: (k) => storage.get(k) || null },
  });
  next.window = next;
  vm.runInContext(source("js/render/shared/glx-facade.js"), next);
  assert.equal(next.GLX.isMobile, true);
  assert.equal(next.GLX.mobileTier, false, "high quality overrides only the safe tier");
});

test("GLX implementation is deferred and ordered, while the facade precedes its consumers", () => {
  assert.ok(manifest.FULL.includes("js/render/shared/glx-facade.js"));
  assert.ok(!manifest.FULL.includes("js/render/glx/glx.js"));
  assert.equal(manifest.DEFERRED.webgl2.at(-1), "js/render/glx/glx.js");
  assert.ok(manifest.HARD_EDGES.some(([a, b]) => a === "js/render/shared/glx-facade.js" && b === "js/car/liverytex.js"));
  assert.ok(manifest.CARVIEW.includes("js/render/shared/glx-facade.js"));
});

function bootScenario({ install = true, init = true, pref = "webgl2", skip = false, blocked = false } = {}) {
  const events = [], storage = new Map();
  const context = vm.createContext({
    navigator: { userAgent: "", maxTouchPoints: 0 },
    localStorage: { getItem: () => null, removeItem: (k) => events.push(`remove:${k}`) },
    sessionStorage: {
      getItem: (k) => blocked ? null : storage.get(k) || null,
      setItem(k, v) { if (blocked) throw new Error("blocked"); storage.set(k, v); },
    },
    Event: class { constructor(type) { this.type = type; } },
    location: { reload: () => events.push("reload") },
    BACKEND_FILES: { webgl2: ["glsl-chunks.js", "glx.js"] },
    canvas: {}, _claimSkipped: skip, _createHung: false,   // start()'s closure state the sliced fallback reads
    backendPreference: () => pref,
    showGraphicsUnavailable: () => events.push("unavailable"),
    async loadBackendScripts(group) {
      events.push(`load:${group.join(",")}`);
      if (install) context.GLX.install({ init: () => { events.push("init"); return init; } });
    },
  });
  context.window = context;
  context.dispatchEvent = (event) => events.push(event.type);
  vm.runInContext(source("js/render/shared/glx-facade.js"), context);
  return { run: () => vm.runInContext(fallback, context), events, context, storage };
}

test("explicit GLX and refused opt-in backends load the implementation before context claim", async () => {
  for (const pref of ["webgl2", "webgpu", "three"]) {
    const h = bootScenario({ pref });
    assert.equal(await h.run(), h.context.GLX);
    assert.equal(h.events[0], "load:glsl-chunks.js,glx.js");
    assert.ok(h.events.indexOf("init") > h.events.indexOf("load:glsl-chunks.js,glx.js"));
    assert.equal(h.events.includes("reload"), false);
    assert.equal(h.storage.get("apex26.gfxBound"), "webgl2");
  }
});

test("missing GLX script shows an unavailable panel without reloading indefinitely", async () => {
  const h = bootScenario({ install: false, pref: "webgpu" });
  assert.equal(await h.run(), undefined);
  assert.deepEqual(h.events, ["load:glsl-chunks.js,glx.js", "unavailable"]);
});

test("an already-claimed canvas reloads once only with a durable session skip", async () => {
  const h = bootScenario({ pref: "webgpu", init: false });
  await h.run();
  assert.equal(h.events.includes("reload"), true);
  assert.equal(h.events.includes("unavailable"), false);
  assert.equal(h.storage.get("apex26.gfxClaimFail"), "1");
  for (const opts of [{ pref: "webgpu", init: false, skip: true },
                     { pref: "webgpu", init: false, blocked: true }]) {
    const stopped = bootScenario(opts);
    await stopped.run();
    assert.equal(stopped.events.includes("reload"), false);
    assert.equal(stopped.events.includes("unavailable"), true);
  }
});

}
test("godray: WGX takes the same one-pair lamp-only blur as TLX/GLX", () => {
  const src = code("js/render/webgpu/wgx.js");
  assert.match(src, /1 \/ halfW, 1 \/ halfH, \(o\.grLite \|\| \(!sunGR && _grLite\)\) \? 1 : 2\)/, "wgx: one pair without sun shafts or when o.grLite");
  assert.match(src, /_grLite = localStorage\.getItem\("apex26\.grLite"\) !== "0"/, "wgx: the shared knob");
});

test("lamp shadow cache keys on the lamp's VP inputs, not its position alone", () => {
  // POOL RADIUS / BEAM CONE rebuild the set with the same positions: a key on
  // x,y,z kept (or car-only-copied) a map drawn under the old far plane / fov.
  const sp = code("js/render/shared/shadow-pass.js");
  assert.match(sp, /rad === _lampShR && L\[o \+ 11\] === _lampShC/, "radius + cone in the same-lamp key");
  assert.match(sp, /L\[o \+ 7\] === _lampShDx && L\[o \+ 8\] === _lampShDy && L\[o \+ 9\] === _lampShDz/, "aim in the key");
  const sh = code("js/render/three/tlx-shadow.js");
  assert.match(sh, /if \(Math\.fround\(lightVP\[i\]\) !== _lampStaticVP\[i\]\) return false;/, "L1 copy only under the static map's own VP");
});

test("TLX draw records are pooled, one fixed shape, reset through resetRecs (TLX-PERF-PLAN R1)", () => {
  const src = read("js/render/three/tlx.js");
  const stripped = code("js/render/three/tlx.js");
  assert.doesNotMatch(stripped, /drawList\.push\(\{/, "no per-draw object literal left");
  assert.equal((stripped.match(/drawList\.length = 0/g) || []).length, 1, "the one raw reset is inside resetRecs");
  assert.ok((stripped.match(/resetRecs\(\);/g) || []).length >= 4, "begin, env-soft exit, env face end and present tail all reset through resetRecs");
  // Run the real pool: a slot reused by an FX record must not carry the previous
  // lit draw's emissive/alpha (acquireMesh tests `!== undefined`), and a reset
  // must drop every reference the slot held.
  const a = src.indexOf("const _recPool = [];"), b = src.indexOf("drawList.length = 0;", a);
  const end = src.indexOf("}", b) + 1;
  const drawList = [];
  const lib = new Function("drawList", src.slice(a, end) + "; return { pushRec, resetRecs, pool: () => _recPool };")(drawList);
  lib.pushRec("G1", "M1", "MAT1", 0.7, 0.4, 1, null, null);
  const slot = drawList[0];
  lib.resetRecs();
  assert.equal(drawList.length, 0);
  assert.equal(slot.geo, null); assert.equal(slot.mat, null); assert.equal(slot.m, null);
  lib.pushRec("G2", null, "FXMAT", undefined, undefined, 0, null, null);
  assert.equal(drawList[0], slot, "the slot is reused");
  assert.equal(slot.em, undefined); assert.equal(slot.al, undefined); assert.equal(slot.lg, 0);
  assert.deepEqual(Object.keys(slot), ["geo", "m", "mat", "em", "al", "lg", "chunked", "instanced"], "one fixed shape");
});

test("GLX racing-line chevrons keep vAlong at highp, and a restored context obeys the reload budget", () => {
  // vAlong is metres along the lap (to ~7 km); ESSL mediump is fp16 on mobile
  // GPUs (MDN WebGL best practices), which steps 4 m there and broke the 5 m
  // chevrons. A restore handler reloading without the loss handler's counter
  // looped on a device that loses the context every boot.
  assert.match(code("js/render/glx/shaders/glsl-fx.js"), /in highp float vAlong;/);
  for (const f of ["js/render/glx/glx.js", "js/render/three/tlx.js"]) {
    const src = code(f);
    const i = src.indexOf('"webglcontextrestored"');
    assert.ok(i > 0, f);
    assert.match(src.slice(i, i + 600), /ctxLostReloads[\s\S]*> 2\) return;/, f + ": the restore reload checks the counter");
  }
});


test("cancelled menu finishing cannot change the active montage", async () => {
  for (const cancelAt of ["assets", "idle", "lamps"]) {
    let active = true, _menuFly = null;
    const current = () => active, calls = [];
    const track = {}, trackIdx = 0, _menuGate = { warm: 0 };
    const prepareMenuCarAssets = async () => { if (cancelAt === "assets") active = false; };
    const menuIdle = async () => { if (cancelAt === "idle") active = false; return active; };
    const menuLampBake = async () => { if (cancelAt === "lamps") active = false; return false; };
    const warmPrograms = () => {}, menuSlice = async () => {};
    const loadingScreen = { nextFlyMs: () => 24000 };
    const FlybySeq = { DEFAULT: [], reset() {}, setDuration() { calls.push("duration"); },
      vary() { calls.push("vary"); return []; }, planSteps() { calls.push("plan"); return () => true; } };
    const finish = eval("(" + read("js/game.js").match(/async function menuFinish\(current, key\) \{[\s\S]*?\n\}/)[0] + ")");
    await finish(current, "old");
    assert.deepEqual(calls, [], cancelAt + ": stale work must not touch shared flyby state");
    assert.equal(_menuFly, null);
  }
});

test("the mirror composite's flip reaches every backend: default flipped (the mirror), false straight (the broadcast PiP)", () => {
  // js/render/shared/mirror-pass.js re-aims the ONE mirror target at a second car
  // in a REAL RACE WATCH and composites it unflipped (mirrorRect(rect, false)).
  // Each backend carries the flag to its own composite; a backend that dropped it
  // would show the PiP as glass, or — worse — the mirror as a straight picture.
  const glsl = read("js/render/glx/shaders/glsl-post.js");
  assert.match(glsl, /uniform float uFlip;/);
  assert.match(glsl, /mix\(vUV\.x, 1\.0 - vUV\.x, uFlip\)/, "GLX samples by the flag");
  const post = read("js/render/glx/post.js");
  assert.match(post, /rect\(r, flip\) \{[^}]*mirFlip = flip !== false;/, "GLX defaults to flipped");
  assert.match(post, /gl\.uniform1f\(mirU\.uFlip, mirFlip \? 1 : 0\)/);
  assert.match(read("js/render/glx/glx.js"), /mirrorRect: \(r, flip\) => \{ if \(PST\) PST\.mirror\.rect\(r, flip\); \}/);
  const tsl = read("js/render/three/tsl-post.js");
  assert.match(tsl, /flip: uniform\(1\)/);
  assert.match(tsl, /mix\(p\.x, p\.x\.oneMinus\(\), mirrorU\.flip\)/, "TLX samples by the flag");
  assert.match(read("js/render/three/tlx-post.js"), /_mirFlip = flip !== false;[\s\S]{0,1200}M\.U\.flip\.value = _mirFlip \? 1 : 0/);
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /mirrorRect\(r, flip\) \{[^}]*_mirFlip = flip !== false;/);
  assert.match(tlx, /HalfFloatType, _mirFlip\);/, "TLX hands the flag to the post chain");
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /_mirData\[1\] = _mirFlip \? 1 : 0/, "WGX: the shader already branches on params.y");
  assert.match(wgx, /mirrorRect\(r, flip\) \{[^}]*_mirFlip = flip !== false;/);
});


test("TLX mirror preparation skips software AUTO and off settings, but honours forced mirror or PiP", () => {
  const _warmFx = true, post = { enabled: () => true }, _mirDead = false, lit = {}, vizMat = null;
  let mode = "auto", pip = "auto", softwareGL = false, soft = false;
  const GameStore = { store: { get: key => key === "hudMirror" ? mode : pip } };
  const softGpu = () => soft;
  const want = eval("(function(){" + fnBody(code("js/render/three/tlx.js"), "wantMirrorWarm") + "})");
  assert.equal(want(), true, "hardware AUTO prepares the race-only passes");
  softwareGL = true; assert.equal(want(), false);
  softwareGL = false; soft = true; assert.equal(want(), false);
  mode = "on"; assert.equal(want(), true);
  mode = "off"; pip = "on"; assert.equal(want(), true);
  pip = "off"; soft = false; assert.equal(want(), false);
});

test("TLX mirror composite warm holds its destination and real texture across awaits and restores on failure", async () => {
  let target = "mirrorWorld", active = 0;
  const realTex = {}, previousTex = {}, P = { mirror: { mat: {}, tex: { value: previousTex } } }, viz = null;
  const quad = { material: null, camera: {} }, ctx = { softDest: () => "present" };
  const renderer = {
    getRenderTarget: () => target, setRenderTarget: v => { target = v; },
    compileAsync: async q => {
      assert.equal(++active, 1); await Promise.resolve();
      assert.equal(q, quad); assert.equal(q.material, P.mirror.mat);
      assert.equal(target, "present"); assert.equal(P.mirror.tex.value, realTex);
      active--; throw new Error("rejected mirror pipeline");
    },
  };
  const warm = eval("(async function(tex){" + fnBody(code("js/render/three/tlx-post.js"), "warmMirror") + "})");
  await assert.rejects(warm(realTex), /rejected mirror pipeline/);
  assert.equal(target, "mirrorWorld"); assert.equal(P.mirror.tex.value, previousTex);
});


test("TLX mirror honours software readback backpressure and resumes when the read finishes", () => {
  let _softBlit = true, _softReadPending = true, opened = 0;
  const _mirDead = false, _warmPending = null, _envActive = false, lit = {};
  const body = fnBody(code("js/render/three/tlx.js"), "mirrorBegin");
  const setup = body.indexOf("w = Math.max");
  assert.ok(setup > 0, "the mirror entry guard precedes target setup");
  // Execute the entry guard itself, replacing the allocation/submission tail
  // with a counter: a blocked frame must never reach that work.
  const begin = eval("(function(frame,w,h){" + body.slice(0, setup) + "opened++; return true;})");
  const frame = { proj: [], view: [], viewProj: [] };
  for (let i = 0; i < 120; i++) assert.equal(begin(frame, 320, 100), false);
  assert.equal(opened, 0, "a pending read cannot accumulate second-world submissions");
  _softReadPending = false; assert.equal(begin(frame, 320, 100), true);
  assert.equal(opened, 1, "the mirror resumes when the previous visible frame drains");
  _softBlit = false; _softReadPending = true;
  assert.equal(begin(frame, 320, 100), true, "hardware mirrors retain their normal cadence");
  assert.equal(opened, 2);
});

test("TLX scene MSAA: preset-driven on the desktop WebGL2 backend only, depth resolved", () => {
  // 2026-10-01: the shipped renderer had NO geometric AA — the scene target was
  // single-sample and the canvas MSAA only ever smoothed the FXAA quad. The
  // samples now go to the scene target, on the desktop WebGL2 backend only:
  // phones keep the GLX mobile recipe and the native-WebGPU path cannot
  // resolve a depth attachment (docs/ARCHITECTURE.md §Parity, SCENE MSAA).
  const tlx = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const post = read("js/render/three/tlx-post.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(tlx, /sceneSamples:\s*\(_sceneSamples = sceneSamplesFor\(renderer, forceWebGL, isMobile\)\)/,
    "tlx.js decides the scene sample count through the preset rule (GLX post.js parity)");
  assert.match(post, /samples:\s*ctx\.sceneSamples \|\| 0,\s*resolveDepthBuffer:\s*true/,
    "the scene target takes the caller's samples and resolves its depth texture (SSAO/SSR/godray read it)");
});

// THE COCKPIT'S LIVE MIRROR GLASS on GLX (post.js mirror.glass, glx.js
// drawMirrorGlass): the mirror target sampled INSIDE the main pass, on the
// lens mesh. Driven on the recording mock: the chain is built in mirrorEnd —
// before the main pass samples it, never at composite time — on a spare unit;
// the glass binds the target on that unit and leaves unit 0 (the shadow map)
// active; and it refuses whenever there is nothing safe to show.
test("GLX live mirror glass: mips in mirrorEnd, a spare texture unit, unit 0 restored, and every refusal", () => {
  const h = bootGlx();
  const G = h.GLX, gl = h.gl;
  const id = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const glass = G.createTexMesh({ pos: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], nrm: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
    uv: [0.4, 0.22, 1, 0.22, 1, 0.78, 0.4, 0.78], idx: [0, 1, 2, 0, 2, 3] });
  const rect = [0.4, 0.1, 0.2, 0.06];
  assert.equal(typeof G.drawMirrorGlass, "function");
  // Nothing rendered yet: refused, nothing drawn.
  G.begin(h.frame());
  h.reset();
  assert.equal(G.drawMirrorGlass(glass, id, null), false, "no mirror image yet");
  assert.equal(h.count("drawElements"), 0);

  // The pass. While it is open the target is the bound draw buffer: refused.
  assert.equal(G.mirrorBegin(h.frame(), 64, 16), true);
  const mirFBO = h.calls.filter((c) => c[0] === "bindFramebuffer").at(-1)[1][1];
  assert.ok(mirFBO && mirFBO.fbo, "mirrorBegin binds the mirror FBO");
  h.reset();
  assert.equal(G.drawMirrorGlass(glass, id, null), false, "an open mirror pass would sample its own target");
  assert.equal(h.count("drawElements"), 0);
  G.mirrorEnd();
  const mip = h.calls.findIndex((c) => c[0] === "generateMipmap");
  assert.ok(mip >= 0, "mirrorEnd builds the target's mip chain");
  const before = h.calls.slice(0, mip);
  assert.notEqual(before.filter((c) => c[0] === "bindFramebuffer").at(-1)[1][1], mirFBO,
    "the chain is built with the OUTPUT framebuffer bound, never the target's own");
  assert.equal(before.filter((c) => c[0] === "activeTexture").at(-1)[1][0], gl.TEXTURE5, "on the spare unit");
  const mirTex = before.filter((c) => c[0] === "bindTexture").at(-1)[1][1];
  assert.ok(mirTex && mirTex.texture, "the mirror texture is bound for generateMipmap");
  assert.equal(h.calls.slice(mip).find((c) => c[0] === "activeTexture")[1][0], gl.TEXTURE0, "unit 0 active again");

  // The main pass: drawn, sampling the target on unit 5; unit 0 never rebound.
  G.begin(h.frame());
  h.reset();
  assert.equal(G.drawMirrorGlass(glass, id, null), true);
  let unit = null, mirOn0 = false;
  for (const [name, args] of h.calls) {
    if (name === "activeTexture") unit = args[0];
    if (name === "bindTexture" && args[1] === mirTex && unit === gl.TEXTURE0) mirOn0 = true;
  }
  assert.equal(mirOn0, false, "unit 0 keeps the shadow map");
  const bind = h.calls.findIndex((c) => c[0] === "bindTexture" && c[1][1] === mirTex);
  assert.ok(bind > 0, "the glass binds the mirror target");
  assert.equal(h.calls.slice(0, bind).filter((c) => c[0] === "activeTexture").at(-1)[1][0], gl.TEXTURE5);
  assert.ok(h.calls.some((c) => c[0] === "uniform1i" && c[1][0] && c[1][0].name === "uTex" && c[1][1] === 5), "uTex samples unit 5");
  assert.equal(h.calls.filter((c) => c[0] === "activeTexture").at(-1)[1][0], gl.TEXTURE0, "unit 0 left active");
  const prog = h.calls.filter((c) => c[0] === "useProgram").at(-1)[1][0];
  const fs = prog.shaders.map((sh) => sh.source).join("\n");
  assert.match(fs, /outColor = vec4\(texture\(uTex, vUV\)\.rgb, 1\.0\)/, "MIRROR_GLASS_FS: unlit, alpha 1");
  assert.doesNotMatch(fs, /discard/, "opaque: no alpha test");
  assert.equal(h.count("drawElements"), 1);
  assert.ok(h.calls.some((c) => c[0] === "colorMask" && c[1].every((v) => v === true)), "alpha written (the not-car-paint tag)");
  assert.equal(h.count("enable", (a) => a[0] === gl.BLEND), 0, "no blend");
  const draw = h.calls.findIndex((c) => c[0] === "drawElements");
  assert.ok(h.calls.slice(0, draw).some((c) => c[0] === "disable" && c[1][0] === gl.CULL_FACE), "both faces");
  assert.ok(h.calls.slice(draw).some((c) => c[0] === "enable" && c[1][0] === gl.CULL_FACE), "culling restored");
  assert.equal(G.mirrorState().glass, 1, "mirrorState counts the glass");

  // The composite no longer builds the chain (the glass already sampled it this frame).
  G.mirrorRect(rect);
  h.reset();
  G.present({});
  assert.equal(G.mirrorState().composites, 1, "the composite ran");
  assert.equal(h.count("generateMipmap"), 0, "present() builds no mip chain");

  // flip false = the broadcast PiP owns the target: refused; the mirror back: drawn.
  G.begin(h.frame());
  G.mirrorRect(rect, false);
  assert.equal(G.drawMirrorGlass(glass, id, null), false, "never on the PiP");
  G.mirrorRect(rect);
  assert.equal(G.drawMirrorGlass(glass, id, null), true);
  assert.equal(G.mirrorState().glass, 2);

  // A dead target (an incomplete framebuffer at a new size): refused for good.
  h.answers.checkFramebufferStatus = () => 0;
  assert.equal(G.mirrorBegin(h.frame(), 128, 32), false);
  assert.equal(G.mirrorState().dead, true);
  G.begin(h.frame());
  assert.equal(G.drawMirrorGlass(glass, id, null), false, "a dead target");
  assert.equal(G.mirrorState().glass, 2);
});

// The TLX half of the live glass (three cannot load in Node): drawMirrorGlass's
// own body runs against stubs of what it closes over — one opaque record while
// mirRT holds an image, every refusal GLX makes — and the warm compiles the
// glass material in the SCENE pass's render context, both winding signs.
test("TLX live mirror glass: one record on mirRT, the same refusals, warmed under the scene target", () => {
  const body = fnBody(code("js/render/three/tlx.js"), "drawMirrorGlass");
  const run = (st) => {
    const recs = [];
    const make = new Function("st", "recs", `
      let { _mirActive, _mirDead, mirRT, _mirRenders, _mirFlip, fx } = st, _mirGlass = 0;
      const pushRec = (...a) => recs.push(a), poolModelMat = (m) => m;
      const draw = function (mesh, model, opts) {${body}};
      return { draw, glass: () => _mirGlass };`);
    const t = make(st, recs);
    const ok = t.draw({ geo: "glassGeo" }, "model", null);
    return { ok, recs, glass: t.glass() };
  };
  const tex = { rt: true }, mat = { glassMat: true };
  const live = { _mirActive: false, _mirDead: false, mirRT: { texture: tex }, _mirRenders: 3, _mirFlip: true,
    fx: { mirrorGlassMaterial: (t) => (t === tex ? mat : null) } };
  const r = run(live);
  assert.equal(r.ok, true);
  assert.equal(r.glass, 1);
  assert.deepEqual(r.recs, [["glassGeo", "model", mat, undefined, undefined, 0, null, null]], "one opaque, un-lit record on mirRT's texture");
  for (const [why, over] of [["no image yet", { _mirRenders: 0 }], ["no target", { mirRT: null }], ["dead", { _mirDead: true }],
    ["the PiP", { _mirFlip: false }], ["an open mirror pass", { _mirActive: true }], ["no fx", { fx: null }]]) {
    const x = run(Object.assign({}, live, over));
    assert.equal(x.ok, false, why);
    assert.equal(x.recs.length + x.glass, 0, why + ": nothing recorded");
  }
  const tlx = code("js/render/three/tlx.js");
  assert.match(tlx, /composites: [^,]+, glass: _mirGlass,/, "mirrorState counts the glass");
  const warm = span(tlx, "if (fx && fx.mirrorGlassMaterial) {", "if (post.warmMirror) await post.warmMirror", "TLX mirror glass warm");
  const mrt = spanBack(tlx, "renderer.setMRT(usePost ? _ssrMrtNode() : null);", "if (fx && fx.mirrorGlassMaterial) {", "TLX mirror warm MRT");
  assert.ok(mrt.length < 200, "the scene MRT is set right before the glass compiles");
  assert.match(warm, /renderer\.setRenderTarget\(usePost \? post\.sceneTarget\(\) : softOutRT\(\)\)/,
    "the glass compiles under the scene pass's target, where it draws");
  assert.match(warm, /fx\.mirrorGlassMaterial\(mirRT\.texture\)[\s\S]*for \(const sx of \[1, -1\]\)[\s\S]*compileAsync\(m, camera, scene\)/,
    "both winding signs of the real material");
  assert.match(warm, /"uv", new THREE\.BufferAttribute/, "on createTexMesh's layout (position / normal / uv)");
  const glass = fnBody(code("js/render/three/tsl-fx.js"), "mirrorGlassMaterial");
  assert.match(glass, /m\.transparent = false;/);
  assert.match(glass, /m\.depthWrite = true;/);
  assert.match(glass, /m\.side = THREE\.DoubleSide;/);
  assert.match(glass, /m\.colorNode = texture\(tex\)\.rgb;/, "sampled at the mesh uv: three flips a render target itself on WebGPU");
  assert.match(glass, /m\.opacityNode = float\(1\.0\);/);
  assert.doesNotMatch(glass, /trackFx|fxMaterial\(/, "not an FX material: no blend, no keep-dst ssrTag — the scene MRT's tag 1");
});

// 2026-10-04 (L4-b): the preset rule GLX applies in glx/post.js — 4x only on
// GRAPHICS: ULTRA, 2x below, 0 on phones and native WebGPU, clamped to what
// the HDR format supports. Executed, not pattern-matched.
function tlxSceneSamples({ store = {}, forceWebGL = true, isMobile = false, cMax = 8, dMax = 8, hdr = true } = {}) {
  const body = fnBody(code("js/render/three/tlx.js"), "sceneSamplesFor");
  const localStorage = { getItem: (k) => (k in store ? store[k] : null) };
  const gl = { RENDERBUFFER: 1, RGBA16F: 2, RGBA8: 3, DEPTH_COMPONENT24: 4, SAMPLES: 5,
    getExtension: (n) => (hdr && n === "EXT_color_buffer_float" ? {} : null),
    getInternalformatParameter: (t, fmt) => {
      assert.equal(fmt === 2 || fmt === 3 || fmt === 4, true);
      if (fmt !== 4) assert.equal(fmt, hdr ? 2 : 3, "the colour query follows the HDR format");
      return fmt === 4 ? [dMax] : [cMax];
    } };
  const fn = new Function("localStorage", "renderer", "forceWebGL", "isMobile", body);
  return fn(localStorage, { backend: { gl } }, forceWebGL, isMobile);
}
test("TLX scene MSAA follows the GRAPHICS preset like glx/post.js (ULTRA 4x, else 2x, phones/WebGPU 0)", () => {
  assert.equal(tlxSceneSamples(), 2, "unset preset = desktop HIGH = 2x");
  assert.equal(tlxSceneSamples({ store: { "apex26.gfxPreset": JSON.stringify("high") } }), 2);
  assert.equal(tlxSceneSamples({ store: { "apex26.gfxPreset": JSON.stringify("ultra") } }), 4);
  assert.equal(tlxSceneSamples({ store: { "apex26.gfxPreset": "ultra" } }), 4, "a raw probe string still compares");
  assert.equal(tlxSceneSamples({ store: { "apex26.gfxHigh": "1" } }), 4, "legacy gfxHigh=1 with no preset = ULTRA");
  assert.equal(tlxSceneSamples({ store: { "apex26.gfxPreset": JSON.stringify("ultra") }, cMax: 2 }), 2, "clamped to the format");
  assert.equal(tlxSceneSamples({ store: { "apex26.gfxPreset": JSON.stringify("ultra") }, dMax: 1 }), 0, "1x is no MSAA");
  assert.equal(tlxSceneSamples({ hdr: false }), 2, "an RGBA8 scene queries RGBA8");
  assert.equal(tlxSceneSamples({ isMobile: true, store: { "apex26.gfxPreset": JSON.stringify("ultra") } }), 0, "phones: FXAA alone");
  assert.equal(tlxSceneSamples({ forceWebGL: false }), 0, "native WebGPU cannot resolve a depth attachment");
});

// 2026-10-04 (L4-b): r186 WebGLBackend.dispose() ends with
// WEBGL_lose_context.loseContext(). On the forceWebGL path that is #game's own
// context, and the GLX fallback _fail() boots next gets the same object back
// from getContext("webgl2"). The abort path must dispose three without it.
test("TLX abort path disposes three without losing #game's WebGL2 context", () => {
  const tlx = code("js/render/three/tlx.js");
  const body = fnBody(tlx, "disposeKeepingContext");
  const run = new Function("r", body);
  // three's WebGLBackend shape: dispose() reaches extensions.get("WEBGL_lose_context").
  function webglRenderer() {
    const log = [];
    const ext = { get(name) { log.push("get:" + name); return name === "WEBGL_lose_context" ? { loseContext() { log.push("LOST"); } } : { name }; } };
    const backend = { isWebGPUBackend: false, extensions: ext };
    return { log, backend, dispose() {
      log.push("dispose");
      const e = backend.extensions.get("WEBGL_lose_context");
      if (e) e.loseContext();
      assert.deepEqual(backend.extensions.get("OES_x"), { name: "OES_x" }, "other lookups still reach three");
      return Promise.resolve();
    } };
  }
  const gl = webglRenderer();
  run(gl);
  assert.ok(gl.log.includes("dispose"), "three still frees its own objects");
  assert.ok(!gl.log.includes("LOST"), "the shared context must survive the dispose");
  // No extensions object to neuter: skip the dispose rather than lose the context.
  const bare = { backend: { isWebGPUBackend: false }, dispose() { throw Error("must not dispose"); } };
  run(bare);
  // The WebGPU backend has no loseContext: it disposes as before.
  let gpuDisposed = 0;
  run({ backend: { isWebGPUBackend: true }, dispose() { gpuDisposed++; return Promise.reject(Error("device lost")); } });
  assert.equal(gpuDisposed, 1);
  // Both teardown sites route through it; no raw renderer.dispose() remains there.
  assert.match(tlx, /disposeKeepingContext\(_abortRenderer\)/, "the create() catch uses the context-keeping dispose");
  assert.match(tlx, /disposeKeepingContext\(renderer\);[^\n]*\n\s*throw e;/, "the init() failure path uses it too");
  assert.doesNotMatch(tlx, /_abortRenderer\.dispose\(\)/, "no raw dispose on the abort path");
});

// L4-c (2026-10-04): car decals. The atlas uploads PREMULTIPLIED and blends
// ONE / ONE_MINUS_SRC_ALPHA (a straight upload let generateMipmap average the
// transparent black surround into logo edges), and DECAL_FS reads the sun map
// already on unit 0 plus the lamp bake on 12/13. Driven on the recording mock.
test("GLX decals: premultiplied upload, premultiplied blend restored after, shadow + lamp-pool uniforms", () => {
  const h = bootGlx();
  const gl = h.gl;
  h.reset();
  const tex = h.GLX.createTexture({ width: 2, height: 2 });
  const store = h.calls.filter((c) => c[0] === "pixelStorei" && c[1][0] === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL).map((c) => c[1][1]);
  assert.deepEqual(store, [true, false], "premultiplied for the atlas, then back to false (texSubImage3D from a buffer rejects it)");
  const iUp = h.calls.findIndex((c) => c[0] === "texImage2D");
  const iOn = h.calls.findIndex((c) => c[0] === "pixelStorei" && c[1][0] === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL && c[1][1] === true);
  assert.ok(iOn >= 0 && iOn < iUp, "the flag is set before the upload");
  const mesh = h.GLX.createTexMesh({ pos: [0, 0, 0, 1, 0, 0, 1, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], uv: [0, 0, 1, 0, 1, 1], idx: [0, 1, 2] });
  const model = new Float32Array(16); model[0] = model[5] = model[10] = model[15] = 1;
  const lampBake = { data: new Uint16Array(4 * 4 * 2 * 4), indir: new Uint16Array(4), x0: -50, z0: -40, tilesX: 1, tilesY: 1, T: 4, cell: 2, atlasW: 4, atlasH: 4 };
  h.GLX.begin(h.frame({ lampBake, lampBakeScale: [1, 1, 1] }));
  h.reset();
  h.GLX.drawDecal(mesh, model, tex, {});
  const blends = h.calls.filter((c) => c[0] === "blendFunc").map((c) => c[1]);
  assert.deepEqual(blends[0], [gl.ONE, gl.ONE_MINUS_SRC_ALPHA], "premultiplied blend for the decal");
  assert.deepEqual(blends.at(-1), [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA], "the frame's blend invariant comes back");
  const named = (fn, name) => h.calls.filter((c) => c[0] === fn && c[1][0] && c[1][0].name === name).map((c) => c[1].slice(1));
  assert.deepEqual(named("uniform1i", "uShadowMap"), [[0]], "the sun map stays on unit 0");
  assert.deepEqual(named("uniform1i", "uLampBake"), [[12]]);
  assert.deepEqual(named("uniform1i", "uLampBakeIdx"), [[13]]);
  assert.equal(named("uniform4fv", "uShadowP").length, 1, "shadow strength / texel / bias / range");
  assert.deepEqual(named("uniform1f", "uBakeOn"), [[1]], "a live bake lights the decal's pool");
  assert.deepEqual(named("uniform4f", "uBakeA"), [[-50, -40, 1 * 4 * 2, 1 * 4 * 2]], "origin + size in metres (lit.js uBakeOrigin/uBakeSize)");
  // A second decal in the same frame re-sends none of the frame block.
  h.reset();
  h.GLX.drawDecal(mesh, model, tex, {});
  assert.equal(named("uniform4fv", "uShadowP").length, 0, "frame-constant: once per frame token");
});

test("decal shaders: sun-map PCF + lamp pools in GLSL, TSL and WGSL; TLX premultiplied", () => {
  const glsl = read("js/render/glx/shaders/glsl-fx.js");
  const fs = /const DECAL_FS = `([\s\S]*?)`;/.exec(glsl)[1];
  assert.match(fs, /uniform sampler2DShadow uShadowMap;/);
  assert.match(fs, /float sh = ndl > 0\.0 \? decalShadow\(vWorldPos, N\) : 1\.0;/);
  assert.equal((fs.match(/texture\(uShadowMap,/g) || []).length, 4, "a 4-tap box PCF");
  assert.match(fs, /texelFetch\(uLampBakeIdx, ivec2\(bTile\), 0\)/, "the bake indirection (lit.js parity)");
  assert.match(fs, /vec3 lit = t\.rgb \* \(amb \+ uSunColor \* \(ndl \* sh\) \+ decalPool\(vWorldPos, N\)\) \+ t\.rgb \* uGlow;/);
  const lit = read("js/render/three/tsl-lit.js");
  assert.match(lit, /decalLight: \{ shadow: decalShadow, pool: decalPool \}/, "tsl-lit hands the decal terms to tsl-fx");
  const fx = read("js/render/three/tsl-fx.js");
  assert.match(fx, /const sh = DL && DL\.shadow \? DL\.shadow\(wp, N\) : float\(1\.0\);/);
  assert.match(fx, /const pool = DL && DL\.pool \? DL\.pool\(wp, N\) : vec3\(0\.0\);/);
  assert.match(fx, /m\.blendSrc = THREE\.OneFactor;\s*\/\/ premultiplied atlas/);
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /t\.premultiplyAlpha = true;/, "TLX createTexture uploads premultiplied");
});

// L4-d (2026-10-04): the PCSS blocker map. R16F stepped 2^-11 in [0.5,1) (a
// ~0.28 m receiver-blocker error at a 570 m span) and the 4 taps at +/-1 source
// texel read texels {1,3} of each 4-texel axis — 12 of 16 never seen.
test("PCSS blocker: 32-bit float and the min over the whole 4x4 source footprint (GLX + TLX)", () => {
  const post = read("js/render/glx/shaders/glsl-post.js");
  const blk = /const BLOCKER_FS = `([\s\S]*?)`;/.exec(post)[1];
  assert.match(blk, /ivec2 k = max\(textureSize\(uDepthTex, 0\) \/ 512, ivec2\(1\)\);/);
  assert.match(blk, /for \(int y = 0; y < 4; y\+\+\) \{\s*for \(int x = 0; x < 4; x\+\+\) \{/);
  assert.match(blk, /texelFetch\(uDepthTex, base \+ ivec2\(x, y\), 0\)\.r/);
  const sh = read("js/render/glx/shadow.js");
  assert.match(sh, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.R32F, 512, 512, 0, gl\.RED, gl\.FLOAT, null\);/);
  assert.doesNotMatch(sh, /gl\.R16F, 512, 512/);
  const tsh = read("js/render/three/tlx-shadow.js");
  assert.match(tsh, /format: THREE\.RedFormat, type: THREE\.FloatType,\s*depthBuffer: false/, "TLX blocker target is R32F");
  assert.match(tsh, /opts\.type = THREE\.FloatType;\s*opts\.format = THREE\.RedFormat;/, "and so is the colour copy of the sun depth it reads");
  // The tap loop is JS: execute it to count the taps it emits.
  const loop = /let d = tap\(0, 0\);\s*(for \(let y = 0; y < k; y\+\+\) for \(let x = 0; x < k; x\+\+\) if \(x \|\| y\) d = TSL\.min\(d, tap\(x, y\)\);)/.exec(tsh);
  assert.ok(loop, "the k x k min loop");
  const seen = [];
  const TSL = { min: (a, b) => a + b };
  const tap = (x, y) => { seen.push(x + "," + y); return 1; };
  const k = 2048 / 512;
  let d = tap(0, 0);
  eval(loop[1]);
  assert.equal(new Set(seen).size, 16, "16 distinct source texels at 2048 -> 512");
  assert.equal(d, 16);
});

// M15: headed GLX has no #game-soft and no preserved drawing buffer, so #game.toDataURL()
// after an await returned the cleared buffer: a black PNG reported SAVED. The picker now
// asks GLX for a frame that resolves from inside present() and reports NO LIVE FRAME
// when none comes (paused) rather than saving black.
test("SAVE SCREENSHOT on headed GLX reads only a live frame and never saves a black one (M15)", async () => {
  const fn = span(read("js/perf/renderer-picker.js"), "function saveScreenshot()", "function ensureAdvHost()", "saveScreenshot");
  const run = async (answer) => {
    const button = { textContent: "SAVE SCREENSHOT" };
    const calls = { await: [], dataUrl: 0, saved: 0 };
    const ctx = vm.createContext({
      document: { getElementById: (id) => id === "pm-save-shot" ? button : id === "game" ? { toDataURL: () => { calls.dataUrl++; return "data:image/png;base64,AQID"; } } : null,
        createElement: () => ({ click() { calls.saved++; } }) },
      GLX: { softPresent: () => false, awaitSoftPresent: (ms, mode) => { calls.await.push([ms, mode]); return Promise.resolve(answer); } },
      NativeDownload: { viable: () => false }, readBackend: () => "webgl2", setTimeout() {},
    });
    vm.runInContext(fn + "\nsaveScreenshot();", ctx);
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    return { button, calls };
  };
  const stale = await run("stale");
  assert.deepEqual(stale.calls.await, [[1500, "frame"]], "headed GLX asks for the next presented frame");
  assert.equal(stale.calls.dataUrl, 0, "no frame presented: the cleared #game buffer is not read");
  assert.equal(stale.calls.saved, 0);
  assert.match(stale.button.textContent, /NO LIVE FRAME$/);
  const live = await run("frame");
  assert.equal(live.calls.dataUrl, 1);
  assert.match(live.button.textContent, /SAVED$/);
  // GLX gives the "frame" mode meaning only while it is not soft-presenting.
  const glx = read("js/render/glx/glx.js");
  assert.match(glx, /if \(_frameWaiters\.length\) _frameWaiters\.splice\(0\)\.forEach/, "present() wakes frame waiters");
  assert.match(glx, /if \(!_softPresent\) return arguments\[1\] === "frame" \? _awaitFrame\(/);
});

// M16: SHD.lampIdx is a slot of the FORWARD frame.lights; the mirror re-ranks its own list.
test("the GLX mirror pass runs with the lamp shadow off — the forward slot names another lamp there (M16)", () => {
  const glx = read("js/render/glx/glx.js");
  assert.match(glx, /const _lampOn = SHD\.lampArmed && !PST\.mirror\.active\(\);/);
  assert.match(glx, /uf1\(litU\.uLampShadowOn, _litUf, "lampShadowOn", _lampOn \? 1\.0 : 0\.0\);/);
  assert.match(glx, /LampBake\.shadowCol\(frame, _lampOn \? SHD\.lampIdx \| 0 : -1, _bakeShScr\)/);
  const chunked = read("js/render/glx/chunked.js");
  assert.match(chunked, /SH\.lampArmed && SH\.lampIdx >= 0 && F\.lights && !core\.post\.mirror\.active\(\)/);
});
