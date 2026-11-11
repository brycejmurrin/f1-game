#!/usr/bin/env node
/* Apex 26 — place the OFFICIAL F1 turn numbers on a built circuit.
 * @doc Fits the F1 timing outline (FastF1's MultiViewer source) onto the built centreline; places each official turn number.
 * @skill survey-track
 *
 * WHY: a def's `turns` were picked from curvature peaks, but the player sees
 * them as official turn numbers (map, coach, corner boards). This tool says
 * which racing-lap fraction each OFFICIAL turn number sits at.
 *
 * SOURCE: the F1 live-timing circuit data served by
 *   https://api.multiviewer.app/api/v1/circuits/<circuitKey>/<year>
 * (the data FastF1's `Session.get_circuit_info()` reads): a track outline
 * (`x`, `y`, decimetres, local rotated frame) and `corners[]` with
 * `number`, `letter`, `angle` and `trackPosition`. Only circuits raced since
 * 2018 have it. The corners' `length` field is measured from the outline's
 * first sample, NOT from the timing line, so it is not used.
 *
 * METHOD: resample the outline and the built centreline (Tracks.buildCenterline,
 * racing frame, node 0 = start line) to M points by arc length; try both
 * outline directions, a reflection and every cyclic offset; keep the 2-D
 * similarity (Procrustes) with the lowest RMS. Each corner's trackPosition is
 * mapped through it and snapped to the nearest built node: frac = node / n.
 * A marker sits AT the corner, not always on the apex: on long corners it is
 * 30-140 m from the curvature peak (measured on spa, suzuka, monza and
 * hungaroring, whose FIA-numbered `turns` map 1:1 to the official numbers).
 *
 * Usage:
 *   node tools/track/official-corners.cjs --fetch montreal     # download into scratch/official-corners/
 *   node tools/track/official-corners.cjs montreal [--json]    # table vs def.turns (reads the cache)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const CACHE = path.join(ROOT, "scratch/official-corners");
// game id -> F1 live-timing Circuit.Key (as FastF1 / MultiViewer use it).
const KEY = {
  monaco: 22, montreal: 23, mexico: 65, miami: 151, jeddah: 149,
  spa: 7, suzuka: 46, monza: 39, hungaroring: 4,
};
const YEAR = 2026;

function resample(P, M) {
  const c = [0];
  for (let i = 1; i <= P.length; i++) {
    const a = P[i - 1], b = P[i % P.length];
    c.push(c[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = c[P.length], out = [];
  let j = 0;
  for (let k = 0; k < M; k++) {
    const s = (k * L) / M;
    while (c[j + 1] < s) j++;
    const a = P[j], b = P[(j + 1) % P.length], t = (s - c[j]) / (c[j + 1] - c[j] || 1);
    out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
  }
  return out;
}

// Similarity s·R·A + t that best maps A onto B (point i to point i).
function procrustes(A, B) {
  const n = A.length;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let i = 0; i < n; i++) { ax += A[i][0]; ay += A[i][1]; bx += B[i][0]; by += B[i][1]; }
  ax /= n; ay /= n; bx /= n; by /= n;
  let sxx = 0, sxy = 0, na = 0;
  for (let i = 0; i < n; i++) {
    const x = A[i][0] - ax, y = A[i][1] - ay, u = B[i][0] - bx, v = B[i][1] - by;
    sxx += x * u + y * v; sxy += x * v - y * u; na += x * x + y * y;
  }
  const th = Math.atan2(sxy, sxx), s = Math.hypot(sxx, sxy) / na;
  const c = Math.cos(th) * s, si = Math.sin(th) * s;
  const f = ([x, y]) => [c * (x - ax) - si * (y - ay) + bx, si * (x - ax) + c * (y - ay) + by];
  let r = 0;
  for (let i = 0; i < n; i++) { const p = f(A[i]); r += (p[0] - B[i][0]) ** 2 + (p[1] - B[i][1]) ** 2; }
  return { f, rms: Math.sqrt(r / n), s };
}

function place(Tracks, id, data) {
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`unknown circuit ${id}`);
  const tr = Tracks.buildCenterline(def, { line: false });
  const ours = [];
  for (let i = 0; i < tr.n; i++) ours.push([tr.px[i], tr.pz[i]]);
  const M = 360, B = resample(ours, M);
  let best = null;
  for (const refl of [1, -1]) for (const dir of [1, -1]) {
    let O = data.x.map((x, i) => [(refl * x) / 10, data.y[i] / 10]);
    if (dir < 0) O = O.slice().reverse();
    const A0 = resample(O, M);
    for (let k = 0; k < M; k++) {
      const p = procrustes(A0.slice(k).concat(A0.slice(0, k)), B);
      if (!best || p.rms < best.rms) best = { ...p, refl };
    }
  }
  const corners = data.corners.map((c) => {
    const q = best.f([(best.refl * c.trackPosition.x) / 10, c.trackPosition.y / 10]);
    let bi = 0, bd = Infinity;
    for (let i = 0; i < tr.n; i++) {
      const d = (tr.px[i] - q[0]) ** 2 + (tr.pz[i] - q[1]) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return { turn: `${c.number}${c.letter || ""}`, frac: +(bi / tr.n).toFixed(4), offM: +Math.sqrt(bd).toFixed(1) };
  });
  const lap = tr.total;
  const wrap = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
  for (const c of corners) {
    let near = -1, nd = Infinity;
    (def.turns || []).forEach((t, i) => { const d = wrap(t, c.frac); if (d < nd) { nd = d; near = i; } });
    c.nearestDefTurn = near + 1;
    c.nearestM = Math.round(nd * lap);
  }
  return { id, rmsM: +best.rms.toFixed(1), scale: +best.s.toFixed(4), lapM: Math.round(lap), corners };
}

function cacheFile(id) { return path.join(CACHE, `${id}-${YEAR}.json`); }

if (require.main === module) {
  const argv = process.argv.slice(2);
  const ids = argv.filter((a) => !a.startsWith("--"));
  if (!ids.length) { console.error("usage: official-corners.cjs [--fetch] [--json] <id> ..."); process.exit(1); }
  for (const id of ids) if (!KEY[id]) { console.error(`no live-timing key for ${id} (known: ${Object.keys(KEY).join(" ")})`); process.exit(1); }
  if (argv.includes("--fetch")) {
    fs.mkdirSync(CACHE, { recursive: true });
    for (const id of ids) {
      const url = `https://api.multiviewer.app/api/v1/circuits/${KEY[id]}/${YEAR}`;
      execFileSync("curl", ["-sS", "-m", "30", "-o", cacheFile(id), url]);
      console.log(`fetched ${url} -> ${path.relative(ROOT, cacheFile(id))}`);
    }
    process.exit(0);
  }
  const Tracks = require("./verify-track.cjs").buildContext(null, { quiet: true });
  const out = ids.map((id) => {
    if (!fs.existsSync(cacheFile(id))) { console.error(`no cache for ${id}: run with --fetch first`); process.exit(1); }
    return place(Tracks, id, JSON.parse(fs.readFileSync(cacheFile(id), "utf8")));
  });
  if (argv.includes("--json")) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  for (const r of out) {
    console.log(`${r.id}: fit rms ${r.rmsM} m, scale ${r.scale}, lap ${r.lapM} m`);
    for (const c of r.corners) console.log(`  T${c.turn.padEnd(4)} ${c.frac.toFixed(4)}  nearest def T${c.nearestDefTurn} ${c.nearestM} m`);
  }
}

module.exports = { place, procrustes, resample, KEY };
