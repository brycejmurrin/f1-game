/* elevation-tracks-vm.test.mjs — tests/specs/elevation-tracks.spec.js replayed
 * in the Node VM (tools/game-vm.cjs): banking geometry (Tracks.banking on a
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
 * (~1 s each here) plus ~1700 physics steps per circuit — ~2 min alone, and
 * still an order of magnitude under the browser group's 40 × 24 s.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/elevation-tracks-vm.test.mjs   (~2 min, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

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

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

const mark = () => ({ c: g.record.console.length, r: g.record.rejections.length });
const errorsSince = (m) => [
  ...g.record.console.slice(m.c).filter((c) => c[0] === "error").map((c) => c[1]),
  ...g.record.rejections.slice(m.r),
];

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

// The per-circuit recipe, verbatim from the browser spec (see it for why the
// reference run is placed on the straightest stretch and stops off-road).
function gradientProbe() {
  const A = g.apex;
  let finite = true;
  const prof = A.trackProfile(300);
  const WIN = 10;                       // ~1/30 of a lap
  let flatAt = 0, bestBend = Infinity;
  for (let i = 0; i < prof.length; i++) {
    let bend = 0;
    for (let j = 0; j < WIN; j++) bend += Math.abs(prof[(i + j) % prof.length].k);
    if (bend < bestBend) { bestBend = bend; flatAt = prof[i].frac; }
  }
  A.jump(flatAt, FLAT_LAUNCH, 0);
  A.setInput({ steer: 0, throttle: true });
  let flatMax = 0, flatSteps = 0;
  for (let i = 0; i < 180; i++) {
    A.step(1 / 60, 1);
    const p = A.physState();
    if (Math.abs(p.x) > A.probe().hw) break;   // off the road — stop counting
    flatMax = Math.max(flatMax, p.speed);
    flatSteps++;
  }
  A.clearInput();

  let dnAt = 0, dn = 0, upAt = 0, up = 0;
  for (let i = 0; i < 300; i++) {
    const f = i / 300;
    A.jump(f, 40, 0); A.step(1 / 60, 1);
    const s = A.physState().slope;
    if (s < dn) { dn = s; dnAt = f; }
    if (s > up) { up = s; upAt = f; }
  }

  A.jump(dnAt, flatMax, 0);
  A.setInput({ steer: 0, throttle: true });
  let maxV = 0;
  for (let i = 0; i < 150; i++) {
    A.step(1 / 60, 1);
    const p = A.physState();
    maxV = Math.max(maxV, p.speed);
    if (!Number.isFinite(p.speed) || !Number.isFinite(p.s) || !Number.isFinite(p.x)) finite = false;
  }

  A.jump(upAt, CLIMB_LAUNCH, 0);
  const cv0 = A.physState().speed;
  for (let i = 0; i < 150; i++) A.step(1 / 60, 1);
  const cv1 = A.physState().speed;

  A.setPhysics({ roadFollow: 0.6 });
  const corners = A.corners();
  let widest = 0, hw = 7;
  for (const f of corners) {
    A.jump((f - 0.02 + 1) % 1, 30, 0);
    A.setInput({ steer: 0, throttle: false });
    hw = A.probe().hw;
    for (let i = 0; i < 70; i++) {
      A.step(1 / 60, 1);
      const p = A.probe();
      if (!Number.isFinite(p.x)) finite = false;
      widest = Math.max(widest, Math.abs(p.x));
    }
  }
  A.clearInput();
  A.setPhysics({ roadFollow: 0 });   // restore the shipped default
  return { dn, up, maxV, flatMax, flatSteps, flatAt: +flatAt.toFixed(3), climbGain: cv1 - cv0, climbEnd: cv1, widest, hw, finite };
}

function bankedProbe() {
  const A = g.apex;
  A.setPhysics({ roadFollow: 0.6 });
  const corners = A.corners();
  const probe = A.probe.bind(A);
  const scored = corners.map((f) => {
    A.jump(f, 30, 0);
    return { f, k: Math.abs(probe().k) };
  }).sort((a, b) => b.k - a.k).slice(0, 2);

  let finite = true, widest = 0, hw = 7, allProgressed = true;
  for (const { f } of scored) {
    A.jump((f - 0.03 + 1) % 1, 25, 0);
    A.setInput({ steer: 0, throttle: false });   // road-following rides the bank
    const s0 = A.physState().prog;
    hw = probe().hw;
    for (let i = 0; i < 100; i++) {
      A.step(1 / 60, 1);
      const p = probe();
      const ps = A.physState();
      if (!Number.isFinite(p.x) || !Number.isFinite(ps.head) || !Number.isFinite(ps.speed)) finite = false;
      widest = Math.max(widest, Math.abs(p.x));
    }
    if (A.physState().prog <= s0 + 20) allProgressed = false;
  }
  A.clearInput();
  A.setPhysics({ roadFollow: 0 });
  return { finite, widest, hw, progressed: allProgressed };
}

for (const id of ELEVATION_TRACKS) {
  test(`${id}: slope gravity behaves + road-following holds on the grade`, async () => {
    const m = mark();
    await startRace(id);
    const r = gradientProbe();
    assert.deepEqual(errorsSince(m), []);
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
    const m = mark();
    await startRace(id);
    const r = bankedProbe();
    assert.deepEqual(errorsSince(m), []);
    assert.equal(r.finite, true);
    assert.equal(r.progressed, true);   // the car drove through, didn't beach
    lt(r.widest, r.hw);                 // stayed ON the banked paved road
  });
}
