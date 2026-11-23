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
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SAMPLES = 64; // profile resolution around the lap

// Apex 26 circuit id -> bacinger/f1-circuits geojson id (from f1-locations.json).
const MAP = {
  magny_cours: "fr-1960",  // Estoril dip, Adelaide climb and Château d’Eau crest.
  watkins_glen: "us-1956",
  bahrain: "bh-2002", monaco: "mc-1929", silverstone: "gb-1948", spa: "be-1925",
  monza: "it-1922", suzuka: "jp-1962", singapore: "sg-2008", cota: "us-2012",
  interlagos: "br-1940", vegas: "us-2023", madrid: "es-2026", zandvoort: "nl-1948",
  jeddah: "sa-2021", albert_park: "au-1953", shanghai: "cn-2004", miami: "us-2022",
  imola: "it-1953", montreal: "ca-1978", redbull: "at-1969", hungaroring: "hu-1986",
  baku: "az-2016", mexico: "mx-1962", qatar: "qa-2004", abudhabi: "ae-2009",
  // Classics with bacinger traces (same ids as tools/track/import-circuit-path.mjs).
  // Baking overrides authored cosine bumps — only add an id when the bumps are
  // the problem (sparse plateaus / stair-steps), not for every classic.
  nurburgring: "de-1927",
  estoril: "pt-1972", // Tanque layout, including the climb from the Orelha hairpin.
  // Portimão (Algarve): rollercoaster hills are real; sparse authored cosines
  // left knife-edge grade changes (max ~7 pp/step). Same SRTM path as #287.
  portimao: "pt-2008",
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
// MAX_GRADE is 5.5%. It was 8%, and 8% was measurably wrong — not because any
// single number was indefensible, but because THE CLAMP WAS DOING THE SHAPING.
// Measured across all 52 circuits at the real 4 m node spacing (2026-09-15):
// the eleven baked profiles had a MEDIAN max gradient of 7.04% against a cap of
// 8%. Real terrain does not pile up just under a limit; a clamp that is binding
// almost everywhere has stopped being a backstop and become the author. SRTM
// 30 m carries several metres of vertical noise, and at this 60-70 m sample
// spacing that noise manufactures slope the landscape does not have.
// The shipped fleet's hand-authored bumps median 2.77%. 5.5% keeps these
// genuinely hilly venues steeper than the fleet — which they are — while
// leaving the cap slack on most of them, so the terrain decides and the clamp
// only catches the outliers. Still far under the 17-18% of Spa's Raidillon.
// Both passes keep the loop closed (sample 0 and sample SAMPLES-1 must still
// meet) — realPoints() de-trends any residual, but a profile that needs
// de-trending has already lied about a gradient somewhere.
const MAX_GRADE = 0.055;
// Default [1,2,1] passes, and the circuits whose relief is one short, steep climb
// the global limits flatten. cota (#2208): raw SRTM climbs 25 m to the T1 crest
// in ~330 m (published: 30+ m); the 0.012 kink clamp alone held the crest to
// 10.5 m, six passes and the 5.5 % grade cap the rest. Per-circuit overrides of
// passes / kink / grade, named and never global (header: SRTM noise on 11 circuits).
const SMOOTH_PASSES = 6;
const SMOOTH_OVERRIDE = { cota: 1, estoril: 2 };
const GRADE_OVERRIDE = { cota: 0.08 };
const KINK_OVERRIDE = { cota: 0.06 };
// The gradient CHANGE allowed between adjacent samples. A road can sit inside
// MAX_GRADE everywhere and still feel violent, because what a driver feels is
// the second derivative, not the first: shipped 2026-09-14 with slope clamped
// to 8%, Brands Hatch still swung slope by 6.5 percentage points across a
// single 60 m step, 64 times a lap. That is a crest, and no amount of smooth
// interpolation downstream can remove a kink the data really contains.
// 2.5 points per ~60 m step is a vertical curve a real circuit would build.
//
// 0.025 was still twice too loose, and this is the number that decides whether
// a lap feels dramatic. Measured as max |d2y/ds2| at 4 m spacing, x1e4: the
// eleven baked at 0.025 came out at a median 7.74 against the shipped fleet's
// 3.50 — every new circuit rode like Spa's worst compression for a whole lap,
// while the fleet's steep circuits (Suzuka 26.0, Monaco 12.8) spend ONE corner
// there and are otherwise calm. 0.012 lands the eleven at a median 3.10, i.e.
// the fleet's own character, and costs almost none of the real relief:
// Mosport 42.9 -> 40.3 m, Fuji 36.2 -> 33.3 m, Donington 32.0 -> 29.3 m. The
// drama was high-frequency sampling noise, not landscape, which is exactly why
// removing it leaves the hills standing. A tighter pass (0.010 with 6 smoothing
// passes) was measured too: it shaved more real range without improving the
// kink, so this is the stopping point, not the start of a slide toward flat.
const MAX_KINK = 0.012;

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
function clampGrade(p, spacing, grade = MAX_GRADE) {
  const n = p.length, lim = grade * spacing;
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

// Limit the SECOND difference: |p[i-1] - 2p[i] + p[i+1]| <= MAX_KINK * spacing.
// Nudging the middle sample toward the chord it sits off reduces that residual
// directly, and does so without touching the endpoints, so the lap stays closed
// and the macro shape (which is the part SRTM gets right) is preserved.
function clampKink(p, spacing, kink = MAX_KINK) {
  const n = p.length, lim = kink * spacing;
  let a = p.slice();
  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const d2 = a[(i - 1 + n) % n] - 2 * a[i] + a[(i + 1) % n];
      if (Math.abs(d2) <= lim) continue;
      a[i] += (Math.abs(d2) - lim) * Math.sign(d2) * 0.5;
      moved = true;
    }
    if (!moved) break;
  }
  return a;
}

