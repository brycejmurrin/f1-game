#!/usr/bin/env node
/**
 * @doc Audits the baked racing line on real circuits: slope, clamp time, corner-time / lap-time gains, tighter corners.
 * @skill agent-view
 * line-audit.mjs — is the baked racing line any good, on the circuits we ship?
 *
 * `tests/unit/track-line.test.mjs` proves the SHAPE on synthetic corners and
 * `track-line-circuits` pins a handful of real numbers, but neither prints the
 * picture you need when changing the bake. This does, per circuit:
 *
 *   maxSlope    the worst |dx|/ds on the lap. 0.2 m/m is an 11° crossing angle,
 *               0.35 is 19°. The knot bake peaked at 0.66-0.68 where two corner
 *               windows overlapped — a lurch no car makes (2026-09-08).
 *   steep%      share of nodes above 0.2 m/m.
 *   onClamp%    share sitting exactly on the MARGIN clamp. A line pressed
 *               against the edge for a third of the lap is asking for more
 *               lateral travel than the road has.
 *   cornerTime  the AI's own corner-speed model (sqrt(LAT_MAX/|k|), capped at
 *               vTop) integrated over the lap, for the ROAD's curvature against
 *               the LINE's. This is the number that showed the pre-relaxation
 *               line was 5-14 % SLOWER than the centreline while pathK's
 *               synthetic arc hid it.
 *   lapTime     the same, under a brake / accel budget (the display's own
 *               forward/backward sweep). cornerTime is grip-limited at every
 *               node, so a line that straightens a corner's EXIT — where the
 *               car is traction-limited and the throttle opens earlier —
 *               reads as no gain there; this sees it (2026-09-16: the exact
 *               curvature bake is 1.5-4 % better by cornerTime and 7-14 % by
 *               lapTime, and on the street circuits only the latter is
 *               positive).
 *   tighter     corners whose peak |line curvature| exceeds the road's — over
 *               the corner's own CORE (±len/2 about the apex), on a 5-node
 *               mean. Both qualifiers are load-bearing. lineCorners' s0..s1
 *               windows are PADDED and overlap their neighbours, so a peak
 *               taken over the window is often the NEXT corner's turn-in
 *               (Suzuka's 99 m left read 1.36 that way while its own core was
 *               0.73); and an unsmoothed line curvature is a single-node second
 *               difference, which alone put four circuits over 1.02. At the
 *               apex a racing line is never tighter than the road — through the
 *               TRANSITION between two corners it always is, because that is
 *               what outside-in-outside means, and no windowed metric can tell
 *               the two apart on a lap as tight as Monaco's.
 *
 * It is the instrument behind the tables in docs/notes/RACING-LINE-RESEARCH.md;
 * a doc that quotes measurements should ship the thing that produced them.
 *
 * Run: node tools/track/line-audit.mjs [id …]      (default: a spread of five)
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

const LAT_MAX = 22, VMAX = 72, MARGIN = 1.2;   // js/physics/consts.js, js/track/core/line.js

/** The line's own curvature — TrackLine's exact offset-curve expression, the
 *  one the bake minimises, so the audit cannot drift from it. */
function lineCurvature(track) {
  return Tracks._vmContext.TrackLine.lineCurvature(track);
}

/** A 5-node (20 m) mean: one node's second difference is not a corner. */
const smooth = (a, i, n) => {
  let s = 0;
  for (let q = -2; q <= 2; q++) s += a[(i + q + n) % n];
  return s / 5;
};

const cornerTime = (k, n, ds) => {
  let t = 0;
  for (let i = 0; i < n; i++) t += ds / Math.min(VMAX, Math.sqrt(LAT_MAX / Math.max(Math.abs(k[i]), 1e-5)));
  return t;
};

/** Lap time under a brake / accel budget — the forward/backward sweep the
 *  DRIVING LINE display already runs (js/render/shared/driving-line.js: the
 *  cornering cap, a backward pass under BRAKE·0.85, a forward pass under
 *  ACCEL, twice). cornerTime above is grip-limited everywhere and so cannot
 *  see what a line does at a corner's EXIT, where the car is traction-limited
 *  and a straighter path lets the throttle open earlier (Kapania et al. 2016,
 *  the velocity-profile half of the sequential two-step). Same constants on
 *  both sides of every comparison; relative use only. */
