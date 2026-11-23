/* cam-context-alloc.test.mjs — the camera tuner reads the stored track/team once per Store revision (CPU-HUNT-2026-10-24 C6).
 *
 * js/camera/offsets.js scopeKey() resolves the track/car override scope on every knob read, and the rig reads a
 * dozen knobs a rendered frame (vantage headOffset, fovBias, buzzAmp, rollTarget, comfortGet ...). Each call ran
 * refreshStoredContext(): two Store.get, each building an "apex26." + key string, ~0.8 KB of strings a frame in the
 * game-vm heap profile. It now re-reads only when store.rev (bumped by every set / clear / import / foreign-tab
 * write) or Teams.LIST moved. Pinned here, on the real offsets.js in a VM with a counting store:
 *   1. 200 knob reads with storage unchanged cost at most one trackId/team read pair (fails before: hundreds);
 *   2. a Store write (team) is seen by the very next read;
 *   3. setContext() is still overridden by stored values on the next read, as before the memo;
 *   4. a Teams.LIST swap with no Store write re-reads (a roster change can re-map the team index);
 *   5. a store mock with no numeric rev keeps the read-every-call behaviour.
 *
 * Run: node --test tests/unit/cam-context-alloc.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8");

function load(disk, { withRev = true } = {}) {
  const reads = { trackId: 0, team: 0 };
  const store = {
    get(k, d) { if (k in reads) reads[k]++; return disk.has(k) ? disk.get(k) : d; },
    set(k, v) { disk.set(k, v); if (withRev) this.rev++; return true; },
  };
  if (withRev) store.rev = 0;
  const ctx = {
    GameStore: { store },
    Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }, { id: "williams" }] },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    Log: { info() {}, debug() {}, enabled() { return false; } },
  };
  vm.runInNewContext(SRC + "\nthis.exported = CamTune;", ctx, { filename: path.join(root, "js/camera/offsets.js") });
  const C = ctx.exported;
  C.importPack({ v: 2, global: { dist: 1 },
    cars: { mclaren: { modes: { chase: { dist: 2 } } }, ferrari: { modes: { chase: { dist: 4 } } }, williams: { modes: { chase: { dist: 6 } } } },
    tracks: { monza: { modes: { chase: { dist: 3 } } } } });
  return { C, ctx, store, reads };
}

test("knob reads with storage unchanged re-read the stored context at most once", () => {
  const disk = new Map([["team", 0]]);
  const { C, reads } = load(disk);
  C.get("chase", "dist");   // first read after the import's writes
  reads.trackId = reads.team = 0;
  for (let i = 0; i < 200; i++) { C.get("chase", "dist"); C.comfortGet("bob"); C.values("chase"); }
  assert.ok(reads.trackId <= 1 && reads.team <= 1, `200 rounds of knob reads read trackId ${reads.trackId}x, team ${reads.team}x`);
  assert.equal(C.get("chase", "dist"), 2, "mclaren's override");
});

test("a Store write is seen by the next read", () => {
  const disk = new Map([["team", 0]]);
  const { C, store } = load(disk);
  assert.equal(C.get("chase", "dist"), 2);
  store.set("team", 1);
  assert.equal(C.get("chase", "dist"), 4, "ferrari after the team write");
  store.set("trackId", "monza");
  assert.equal(C.get("chase", "dist"), 3, "the monza track override after the trackId write");
});

test("setContext is still overridden by stored values on the next read", () => {
  const disk = new Map([["team", 0], ["trackId", "spa"]]);
  const { C } = load(disk);
  assert.equal(C.get("chase", "dist"), 2);
  C.setContext("monza", "ferrari");
  // Stored trackId "spa" and team 0 win over the explicit context, exactly as before the memo.
  assert.equal(C.get("chase", "dist"), 2);
  assert.deepEqual({ ...C.context() }, { track: "spa", car: "mclaren" });
});

test("a Teams.LIST swap with no Store write re-reads the team", () => {
  const disk = new Map([["team", 0]]);
  const { C, ctx } = load(disk);
  assert.equal(C.get("chase", "dist"), 2);
  ctx.Teams.LIST = [{ id: "williams" }];
  assert.equal(C.get("chase", "dist"), 6, "index 0 is williams in the new roster");
});

test("a store without a numeric rev keeps reading every call", () => {
  const disk = new Map([["team", 0]]);
  const { C, reads } = load(disk, { withRev: false });
  C.get("chase", "dist");
  reads.team = 0;
  for (let i = 0; i < 10; i++) C.get("chase", "dist");
  assert.ok(reads.team >= 10, `no rev: ${reads.team} team reads over 10 knob reads`);
  disk.set("team", 1);
  assert.equal(C.get("chase", "dist"), 4);
});

/* mergedProf memo (perf hunt P6, #4546). CamTune.apply runs once a camera frame (vantage.js) and mergedProf built a
 * layers array + an out object + Object.keys(out) on every call, tuned or not. It is now cached per mode against a
 * revision every store writer bumps, plus the resolved track/car keys. Object.keys inside the VM is the probe: on the
 * apply path nothing else calls it, so one count per apply before the memo, at most one per mode after. */
function countKeys(ctx) {
  return vm.runInContext(`(function () {
    const k = Object.keys; let n = 0;
    Object.keys = function (o) { n++; return k(o); };
    return { count: () => n, restore: () => { Object.keys = k; } };
  })()`, ctx);
}
const eyeTgt = () => ({ eye: [0, 2, 0], tgt: [0, 1, 10] });

