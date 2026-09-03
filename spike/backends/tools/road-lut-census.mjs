#!/usr/bin/env node
// @doc Census: can WGX's road LUT hand the shader a track frame rotated 90 degrees?
// @skill webgpu-debug
/**
 * road-lut-census.mjs — the headless repro for "WebGPU road markings are drawn
 * in the wrong places".
 *
 * WHY THIS NEEDS NO GPU. GLX reads the per-vertex `trk` attribute (s, lateral x,
 * half-width) and interpolates it. WGX cannot: a location-3 interpolator shards
 * dashes on Dawn, and drawIndexed leaves vertex_index at 0 on that adapter, so
 * authored storage[vid] is unusable. WGX therefore RECONSTRUCTS (s, x, hw) per
 * fragment from world XZ against a baked spatial LUT. The bake is pure JS and
 * the reconstruction is a small exact search, so whether the shader can be
 * handed a broken frame is a property of the BAKED TABLE, not of pixels.
 *
 * THE DEFECT. trkFromWorld builds the track frame from the vector between the
 * nearest sample and the second-nearest:
 *
 *     tangRaw = best2.xy - best.xy
 *     right   = (tang.y, -tang.x)
 *     x       = dot(wp.xz - best.xy, right)      // lateral
 *
 * and the ONLY qualifier on best2 is `sep > 0.25` — at least 0.5 m from best.
 * Nothing requires it to be best's neighbour ALONG THE LAP. The grid is 32x32
 * over a whole circuit and every sample is binned into its four neighbours too,
 * so wherever the track runs back near itself the second-nearest sample is
 * easily one from a different part of the lap: laterally adjacent rather than
 * longitudinally. The "tangent" then points ACROSS the ribbon, `right` rotates
 * with it, and x and s swap roles — the marking shader paints its centre line
 * down the LENGTH of the road.
 *
 * WHAT IS COUNTED. For each sampled ribbon point this replays the shader's
 * search over the real baked cell and reports the points whose chosen pair is
 * not along-track adjacent, plus the worst rotation seen (the angle between the
 * reconstructed tangent and the true centreline direction).
 *
 * It calls WGX's OWN bake through WGX.__roadLutTable — never a copy of it. A
 * census that re-derives what it audits agrees with itself while the shipped
 * code is wrong.
 *
 *   node spike/backends/tools/road-lut-census.mjs                # a folded sample + monza
 *   node spike/backends/tools/road-lut-census.mjs vegas baku     # named circuits
 *   node spike/backends/tools/road-lut-census.mjs --all          # every shipped circuit
 *   node spike/backends/tools/road-lut-census.mjs --json
 *   NO_SWIN=1 node spike/backends/tools/road-lut-census.mjs --all   # A/B the shader's
 *       along-track window. It is belt-and-braces rather than load-bearing:
 *       with the two BAKE fixes in place its measured effect is 3 points on
 *       baku (55 deg, well under the 90-deg frame swap), so the guard does not
 *       bite on it. Recorded rather than assumed, because a lever whose effect
 *       nobody measured is how this repo has shipped dead code before.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Header layout as _roadLutTable packs it: magic, minX, minZ, spare | extX,
// extZ, GW, GH — then GW*GH*SLOT vec4 samples of (px, pz, s, hw).
export const HEADER_F32 = 8;
export const SLOT = 16;

/** WGX's real bake, loaded with no device — __roadLutTable is pure. */
export function loadBake() {
  const P = require(path.join(ROOT, "tools/manifest.cjs")).PATHS;
  const src = readFileSync(path.join(ROOT, P.WGX), "utf8");
  const ctx = vm.createContext({
    Math, Object, Array, Float32Array, Uint32Array, Number, isFinite, Map, Set, JSON, console,
  });
  ctx.globalThis = ctx;
  ctx.navigator = undefined;
  vm.runInContext(`${src}\nthis.__WGX = WGX;`, ctx, { filename: "wgx.js" });
  const WGX = ctx.__WGX;
  if (!WGX || typeof WGX.__roadLutTable !== "function") {
    throw new Error("WGX.__roadLutTable is gone — this census will NOT reimplement the bake");
  }
  return WGX.__roadLutTable;
}

/** Build a circuit headlessly and hand back its road geometry. */
export function roadGeometry(circuitId) {
  const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
  const Tracks = buildContext();
  Tracks.setKeepGeometry(true);
  const def = Tracks.LIST.find((d) => d.id === circuitId);
  if (!def) throw new Error(`unknown circuit "${circuitId}"`);
  const track = Tracks.build(def);
  const geo = track.roadGeo;
  if (!geo || !geo.pos || !geo.trk) throw new Error(`${circuitId}: no road geometry carrying trk`);
  return { pos: geo.pos, trk: geo.trk, mat: geo.mat || null };
}