const BRAKE = 22 * 0.85, ACCEL = 7;
function lapTime(k, n, ds) {
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(VMAX, Math.sqrt(LAT_MAX / Math.max(Math.abs(k[i]), 1e-5)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) { const nx = (i + 1) % n; v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * BRAKE * ds)); }
    for (let i = 0; i < n; i++) { const pv = (i - 1 + n) % n; v[i] = Math.min(v[i], Math.sqrt(v[pv] * v[pv] + 2 * ACCEL * ds)); }
  }
  let t = 0;
  for (let i = 0; i < n; i++) t += ds / v[i];
  return t;
}

const Tracks = buildContext();
const ids = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const want = ids.length ? ids : ["monza", "spa", "silverstone", "monaco", "suzuka"];

let worst = 0;
console.log("circuit        len   corners  maxSlope        steep>0.2  onClamp  cornerTime road→line      lapTime road→line       tighter");
for (const id of want) {
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) { console.log(`${id}: no such circuit`); continue; }
  const t = Tracks.build(def);
  const n = t.n, ds = t.total / n, x = t.line, hw = t.hw;
  let onClamp = 0, steep = 0, maxSlope = 0, maxAt = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(Math.abs(x[i]) - Math.max(hw[i] - MARGIN, 0.5)) < 0.05) onClamp++;
    const slope = Math.abs(x[(i + 1) % n] - x[i]) / ds;
    if (slope > 0.2) steep++;
    if (slope > maxSlope) { maxSlope = slope; maxAt = i * ds; }
  }
  const kLine = lineCurvature(t);
  const tRoad = cornerTime(t.curv, n, ds), tLine = cornerTime(kLine, n, ds);
  const lRoad = lapTime(t.curv, n, ds), lLine = lapTime(kLine, n, ds);
  // A corner whose LINE is tighter than the ROAD *at its apex* is a bake that
  // made things worse. Measured over the core, not the padded window — see the
  // header for why the window version reads a neighbour's turn-in.
  let tighter = 0, worstRatio = 0, worstAt = 0;
  for (const c of t.lineCorners || []) {
    const half = Math.max(c.len, 20) / 2;
    const i0 = Math.round((((c.sApex - half) % t.total) + t.total) % t.total / ds), span = Math.round(2 * half / ds);
    let pr = 0, pl = 0;
    for (let q = 0; q <= span; q++) { const i = (i0 + q) % n; pr = Math.max(pr, Math.abs(t.curv[i])); pl = Math.max(pl, Math.abs(smooth(kLine, i, n))); }
    const ratio = pl / Math.max(pr, 1e-9);
    if (ratio > 1.02) { tighter++; if (ratio > worstRatio) { worstRatio = ratio; worstAt = Math.round(c.sApex); } }
  }
  worst = Math.max(worst, maxSlope);
  console.log(`${id.padEnd(13)} ${String(Math.round(t.total)).padStart(5)} ${String((t.lineCorners || []).length).padStart(6)}` +
    `   ${maxSlope.toFixed(2)} @ ${String(Math.round(maxAt)).padStart(4)} m` +
    `   ${(100 * steep / n).toFixed(1).padStart(6)}%  ${(100 * onClamp / n).toFixed(0).padStart(5)}%` +
    `   ${tRoad.toFixed(1)} → ${tLine.toFixed(1)} s (${(100 * (1 - tLine / tRoad) >= 0 ? "+" : "")}${(100 * (1 - tLine / tRoad)).toFixed(2)}%)` +
    `   ${lRoad.toFixed(1)} → ${lLine.toFixed(1)} s (${(100 * (1 - lLine / lRoad) >= 0 ? "+" : "")}${(100 * (1 - lLine / lRoad)).toFixed(2)}%)` +
    `   ${String(tighter).padStart(4)}/${(t.lineCorners || []).length}` +
    (tighter ? `  (worst ${worstRatio.toFixed(2)}× @ ${worstAt} m)` : ""));
}
console.log(`\nworst lateral slope across the set: ${worst.toFixed(2)} m/m` +
  (worst > 0.5 ? "  — a lurch that size is usually two corner windows fighting" : ""));
