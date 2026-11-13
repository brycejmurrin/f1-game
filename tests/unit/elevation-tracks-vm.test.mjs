/* elevation-tracks-vm.test.mjs — tests/specs/elevation-tracks.spec.js replayed
 * in the Node VM (tools/lib/game-vm.cjs): banking geometry (Tracks.banking on a
 * bare centreline), the chase camera riding the bank, and — for EVERY circuit
 * in Tracks.LIST (52, TK1-16) — slope gravity, the climb, road-following on the
 * grade, plus the two banked bowls, with the SAME assertions, launches and
 * thresholds the browser spec carried.
 *
 * SUPERSET OF THE SPEC (TK1-16, #3039). The browser spec used to declare the
 * same 47 tests; it now keeps only the chase-camera roll and the two banked
 * bowls (the render()-only cases a VM cannot see), and this file is the sole
 * carrier of the banking-geometry audits and the per-circuit grade sweep.
 * tools/ci/twinned-specs.mjs TWIN_SUBSET checks every spec title is a title
 * here. The four banking-geometry tests read the `Tracks` engine global from
 * the VM sandbox exactly as the browser reads the page global; the camera test
 * reads camState() (the camera rig runs in the VM — measured roll -13.5 deg on
 * Madrid's bowl). The pageerror guards read the VM's console/rejection record.
 * This is the heaviest twin because it BUILDS every circuit plus ~2,200
 * physics steps per circuit.
 *
 * FOUR VMs, ONE FILE (2026-09-16). ~70 % of this file was physics stepping at
 * 3.13 ms a step on ONE core (docs/plans/research-2026-09-16/vm-harness.md), and
 * the per-circuit tests are independent races. They now go through
 * tools/lib/game-vm-pool.cjs: each worker boots its own game-vm and runs one
 * circuit's probe from tests/helpers/elevation-probes.cjs — the same recipe,
 * launches and thresholds, with the grade search confirming 12 profile
 * candidates instead of 300 jump+steps — and returns a plain object. EVERY
 * assertion stayed here, so a failure still names the circuit and the number,
 * and the twin is still ONE file (60 declared tests since TK1-16). Measured on this 4-core box:
 * 400 s serial -> 191-210 s pooled, 47/47 green every run (40 circuits then). (The box was shared
 * with other agents' suites throughout: the 210 s run averaged load 5.1 of four
 * cores, so the pool held about three of them.) The five geometry / camera
 * tests keep the parent's own boot, because they read `Tracks` and camState()
 * directly.
 * `APEX_VM_POOL=0` runs the identical probes serially in the parent, the way
 * this file ran before (400 s); tests/unit/game-vm-pool.test.mjs asserts the
 * two paths return the same numbers for two circuits.
 *
 * Run: node --test tests/unit/elevation-tracks-vm.test.mjs   (~3.5 min, 4 VMs)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const { createPool } = require("../../tools/lib/game-vm-pool.cjs");
const { INIT, GRADIENT, BANKED } = require("../helpers/elevation-probes.cjs");

const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const gte = (a, b, m) => assert.ok(a >= b, m || `${a} >= ${b}`);

// EVERY circuit (TK1-16, #3039). This was a hand-copied list of 40 ids, the
// browser spec's, and the twelve circuits added since (fuji ... mosport) were
// never swept. It is now one id per js/circuits/*.js def — read with a
// readdirSync of that directory, the form select-budget.mjs resolves
// statically (circuitDefCount), so the declared count stays exact — and the
// first test below pins it to Tracks.LIST itself, so a def that is not in the
// roster (or a roster entry with no def) reds here instead of going unswept.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ELEVATION_TRACKS = fs.readdirSync(path.join(ROOT, "js/circuits"))
  .filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
const BANKED_TRACKS = ["zandvoort", "madrid"];
// APEX_CIRCUITS (comma list) narrows the per-circuit launches below — this file
// is the node gate's slowest (one build per circuit). Unset = every
// circuit. ci.yml's node-suites job sets it on a circuit-only pull request
// (tools/ci/node-plan.mjs); set it locally to check one circuit.
// APEX_CIRCUIT_SHARD=i/n (2026-09-30) takes every n-th circuit of the scoped
// list starting at the i-th, so two runners can each build half: ci.yml's
// vm-a1 / vm-a2 slices are 1/2 and 2/2 of the same script. The shards are a
// partition of the launches (tools/lib/circuit-scope.cjs `shard`, pinned in
// tests/unit/circuit-scope.test.mjs); the fixed zandvoort/madrid geometry
// tests run in every shard — seconds.
// (A `.filter` chain on purpose: select-budget.mjs counts the per-circuit
// loops statically and reads `.filter` as length-keeping; a bare call would
// count as one test and fail the twin drift check.)
const { inShard } = require("../../tools/lib/circuit-scope.cjs");
const SCOPE = (process.env.APEX_CIRCUITS || "").split(",").map((s) => s.trim()).filter(Boolean);
const inScope = (id) => !SCOPE.length || SCOPE.includes(id);
const GRADE_RUNS = ELEVATION_TRACKS.filter(inScope).filter(inShard());
const BANK_RUNS = BANKED_TRACKS.filter(inScope).filter(inShard());
const FLAT_LAUNCH = 40;    // m/s, flat-out reference run on the straightest stretch
const CLIMB_LAUNCH = 10;   // m/s, low-speed run at the steepest climb
const LAUNCHES = { FLAT_LAUNCH, CLIMB_LAUNCH };

// The probes never read a car mesh (they read physState/probe/corners/
// trackProfile only), so the workers and the parent skip building one.
const BOOT = { track: "monza", carMeshes: false };
const POOLED = process.env.APEX_VM_POOL !== "0";

let g = null, state = null, pool = null;
const queued = new Map();

before(async () => {
  // Queue every circuit FIRST: the workers boot and build while the parent
  // boots its own game for the five geometry/camera tests.
  if (POOLED) {
    pool = createPool({ boot: BOOT, init: INIT });
    const add = (key, circuit, probe) => {
      const p = pool.run({ circuit, probe, options: LAUNCHES });
      p.catch(() => {});                  // the awaiting test reports it
      queued.set(key, p);
    };
    for (const id of GRADE_RUNS) add(`grad:${id}`, id, GRADIENT);
    for (const id of BANK_RUNS) add(`bank:${id}`, id, BANKED);
  }
  g = await createGame(BOOT);
  state = INIT(g);
});
after(async () => { if (pool) await pool.close(); if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(state.PHYS0); g.apex.headless(false); };

const mark = () => ({ c: g.record.console.length, r: g.record.rejections.length });
const errorsSince = (m) => [
  ...g.record.console.slice(m.c).filter((c) => c[0] === "error").map((c) => c[1]),
  ...g.record.rejections.slice(m.r),
];

/** One circuit's probe: the queued worker result, or — under APEX_VM_POOL=0 —
 *  the same probe function run in the parent's own VM. Both return the pool's
 *  shape, `{ result, errors }`, so the assertions below cannot tell them apart. */
