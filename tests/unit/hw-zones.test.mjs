// hw-zones — where a circuit's `hwZones` (narrowed road sections) really land.
//
// THE TRAP. `applyHwZones` (js/track/core/def.js) evaluates a zone's s0/s1 as
// CONTROL-POINT INDEX fractions (`i / N` over def.points), not lap-arc
// fractions. OSM control points are nowhere near arc-uniform (one 700-1300 m
// straight can be a single segment), so a zone authored from a corner's ARC
// fraction narrows the road a quarter of a lap away from the corner it names:
// sepang's "T15 final hairpin" kept full width while T12/T13 pinched, 960 m
// off. The classic-circuit batch was authored in arc fractions; twelve zones
// were re-keyed (the arc window each was meant to cover is pinned below).
//
// WHAT THIS PINS.
//   1. every re-keyed zone narrows the nodes inside the arc window it was
//      authored for (not just "somewhere");
//   2. every curated turn inside that window dips the road within 60 m of its
//      apex — the corner the comment names is the corner that narrows;
//   3. the whole roster: a zone must narrow within 150 m of some curated turn
//      apex, or be named in NO_TURN_NEARBY (zones that sit on a straight today,
//      reviewed and left alone). A NEW zone keyed from arc fractions lands on a
//      straight and fails here until it is re-keyed.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

const Tracks = buildContext();
const RAW = Tracks._vmContext.TrackDefs;
const wrap1 = (v) => ((v % 1) + 1) % 1;
const inWindow = (s, a, b) => (b < a ? s >= a || s <= b : s >= a && s <= b);

// Zone -> the nodes it narrows and where they sit in RACING arc fractions.
function zoneSpans(def) {
  const P = def.points, N = P.length;
  const arc = [0];
  for (let i = 1; i <= N; i++) {
    const a = P[i - 1], b = P[i % N];
    arc.push(arc[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const tot = arc[N];
  // def.hwZones is already in racing index space (startFrac/reverse applied).
  return def.hwZones.map((z) => {
    const idx = [];
    for (let i = 0; i < N; i++) if (inWindow(i / N, z.s0, z.s1)) idx.push(i);
    return idx.length ? { a: arc[idx[0]] / tot, b: arc[idx[idx.length - 1]] / tot } : null;
  });
}

// Smallest road half-width within `m` metres of racing fraction `f`.
function minHwNear(tr, f, m) {
  const n = tr.n, reach = Math.ceil(m / (tr.total / n)), k0 = Math.round(f * n);
  let lo = Infinity;
  for (let j = -reach; j <= reach; j++) lo = Math.min(lo, tr.hw[((k0 + j) % n + n) % n]);
  return lo;
}

// [circuit, zone index, arc window the zone was authored for (racing lap fractions)].
const REKEYED = [
  ["hockenheim", 0, 0.435, 0.480],     // Spitzkehre hairpin
  ["nurburgring", 1, 0.610, 0.670],    // Dunlop-Kehre
  ["catalunya", 2, 0.905, 0.955],      // final chicane complex
  ["sepang", 1, 0.560, 0.600],         // T9 hairpin
  ["sepang", 2, 0.865, 0.905],         // T15 final hairpin
  ["istanbul", 1, 0.590, 0.640],       // Turn 9-10
  ["portimao", 2, 0.820, 0.870],
  ["sochi", 1, 0.520, 0.565],
  ["sochi", 2, 0.790, 0.835],
  ["kyalami", 2, 0.105, 0.150],        // Crowthorne (reverse circuit: authored in the source frame)
  ["watkins_glen", 0, 0.070, 0.115],   // Turn 1 / the 90
  ["watkins_glen", 2, 0.880, 0.925],   // the Anvil
];

test("re-keyed hwZones narrow the arc window they were authored for", () => {
  const bad = [];
  for (const [id, zi, a0, a1] of REKEYED) {
    const def = Tracks.LIST.find((t) => t.id === id);
    const span = zoneSpans(def)[zi];
    if (!span) { bad.push(`${id} z${zi}: narrows no node`); continue; }
    const centre = (span.a + span.b) / 2, want = (a0 + a1) / 2;
    if (Math.abs(centre - want) > 0.02 || span.a < a0 - 0.01 || span.b > a1 + 0.01)
      bad.push(`${id} z${zi}: narrows arc ${span.a.toFixed(3)}-${span.b.toFixed(3)}, authored for ${a0}-${a1}`);
  }
  assert.deepEqual(bad, [], "re-key s0/s1 as CONTROL-INDEX fractions (see this file's header)");
});

test("every curated turn inside a re-keyed zone's window dips the road within 60 m of its apex", () => {
  const bad = [];
  let checked = 0;
  for (const [id, zi, a0, a1] of REKEYED) {
    const def = Tracks.LIST.find((t) => t.id === id);
    const base = RAW.find((d) => d.id === id).baseHW;
    const tr = Tracks.buildCenterline(def, { line: false });
    def.turns.forEach((t, i) => {
      if (!inWindow(wrap1(t), a0, a1)) return;
      checked++;
      const lo = minHwNear(tr, t, 60);
      if (!(lo < base - 0.2)) bad.push(`${id} z${zi}: T${i + 1} @${t} stays ${lo.toFixed(2)} m (base ${base})`);
    });
  }
  assert.ok(checked >= 8, `expected the windows to hold curated turns (checked ${checked})`);
  assert.deepEqual(bad, []);
});

// Zones that narrow a stretch with no curated apex within 150 m. Each was
// reviewed when the arc/index frames were sorted out (2026-10) and left alone:
// no frame puts a turn inside them either, so there is no corner to move them
// to. Do not add an entry to make a re-keyed zone pass — re-key it.
const NO_TURN_NEARBY = new Set([
  "istanbul:0", "portimao:1", "jacarepagua:1",
]);

test("every hwZone narrows within 150 m of a curated turn, or is a reviewed exception", () => {
  const far = [], listed = new Set();
  for (const def of Tracks.LIST) {
    if (!def.hwZones || !def.turns) continue;
    const L = Tracks.buildCenterline(def, { line: false }).total;
    zoneSpans(def).forEach((span, zi) => {
      if (!span) return;
      const tol = 150 / L;
      const hit = def.turns.some((t) => inWindow(wrap1(t), wrap1(span.a - tol), wrap1(span.b + tol)));
      const key = `${def.id}:${zi}`;
      if (!hit) { far.push(`${key} arc ${span.a.toFixed(3)}-${span.b.toFixed(3)}`); }
      else if (NO_TURN_NEARBY.has(key)) listed.add(key);
    });
  }
  const unexpected = far.filter((f) => !NO_TURN_NEARBY.has(f.split(" ")[0]));
  assert.deepEqual(unexpected, [],
    "an hwZone narrows a straight — authored as ARC fractions? s0/s1 are control-INDEX fractions");
  // The allow-list must not rot: an entry whose zone now has a turn nearby is stale.
  assert.deepEqual([...listed], [], "stale NO_TURN_NEARBY entries (the zone now sits on a corner)");
});
