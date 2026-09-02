#!/usr/bin/env node
/* Apex 26 — snap each circuit's start/finish line onto its centreline trace and
 * @doc Derives `startFrac` from a real start/finish coordinate: projects into `CircuitPaths`, snaps to the nearest segment.
 * @skill new-track
 * report the `startFrac` that puts racing s=0 there.
 *
 * WHY THIS EXISTS
 * ---------------
 * `startFrac` positions the start/finish line. 20 circuits carried a value with
 * a confidence in the comment and the confidences were poor (shanghai 0.117,
 * hungaroring 0.185); the other 18 were hand-set round numbers. No tool in the
 * repo reproduced the derivation. This is that tool.
 *
 * THE MECHANISM (read js/track/space.js alongside this)
 * ----------------------------------------------------
 * `startFrac` is an INDEX fraction, not an arc-length fraction:
 *   racingNodeToSource(def, 0, N) === round(wrap01(startFrac) * N) % N
 * so racing node 0 IS source node `round(startFrac * N)`, under both the
 * forward and the `reverse: true` branch. `realPoints()` in tracks.js keeps
 * `CircuitPaths[id].pts` index-for-index (it maps, smooths in place, and never
 * resamples), so the source node index here is the CircuitPaths index, and
 *
 *   startFrac = ptsIndex / pts.length
 *
 * THE TRAP THIS TOOL MEASURES RATHER THAN ASSUMES
 * -----------------------------------------------
 * The committed traces are NOT all stored in upstream vertex order. MONACO is
 * stored REVERSED (committed[i] === projected[n-1-i]) — measured, and it is the
 * one circuit of 40 that is. Assuming a 1:1 geojson->pts index would put its
 * line on the mirror-image position, roughly half a lap out. So the alignment
 * (rotational offset + reversal) is re-derived per circuit on every run and
 * printed; anything other than `off=0` is a loud column, not a silent fixup.
 *
 * Twelve traces also carry a constant translation (they were never re-centred
 * on their bounding box). That is uniform and cannot affect an index, but it
 * does mean distances must be measured in ONE frame — this tool works entirely
 * in the projected, bbox-centred frame, where the start coordinate and the
 * trace are directly comparable.
 *
 * Usage:
 *   node tools/startline-snap.cjs            # table for every located circuit
 *   node tools/startline-snap.cjs --json     # machine-readable
 *   node tools/startline-snap.cjs monza spa  # just these
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const R = 6378137;

// game id -> upstream feature id in tests/data/f1-circuit-reference.geojson.
// Mirrors CIRCUIT_MAP in tests/specs/f1-track-accuracy.spec.js and COMMITTED +
// CLASSICS in tools/import-circuit-path.mjs.
const FEATURE = {
  abudhabi: "ae-2009", albert_park: "au-1953", bahrain: "bh-2002",
  baku: "az-2016", cota: "us-2012", hungaroring: "hu-1986",
  imola: "it-1953", interlagos: "br-1940", jeddah: "sa-2021",
  madrid: "es-2026", mexico: "mx-1962", miami: "us-2022",
  monaco: "mc-1929", monza: "it-1922", montreal: "ca-1978",
  qatar: "qa-2004", redbull: "at-1969", shanghai: "cn-2004",
  silverstone: "gb-1948", singapore: "sg-2008", spa: "be-1925",
  suzuka: "jp-1962", vegas: "us-2023", zandvoort: "nl-1948",
  hockenheim: "de-1932", nurburgring: "de-1927", catalunya: "es-1991",
  sepang: "my-1999", istanbul: "tr-2005", paul_ricard: "fr-1969",
  portimao: "pt-2008", sochi: "ru-2014", mugello: "it-1914",
  magny_cours: "fr-1960", estoril: "pt-1972", kyalami: "za-1961",
  watkins_glen: "us-1956", indianapolis: "us-1909", buenos_aires: "ar-1952",
  jacarepagua: "br-1977",
};

// Real start/finish coordinates, cross-checked across OpenStreetMap
// `raceway=start/finish` nodes and the Podium timing database, then
// reverse-looked-up against pit lanes and grandstands.
//
// FIVE circuits run a separate start line and finish line. The value here is
// always the FINISH (timing) line, because that is the line s=0 has to be:
//   silverstone  start 52.06934,-1.02215  (170 m up the road)
//   redbull      start 47.22001, 14.76520 (130 m)
//   vegas        start 36.10928,-115.16188 (85 m)
//   zandvoort    start 52.38945,  4.54118 (60 m)
//   imola        start 44.34441, 11.71402 (215 m)
//
// NOT LOCATED, deliberately absent — do not guess:
//   bahrain  bounded only: OSM pit lane way 187123422 runs
//            26.02985,50.51052 -> 26.03420,50.51071 and main grandstand way
//            187123419 centres 26.03207,50.51014, so the line is between them
//            at lon ~50.5103. A bound is not a coordinate.
//   jeddah   no usable source found.
// Both keep whatever startFrac they already carry.
const START = {
  monza:       { lat: 45.61896, lon:   9.28117, conf: "high" },
  cota:        { lat: 30.13189, lon: -97.63983, conf: "high" },
  spa:         { lat: 50.44406, lon:   5.96516, conf: "high" },
  zandvoort:   { lat: 52.38899, lon:   4.54088, conf: "high", split: true },
  imola:       { lat: 44.34400, lon:  11.71669, conf: "high", split: true },
  silverstone: { lat: 52.06826, lon:  -1.02349, conf: "high", split: true },
  monaco:      { lat: 43.73503, lon:   7.42127, conf: "high" },
  baku:        { lat: 40.37259, lon:  49.85291, conf: "high" },
  singapore:   { lat:  1.29169, lon: 103.86421, conf: "high" },
  vegas:       { lat: 36.10866, lon:-115.16256, conf: "high", split: true },
  redbull:     { lat: 47.22030, lon:  14.76673, conf: "high", split: true },
  albert_park: { lat:-37.85006, lon: 144.96898, conf: "high" },
  miami:       { lat: 25.95909, lon: -80.23738, conf: "med-high" },
  catalunya:   { lat: 41.57004, lon:   2.26123, conf: "med-high" },
  suzuka:      { lat: 34.84480, lon: 136.53885, conf: "medium" },
  montreal:    { lat: 45.50010, lon: -73.52272, conf: "medium" },
  mexico:      { lat: 19.40617, lon: -99.09380, conf: "medium" },
  interlagos:  { lat:-23.70369, lon: -46.69995, conf: "medium" },
  abudhabi:    { lat: 24.46994, lon:  54.60522, conf: "medium" },
  qatar:       { lat: 25.48904, lon:  51.44970, conf: "med-low" },
  hungaroring: { lat: 47.57904, lon:  19.24813, conf: "low-med", note: "sources disagree by 250 m" },
  shanghai:    { lat: 31.33800, lon: 121.22413, conf: "low-med", note: "sources disagree by 175 m" },
};

/* ---------- projection: identical to tools/import-circuit-path.mjs ---------- */