async function probed(key, circuit, probe) {
  if (queued.has(key)) return queued.get(key);
  const m = mark();
  const result = await probe(g, { circuit, ...LAUNCHES }, state);
  return { result, errors: errorsSince(m) };
}

// The spec's startRace(): race(id) and, before anything reads a slope, wait
// for the elevation profile to show relief (the build is synchronous here,
// but the guard is the spec's and it is cheap).
async function startRace(id) {
  fresh();
  await g.race(id, "day", "dry");
  const ok = await g.settle(() => {
    const p = g.apex.trackProfile(120);
    if (!p || !p.length) return false;
    const ys = p.map((q) => q.y);
    return Math.max(...ys) - Math.min(...ys) > 0.5;
  }, 200);
  assert.ok(ok, `${id}: elevation profile never showed relief`);
}

test("the swept roster is Tracks.LIST: every circuit, no stale id", () => {
  // Array.from: a sandbox array has the VM realm's prototype, which a strict
  // deepEqual would report as a mismatch even with identical ids.
  const ids = Array.from(g.sandbox.Tracks.LIST, (entry) => entry.id).sort();
  assert.deepEqual(ELEVATION_TRACKS, ids, "js/circuits/*.js and Tracks.LIST disagree — the sweep would miss a circuit");
});

test("banking pivots around the centreline with smooth edge transitions", () => {
  const Tracks = g.sandbox.Tracks;
  const audits = ["zandvoort", "madrid"].map((id) => {
    const def = Tracks.LIST.find((entry) => entry.id === id);
    const track = Tracks.buildCenterline(def);
    const stepM = 1;
    let maxCentreLift = 0, maxPivotError = 0, maxEdgeGrade = 0;
    for (let s = 0; s < track.total; s += stepM) {
      const centre = Tracks.banking(track, s, 0);
      maxCentreLift = Math.max(maxCentreLift, Math.abs(centre?.dy || 0));
      const leftEdge = Tracks.banking(track, s, -Infinity)?.dy || 0;
      const edge = Tracks.banking(track, s, Infinity)?.dy || 0;
      const nextEdge = Tracks.banking(track, s + stepM, Infinity)?.dy || 0;
      maxPivotError = Math.max(maxPivotError, Math.abs(leftEdge + edge));
      maxEdgeGrade = Math.max(maxEdgeGrade, Math.abs(nextEdge - edge) / stepM);
    }
    return { id, maxCentreLift, maxPivotError, maxEdgeGrade };
  });
  for (const audit of audits) {
    lt(audit.maxCentreLift, 0.01, `${audit.id} centreline lift`);
    lt(audit.maxPivotError, 0.01, `${audit.id} edge symmetry`);
    lt(audit.maxEdgeGrade, 0.08, `${audit.id} bank transition grade`);
  }
});

