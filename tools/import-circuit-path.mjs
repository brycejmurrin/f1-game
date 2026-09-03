#!/usr/bin/env node
// @doc Projects a `bacinger/f1-circuits` GeoJSON feature into a circuit def's `path`; `--self-check` diffs committed traces.
// @skill new-track
/* Apex 26 — import real circuit centrelines from bacinger/f1-circuits (ODbL-1.0)
   as the `path: { len, pts }` key of a circuit def in js/circuits/<id>.js.
 *
 * The committed traces were produced by hand from the same upstream GeoJSON but
 * no tool was ever checked in, so the projection had to be recovered before the
 * retired circuits could be added in the same convention. It is:
 *
 *   lat0/lon0 = arithmetic centroid of the feature's coordinates
 *   x = -(lon - lon0) * R * cos(lat0)      (metres)
 *   z =  (lat - lat0) * R                  (metres)
 *   R = 6378137 (WGS-84 equatorial radius)
 *   drop the duplicate closing vertex  →  "one lap, open loop"
 *   translate so the bounding box is centred on the origin
 *   round to 1 decimal place
 *   len = summed length of the projected open polyline, rounded to metres
 *
 * `--self-check` regenerates the ALREADY-COMMITTED circuits and diffs them
 * against the committed circuit files. That is the guard that this projection is still the one
 * the shipped data was built with — run it before trusting any new entry.
 * Observed agreement is 0.4-1.1 m mean error per circuit (digitisation-level).
 *
 * Usage:
 *   node tools/import-circuit-path.mjs --self-check            # every committed path
 *   node tools/import-circuit-path.mjs --self-check monza spa
 *   node tools/import-circuit-path.mjs <gameId>:<featureId> …  # emit new entries
 *   node tools/import-circuit-path.mjs --classics              # emit all 16 retired
 *
 * Flags:
 *   --source <path>   read the GeoJSON from disk instead of fetching
 *   --json            emit JSON instead of the circuit-file source line
 *
 * Network: fetches raw.githubusercontent.com, same host and file as
 * tools/refresh-f1-circuit-reference.mjs. Never run by the test suite.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIRCUITS = path.join(ROOT, "js/circuits");
const R = 6378137;

// Circuits already in the game — game id → upstream feature id. Mirrors
// CIRCUIT_MAP in tests/specs/f1-track-accuracy.spec.js; used only by --self-check.
const COMMITTED = {
  abudhabi: "ae-2009", albert_park: "au-1953", bahrain: "bh-2002",
  baku: "az-2016", cota: "us-2012", hungaroring: "hu-1986",
  imola: "it-1953", interlagos: "br-1940", jeddah: "sa-2021",
  madrid: "es-2026", mexico: "mx-1962", miami: "us-2022",
  monaco: "mc-1929", monza: "it-1922", montreal: "ca-1978",
  qatar: "qa-2004", redbull: "at-1969", shanghai: "cn-2004",
  silverstone: "gb-1948", singapore: "sg-2008", spa: "be-1925",
  suzuka: "jp-1962", vegas: "us-2023", zandvoort: "nl-1948",
};

// The retired / off-calendar circuits upstream carries that the game does not.
const CLASSICS = {
  hockenheim: "de-1932", nurburgring: "de-1927", catalunya: "es-1991",
  sepang: "my-1999", istanbul: "tr-2005", paul_ricard: "fr-1969",
  portimao: "pt-2008", sochi: "ru-2014", mugello: "it-1914",
  magny_cours: "fr-1960", estoril: "pt-1972", kyalami: "za-1961",
  watkins_glen: "us-1956", indianapolis: "us-1909", buenos_aires: "ar-1952",
  jacarepagua: "br-1977",
};

/* ---------- projection ---------- */

// GeoJSON [lon,lat] ring → { len, pts:[[x,z],…] } in the def.path convention.
export function project(coords) {
  const n = coords.length;
  let lon0 = 0, lat0 = 0;
  for (const [lon, lat] of coords) { lon0 += lon; lat0 += lat; }
  lon0 /= n; lat0 /= n;
  const kx = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180);
  const kz = (Math.PI / 180) * R;

  let pts = coords.map(([lon, lat]) => [-(lon - lon0) * kx, (lat - lat0) * kz]);
  // Upstream rings are closed (last vertex repeats the first). def.path is
  // an OPEN loop — the Catmull-Rom pass closes it — so drop the duplicate.
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]) < 1) pts = pts.slice(0, -1);

  // Recentre on the bounding box, matching the committed traces.
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  pts = pts.map(([x, z]) => [round1(x - cx), round1(z - cz)]);

  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return { len: Math.round(len), pts };
}

