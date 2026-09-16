/* elevation-tracks-vm.test.mjs — tests/specs/elevation-tracks.spec.js replayed
 * in the Node VM (tools/lib/game-vm.cjs): banking geometry (Tracks.banking on a
 * bare centreline), the chase camera riding the bank, and — for every one of
 * the 40 circuits — slope gravity, the climb, road-following on the grade and
 * the two banked bowls, with the SAME assertions, launches and thresholds.
 *
 * Ported: all 47 tests. The four banking-geometry tests read the `Tracks`
 * engine global from the VM sandbox exactly as the browser reads the page
 * global; the camera test reads camState() (the camera rig runs in the VM —
 * measured roll -13.5 deg on Madrid's bowl). The pageerror guards read the
 * VM's console/rejection record.
 * Not portable: none. This is the heaviest twin because it BUILDS 40 circuits
 * plus ~2,200 physics steps per circuit — still an order of magnitude under
 * the browser group's 40 × 24 s.
 *
 * FOUR VMs, ONE FILE (2026-09-16). ~70 % of this file was physics stepping at
 * 3.13 ms a step on ONE core (docs/plans/research-2026-09-16/vm-harness.md), and
 * the 42 per-circuit tests are independent races. They now go through
 * tools/lib/game-vm-pool.cjs: each worker boots its own game-vm and runs one
 * circuit's probe from tests/helpers/elevation-probes.cjs — the same recipe,
 * launches, step counts and thresholds — and returns a plain object. EVERY
 * assertion stayed here, so a failure still names the circuit and the number,
 * and the twin is still ONE file with 47 declared tests (tools/ci/twinned-specs
 * .mjs counts them against the spec). Measured on this 4-core box:
 * 400 s serial -> 191-210 s pooled, 47/47 green every run. (The box was shared
 * with other agents' suites throughout: the 210 s run averaged load 5.1 of four
 * cores, so the pool held about three of them.) The five geometry / camera
 * tests keep the parent's own boot, because they read `Tracks` and camState()
 * directly.
 * `APEX_VM_POOL=0` runs the identical probes serially in the parent, the way
 * this file ran before (400 s); tests/unit/game-vm-pool.test.mjs asserts the
 * two paths return the same numbers for two circuits.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/elevation-tracks-vm.test.mjs   (~3.5 min, 4 VMs)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const { createPool } = require("../../tools/lib/game-vm-pool.cjs");
const { INIT, GRADIENT, BANKED } = require("../helpers/elevation-probes.cjs");

const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const gte = (a, b, m) => assert.ok(a >= b, m || `${a} >= ${b}`);

// Verbatim from the browser spec.
const ELEVATION_TRACKS = [
  "abudhabi", "albert_park", "bahrain", "baku", "cota", "hungaroring", "imola",
  "interlagos", "jeddah", "madrid", "mexico", "miami", "monaco", "montreal",
  "monza", "qatar", "redbull", "shanghai", "silverstone", "singapore", "spa",
  "suzuka", "vegas", "zandvoort",
  "hockenheim", "nurburgring", "catalunya", "sepang", "istanbul",
  "paul_ricard", "portimao", "sochi", "mugello", "magny_cours",
  "estoril", "kyalami", "watkins_glen", "indianapolis", "buenos_aires",
  "jacarepagua",
];
const BANKED_TRACKS = ["zandvoort", "madrid"];
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
    for (const id of ELEVATION_TRACKS) add(`grad:${id}`, id, GRADIENT);
    for (const id of BANKED_TRACKS) add(`bank:${id}`, id, BANKED);
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

for (const id of ELEVATION_TRACKS) {
  test(`${id}: slope gravity behaves + road-following holds on the grade`, async () => {
    const { result: r, errors } = await probed(`grad:${id}`, id, GRADIENT);
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

for (const id of BANKED_TRACKS) {
  test(`${id}: banked corner is drivable and stays on the road`, async () => {
    const { result: r, errors } = await probed(`bank:${id}`, id, BANKED);
    assert.ok(r.relief, `${id}: elevation profile never showed relief`);
    assert.deepEqual(errors, []);
    assert.equal(r.finite, true);
    assert.equal(r.progressed, true);   // the car drove through, didn't beach
    lt(r.widest, r.hw);                 // stayed ON the banked paved road
  });
}