// resample per-vertex elevations to SAMPLES points evenly spaced by arc length,
// normalized so the start sits at 0
function toProfile(coords, ele, passes = SMOOTH_PASSES, kink = MAX_KINK, grade = MAX_GRADE) {
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
  // Kink first (it is the violent one and it also lowers the slope), then the
  // slope clamp, so the hard ceiling is what the output is measured against.
  // SIX passes, not two. Two [1,2,1]/4 passes barely dent SRTM's per-sample
  // noise, which left the clamps below doing the shaping (see MAX_GRADE). Six
  // is still a narrow low-pass at this spacing — it attenuates the 2-3 sample
  // wiggles that are sampling artefacts and leaves anything spanning several
  // hundred metres, which is every real gradient a circuit has, untouched.
  const eased = clampKink(smoothClosed(prof, passes), spacing, kink);
  const { prof: capped, worstRaw } = clampGrade(eased, spacing, grade);
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

// The SRTM flight predates Buddh's earthworks. Williams measured a 14 m rise
// from T1 to T3, and Renault describes the following descent to mid-straight
// and climb to T4. These arc stations use the stitched ring's origin.
// https://www.motorsport.com/f1/news/f1-williams-can-t-wait-to-see-tilke-designed-indian-gp-track/413764/
// https://media.alpinecars.com/renault-sport-f1-preview-to-the-indian-gp/?lang=eng
function buddhEarthworks(profile) {
  const turn1 = 0.7765, turn3 = 0.8509, midStraight = 0.9769, turn4 = 1.1025;
  const ease = (t) => t * t * (3 - 2 * t);
  // Relative to the old terrain, lower the first braking zone and the hollow
  // in the straight. A 17.4 m differential corrects the old descent and gives
  // 14.0 m between the built apexes after the 64-post spline interpolation.
  const corrected = profile.map((y, i) => {
    let f = i / profile.length;
    if (f < turn4 - 1) f += 1;
    if (f < turn1 - 0.07 || f >= turn4) return y;
    if (f <= turn1) return y - 4 * ease((f - turn1 + 0.07) / 0.07);
    if (f <= turn3) return y - 4 + 17.4 * (f - turn1) / (turn3 - turn1);
    if (f <= midStraight) return y + 13.4 - 18.4 * ease((f - turn3) / (midStraight - turn3));
    return y - 5 * (1 - ease((f - midStraight) / (turn4 - midStraight)));
  });
  return corrected.map((y) => +(y - corrected[0]).toFixed(2));
}

async function bake(ids) {
  const result = {};
  for (const id of ids) {
    if (id === "redbull") {
      // OpenF1 2024 Austrian GP qualifying, session 9541. Fit Verstappen lap 17
      // to the built road in plan; Norris lap 19 independently checks the heights.
      // Fit relative z at nearest plan nodes with a second-difference penalty.
      // https://api.openf1.org/v1/laps?session_key=9541&driver_number=1&lap_number=17
      // These ordinates use the bake's unrotated, equally spaced arc stations.
      result[id] = [
        0, 0.98, 3.23, 7, 11.57, 15.74, 18.21, 19,
        19.02, 19.22, 20, 21.13, 22.47, 25.53, 29.49, 34.73,
        41.32, 48.81, 56.17, 61.94, 63.61, 62.53, 60.05, 57.22,
        54.66, 52.33, 50.35, 48.39, 46, 42.96, 39.29, 35.32,
        31.8, 29.6, 29.05, 29.91, 31.39, 32.17, 31.62, 29.22,
        24.83, 19.52, 15.44, 13.22, 12.82, 13.48, 14.47, 15.85,
        18.26, 20.6, 22.44, 23.48, 23.51, 22.45, 20.23, 16.8,
        12.4, 7.94, 4.67, 2.75, 1.67, 0.92, 0.32, -0.08,
      ];
      continue;
    }
    if (id === "magny_cours") {
      // IGN RGE ALTI on the fr-1960 ring, sampled every 1/64 lap by plan distance.
      // https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json
      const heights = [
        217.53, 216.83, 216.28, 215.8, 214.67, 212.69, 210.48, 208.44,
        208.05, 210.13, 211.83, 213.32, 215.1, 216.7, 218.19, 219.78,
        221.4, 223.0, 224.43, 226.11, 228.12, 229.96, 231.96, 233.69,
        234.38, 233.07, 231.58, 229.93, 227.67, 225.61, 224.2, 222.79,
        221.26, 219.23, 217.54, 215.71, 213.94, 213.58, 215.09, 217.06,
        218.74, 220.71, 222.35, 223.93, 226.25, 228.24, 229.31, 232.41,
        234.56, 236.73, 237.93, 237.06, 235.03, 232.36, 229.52, 226.95,
        224.35, 221.69, 219.4, 218.6, 218.89, 219.3, 218.6, 218.02,
      ];
      result[id] = heights.map(h => +(h - heights[0]).toFixed(2));
      continue;
    }
    if (id === "portimao") {
      // FastF1 positions, 2021 Portuguese qualifying: Bottas lap 18 fit;
      // Hamilton lap 12 checks the 64 stations on the built racing line.
      // https://github.com/TracingInsights/2021/tree/main/Portuguese%20Grand%20Prix/Qualifying
      result[id] = [
        0, -0.03, 0.04, -1.42, -5.53, -4.98, -2.41, -1.29,
        -0.5, 0.65, 1.02, 0.21, 5.07, 7.56, 8.26, 9.06,
        9.67, 9.18, 6.96, 3.02, -0.11, 2.6, 7.04, 11.24,
        14.55, 15.22, 14.1, 12.56, 12.55, 16.86, 21.86, 20.58,
        12.5, 9.54, 10.97, 16.89, 21.96, 22.19, 21.55, 16.67,
        7.75, 7.57, 11.05, 14.29, 17.29, 18.95, 18.41, 16.04,
        11.18, 8.15, 7.29, 7.63, 7.69, 3.25, -2.95, -5.64,
        -5.68, -5.11, -1.88, -0.05, -0.05, 0, -0.01, -0.01,
      ];
      continue;
    }
    if (id === "jerez") {
      // IGN Spain MDT05 5 m bare-earth raster, sampled by bilinear interpolation
      // at i/64 of unrotated chord distance along the OSM ring. Datum: first post.
      // https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=DescribeCoverage&coverageId=Elevacion4258_5
      result[id] = [
        0, 0, 0, 1, 2, 3, 4, 4.89,
        5, 5.91, 5, 5, 5, 4, 4, 4,
        4, 6, 8.92, 12, 14, 14, 14, 13,
        11, 8, 6.68, 6, 7, 8, 9, 10.01,
        11.4, 13.53, 16.43, 18.79, 19, 17, 14, 11,
        9, 9, 9, 10, 10.2, 11.44, 11, 9,
        7, 6, 4.18, 3, 2, 2, 1.04, 1,
        2, 3, 4, 4.48, 4.98, 3.23, 2, 1,
      ];
      continue;
    }
    if (id === "fuji") {
      // GSI Japan 1 m lidar on the built centreline, sampled every 36 m.
      // Fit alternating stations, retaining the operator's signed grade limits.
      // https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php
      result[id] = [
        0, -0.1, -0.11, -0.11, -0.11, -0.1, -0.03, -0.1,
        -0.11, -0.03, -0.01, -0.01, -0.08, -0.25, -0.6, -1.15,
        -1.67, -2.13, -2.6, -3.91, -9.3, -15.46, -19.33, -21.25,
        -21.7, -20.97, -19.82, -19.7, -21.34, -24.45, -28.19, -30.83,
        -31.17, -29.25, -25.39, -21.26, -18.8, -18.64, -20.16, -21.39,
        -22.65, -24.16, -26, -28.57, -31.85, -35, -36.55, -36.6,
        -35.94, -34.27, -29.87, -24.01, -18.6, -16.04, -16.2, -15.21,
        -11.22, -9.04, -9.47, -7.36, -2.46, 0.17, 0.3, 0.12,
      ];
      continue;
    }
    if (id === "donington") {
      // Environment Agency 1 m composite DTM, sampled at i/64 around the authored OSM ring.
      // https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc
      result[id] = [
        0, -0.48, -1.93, -4.44, -5.6, -3.86, -1.85, -0.15,
        0.7, 0.99, 0.6, -1.37, -2.18, -2.8, -3.56, -4.78,
        -6.01, -6.84, -6.5, -6.21, -5.72, -5.03, -4.99, -5.83,
        -6.89, -8.85, -12.13, -16.65, -20.34, -25.4, -28.29, -29.87,
        -31.77, -31.18, -28.69, -26.38, -24.71, -23.09, -20.33, -17.06,
        -13.75, -10.25, -6.47, -3.38, -3.09, -3.25, -2.84, 1.03,
        3.75, 3.79, 3.53, 2.32, 1.68, 1.25, 1.11, 0.76,
        -0.83, -1.74, -2.15, -3.17, -2.62, -1.78, -0.88, -0.25,
      ];
      continue;
    }
    if (id === "zolder") {
      // Flemish DHMV II 1 m bare-earth lidar on the modern OSM ring, at i/64 of arc.
      // https://geo.api.vlaanderen.be/DHMV/wcs?service=WCS&request=DescribeCoverage&version=1.0.0&coverage=DHMVII_DTM_1m
      const heights = [
        0, 0.28, 0.72, 0.72, 1.01, 1.25, 1.42, 1.61,
        1.81, 2.01, 2.24, 2.67, 3.63, 5.13, 6.59, 7.29,
        7.23, 6.64, 5.96, 5.2, 4.45, 3.64, 2.77, 1.43,
        -0.1, -1.18, -1.72, -2.06, -2.3, -2.32, -2.34, -2.31,
        -2.26, -2.31, -2.24, -2, -1.58, -1.03, -0.24, 0.62,
        1.5, 2.36, 2.88, 3.01, 3.11, 3.41, 3.44, 3.65,
        4.12, 8.06, 6.58, 1.81, 0.45, 0.06, -0.54, -0.79,
        -0.98, -1.15, -1.49, -0.78, 0.62, 2.04, 2.61, 1.28,
      ];
      const { prof } = clampGrade(heights, 4006 / SAMPLES, 0.045);
      result[id] = prof.map(height => +(height - prof[0]).toFixed(2));
      continue;
    }
    if (id === "dijon") {
      // IGN RGE ALTI at 64 equal plan-distance stations on the Dijon OSM ring.
      // https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json
      const heights = [
        480.97, 482.48, 483.55, 484.27, 484.85, 485.43, 486.06, 486.7,
        486.64, 488.05, 488.73, 489.32, 489.38, 489.55, 489.0, 487.2,
        484.35, 480.38, 477.1, 473.44, 474.96, 477.62, 477.72, 477.52,
        478.88, 480.33, 481.56, 480.53, 476.74, 472.36, 469.76, 467.25,
        465.0, 462.43, 460.22, 461.86, 469.42, 473.66, 478.7, 481.86,
        482.94, 482.85, 482.98, 483.96, 484.83, 485.44, 484.68, 482.7,
        480.21, 477.64, 474.63, 471.11, 468.43, 464.32, 463.45, 463.75,
        460.29, 457.93, 461.7, 466.15, 471.82, 475.47, 477.75, 479.43,
      ];
      // Ease the two posts bracketing the sharpest rise: Catmull-Rom
      // otherwise overshoots the operator’s 14% maximum at Parabolique.
      for (const i of [35, 36]) {
        heights[i] = 0.06 * heights[i - 1] + 0.88 * heights[i] + 0.06 * heights[i + 1];
      }
      result[id] = heights.map(h => +(h - heights[0]).toFixed(2));
      continue;
    }
    if (id === "mosport") {
      // NRCan 1 m Peterborough lidar (2016–17), relative to the first OSM
      // post. The 64 stations follow the racing surface along the mapped ring.
      // https://datacube.services.geo.ca/pgstac/api/collections/hrdem-lidar/items/ON-2016-17-Peterborough-1m
      result[id] = [
        0, -1.5, -1.79, -1.8, -2.26, -5.06, -10.74, -15.6,
        -17.73, -12.82, -7.88, -9.91, -11.52, -11.36, -9.37, -7.33,
        -5.37, -1.23, 3.74, 7.66, 11.05, 15.21, 18.34, 18.74,
        18.93, 18.92, 20.02, 22.65, 24.4, 24.05, 23.75, 23.83,
        25.08, 27.65, 29.33, 29.09, 29.59, 29.63, 30.57, 32.89,
        32.89, 32.73, 32.41, 31.4, 29.19, 24.86, 20.25, 17.48,
        16.45, 16.3, 17.39, 19.04, 18.09, 13.84, 6.46, 0.32,
        -2.15, -1.95, -0.75, 1.21, 4.53, 7.12, 5.85, 2.69,
      ];
      continue;
    }
    if (id === "okayama") {
      // GSI Japan 1 m laser DEM, sampled at i/64 of the stitched OSM ring
      // from 134.2234962 E, 34.9173276 N. The operator publishes 29 m relief.
      // https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php
      const heights = [
        262.8, 263.4, 263.9, 264.4, 265, 265.6, 266.1, 266.7,
        266.8, 266.5, 263.5, 259.7, 256.9, 257.2, 258.9, 260.6,
        262.2, 263.9, 265.5, 267.4, 269.3, 271, 272.9, 274.6,
        274.7, 274.5, 273, 271.4, 269.7, 267.9, 266.2, 265.3,
        264.8, 264.4, 263.9, 263.5, 263.1, 262.6, 262.2, 261.7,
        261, 260.6, 259.5, 258, 256.9, 256.5, 255.3, 253.4,
        252.7, 252.7, 252.7, 251.9, 250.3, 248.6, 247.2, 245.8,
        245.4, 248.2, 252.7, 256.6, 259.4, 261, 261.6, 262.2,
      ];
      const spacing = 3699.6 / SAMPLES; // metres along the sampled OSM ring
      const eased = clampKink(heights, spacing, MAX_KINK);
      const { prof } = clampGrade(eased, spacing, MAX_GRADE);
      result[id] = prof.map((height) => +(height - prof[0]).toFixed(2));
      continue;
    }
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
      const { prof: terrain, spacing, worstRaw } = toProfile(coords, ele, SMOOTH_OVERRIDE[id] ?? SMOOTH_PASSES, KINK_OVERRIDE[id] ?? MAX_KINK, GRADE_OVERRIDE[id] ?? MAX_GRADE);
      const prof = id === "buddh" ? buddhEarthworks(terrain) : terrain;
      if (id === "interlagos") {
        // Road-height residuals against the terrain at Descida do Lago.
        // OpenF1 2025 São Paulo qualifying (9865), laps 20/10 of cars 4/81:
        // after XY registration, T4–T5 descends 6.75/6.66 m. T5 is the datum.
        // Blend back into unchanged terrain posts on either side of the sector.
        const descentCorrection = [1.68, 1.64, 1.87, 3.07, 3.75, 2.67, 0.65, -0.17, 0.36];
        descentCorrection.forEach((dy, j) => { prof[16 + j] = +(prof[16 + j] + dy).toFixed(2); });
      }
      if (id === "hungaroring") {
        // XY-registered OpenF1 2024 qualifying laps (session 9562, cars 4/81)
        // place T3 ~14.6 m below T2 and ~8.4 m below T4. Fit the sector's
        // road-height residuals subject to the terrain bake's grade limit.
        const basinCorrection = [-1.67, -1.63, -1.37, -1.37, -2.37, -2.97, -3.85, -5.56, -6.4, -6.62, -5.73, -4.18, -2.22, -0.04, 0.76, -0.69, -0.59];
        basinCorrection.forEach((dy, j) => { prof[9 + j] = +(prof[9 + j] + dy).toFixed(2); });
      }
      if (id === "mont_tremblant") {
        // NRCan 2018 1 m lidar on the back straight plus the reported historic
        // Hump cut (about 12 feet). Blend adjacent posts into the original bake.
        // https://datacube.services.geo.ca/api/collections/hrdem-lidar/items/QC-600018-23_DIF_Grand_Mtl_2018-1m
        const humpCorrection = [-0.01, 0.01, -0.39, -0.86, -0.59, 0.83, 4.02, 5.37, 3.69, -0.75, -2.87, -2.52, -2.02, -0.98, -0.03];
        humpCorrection.forEach((dy, i) => { prof[13 + i] = +(prof[13 + i] + dy).toFixed(2); });
      }
      if (id === "brands_hatch") {
        // Environment Agency 1 m DTM (2022, OGL), sampled on the OSM ring.
        // https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc
        // Paddock Hill's approach, trough and Druids are at 138/365/598 m
        // from the timing line, with elevations of 131.65/114.14/134.71 m.
        // These 1 m DTM samples coincide with source posts 21–32. Use
        // the height difference from post 20 (128.50 m). The measured
        // excerpt rejoins the SRTM profile after the crest of Druids.
        const localHeights = [1.82, 3.09, 2.15, -0.96, -8.31, -14.33, -9.56, -2.77, 3.87, 6.05, 1.27, -4.7];
        prof.splice(21, localHeights.length, ...localHeights.map(h => +(prof[20] + h).toFixed(2)));
      }
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

// Preserve previously surveyed profiles when a terrain service skips a circuit.
const outPath = join(ROOT, "js", "track", "circuit-elevations.js");
const existing = existsSync(outPath)
  ? vm.runInNewContext(readFileSync(outPath, "utf8") + ";CircuitElevations", {})
  : {};
const requested = process.argv.slice(2);
const ids = requested.length ? requested : [...new Set([...Object.keys(MAP), ...Object.keys(existing), "okayama"])];
const baked = await bake(ids);
const data = { ...existing, ...baked };

const body = Object.entries(data)
  .map(([id, prof]) => `    ${id}: [${prof.join(", ")}],`)
  .join("\n");
const file = `/* Apex 26 — surveyed circuit elevation profiles (metres relative to the
   start/finish line, ${SAMPLES} samples by arc-fraction around the lap).
   Generated by tools/gen/bake-elevation.mjs from SRTM terrain, national
   elevation surveys and registered race traces. See the circuit-specific
   source and sampling notes in the baker and the track validation report.
   Consumed by TrackDef (js/track/core/def.js) at fromRaw/hydrate.
   Keep ahead of tracks.js in the manifest. */
const CircuitElevations = {
${body}
};
if (typeof window !== "undefined") window.CircuitElevations = CircuitElevations;
`;
writeFileSync(outPath, file);
console.log(`\nWrote ${outPath} (${Object.keys(data).length} circuits, ${Object.keys(baked).length} baked this run).`);
console.log("Add <script src=\"js/track/circuit-elevations.js?v=NN\"></script> before js/track/tracks.js.");