/**
 * Replay trkFromWorld's cell search. The select() order matters and is mirrored
 * exactly: on a new nearest, best2 inherits the OLD best; otherwise a candidate
 * takes best2 only if it is nearer than the incumbent AND >0.5 m from best.
 */
export function searchCell(lut, wx, wz) {
  const minX = lut[1], minZ = lut[2], extX = lut[4], extZ = lut[5];
  const GW = lut[6] | 0, GH = lut[7] | 0;
  const u = Math.min(0.999, Math.max(0, (wx - minX) / extX));
  const v = Math.min(0.999, Math.max(0, (wz - minZ) / extZ));
  const base = HEADER_F32 + (((u * GW) | 0) + ((v * GH) | 0) * GW) * SLOT * 4;
  // The along-track window, exactly as the shader derives it from h0.w.
  const sWin = process.env.NO_SWIN ? Infinity : (lut[3] > 0.01 ? lut[3] * 4 : Infinity);
  let best = null, bestD = Infinity, best2 = null, bestD2 = Infinity;
  for (let i = 0; i < SLOT; i++) {
    const o = base + i * 4;
    const p = { px: lut[o], pz: lut[o + 1], s: lut[o + 2], hw: lut[o + 3] };
    const d = (wx - p.px) ** 2 + (wz - p.pz) ** 2;
    if (d < bestD) {
      const handDown = best && Math.abs(best.s - p.s) <= sWin && best.hw > 0.5;
      if (handDown) { best2 = best; bestD2 = bestD; }
      best = p; bestD = d;
    } else if (best) {
      const sep = (p.px - best.px) ** 2 + (p.pz - best.pz) ** 2;
      const near = Math.abs(p.s - best.s) <= sWin;
      if (d < bestD2 && sep > 0.25 && near) { best2 = p; bestD2 = d; }
    }
  }
  // Final pair check, as the shader does it: best2 is only qualified against
  // the best current when it was taken, so validate what actually came out.
  if (best && best2 && !(Math.abs(best2.s - best.s) <= sWin && best2.hw > 0.5)) best2 = null;  // final pair check
  return { best, best2 };
}

/**
 * Census one circuit. Walks the ribbon's own centreline samples (the same
 * vertices the bake kept), asks the LUT what frame it would hand the shader
 * there, and compares the reconstructed tangent against the true local
 * direction taken from consecutive centreline points.
 */