function round1(v) {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

// Signed area in projected space. Positive = counter-clockwise on screen.
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/* ---------- source + committed data ---------- */

async function loadSource(file) {
  if (file) return JSON.parse(await fs.readFile(file, "utf8"));
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${SOURCE}`);
  return res.json();
}

// Parse each circuit's committed `path` straight out of js/circuits/<id>.js, so
// --self-check compares against what actually ships rather than a copy.
async function loadCommitted() {
  const out = {};
  const re = /^\s*path:\s*\{\s*len:\s*(\d+),\s*pts:\s*(\[\[[\s\S]*?\]\])\s*\}/m;
  for (const f of (await fs.readdir(CIRCUITS)).filter((n) => n.endsWith(".js"))) {
    const m = re.exec(await fs.readFile(path.join(CIRCUITS, f), "utf8"));
    if (m) out[f.replace(/\.js$/, "")] = { len: Number(m[1]), pts: JSON.parse(m[2]) };
  }
  return out;
}

/* ---------- output ---------- */

// The def key, ready to paste into js/circuits/<gameId>.js.
function emit(gameId, entry, asJson) {
  if (asJson) return JSON.stringify({ [gameId]: entry });
  return `    path: { len: ${entry.len}, pts: ${JSON.stringify(entry.pts)} },  // ${gameId}`;
}

// Mean per-vertex distance between two same-length traces, after aligning the
// rotational offset and point order (a trace may be stored reversed).
function meanError(a, b) {
  if (a.length !== b.length) return { err: Infinity, offset: 0, reversed: false };
  const n = a.length;
  const ca = centre(a), cb = centre(b);
  const A = a.map(([x, z]) => [x - ca[0], z - ca[1]]);
  let best = { err: Infinity, offset: 0, reversed: false };
  for (const reversed of [false, true]) {
    const B0 = reversed ? [...b].reverse() : b;
    const B = B0.map(([x, z]) => [x - cb[0], z - cb[1]]);
    for (let off = 0; off < n; off++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const p = A[i], q = B[(i + off) % n];
        sum += Math.hypot(p[0] - q[0], p[1] - q[1]);
      }
      const err = sum / n;
      if (err < best.err) best = { err, offset: off, reversed };
    }
  }
  return best;
}

function centre(pts) {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
}

/* ---------- main ---------- */

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const selfCheck = argv.includes("--self-check");
const wantClassics = argv.includes("--classics");
const sourceIdx = argv.indexOf("--source");
const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : null;
const positional = argv.filter((a, i) =>
  !a.startsWith("--") && !(sourceIdx >= 0 && i === sourceIdx + 1));

const geo = await loadSource(sourceFile);
const features = new Map(geo.features.map((f) => [f.properties.id, f]));

if (selfCheck) {
  // The 16 classics ship alongside the 24 season rounds, so
  // self-check must resolve feature ids through BOTH maps — COMMITTED alone
  // silently skipped every classic with "no upstream feature".
  const KNOWN = { ...COMMITTED, ...CLASSICS };
  const ids = positional.length ? positional : Object.keys(KNOWN);
  const committed = await loadCommitted();
  let worst = 0, failures = 0;
  for (const gameId of ids) {
    const featureId = KNOWN[gameId];
    const feature = featureId && features.get(featureId);
    const have = committed[gameId];
    if (!feature || !have) {
      console.log(`SKIP ${gameId}: no ${!feature ? "upstream feature" : "committed entry"}`);
      continue;
    }
    const made = project(feature.geometry.coordinates);
    const cmp = meanError(made.pts, have.pts);
    // 2 m is the agreed bar: comfortably above observed digitisation noise
    // (0.4-1.1 m) and far below any real projection mistake, which lands in the
    // hundreds of metres.
    const ok = cmp.err <= 2;
    if (!ok) failures++;
    worst = Math.max(worst, cmp.err);
    console.log(
      `${ok ? "OK  " : "FAIL"} ${gameId.padEnd(13)} err=${cmp.err.toFixed(2)} m  ` +
      `pts ${made.pts.length}/${have.pts.length}  len ${made.len}/${have.len}` +
      `${cmp.reversed ? "  (stored reversed)" : ""}`);
  }
  console.log(`\nworst ${worst.toFixed(2)} m across ${ids.length} circuit(s); ${failures} over the 2 m bar`);
  process.exit(failures ? 1 : 0);
}

const wanted = wantClassics
  ? Object.entries(CLASSICS)
  : positional.map((arg) => {
    const [gameId, featureId] = arg.split(":");
    if (!featureId) throw new Error(`expected <gameId>:<featureId>, got "${arg}"`);
    return [gameId, featureId];
  });

if (!wanted.length) {
  console.error("nothing to do — pass --self-check, --classics, or <gameId>:<featureId> pairs");
  process.exit(2);
}

for (const [gameId, featureId] of wanted) {
  const feature = features.get(featureId);
  if (!feature) throw new Error(`upstream has no feature "${featureId}" (for ${gameId})`);
  const entry = project(feature.geometry.coordinates);
  if (!asJson) {
    const p = feature.properties;
    // The winding tells the def author whether `reverse` is needed: compare it
    // against the circuit's real racing direction.
    const winding = signedArea(entry.pts) > 0 ? "CCW" : "CW";
    console.log(`    // ${p.Name} — ${p.Location}. Upstream ${featureId}, ` +
      `stated ${p.length} m, projected ${entry.len} m, trace winding ${winding}.`);
  }
  console.log(emit(gameId, entry, asJson));
}
