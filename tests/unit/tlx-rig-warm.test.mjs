/* TLX rig warm (perf hunt 6, B·H6, 2026-10-20). A chase start draws no cockpit rig, and the menu path does not even
 * run the race-entry warm, so the first onboard frame compiled the rig's programs and pipelines synchronously: on the
 * macos-latest census (run 39449331814, monaco, chase>cockpit, menu entry) the switch froze TLX-WebGPU for 1109 ms
 * and TLX-WebGL2 for 1013 ms, then idled the GPU 2012 / 1111 ms; locally it linked 14 programs on SwiftShader.
 * gfx.warmDraws(fn) captures fn's draws and compiles exactly those pairs on the next present, owned like the deferred
 * mirror warm; race entry awaits it under the cover (car-draw.js warmCockpitRig, game.js startRaceBody).
 * No browser, no GPU: three r186's REAL WebGPURenderer({ forceWebGL }) over the no-op WebGL2 context, the REAL lit
 * material and the REAL warmDraws / startRigWarm / compileWarmProbe source. A unit test is not evidence it runs:
 * the follow-up is gpu-census.yml (macos) with cam chase>cockpit — hitch.spikeMs at camSwitch, compileStacks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TLX = read("js/render/three/tlx.js");
const CAR_DRAW = read("js/car/car-draw.js");
const GAME = read("js/game.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.1/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

const tslice = (from, to) => {
  const a = TLX.indexOf(from), b = TLX.indexOf(to, a);
  assert.ok(a > 0 && b > a, `tlx.js block "${from.trim()}" moved — check this test, not the code`);
  return TLX.slice(a, b);
};

// The real capture + warm over a real renderer. Stand-ins: materialFor (one lit material per opts object, as the
// matCache keys it), the GPU settle, and present()'s dispatch line — pinned to the real source below.
async function rig(t, { soft = false } = {}) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 5); camera.updateMatrixWorld();
  const mk = new Function("THREE", "renderer", "scene", "camera", "lit", "Log", "SOFT", `"use strict";
    const post = { enabled: () => true }, fx = null, vizMat = null, _drawMatMode = false, _postF = {};
    const _warmFx = true, _mirDead = false, softGpu = () => SOFT, softwareGL = SOFT;
    let mirrorStages = 0, unswaps = 0;
    async function warmMirrorStage() { mirrorStages++; }
    function _mirWarmUnswap() { unswaps++; }
    let _coOn = true;
    let _warmPending = null, _deviceLost = false, _gpuLastOperation = "";
    const mats = new Map();
    const materialFor = (o) => { let m = mats.get(o); if (!m) mats.set(o, m = lit.makeMaterial({ roughness: o.roughness })); return m; };
    const _gpuSettled = async () => {}, _ssrMrtNode = () => null, softOutRT = () => null;
    const drawList = []; drawList.n = 0;
    ${tslice("      const _warmProbes = new WeakMap();", "      async function warmFxPrograms() {")}
    ${tslice("      // THE DRAWS NO WARM FRAME HELD", "      const ENV_PROBE_TRIES")}
    function draw(mesh, model, opts) {
      if (_capture) { _captureRec(mesh, model, opts); return; }   // as tlx.js, after its coalesce line (off while capturing)
      drawList.n++;
    }
    function present() {
      if (!_warmPending && !_deviceLost) { if (_rigWarm) startRigWarm(); }
      return !_warmPending;
    }
    return { warmDraws, draw, present, pending: () => _warmPending, drawn: () => drawList.n, mats,
      mirror: () => ({ stages: mirrorStages, unswaps }) };`);
  const R = mk(THREE, renderer, scene, camera, lit, globalThis.Log, soft);
  renderer.render(scene, camera);   // three's own first-render programs (the output pass), so a count isolates ours
  const compiles = [];
  const c0 = renderer.compileAsync.bind(renderer);
  renderer.compileAsync = (obj, ...a) => { compiles.push({ geo: obj.geometry, mat: obj.material, sx: obj.scale.x }); return c0(obj, ...a); };
  return { fg, renderer, R, compiles, scene, camera, lit };
}
const geo = (attrs) => {
  const g = new THREE.BufferGeometry();
  for (const [n, k] of attrs) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3).fill(0.5), k));
  return g;
};
// The rig's layout: the cockpit cabin/wheel meshes carry no `trk` attribute, unlike every car body the chase frame drew.
const RIG_LAYOUT = [["position", 3], ["normal", 3], ["color", 3], ["mat", 1]];
const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const MIRRORED = new Float32Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const CAB = { roughness: 0.88, metalness: 0.04, specular: 0.14, doubleSided: true }, FX = { roughness: 0.9, emissive: 1, noAlphaWrite: true };
const WHEELS = { roughness: 0.55, doubleSided: true, coalesce: true };

test("warmDraws captures without painting, then the next present compiles each pair, owned (game.js pauses on warming)", async (t) => {
  const h = await rig(t);
  const cab = { geo: geo(RIG_LAYOUT) }, wheel = { geo: geo(RIG_LAYOUT) }, tyre = { geo: geo(RIG_LAYOUT) };
  let settled = null;
  const p = h.R.warmDraws(() => { h.R.draw(cab, I, CAB); h.R.draw(wheel, MIRRORED, FX); h.R.draw(tyre, I, WHEELS); });
  p.then((v) => { settled = v; });
  assert.equal(h.R.drawn(), 0, "captured draws never reach the frame's draw list");
  assert.equal(h.compiles.length, 0, "nothing compiles until a present owns the renderer");
  assert.equal(h.R.present(), false, "present() starts the rig warm and paints nothing");
  assert.ok(h.R.pending(), "warming() is true while it compiles");
  assert.equal(await p, true);
  assert.equal(settled, true);
  assert.equal(h.R.present(), true, "the next present paints");
  assert.deepEqual(h.compiles.map((c) => [c.geo === cab.geo ? "cab" : c.geo === wheel.geo ? "wheel" : "?", c.sx]), [["cab", 1], ["wheel", -1]],
    "one compile per pair, the mirrored draw on a mirrored probe (three keys the pipeline on the determinant); a coalesced draw is skipped");
  assert.equal(h.renderer.getRenderTarget(), null, "target restored");
});

test("after the warm, drawing the rig links nothing; without it the same draw links its program (the mid-race switch)", async (t) => {
  const draw1 = (h, g, mat) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.updateMatrixWorld(); h.scene.add(mesh);
    const before = h.fg.counts.linkProgram || 0;
    h.renderer.render(h.scene, h.camera);
    h.scene.remove(mesh);
    return (h.fg.counts.linkProgram || 0) - before;
  };
  // Warmed: capture + present + compile, then the real draw of the same pair.
  const w = await rig(t);
  const g1 = geo(RIG_LAYOUT);
  const p = w.R.warmDraws(() => w.R.draw({ geo: g1 }, I, CAB));
  w.R.present(); await p;
  assert.equal(draw1(w, g1, w.R.mats.get(CAB)), 0, "the first rig frame links no program: the warm built it");
  // Cold (today, before the fix): the first draw of the same pair links on the frame that needs it.
  const c = await rig(t);
  assert.ok(draw1(c, geo(RIG_LAYOUT), c.lit.makeMaterial({ roughness: CAB.roughness })) > 0, "control: a cold first draw links its program");
});

test("a second warmDraws over pairs already compiled resolves at once and holds no present", async (t) => {
  const h = await rig(t);
  const g = { geo: geo(RIG_LAYOUT) };
  const p1 = h.R.warmDraws(() => h.R.draw(g, I, CAB)); h.R.present(); await p1;
  const n = h.compiles.length;
  assert.equal(await h.R.warmDraws(() => h.R.draw(g, I, CAB)), true);
  assert.equal(h.R.present(), true, "nothing owed: the present paints");
  assert.equal(h.compiles.length, n, "no recompile");
  assert.equal(await h.R.warmDraws(() => {}), false, "an empty capture reports false");
});

test("menu path: opts.mirror runs the mirror stage over the race scene once per world, never on a software GPU or without a key", async (t) => {
  const h = await rig(t);
  const g = { geo: geo(RIG_LAYOUT) };
  let p = h.R.warmDraws(() => h.R.draw(g, I, CAB), { mirror: "monaco|day" }); h.R.present(); await p;
  assert.deepEqual(h.R.mirror(), { stages: 1, unswaps: 1 }, "the stage ran, and the mirror's instanced swap was undone");
  p = h.R.warmDraws(() => h.R.draw(g, I, CAB), { mirror: "monaco|day" });
  assert.equal(await p, true, "same world, rig compiled: nothing owed");
  assert.equal(h.R.present(), true);
  assert.equal(h.R.mirror().stages, 1, "once per world");
  p = h.R.warmDraws(() => h.R.draw(g, I, CAB), { mirror: "spa|day" }); h.R.present(); await p;
  assert.equal(h.R.mirror().stages, 2, "a new world runs it again, even with the rig already compiled");
  p = h.R.warmDraws(() => h.R.draw({ geo: geo(RIG_LAYOUT) }, I, CAB)); h.R.present(); await p;
  assert.equal(h.R.mirror().stages, 2, "no key (the race-entry warm ran): no mirror stage");
  const s = await rig(t, { soft: true });
  p = s.R.warmDraws(() => s.R.draw({ geo: geo(RIG_LAYOUT) }, I, CAB), { mirror: "monaco|day" }); s.R.present(); await p;
  assert.equal(s.R.mirror().stages, 0, "a software GPU never warms the mirror (as wantMirrorWarm)");
});

test("wiring: present() dispatches the rig warm after the entry and mirror warms; car-draw warms both seats; race entry awaits it", () => {
  assert.ok(TLX.includes("if (_warmRequested) startProgramWarm(opts); else if (_mirWarmReq) startMirrorWarm(opts); else if (_rigWarm) startRigWarm(); }"),
    "present() dispatches the rig warm after the entry and mirror warms");
  assert.ok(TLX.includes("_coAppend(mesh.geo, model, opts)) return;   // R1\n          if (_capture) { _captureRec(mesh, model, opts); return; }"), "draw() captures right after the coalesce line");
  assert.ok(TLX.includes("_capture = recs; _coOn = false;"), "coalescing is off while capturing, so _coAppend never takes a rig draw");
  assert.ok(TLX.includes("\n        warmDraws,   //"), "the backend publishes warmDraws");
  assert.ok(CAR_DRAW.includes("G.gfx.warmDraws(() => { drawCockpitRig(c, _rigWarmBase, 0, paint, false); drawCockpitRig(c, _rigWarmBase, 0, paint, true); },"),
    "cockpit/helmet (wheel) and visor (no wheel)");
  const i = GAME.indexOf('spanAsync("rigWarm"'), j = GAME.indexOf('spanAsync("mirrorPrepare"');
  assert.ok(i > 0 && j > i, "startRaceBody awaits the rig warm under the cover, before the mirror preparation");
  assert.ok(GAME.indexOf('spanAsync("warmCarAssets"') < i, "after the car meshes exist");
  assert.ok(GAME.includes("_warmKey === menuKey(trackIdx) ? _warmKey : null))"), "the mirror key only when the menu warmed this world (the entry warm was skipped)");
});