test("apply() with nothing tuned stops rebuilding the merged profile", () => {
  const { C, ctx } = load(new Map([["team", 0]]));
  C.resetAll();
  const probe = countKeys(ctx);
  try {
    for (let i = 0; i < 300; i++) {
      const p = eyeTgt();
      assert.equal(C.apply("chase", p.eye, p.tgt, 60), 60);
      C.apply("hood", p.eye, p.tgt, 60);
      assert.deepEqual(p.eye, [0, 2, 0], "untuned: the eye is untouched");
    }
    // 600 applies over two modes: at most one build per mode (fails before the memo: 600).
    assert.ok(probe.count() <= 2, `600 untuned applies ran Object.keys ${probe.count()}x`);
  } finally { probe.restore(); }
});

test("apply() with a tuned profile reuses the merge until a write", () => {
  const { C, ctx } = load(new Map([["team", 0], ["trackId", "monza"]]));
  const probe = countKeys(ctx);
  try {
    for (let i = 0; i < 200; i++) {
      const p = eyeTgt();
      C.apply("chase", p.eye, p.tgt, 60);
      // monza's track override (dist 3) wins over mclaren (2) and the global (1): the eye backs off 3 m along -Z.
      assert.deepEqual(p.eye, [0, 2, -3]);
    }
    assert.ok(probe.count() <= 1, `200 tuned applies ran Object.keys ${probe.count()}x`);
  } finally { probe.restore(); }
});

test("every write after a cached read is seen by the next merge", () => {
  const disk = new Map([["team", 0]]);
  const { C, store } = load(disk);
  // values() goes through mergedProf; get() resolves each knob layer by layer with no memo: they must agree,
  // and apply() must move the eye by the merged knobs. Aiming down +Z, right is -X, so the eye lands at
  // (-side, height, -dist) before yaw/pitch (which only turn the target), and the FOV gains the merged fov.
  const agree = (label, mode = "chase") => {
    const v = C.values(mode);
    for (const d of C.CAM_TUNE_DEFS) assert.equal(v[d.id], C.get(mode, d.id), `${label}: ${mode}.${d.id}`);
    const p = { eye: [0, 0, 0], tgt: [0, 0, 10] };
    const fov = C.apply(mode, p.eye, p.tgt, 60);
    const want = [-v.side, v.height, -v.dist];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(p.eye[i] - want[i]) < 1e-9, `${label}: eye ${p.eye} vs ${want}`);
    assert.equal(fov, 60 + v.fov, `${label}: fov`);
    return v;
  };
  assert.equal(agree("import").dist, 2);
  C.set("chase", "dist", 5); assert.equal(agree("set").dist, 2, "the car layer still wins over the mode");
  C.setScoped("car", "chase", "dist", 7); assert.equal(agree("setScoped car").dist, 7);
  C.resetScoped("car", "chase"); assert.equal(agree("resetScoped car").dist, 5);
  C.setGlobal("height", 1.5); assert.equal(agree("setGlobal").height, 1.5);
  C.resetGlobal(); assert.equal(agree("resetGlobal").height, 0);
  C.reset("chase"); assert.equal(agree("reset").dist, 0);
  agree("hood untouched", "hood");
  C.set("hood", "side", 2); C.copyFrom("hood", "chase"); assert.equal(agree("copyFrom").side, 2);
  C.set("far", "pitch", 4); C.applyToAllModes("far"); assert.equal(agree("applyToAllModes").pitch, 4);
  C.applyPreset("close"); assert.equal(agree("applyPreset close").dist, -2.5);
  C.applyPreset("stock"); assert.equal(agree("applyPreset stock").dist, 0);
  C.importPack({ v: 1, modes: { chase: { yaw: 3 } }, cars: { ferrari: { modes: { chase: { dist: 4 } } } } });
  assert.equal(agree("importPack").yaw, 3);
  assert.equal(agree("importPack, still mclaren").dist, 0);
  store.set("team", 1); assert.equal(agree("team write: ferrari").dist, 4);
  C.importCars({}); assert.equal(agree("importCars").dist, 0);
  C.importTracks({ spa: { modes: { chase: { fov: 6 } } } });
  store.set("trackId", "spa"); assert.equal(agree("trackId write: spa").fov, 6);
  C.importModes({ chase: { height: 2 } }); assert.equal(agree("importModes").height, 2);
  C.importGlobal({ side: 1 }); assert.equal(agree("importGlobal").side, 1);
  C.load({ chase: { height: 3 } }); assert.equal(agree("load").height, 3);
  C.loadGlobal({}); assert.equal(agree("loadGlobal").side, 0);
  C.loadCar({ ferrari: { modes: { chase: { dist: 9 } } } }); assert.equal(agree("loadCar").dist, 9);
  C.loadTrack({}); assert.equal(agree("loadTrack").fov, 0);
  // A live context (career / WATCH) moves without any Store write: the resolved keys are part of the memo key.
  C.importCars({ ferrari: { modes: { chase: { dist: 4 } } }, williams: { modes: { chase: { dist: 6 } } } });
  let live = { track: "spa", car: "williams" };
  C.bindContext(() => live);
  assert.equal(agree("bound williams").dist, 6);
  live = { track: "spa", car: "ferrari" };
  assert.equal(agree("bound ferrari, no write").dist, 4);
  C.bindContext(null);
  C.resetAll(); assert.equal(agree("resetAll").height, 0);
});
