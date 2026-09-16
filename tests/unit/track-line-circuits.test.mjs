/* track-line-circuits.test.mjs — the RELAXED racing line on REAL circuits
 * (TrackLine.bake through the headless track build). The synthetic-track
 * geometry is track-line.test.mjs; this is the audit that motivated the
 * relaxation (docs/notes/RACING-LINE-RESEARCH.md): the line must stay on the
 * road, never lurch between nodes, and — in the AI's own corner-speed model,
 * evaluated on the line's OWN curvature — never be slower than driving the
 * centreline. The knot-only bake failed the last one on every circuit.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require2 = createRequire(import.meta.url);
const { buildContext } = require2("../../tools/track/verify-track.cjs");
const Tracks = buildContext();
// Relative use only — the same model on both sides of every comparison, so
// no absolute speed here reaches anything (PHYSICS.md §curvature channels).
const LAT = 22, VMAX = 72, MARGIN = 1.2;

function build(id) {
  const def = Tracks.LIST.find((d) => d.id === id);
  assert.ok(def, `no circuit ${id}`);
  return Tracks.build(def);
}
// The offset curve's curvature, exactly — the expression the bake minimises.
const lineCurv = (t) => Tracks._vmContext.TrackLine.lineCurvature(t);
const cornerTime = (k, n, ds) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += ds / Math.min(VMAX, Math.sqrt(LAT / Math.max(Math.abs(k[i]), 1e-5)));
  return s;
};
// The same under a brake / accel budget — the DRIVING LINE display's own
// forward/backward sweep (js/render/shared/driving-line.js), so a straighter
// corner EXIT counts. cornerTime is grip-limited at every node and cannot see
// one; on the street circuits it reads the relaxed line as a hair slower than
// the centreline while this reads it 7-11 % faster (tools/track/line-audit.mjs).
const BRAKE = 22 * 0.85, ACCEL = 7;
function lapTime(k, n, ds) {
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(VMAX, Math.sqrt(LAT / Math.max(Math.abs(k[i]), 1e-5)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) { const nx = (i + 1) % n; v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * BRAKE * ds)); }
    for (let i = 0; i < n; i++) { const pv = (i - 1 + n) % n; v[i] = Math.min(v[i], Math.sqrt(v[pv] * v[pv] + 2 * ACCEL * ds)); }
  }
  let s = 0;
  for (let i = 0; i < n; i++) s += ds / v[i];
  return s;
}

for (const id of ["monza", "spa", "silverstone"]) {
  test(`${id}: the line stays on the road, never lurches, and is no slower than the centreline`, () => {
    const t = build(id);
    const n = t.n, ds = t.total / n;
    assert.ok(t.line && t.line.length === n && t.lineCorners.length >= 8, `${id} baked ${t.lineCorners.length} corners`);
    let maxStep = 0;
    for (let i = 0; i < n; i++) {
      assert.ok(Math.abs(t.line[i]) <= Math.max(t.hw[i] - MARGIN, 0.5) + 1e-3, `${id}: off the road at node ${i}`);
      const d = Math.abs(t.line[(i + 1) % n] - t.line[i]);
      if (d > maxStep) maxStep = d;
    }
    // 0.5 m/m across a 4 m node: Monza's first chicane measures 0.46 (the road
    // itself turns 90° there); the knot bake's overlap lurches were 0.58–0.68.
    assert.ok(maxStep <= 0.5 * ds + 1e-6, `${id}: a ${maxStep.toFixed(2)} m step between nodes (${(maxStep / ds).toFixed(2)} m/m)`);
    const tLine = cornerTime(lineCurv(t), n, ds), tRoad = cornerTime(t.curv, n, ds);
    assert.ok(tLine <= tRoad, `${id}: the line's own curvature costs ${tLine.toFixed(1)} s of corner time against the centreline's ${tRoad.toFixed(1)} s`);
  });
}

// Under the brake / accel sweep the line must beat the centreline on EVERY
// circuit shape — the street layouts included, where the grip-only model
// reads it as a wash (2026-09-16: +6.9 % zandvoort, +11 % baku / singapore).
// 5 % is well under every measured value and well over what a re-bake moves.
for (const id of ["monza", "spa", "silverstone", "monaco", "baku", "singapore", "zandvoort"]) {
  test(`${id}: under a brake/accel budget the line is at least 5 % faster than the centreline`, () => {
    const t = build(id);
    const n = t.n, ds = t.total / n;
    const lLine = lapTime(lineCurv(t), n, ds), lRoad = lapTime(t.curv, n, ds);
    assert.ok(lLine <= 0.95 * lRoad, `${id}: ${lLine.toFixed(1)} s on the line against ${lRoad.toFixed(1)} s on the centreline (${(100 * (1 - lLine / lRoad)).toFixed(2)} %)`);
  });
}

test("monza: the long corners with a clear approach turn in from the outside and apex on the inside", () => {
  // Mirrors ai-racecraft-vm's live check (which drives an AI car through
  // them) on the baked table itself: approach 45 m before the turn-in on the
  // outside by 2.5 m, apex on the inside by 4 m of the 8 m half-width. The
  // AI blends lane and line, so the line must be further inside than the
  // car is asked to be.
  const t = build("monza");
  const at = (s) => { s = ((s % t.total) + t.total) % t.total; return t.line[Math.floor(s / t.total * t.n) % t.n]; };
  const all = t.lineCorners;
  const big = all.filter((k) => k.len > 40 && !all.some((o) => o !== k && Math.abs(o.sApex - k.sApex) < 120));
  assert.ok(big.length >= 3, `expected several long corners with a clear approach, got ${big.length}`);
  for (const k of big) {
    const ap = at(k.s0 - 45) * k.inside, apex = at(k.sApex) * k.inside;   // + = toward the inside
    assert.ok(ap <= -2.5, `corner at s=${k.s0.toFixed(0)}: approach not outside (${ap.toFixed(2)} m toward the inside)`);
    assert.ok(apex >= 4.0, `corner at s=${k.s0.toFixed(0)}: apex not inside (${apex.toFixed(2)} m)`);
  }
});