const round1 = (v) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? 0 : r; };

// Returns the projector for one feature, so a lat/lon that is NOT a trace
// vertex (the start line) lands in exactly the frame the trace lives in.
function projector(coords) {
  const n = coords.length;
  let lon0 = 0, lat0 = 0;
  for (const [lon, lat] of coords) { lon0 += lon; lat0 += lat; }
  lon0 /= n; lat0 /= n;
  const kx = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180);
  const kz = (Math.PI / 180) * R;
  const raw = ([lon, lat]) => [-(lon - lon0) * kx, (lat - lat0) * kz];

  let pts = coords.map(raw);
  const last = pts[pts.length - 1];
  // Upstream rings close; CircuitPaths is an open loop.
  if (Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]) < 1) pts = pts.slice(0, -1);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;

  return {
    pts: pts.map(([x, z]) => [round1(x - cx), round1(z - cz)]),
    at: (lon, lat) => { const [x, z] = raw([lon, lat]); return [x - cx, z - cz]; },
  };
}

/* ---------- committed traces ---------- */

function loadCommitted() {
  const src = fs.readFileSync(path.join(ROOT, "js/track/geo-paths.js"), "utf8");
  const re = /(\w+):\s*\{\s*len:\s*(\d+),\s*pts:\s*(\[\[[\s\S]*?\]\])\s*\}/g;
  const out = {};
  for (let m; (m = re.exec(src)); ) out[m[1]] = JSON.parse(m[3]);
  return out;
}

