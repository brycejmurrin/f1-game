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
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);
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
    const _warmStages = { rig: null };
    async function warmMirrorStage() { mirrorStages++; }
    function _mirWarmUnswap() { unswaps++; }
    let _coOn = true;
    let _warmPending = null, _warmRequested = false, _deviceLost = false, _gpuLastOperation = "";
    const mats = new Map();
    const fxFor = () => false;   // finishes on demand (tlx.js): these rigs draw no 60-85 geometry
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
      if (_rigWarm && !_rigWarm.started) _rigWarm.seen++;   // as tlx.js present(), pinned in the wiring test
      // A requested program warm (game.js startRaceBody asks for it just before the rig): this present runs it, paints nothing.
      if (!_warmPending && !_deviceLost && _warmRequested) { _warmRequested = false; return false; }
      if (!_warmPending && !_deviceLost) { if (_rigWarm) startRigWarm(); }
      return !_warmPending;
    }
    const warmQueued = () => !_deviceLost && !!_rigWarm && !_rigWarm.started;   // as tlx.js, pinned in the wiring test
    return { warmDraws, draw, present, warmQueued, pending: () => _warmPending, drawn: () => drawList.n, mats, requestWarm: () => { _warmRequested = true; },
      mirror: () => ({ stages: mirrorStages, unswaps }), stages: _warmStages };`);
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
  const rs = h.R.stages.rig;
  assert.ok(rs && rs.ok === true && rs.pairs === 2 && rs.mirror === false && rs.ms >= 0, `memState().warm.rig ${JSON.stringify(rs)}`);
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

test("A·W50: a double-sided pair compiles both windings (the race also draws the rig's DoubleSide keep material mirrored)", async (t) => {
  // Lavapipe census after the pipeline pin: the one lit pipeline left at race entry was that material's cw twin, built
  // synchronously on the first race frame; the rig warm had compiled only the winding it captured.
  const h = await rig(t);
  const ds = { geo: geo(RIG_LAYOUT) }, one = { geo: geo(RIG_LAYOUT) }, DS = { roughness: 0.5 }, ONE = { roughness: 0.6 };
  const p = h.R.warmDraws(() => { h.R.draw(ds, I, DS); h.R.draw(one, I, ONE); });
  h.R.mats.get(DS).side = THREE.DoubleSide;
  h.R.present(); assert.equal(await p, true);
  assert.deepEqual(h.compiles.map((c) => [c.geo === ds.geo ? "ds" : "one", c.sx]), [["ds", 1], ["ds", -1], ["one", 1]],
    "the DoubleSide pair on both signs, a one-sided pair on the sign it was drawn with");
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

test("behind a requested program warm, warmDraws resolves at once and the rig still compiles before any frame paints", async (t) => {
  // Race entry requests the program warm, then awaits the rig warm. Awaiting a job that can only start after that
  // warm held race entry for all of it, and past 20 s (a software-GL warm) the fallback dropped the job unwarmed.
  const h = await rig(t);
  const cab = { geo: geo(RIG_LAYOUT) };
  h.R.requestWarm();
  let settled = null;
  h.R.warmDraws(() => h.R.draw(cab, I, CAB)).then((v) => { settled = v; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, true, "race entry is not held behind the program warm");
  assert.equal(h.compiles.length, 0, "queued, not compiled yet");
  assert.equal(h.R.present(), false, "this present runs the program warm and paints nothing");
  assert.equal(h.R.present(), false, "the next present starts the queued rig warm and still paints nothing");
  while (h.R.pending()) await h.R.pending();
  assert.deepEqual(h.compiles.map((c) => c.geo === cab.geo), [true], "the rig's pair compiled");
  assert.equal(h.R.present(), true, "only then does a frame paint");
  assert.equal(await h.R.warmDraws(() => h.R.draw(cab, I, CAB)), true, "and it is recorded as done");
});

test("A·W56: a warmDraws meeting a queued rig job captures NOW and joins it, then both compile (was: refused)", async (t) => {
  // The menu queues the wheel telemetry (car-draw.js warmCockpitTelemetry); race entry's warmCockpitRig can meet it.
  // Its fn must run at the call: run later (after the job), it met a gone track and held the race's car meanwhile.
  const h = await rig(t);
  const tel = { geo: geo(RIG_LAYOUT) }, cab = { geo: geo(RIG_LAYOUT) };
  const p1 = h.R.warmDraws(() => h.R.draw(tel, I, FX));
  let v2 = "pending", ran = 0;
  const p2 = h.R.warmDraws(() => { ran++; h.R.draw(cab, I, CAB); });
  assert.equal(ran, 1, "the second fn ran at the call, not after the first job");
  p2.then((v) => { v2 = v; });
  await new Promise((r) => setImmediate(r));
  assert.equal(v2, "pending", "the second job waits for the first rather than resolving false unwarmed");
  h.R.present(); assert.equal(await p1, true);
  await new Promise((r) => setImmediate(r));
  h.R.present(); assert.equal(await p2, true);
  assert.deepEqual(h.compiles.map((c) => c.geo === tel.geo ? "tel" : c.geo === cab.geo ? "cab" : "?"), ["tel", "cab"], "both jobs' pairs compiled, in order");
});

test("A·W56: a warmDraws meeting a rig job already compiling queues its captured pairs behind it; fn runs once", async (t) => {
  const h = await rig(t);
  const tel = { geo: geo(RIG_LAYOUT) }, cab = { geo: geo(RIG_LAYOUT) };
  const p1 = h.R.warmDraws(() => h.R.draw(tel, I, FX));
  assert.equal(h.R.present(), false, "the first job starts compiling");
  let ran = 0;
  const p2 = h.R.warmDraws(() => { ran++; h.R.draw(cab, I, CAB); });
  assert.equal(await p1, true);
  for (let i = 0; i < 4 && h.compiles.length < 2; i++) { await new Promise((r) => setImmediate(r)); h.R.present(); while (h.R.pending()) await h.R.pending(); }
  assert.equal(await p2, true);
  assert.equal(ran, 1, "fn ran once, at the call; the follow-up job replays its captured pairs");
  assert.deepEqual(h.compiles.map((c) => c.geo === tel.geo ? "tel" : c.geo === cab.geo ? "cab" : "?"), ["tel", "cab"]);
});

test("A·W56: a queued rig job outlives a long held warm while presents come, and is dropped only when none came for 20 s", async (t) => {
  // The menu's world warm runs ~29 s on an iPhone 14 Pro (ledger row 29): the 20 s timer dropped the job behind it.
  const h = await rig(t);
  const tel = { geo: geo(RIG_LAYOUT) };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  h.R.requestWarm();
  assert.equal(await h.R.warmDraws(() => h.R.draw(tel, I, FX)), true, "queued behind the program warm");
  assert.equal(h.R.present(), false, "a present came, held by the warm");
  t.mock.timers.tick(20000);
  t.mock.timers.tick(19999);
  t.mock.timers.reset();
  assert.equal(h.R.present(), false, "the job survived the first 20 s and starts now");
  while (h.R.pending()) await h.R.pending();
  assert.deepEqual(h.compiles.map((c) => c.geo === tel.geo), [true]);
  // Control: queued, and no present ever came (hidden tab): dropped, so a later warmDraws is not blocked forever.
  const c = await rig(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  c.R.requestWarm();
  await c.R.warmDraws(() => c.R.draw({ geo: geo(RIG_LAYOUT) }, I, FX));
  t.mock.timers.tick(20000);
  t.mock.timers.reset();
  const late = { geo: geo(RIG_LAYOUT) };
  const p = c.R.warmDraws(() => c.R.draw(late, I, CAB));
  c.R.present(); c.R.present(); assert.equal(await p, true);
  assert.deepEqual(c.compiles.map((x) => x.geo === late.geo), [true], "the dropped job compiled nothing; the next one ran");
});

test("A·W56: a queued rig job reports warmQueued until a present starts it, so the menu keeps its last warm frame owed", async (t) => {
  // The present that starts a rig job paints nothing. Counted as the menu's last hidden warm frame (game.js
  // "menu warm drawn"), the paused picker never drew the built world (track-switch-memory: no proven submission).
  const h = await rig(t);
  const tel = { geo: geo(RIG_LAYOUT) };
  h.R.requestWarm();
  await h.R.warmDraws(() => h.R.draw(tel, I, FX));
  assert.equal(h.R.warmQueued(), true, "queued behind the program warm");
  assert.equal(h.R.present(), false, "the program warm's present");
  assert.equal(h.R.warmQueued(), true, "still queued: the next present would paint nothing");
  assert.equal(h.R.present(), false, "this present starts the rig job and paints nothing");
  assert.equal(h.R.warmQueued(), false, "started: no longer queued");
  while (h.R.pending()) await h.R.pending();
  assert.equal(h.R.present(), true, "the frame after it paints: that one is the menu's last warm frame");
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
  assert.ok(TLX.includes("          if (_rigWarm && !_rigWarm.started) _rigWarm.seen++;   // a present reached the queue (warmDraws' re-arm)\n          if (!_warmPending && !_deviceLost) { if (_warmRequested)"),
    "present() marks a queued job seen before its dispatch (the harness mirrors that line)");
  // A·W56: the wheel telemetry (car-independent _rigFx) is warmed with the menu's program warm, from the same draws.
  assert.ok(GAME.includes("carDraw.warmCockpitTelemetry();") && GAME.includes("return fresh;"), "game.js warmPrograms queues telemetry on every call (rigDone dedupes), not only the first program warm");
  assert.ok(TLX.includes("        warmQueued() { return !_deviceLost && !!_rigWarm && !_rigWarm.started; },"), "the backend publishes warmQueued (the harness mirrors it)");
  assert.ok(GAME.includes('if (menuBlank && !(gfx.warmQueued && gfx.warmQueued()) && --_menuGate.warm === 0) Log.info("gfx", "menu warm drawn "'),
    "the menu's last hidden warm frame is never the present that starts a queued rig job");
  const tel = CAR_DRAW.slice(CAR_DRAW.indexOf("function warmCockpitTelemetry()"), CAR_DRAW.indexOf("function drawCockpitRig("));
  for (const d of ["getGearDigit(1), _rigWarmBase, _rigFx", "getSpeedDigit(0), _rigWarmBase, _rigFx", "getLedStrip(0, ws), _rigWarmBase, _rigFx"])
    assert.ok(tel.includes(d), `warmCockpitTelemetry draws ${d}`);
  assert.ok(CAR_DRAW.includes("const fx = _rigFx;\n      G.gfx.draw(getGearDigit("), "the race draws the same telemetry with the same material object");
  const i = GAME.indexOf('spanAsync("rigWarm"'), j = GAME.indexOf('spanAsync("mirrorPrepare"');
  assert.ok(i > 0 && j > i, "startRaceBody awaits the rig warm under the cover, before the mirror preparation");
  assert.ok(GAME.indexOf('spanAsync("warmCarAssets"') < i, "after the car meshes exist");
  assert.ok(GAME.includes("_warmKey === menuKey(trackIdx) ? _warmKey : null))"), "the mirror key only when the menu warmed this world (the entry warm was skipped)");
});

test("finishes on demand: the 60-85 tint branch lives in its own lit graph, picked per draw by the geometry's ids", async (t) => {
  // Bryce 2026-10-23 (OrchA 31): the expanded-finish tint block is ~12 % of every lit pipeline's compile, paid on a
  // cold first race whether or not a car wore one of those finishes (the cold first-race warm census, PR #3653).
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const plain = lit.makeMaterial({ carFinish: true, roughness: 0.3 }), plain2 = lit.makeMaterial({ carFinish: true, roughness: 0.5 });
  const fx = lit.makeMaterial({ carFinish: true, roughness: 0.3, finishX: true }), fx2 = lit.makeMaterial({ carFinish: true, finishX: true });
  assert.equal(plain.customProgramCacheKey(), "tlx-lit", "a car with no 60-85 finish keeps the base program");
  assert.equal(fx.customProgramCacheKey(), "tlx-lit-fx", "a 60-85 car draws the fx program");
  assert.equal(plain.colorNode, plain2.colorNode, "every base material binds the one shared graph");
  assert.equal(fx.colorNode, fx2.colorNode, "every fx material binds the one fx graph");
  assert.notEqual(plain.colorNode, fx.colorNode, "the fx graph is its own (the branch is built into it alone)");
  assert.equal(lit.makeMaterial({ chunked: true, finishX: true }).customProgramCacheKey(), "tlx-lit-ch", "the world (chunked) never takes it");
  const lsrc = read("js/render/three/tsl-lit.js");
  assert.ok(lsrc.includes("if (fx) If(matU.carFinish.greaterThan(0.5).and(finishId.greaterThanEqual(60.0)).and(finishId.lessThanEqual(85.0))"),
    "buildFragment builds the 60-85 block only into the fx graph");
  // The geometry flag and the draw-site choice (tlx.js).
  const geoSrc = tslice("      function buildGeometry(data) {", "      /** Read the raw");
  const flag = new Function("data", `const g = { userData: {} };
    ${geoSrc.slice(geoSrc.indexOf("const ids = data.mat;"), geoSrc.indexOf("return _regGeo"))} return !!g.userData.tlxFx;`);
  assert.equal(flag({ mat: [20, 20, 59.6, 21] }), true, "59.6 rounds to 60: a 60-85 id");
  assert.equal(flag({ mat: [20, 44, 85.4] }), true);
  assert.equal(flag({ mat: [20, 44, 85.6, 59.4] }), false, "86 and 59 are outside the range");
  assert.equal(flag({}), false);
  assert.ok(TLX.includes("const fxFor = (geo, opts) => !!(opts && opts.carFinish && geo && geo.userData.tlxFx);"), "only carFinish draws take it");
  assert.ok(TLX.includes("materialFor(opts, false, undefined, fxFor(mesh.geo, opts))"), "draw() picks the variant per draw");
  assert.ok(TLX.includes("mat: materialFor(opts, false, false, fxFor(mesh.geo, opts))"), "the rig warm compiles the variant the draw will use");
  assert.ok(TLX.includes("skipBatches() || fxFor(geo, opts)) return false;"), "an fx geometry never joins a coalesced run (its program has no branch)");
  assert.ok(TLX.includes('const key = fx ? matKeyFor(o, chunked, instanced) + "|fx" : matKeyFor(o, chunked, instanced);'), "its own cache key");
});