test("Zandvoort banking peaks at Hugenholtz and Arie Luyendyk", () => {
  const Tracks = g.sandbox.Tracks;
  const def = Tracks.LIST.find((entry) => entry.id === "zandvoort");
  const track = Tracks.buildCenterline(def);
  const rollDeg = (frac) => {
    const bank = Tracks.banking(track, frac * track.total, 0);
    return Math.abs((bank?.roll || 0) * 180 / Math.PI);
  };
  const hugenholtz = rollDeg(def.turns[2]);    // T3, the banked LEFT hairpin
  const luyendyk = rollDeg(def.turns[13]);     // T14, the banked final RIGHT
  const others = def.turns.filter((_, i) => i !== 2 && i !== 13).map(rollDeg);
  gt(hugenholtz, 15, "Hugenholtz banking");
  gt(luyendyk, 15, "Arie Luyendyk banking");
  lt(Math.max(...others), 6, "no other corner is banked like a bowl");
});

test("Madrid converts La Monumental's 24 percent bank to degrees", () => {
  const Tracks = g.sandbox.Tracks;
  const def = Tracks.LIST.find((entry) => entry.id === "madrid");
  const track = Tracks.buildCenterline(def);
  const bank = Tracks.banking(track, 0.75 * track.total, 0);
  const rollDeg = Math.abs((bank?.roll || 0) * 180 / Math.PI);
  gt(rollDeg, 13);
  lt(rollDeg, 14);
});

test("bank roll matches the road surface slope", () => {
  const Tracks = g.sandbox.Tracks;
  const def = Tracks.LIST.find((entry) => entry.id === "madrid");
  const track = Tracks.buildCenterline(def);
  const s = 0.75 * track.total;
  const w = track.hw[Math.round(0.75 * track.n) % track.n];
  const leftY = Tracks.banking(track, s, -w)?.dy || 0;
  const rightY = Tracks.banking(track, s, w)?.dy || 0;
  const roll = Tracks.banking(track, s, 0)?.roll || 0;
  closeTo(roll, Math.atan2(rightY - leftY, 2 * w), 5);
});

test("chase camera follows the road bank instead of showing a sideways wall", async () => {
  await startRace("madrid");
  const Tracks = g.sandbox.Tracks;
  const A = g.apex;
  const def = Tracks.LIST.find((entry) => entry.id === "madrid");
  const track = Tracks.buildCenterline(def);
  const trackRoll = Tracks.banking(track, 0.75 * track.total, 0)?.roll || 0;
  A.jump(0.75, 30, 0);
  A.camera("chase");
  A.snapCam();
  const bankedRoll = A.camState().roll;
  A.orbit(0.75, 45, 18, 45);
  const debugRoll = A.camState().roll;
  A.camera("chase");
  A.jump(0.60, 30, 0);
  A.snapCam();
  const flatRoll = A.camState().roll;
  gt(Math.abs(bankedRoll) * 180 / Math.PI, 13);
  lt(Math.abs(bankedRoll) * 180 / Math.PI, 14);
  closeTo(bankedRoll, -trackRoll, 4);
  assert.equal(debugRoll, 0);
  lt(Math.abs(flatRoll) * 180 / Math.PI, 1);
});

// The per-circuit recipes live in tests/helpers/elevation-probes.cjs — ONE copy
// that a pool worker compiles from source and the serial path calls directly.

for (const id of GRADE_RUNS) {
  test(`${id}: slope gravity behaves + road-following holds on the grade`, async () => {
    const { result: r, errors } = await probed(`grad:${id}`, id, GRADIENT);
    // A def that opts out of relief (`undulate: false`, today only korea: the
    // SRTM bake measured 0.00 m over Yeongam's tidal flat) has no grade to
    // sweep — measured 2026-11-11, the probe reads relief:false there. Assert
    // that it IS flat, so the day it gains a profile this reds and the opt-out
    // goes, rather than the circuit silently skipping the sweep.
    if (g.sandbox.Tracks.LIST.find((entry) => entry.id === id)?.undulate === false) {
      assert.equal(r.relief, false, `${id} declares undulate:false but its profile shows relief — drop the opt-out`);
      assert.deepEqual(errors, []);
      return;
    }
    assert.ok(r.relief, `${id}: elevation profile never showed relief`);
    assert.deepEqual(errors, []);
    assert.equal(r.finite, true);
    lt(r.dn, 0);                                  // the track really does descend
    gt(r.up, 0);                                  // and climb
    gt(r.flatSteps, 30,
      `reference run at frac ${r.flatAt} left the road immediately — no usable reference`);
    gte(r.flatMax, FLAT_LAUNCH, "flat-out reference run was blocked — it lost ground from the launch");
    lt(r.maxV, r.flatMax * 1.35);                 // no descent runaway past flat top speed
    gt(r.climbEnd, CLIMB_LAUNCH * 0.5, "gravity stopped the car dead on the climb");
    lt(r.widest, r.hw + 8);                       // road-following keeps it broadly on the road
  });
}

for (const id of BANK_RUNS) {
  test(`${id}: banked corner is drivable and stays on the road`, async () => {
    const { result: r, errors } = await probed(`bank:${id}`, id, BANKED);
    assert.ok(r.relief, `${id}: elevation profile never showed relief`);
    assert.deepEqual(errors, []);
    assert.equal(r.finite, true);
    assert.equal(r.progressed, true);   // the car drove through, didn't beach
    lt(r.widest, r.hw);                 // stayed ON the banked paved road
  });
}
