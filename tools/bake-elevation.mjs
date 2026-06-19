/* Apex 26 — offline elevation baker.
 *
 * Produces js/circuit-elevations.js: a `CircuitElevations` global mapping each
 * circuit id to a 64-sample elevation profile (metres, relative to the
 * start/finish line, indexed by arc-fraction 0..1 around the lap). When that
 * file is loaded before js/tracks.js, the engine uses the REAL surveyed
 * elevation for those circuits and ignores their authored `elevations` bumps.
 *
 * Data sources:
 *   - layout/lat-lng : bacinger/f1-circuits (ODbL) GeoJSON LineStrings
 *   - elevation      : Open Topo Data public API (SRTM 30 m), api.opentopodata.org
 *
 * Network note: api.opentopodata.org must be reachable (it is firewalled in the
 * Claude Code web sandbox, so this is meant to be run on an unrestricted
 * machine). The public API allows ~1 request/sec, ≤100 locations/request,
 * ≤1000/day — well within one full bake of the calendar.
 *
 * Usage:
 *   node tools/bake-elevation.mjs            # bake every circuit
 *   node tools/bake-elevation.mjs spa cota   # bake a subset
 * Then add to index.html, before js/tracks.js:
 *   <script src="js/circuit-elevations.js?v=NN"></script>
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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
    prof.push(+(eA + (eB - eA) * t - e0).toFixed(2));
  }
  return prof;
}

async function bake(ids) {
  const result = {};
  for (const id of ids) {
    const gid = MAP[id];
    if (!gid) { console.warn(`! no mapping for ${id}, skipping`); continue; }
    process.stdout.write(`${id} (${gid}) … `);
    try {
      const geo = await fetchJSON(GEO(gid));
      const line = geo.features.find((f) => f.geometry.type === "LineString");
      const coords = line.geometry.coordinates.map((c) => [c[0], c[1]]);
      const ele = await elevations(coords);
      result[id] = toProfile(coords, ele);
      const lo = Math.min(...result[id]), hi = Math.max(...result[id]);
      console.log(`${coords.length} pts, range ${(hi - lo).toFixed(1)} m`);
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
   Generated by tools/bake-elevation.mjs from SRTM 30 m (Open Topo Data) over
   bacinger/f1-circuits traces. Load before js/tracks.js to override the
   authored elevation bumps with real data. */
const CircuitElevations = {
${body}
};
if (typeof window !== "undefined") window.CircuitElevations = CircuitElevations;
`;
const outPath = join(ROOT, "js", "circuit-elevations.js");
writeFileSync(outPath, file);
console.log(`\nWrote ${outPath} (${Object.keys(data).length} circuits).`);
console.log("Add <script src=\"js/circuit-elevations.js?v=NN\"></script> before js/tracks.js.");