export function censusCircuit(id, bake) {
  const geo = roadGeometry(id);
  const lut = bake(geo.pos, geo.trk, geo.mat);
  if (!lut) return { id, skipped: "no road LUT" };

  const pos = geo.pos, trk = geo.trk;
  const n = (pos.length / 3) | 0;
  // ONE POINT PER STATION. The ribbon carries several vertices across its width
  // at each station, and the first version of this walked them in `s` order —
  // so half the "true directions" were the vector to the OTHER SIDE of the same
  // cross-section, i.e. lateral. That produced a flat ~50% rotated on every
  // circuit including monza, which has no folded geometry at all: the number
  // was measuring this loop, not the LUT. Collapse each distinct s to its
  // centre-most vertex first, then neighbours really are along-track.
  const byS = new Map();
  for (let i = 0; i < n; i++) {
    const hw = trk[i * 3 + 2], lat = trk[i * 3 + 1], sv = trk[i * 3];
    if (hw <= 0.5 || Math.abs(lat) > 0.85) continue;
    const key = Math.round(sv * 100);
    const prev = byS.get(key);
    if (!prev || Math.abs(lat) < Math.abs(prev.lat)) {
      byS.set(key, { x: pos[i * 3], z: pos[i * 3 + 2], s: sv, lat });
    }
  }
  const cl = [...byS.values()].sort((a, b) => a.s - b.s);

  let tested = 0, rotated = 0, noPair = 0, worstDeg = 0, worstAt = null;
  let sGapMax = 0;
  // THE PROPERTY THAT ACTUALLY BROKE: does the cell a ribbon point lands in
  // contain the track NEAR IT? Samples are ~4 m apart, so the nearest one
  // should be a couple of metres away. When a full cell kept the wrong section
  // this ran to a median of 47.6 m on baku, the search missed, and a LUT miss
  // on a road draw ZEROES trk — lateral x reads 0 across the whole surface and
  // the centre line is painted down the length of the road. The angle below is
  // the symptom; this is the cause, and it is the better thing to assert.
  let missMax = 0, missAt = null;
  // MATCH THE LUT'S BASELINE. The centreline here is ~1 m apart; the LUT is
  // decimated to lut[3] metres. Measuring "true" direction over 1 m and the
  // reconstructed one over 4 m disagrees at any tight corner purely from
  // resolution, and that disagreement is not a defect — it is this loop
  // comparing two different things. Step out to the LUT's own spacing.
  const baseline = lut[3] > 0.01 ? lut[3] : 4;
  const stepOut = (i, dir) => {
    let j = i;
    while (j + dir >= 0 && j + dir < cl.length &&
           Math.abs(cl[j].s - cl[i].s) < baseline * 0.5) j += dir;
    return cl[j];
  };
  for (let i = 1; i < cl.length - 1; i++) {
    const p = cl[i];
    const a = stepOut(i, 1), b = stepOut(i, -1);
    const tx = a.x - b.x, tz = a.z - b.z;
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-3) continue;
    const { best, best2 } = searchCell(lut, p.x, p.z);
    if (best && best.hw > 0.5) {
      const miss = Math.hypot(p.x - best.px, p.z - best.pz);
      if (miss > missMax) { missMax = miss; missAt = +p.s.toFixed(1); }
    }
    if (!best || !best2 || best2.hw <= 0.5) { noPair++; continue; }
    const rx = best2.px - best.px, rz = best2.pz - best.pz;
    const rl = Math.hypot(rx, rz);
    if (rl < 1e-2) { noPair++; continue; }
    tested++;
    // Angle between the reconstructed tangent and the true one, folded to
    // [0, 90]: the frame is direction-agnostic (sSign flips it), so only the
    // ROTATION matters, and 90 degrees is the x/s swap that paints the stripe
    // down the road.
    const cosA = Math.abs((tx * rx + tz * rz) / (tl * rl));
    const deg = Math.acos(Math.min(1, cosA)) * 180 / Math.PI;
    const sGap = Math.abs(best2.s - best.s);
    if (sGap > sGapMax) sGapMax = sGap;
    if (deg > 45) {
      rotated++;
      if (deg > worstDeg) {
        worstDeg = deg;
        worstAt = { x: +p.x.toFixed(1), z: +p.z.toFixed(1), s: +p.s.toFixed(1), sGap: +sGap.toFixed(1) };
      }
    }
  }
  return {
    id, tested, rotated, noPair,
    rotatedPct: tested ? +(100 * rotated / tested).toFixed(2) : 0,
    worstDeg: +worstDeg.toFixed(1), worstAt, sGapMax: +sGapMax.toFixed(1),
    missMax: +missMax.toFixed(1), missAt,
  };
}

const DEFAULT = ["vegas", "baku", "singapore", "monza"];

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const all = args.includes("--all");
  const named = args.filter((a) => !a.startsWith("--"));
  const bake = loadBake();
  let ids = named.length ? named : DEFAULT;
  if (all) {
    const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
    ids = buildContext().LIST.map((d) => d.id);
  }
  const rows = [];
  for (const id of ids) {
    try { rows.push(censusCircuit(id, bake)); }
    catch (e) { rows.push({ id, error: String(e.message).slice(0, 100) }); }
  }
  if (json) { console.log(JSON.stringify(rows, null, 2)); }
  else {
    console.log("circuit        tested  rotated   %      worst°  maxΔs   maxMiss");
    for (const r of rows) {
      if (r.error) { console.log(`${r.id.padEnd(14)} ERROR ${r.error}`); continue; }
      if (r.skipped) { console.log(`${r.id.padEnd(14)} skipped: ${r.skipped}`); continue; }
      console.log(
        r.id.padEnd(14) +
        String(r.tested).padStart(6) + String(r.rotated).padStart(9) +
        String(r.rotatedPct).padStart(7) + String(r.worstDeg).padStart(9) +
        String(r.sGapMax).padStart(8) + String(r.missMax).padStart(9) + "m" +
        (r.worstAt ? `   worst at s=${r.worstAt.s} (Δs ${r.worstAt.sGap})` : ""));
    }
  }
  const bad = rows.filter((r) => r.rotated > 0);
  if (bad.length) console.log(`\n${bad.length} circuit(s) can hand the shader a rotated frame: ${bad.map((r) => r.id).join(", ")}`);
}
