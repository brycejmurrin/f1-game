// @doc Offline elevation baker — precomputes per-track elevation profiles into a `CircuitElevations` global.
// @skill new-track
// Bakes js/track/circuit-elevations.js, which SHIPS: the engine reads it via
// hasRealElevation(id) and a circuit listed there ignores its authored bumps.
/* Apex 26 — offline elevation baker.
 *
 * Produces js/track/circuit-elevations.js: a `CircuitElevations` global mapping each
 * circuit id to a 64-sample elevation profile (metres, relative to the
 * start/finish line, indexed by arc-fraction 0..1 around the lap). When that
 * file is loaded before js/track/tracks.js, the engine uses the REAL surveyed
 * elevation for those circuits and ignores their authored `elevations` bumps.
 *
 * Data sources, in this order per circuit:
 *   - layout/lat-lng : bacinger/f1-circuits (ODbL) GeoJSON LineStrings, for the
 *                      24 circuits in MAP below;
 *                      else the OSM ring for any id in tools/track/osm-circuits.json,
 *                      stitched by tools/track/stitch-osm-ring.mjs (also ODbL).
 *                      The OSM path is what the eleven circuits recovered in
 *                      2026-09 use — they have no bacinger feature at all.
 *   - elevation      : Open Topo Data public API (SRTM 30 m), api.opentopodata.org
 *
 * Network note: api.opentopodata.org allows ~1 request/sec, ≤100 locations per
 * request and ≤1000/day — well within one full bake of the roster. It IS
 * reachable from the Claude Code web sandbox through the agent proxy; this
 * header claimed the opposite until 2026-09-14, when Mosport's profile was
 * measured from it, and that claim had discouraged the one measurement that
 * works. If it ever does fail, the failure is per-circuit and named, not silent.
 *
 * WHICH IDS TO PASS. A circuit named here OVERRIDES its authored `elevations`
 * (tracks.js: `elevations: hasRealElevation(d.id) ? null : d.elevations`). So
 * baking a circuit that already has hand-tuned bumps is a geometry change to a
 * shipped circuit, not an addition — bake those deliberately, one at a time,
 * with the scenery re-checked. Baking a circuit with NO authored elevations
 * only ever adds relief where there was a flat plane.
 *
 * Usage:
 *   node tools/gen/bake-elevation.mjs            # bake every circuit in MAP
 *   node tools/gen/bake-elevation.mjs spa cota   # bake a subset
 *   node tools/gen/bake-elevation.mjs fuji       # an OSM circuit (auto-stitches)
 * Then add to index.html, before js/track/tracks.js:
 *   <script src="js/track/circuit-elevations.js?v=NN"></script>
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SAMPLES = 64; // profile resolution around the lap

// Apex 26 circuit id -> bacinger/f1-circuits geojson id (from f1-locations.json).
const MAP = {
  bahrain: "bh-2002", monaco: "mc-1929", silverstone: "gb-1948", spa: "be-1925",
  monza: "it-1922", suzuka: "jp-1962", singapore: "sg-2008", cota: "us-2012",
  interlagos: "br-1940", vegas: "us-2023", madrid: "es-2026", zandvoort: "nl-1948",
  jeddah: "sa-2021", albert_park: "au-1953", shanghai: "cn-2004", miami: "us-2022",
  imola: "it-1953", montreal: "ca-1978", redbull: "at-1969", hungaroring: "hu-1986",
  baku: "az-2016", mexico: "mx-1962", qatar: "qa-2004", abudhabi: "ae-2009",
};

const GEO = (id) => `https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/${id}.geojson`;
const ELEV = "https://api.opentopodata.org/v1/srtm30m";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// equirectangular metres between two [lng,lat] points (good enough for arc length)
function metres(a, b) {
  const lat0 = (a[1] + b[1]) * 0.5 * Math.PI / 180;
  const dx = (b[0] - a[0]) * Math.cos(lat0) * 111320;
  const dz = (b[1] - a[1]) * 110540;
  return Math.hypot(dx, dz);
}

// query elevations for [lng,lat] points, ≤100 per call, ≥1s apart
async function elevations(lnglat) {
  const out = [];
  for (let i = 0; i < lnglat.length; i += 100) {
    const batch = lnglat.slice(i, i + 100);
    const locs = batch.map(([lng, lat]) => `${lat},${lng}`).join("|");
    const j = await fetchJSON(ELEV, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: locs, interpolation: "cubic" }),
    });
    for (const r of j.results) out.push(r.elevation);
    if (i + 100 < lnglat.length) await sleep(1100);
  }
  return out;
}

// SRTM is a SURFACE model on 30 m posts, not a road survey. It carries tree
// canopy, buildings and cut/fill embankments, and the ring vertices sit metres
// off the racing line — so a raw sample series reproduces a circuit's MACRO
// shape well (Fuji's 38 m, Donington's 35 m, the half-lap fall-and-climb at
// Mosport all check out against published figures) and its LOCAL GRADIENT
// badly. Shipped raw on 2026-09-14 it put 18.5% at Dijon and ~12% at four
// others: Eau Rouge steepness on circuits that have nothing like it, and
// visibly wrong in the game.
//
// A ROAD IS GRADED AND TERRAIN IS NOT, so the fix is to reject the sampling
// noise rather than to scale the relief down — scaling would flatten the one
// thing the data gets right. Two passes, in this order:
//
//   1. circular binomial smoothing [1,2,1]/4 — removes single-post spikes
//      (one sample that landed on a treetop) while leaving anything spanning
//      several hundred metres untouched;
//   2. a hard gradient clamp, iterated, because smoothing alone still leaves a
//      sustained slope that is really an embankment the road cuts through.
//
// MAX_GRADE is 8%: steeper than any straight in the game's shipped fleet and
// comfortably under the 17-18% of Spa's Raidillon, which is the sport's
// extreme and is NOT what these circuits are. Both passes keep the loop closed
// (sample 0 and sample SAMPLES-1 must still meet) — realPoints() de-trends any
// residual, but a profile that needs de-trending has already lied about a
// gradient somewhere.
const MAX_GRADE = 0.08;

function smoothClosed(p, passes) {
  const n = p.length;
  let a = p.slice();
  for (let k = 0; k < passes; k++) {
    const b = new Array(n);
    for (let i = 0; i < n; i++) {
      b[i] = 0.25 * a[(i - 1 + n) % n] + 0.5 * a[i] + 0.25 * a[(i + 1) % n];
    }
    a = b;
  }
  return a;
}

// Walk the loop repeatedly, pulling any step steeper than MAX_GRADE back to it
// by moving BOTH ends half way. Converges because every pass strictly reduces
// the largest step; the cap on iterations is a guard, not a target.
function clampGrade(p, spacing) {
  const n = p.length, lim = MAX_GRADE * spacing;
  let a = p.slice(), worst = 0;
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const d = a[j] - a[i];
      if (Math.abs(d) <= lim) continue;
      worst = Math.max(worst, Math.abs(d) / spacing);
      const fix = (Math.abs(d) - lim) * Math.sign(d) * 0.5;
      a[i] += fix; a[j] -= fix;
      moved = true;
    }
    if (!moved) break;
  }
  return { prof: a, worstRaw: worst };
}

// resample per-vertex elevations to SAMPLES points evenly spaced by arc length,
// normalized so the start sits at 0
function toProfile(coords, ele) {
  const N = coords.length;
  const cum = [0];
  for (let i = 1; i < N; i++) cum.push(cum[i - 1] + metres(coords[i - 1], coords[i]));
  const total = cum[N - 1] + metres(coords[N - 1], coords[0]); // close the loop
  const e0 = ele[0];
  const prof = [];
  for (let s = 0; s < SAMPLES; s++) {
    const target = (s / SAMPLES) * total;
    let i = 0;
    while (i < N - 1 && cum[i + 1] < target) i++;
    const segLen = (cum[i + 1] ?? total) - cum[i] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[i]) / segLen));
    const eA = ele[i], eB = ele[(i + 1) % N];
    prof.push(eA + (eB - eA) * t - e0);
  }
  const spacing = total / SAMPLES;
  const { prof: capped, worstRaw } = clampGrade(smoothClosed(prof, 2), spacing);
  const base = capped[0];
  return {
    prof: capped.map((v) => +(v - base).toFixed(2)),
    spacing,
    worstRaw,
  };
}

// The eleven circuits recovered from OpenStreetMap in 2026-09 have no bacinger
// feature, so their lat/lng comes from the stitched ring instead. Reading the
// stitcher's own output (rather than re-deriving a lap here) keeps ONE
// definition of "which cycle is the lap" — the target lengths in
// osm-circuits.json — so the elevation is sampled along exactly the centreline
// the circuit def was built from, not a second opinion about it.
const RINGS = join(ROOT, "artifacts/osm-rings.geojson");
const osmTable = JSON.parse(readFileSync(join(ROOT, "tools/track/osm-circuits.json"), "utf8")).circuits;

function ringFor(id) {
  if (!existsSync(RINGS)) return null;
  const fc = JSON.parse(readFileSync(RINGS, "utf8"));
  const f = (fc.features || []).find((x) => x.properties && x.properties.id === id);
  return f ? f.geometry.coordinates.map((c) => [c[0], c[1]]) : null;
}

// artifacts/ is regenerable and uncommitted, so a fresh clone has no rings.
// Stitch on demand rather than failing with "run this other command first".
function osmCoords(id) {
  let ring = ringFor(id);
  if (ring) return ring;
  process.stdout.write("stitching … ");
  execFileSync(process.execPath, [join(ROOT, "tools/track/stitch-osm-ring.mjs"), id],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  ring = ringFor(id);
  if (!ring) throw new Error(`stitch produced no ring for "${id}"`);
  return ring;
}

async function bake(ids) {
  const result = {};
  for (const id of ids) {
    const gid = MAP[id];
    const osm = !gid && osmTable[id];
    if (!gid && !osm) { console.warn(`! no mapping for ${id}, skipping`); continue; }
    process.stdout.write(`${id} (${gid || "OSM"}) … `);
    try {
      let coords;
      if (osm) {
        coords = osmCoords(id);
      } else {
        const geo = await fetchJSON(GEO(gid));
        const line = geo.features.find((f) => f.geometry.type === "LineString");
        coords = line.geometry.coordinates.map((c) => [c[0], c[1]]);
      }
      const ele = await elevations(coords);
      const { prof, spacing, worstRaw } = toProfile(coords, ele);
      const lo = Math.min(...prof), hi = Math.max(...prof);
      let grade = 0;
      for (let i = 0; i < prof.length; i++) {
        grade = Math.max(grade, Math.abs(prof[(i + 1) % prof.length] - prof[i]) / spacing);
      }
      // A DEAD-FLAT profile is not a measurement, it is missing data, and it is
      // worse than no entry at all: listing the circuit makes hasRealElevation
      // true, which nulls out its authored `elevations` for ever after. Korea
      // is the case that found this — SRTM flew in Feb 2000 and the Yeongam
      // circuit stands on land reclaimed a decade later, so every one of its
      // 103 samples reads exactly 0.0 m. Real terrain is never that tidy:
      // Anderstorp is the flattest circuit that genuinely measures, and it
      // still moves 4.8 m over 44 distinct values.
      if (hi - lo < 0.5) {
        console.log(`SKIPPED: range ${(hi - lo).toFixed(2)} m over ${coords.length} pts ` +
          `— SRTM has no surface here (reclaimed or re-graded land), not a flat circuit`);
        continue;
      }
      result[id] = prof;
      // worstRaw is 0 when the clamp never fired, which reads as "0% gradient"
      // if printed unconditionally — say what actually happened instead.
      console.log(`${coords.length} pts, range ${(hi - lo).toFixed(1)} m, grade ${(grade * 100).toFixed(1)}%` +
        (worstRaw ? ` (clamped down from ${(worstRaw * 100).toFixed(1)}%)` : ` (smoothing alone; clamp never fired)`));
      await sleep(1100); // be polite between circuits
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
  return result;
}

const requested = process.argv.slice(2);
const ids = requested.length ? requested : Object.keys(MAP);
const data = await bake(ids);

const body = Object.entries(data)
  .map(([id, prof]) => `    ${id}: [${prof.join(", ")}],`)
  .join("\n");
const file = `/* Apex 26 — surveyed circuit elevation profiles (metres relative to the
   start/finish line, ${SAMPLES} samples by arc-fraction around the lap).
   Generated by tools/gen/bake-elevation.mjs from SRTM 30 m (Open Topo Data) over
   bacinger/f1-circuits traces. Load before js/track/tracks.js to override the
   authored elevation bumps with real data. */
const CircuitElevations = {
${body}
};
if (typeof window !== "undefined") window.CircuitElevations = CircuitElevations;
`;
// js/track/, not js/ — this was missed in the js/ -> js/track/ reorganisation,
// so the tool wrote to a path that its own next line then told you to script-tag
// from js/track/, and following its instructions produced a 404. Everything else
// (tools/manifest.cjs, js/track/tracks.js, this file's own header) already
// agreed on js/track/.
const outPath = join(ROOT, "js", "track", "circuit-elevations.js");
writeFileSync(outPath, file);
console.log(`\nWrote ${outPath} (${Object.keys(data).length} circuits).`);
console.log("Add <script src=\"js/track/circuit-elevations.js?v=NN\"></script> before js/track/tracks.js.");
