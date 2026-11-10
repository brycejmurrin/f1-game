/* curvature-contract-vm.test.mjs — "the arc must not reach the driver"
 * (AGENTS.md §Physics, docs/PHYSICS.md §Curvature channels) as BEHAVIOUR.
 *
 * curvature-channels.test.mjs counts `.curvature(` call sites per file: it is
 * bookkeeping, and it passed with three deliberate violations injected into
 * game.js (audit 2026-11-09). This file drives the real game headless instead.
 *
 * With assists off (ROAD_FOLLOW 0, raceLineAssist 0), the player is put on a
 * straight and at the three tightest corners of three circuits, alone (every
 * AI car retired), and one fixed input is held for 40 steps. Then the SAME
 * trial is re-run from the same snapshot with every runtime curvature and
 * racing-line table replaced by a different one: track.curv (what
 * Tracks.curvature reads), lineRoadK, and the line LUTs (line / lineIn /
 * lineOut / lineW). The road's geometry, grade, banking and surface are
 * untouched, so anything legitimately local stays equal. The world-frame
 * heading change, distance travelled and yaw rate must be bit-identical: a
 * difference means something derived from the arc or the racing line moved
 * the player. Comparing a straight with a corner directly cannot be exact —
 * grade, banking, kerbs and the wind's world direction differ by location and
 * are allowed to — so the counterfactual holds the place and changes only
 * the arc. Sanity: a trial differs from its counterfactual when ROAD_FOLLOW is
 * on (the assist is meant to read the arc), so the swap is seen at all.
 * Run: node --test tests/unit/curvature-contract-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const CIRCUITS = ["monza", "monaco", "suzuka"];
const DT = 1 / 60, STEPS = 40;
const INPUTS = [{ steer: 0.3, throttle: true, brake: false }, { steer: -0.6, throttle: false, brake: true }];
let g = null;
before(async () => { g = await createGame({ storage: { trackId: CIRCUITS[0] } }); });
after(() => { if (g) g.close(); });

const isPlain = (v) => v && typeof v === "object" &&
  (Array.isArray(v) || ArrayBuffer.isView(v) || Object.getPrototypeOf(v) === Object.prototype);
const copy = (v, d = 0) => {
  if (!isPlain(v) || d > 4) return v;
  if (ArrayBuffer.isView(v)) return v.slice();
  if (Array.isArray(v)) return v.map((x) => copy(x, d + 1));
  const o = {}; for (const k of Object.keys(v)) o[k] = copy(v[k], d + 1); return o;
};

async function setup(id) {
  await g.race(id);
  const A = g.apex, G = g.G;
  A.headless(true); A.go();
  G.cars.forEach((c, i) => { if (!c.isPlayer) A.retire(i, "bench"); });
  assert.equal(G.ROAD_FOLLOW, 0, "ROAD_FOLLOW ships at 0");
  assert.equal(G.raceLineAssist, 0, "raceLineAssist ships at 0");
  const p = G.player, tr = G.track;
  const snap = () => { const o = {}; for (const k of Object.keys(p)) o[k] = copy(p[k]); return { o, raceT: G.raceT }; };
  const restore = (s) => {
    for (const k of Object.keys(p)) if (!(k in s.o)) delete p[k];
    for (const k of Object.keys(s.o)) p[k] = copy(s.o[k]);
    G.raceT = s.raceT;
  };
  // Every runtime table derived from the arc or the racing line, swapped in place.
  const TABLES = ["curv", "lineRoadK", "line", "lineIn", "lineOut", "lineW"].filter((k) => ArrayBuffer.isView(tr[k]));
  const swap = () => {
    const saved = TABLES.map((k) => tr[k].slice());
    for (const k of TABLES) {
      const a = tr[k];
      for (let i = 0; i < a.length; i++) a[i] = k === "curv" || k === "lineRoadK" ? -3 * a[i] + 0.02 * Math.sin(i * 0.37) : k === "lineW" ? a[i] * 0.5 + 1 : -a[i] + 1.5 * Math.sin(i * 0.11);
    }
    return () => TABLES.forEach((k, j) => tr[k].set(saved[j]));
  };
  const trial = (input) => {
    const h0 = p.head; let dist = 0, px = p.px, pz = p.pz; const yaw = [];
    for (let i = 0; i < STEPS; i++) {
      A.act(input, DT, 1);
      dist += Math.hypot(p.px - px, p.pz - pz); px = p.px; pz = p.pz; yaw.push(p.yawRateCur);
    }
    return { dHead: p.head - h0, dist, yaw };
  };
  // Straight = the lowest |k| s; corners = the three highest, 80 m apart.
  const ks = [];
  for (let s = 0; s < tr.total; s += 2) ks.push({ s, k: Math.abs(g.sandbox.Tracks.curvature(tr, s)) });
  const byK = ks.slice().sort((a, b) => b.k - a.k), corners = [];
  for (const c of byK) { if (corners.every((o) => Math.min(Math.abs(o.s - c.s), tr.total - Math.abs(o.s - c.s)) > 80)) corners.push(c); if (corners.length === 3) break; }
  const straight = ks.slice().sort((a, b) => a.k - b.k)[0];
  return { A, G, p, tr, snap, restore, swap, trial, TABLES, places: [{ name: "straight", ...straight }, ...corners.map((c, i) => ({ name: "corner" + (i + 1), ...c }))] };
}

function placeAt(r, s, speed) {
  r.A.jump(s / r.tr.total, speed, 0);
  r.A.act({ steer: 0, throttle: true, brake: false }, DT, 2);   // settle the teleport
}

for (const id of CIRCUITS) {
  test(`${id}: with assists off, swapping the arc and the racing line changes nothing the player does`, async () => {
    const r = await setup(id);
    assert.ok(r.TABLES.includes("curv") && r.TABLES.includes("line"), `the track carries no curv/line tables: ${r.TABLES}`);
    for (const pl of r.places) {
      for (const input of INPUTS) {
        for (const speed of [20, 55]) {
          placeAt(r, pl.s, speed);
          const s0 = r.snap();
          const real = r.trial(input);
          r.restore(s0);
          const unswap = r.swap();
          let alt;
          try { alt = r.trial(input); } finally { unswap(); }
          const where = `${id} ${pl.name} s=${pl.s} |k|=${pl.k.toFixed(4)} v=${speed} steer=${input.steer}`;
          assert.equal(alt.dHead, real.dHead, `${where}: heading change moved with the arc`);
          assert.equal(alt.dist, real.dist, `${where}: distance moved with the arc`);
          assert.deepEqual(alt.yaw, real.yaw, `${where}: yaw rate moved with the arc`);
        }
      }
    }
  });
}

test("the swap is visible: with ROAD_FOLLOW on (an assist that reads the arc) the trial does change", async () => {
  const r = await setup(CIRCUITS[0]);
  const corner = r.places[1];
  r.G.ROAD_FOLLOW = 1;
  try {
    placeAt(r, corner.s, 40);
    const s0 = r.snap();
    const real = r.trial(INPUTS[0]);
    r.restore(s0);
    const unswap = r.swap();
    let alt;
    try { alt = r.trial(INPUTS[0]); } finally { unswap(); }
    assert.notEqual(alt.dHead, real.dHead, "ROAD_FOLLOW reads the arc, so the swap must show — the harness is blind otherwise");
  } finally { r.G.ROAD_FOLLOW = 0; }
});