// Current startFrac as authored, straight out of the circuit file.
function currentStartFrac(id) {
  const f = path.join(ROOT, "js/circuits", `${id}.js`);
  if (!fs.existsSync(f)) return null;
  const m = /^\s*startFrac:\s*([0-9.]+)/m.exec(fs.readFileSync(f, "utf8"));
  return m ? Number(m[1]) : 0;
}

const bboxCentre = (pts) => {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
};

// How the committed trace is stored relative to upstream vertex order.
// Exhaustive over (reversed, offset) — cheap at n <= 202 and it cannot be
// fooled by a trace that happens to start near the true index 0.
function alignment(made, have) {
  const n = made.length;
  const cm = bboxCentre(made), ch = bboxCentre(have);
  const A = have.map(([x, z]) => [x - ch[0], z - ch[1]]);
  const M = made.map(([x, z]) => [x - cm[0], z - cm[1]]);
  let best = { err: Infinity, off: 0, rev: false };
  for (const rev of [false, true]) {
    const B = rev ? [...M].reverse() : M;
    for (let off = 0; off < n; off++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const p = A[i], q = B[(i + off) % n];
        sum += Math.hypot(p[0] - q[0], p[1] - q[1]);
      }
      const err = sum / n;
      if (err < best.err) best = { err, off, rev };
    }
  }
  return best;
}

/* ---------- main ---------- */

function snap(ids) {
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/f1-circuit-reference.geojson"), "utf8"));
  const features = new Map(geo.features.map((f) => [f.properties.id, f]));
  const committed = loadCommitted();
  const rows = [];

  for (const id of ids) {
    const s = START[id];
    if (!s) continue;
    const feature = features.get(FEATURE[id]);
    const have = committed[id];
    if (!feature || !have) { rows.push({ id, error: "no feature or committed trace" }); continue; }

    const proj = projector(feature.geometry.coordinates);
    const made = proj.pts;
    if (made.length !== have.length) { rows.push({ id, error: `length ${made.length} vs ${have.length}` }); continue; }

    const align = alignment(made, have);
    const n = have.length;

    // Project onto the nearest SEGMENT, not the nearest vertex. Vertex spacing
    // runs 21-70 m and is not uniform, so a line that sits mid-segment reads as
    // "126 m off the circuit" (Red Bull Ring did exactly that) when it is in
    // fact dead on the centreline. The fractional index this yields is also the
    // honest input to the rounding startFrac has to do anyway.
    const p = proj.at(s.lon, s.lat);
    let bestJ = 0, bestT = 0, bestD = Infinity;
    for (let j = 0; j < n; j++) {
      const a = made[j], b = made[(j + 1) % n];
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const len2 = vx * vx + vz * vz;
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len2)) : 0;
      const d = Math.hypot(a[0] + vx * t - p[0], a[1] + vz * t - p[1]);
      if (d < bestD) { bestD = d; bestJ = j; bestT = t; }
    }
    // Nearest-point snapping picks the nearest BRANCH, and several circuits run
    // alongside themselves — at Zandvoort the track 750 m past the line is
    // ~60 m from the main straight, so a coordinate with 50 m of error can land
    // on the wrong one. `alt` is the same search excluding everything within a
    // fifth of a lap of the winner; when the runner-up is nearly as close, the
    // snap is ambiguous and the caller must not take it on faith.
    let altJ = -1, altD = Infinity;
    for (let j = 0; j < n; j++) {
      const gap = Math.min(Math.abs(j - bestJ), n - Math.abs(j - bestJ));
      if (gap < n / 5) continue;
      const a = made[j], b = made[(j + 1) % n];
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const len2 = vx * vx + vz * vz;
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len2)) : 0;
      const d = Math.hypot(a[0] + vx * t - p[0], a[1] + vz * t - p[1]);
      if (d < altD) { altD = d; altJ = j; }
    }

    // ...then through the measured storage order into a CircuitPaths index,
    // which is what startFrac counts in. Rounding is unavoidable: startFrac can
    // only name a node (`round(startFrac * N)`), so one node is the resolution.
    const jFrac = bestJ + bestT;
    const upstream = Math.round(jFrac) % n;
    const idx = ((align.rev ? n - 1 - upstream : upstream) - align.off % n + n) % n;

    const startFrac = Number((idx / n).toFixed(4));
    const cur = currentStartFrac(id);
    // Lap-fraction delta the SHORT way round, then in metres of trace.
    let dFrac = startFrac - cur;
    while (dFrac > 0.5) dFrac -= 1;
    while (dFrac < -0.5) dFrac += 1;
    let len = 0;
    for (let i = 0; i < n; i++) {
      const a = have[i], b = have[(i + 1) % n];
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }

    // Where upstream vertex 0 falls relative to this line. 39 of 40 traces are
    // dead straight at their own vertex 0 and 13 researched coordinates land
    // within a node of it, so the dataset evidently BEGINS each trace at the
    // start/finish line — which makes v0 a second, independent estimator.
    let v0Frac = ((align.rev ? n - 1 : 0) - align.off % n + n) % n / n;

    rows.push({
      id, n, idx, startFrac, current: cur,
      deltaFrac: Number(dFrac.toFixed(4)),
      deltaM: Math.round(dFrac * len),
      snapM: Number(bestD.toFixed(1)),
      altM: altJ < 0 ? null : Number(altD.toFixed(1)),
      ambiguous: altJ >= 0 && altD < bestD * 2 + 20,
      v0Frac: Number(v0Frac.toFixed(4)),
      spacingM: Math.round(len / n),
      conf: s.conf, split: !!s.split, note: s.note || "",
      align: { off: align.off, rev: align.rev, err: Number(align.err.toFixed(2)) },
    });
  }
  return rows;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const wanted = argv.filter((a) => !a.startsWith("--"));
  const ids = wanted.length ? wanted : Object.keys(START);
  const rows = snap(ids);

  if (asJson) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

  console.log("circuit        n   idx  startFrac   v0Frac  current   off-cl   alt  spac  align       conf");
  console.log("-".repeat(100));
  for (const r of rows) {
    if (r.error) { console.log(`${r.id.padEnd(13)} ERROR ${r.error}`); continue; }
    const a = `off=${r.align.off}${r.align.rev ? " REV" : ""}`;
    console.log(
      `${r.id.padEnd(13)} ${String(r.n).padStart(3)} ${String(r.idx).padStart(4)}  ` +
      `${r.startFrac.toFixed(4).padStart(8)}  ${r.v0Frac.toFixed(4)}  ${String(r.current).padStart(7)}  ` +
      `${(r.snapM + " m").padStart(7)}  ${String(r.altM == null ? "-" : Math.round(r.altM)).padStart(4)} ` +
      `${String(r.spacingM).padStart(4)}m  ${a.padEnd(11)} ${r.conf}` +
      (r.ambiguous ? "  AMBIGUOUS" : "") +
      (r.note ? `  (${r.note})` : "") + (r.split ? "  [timing line]" : ""));
  }
  console.log("\nbahrain, jeddah: NOT LOCATED — left at their current values on purpose.");
}

module.exports = { snap, START, FEATURE, projector };
