#!/usr/bin/env node
// @doc Stitches OpenStreetMap `highway=raceway` ways into ONE closed ring for import-circuit-path.mjs.
// @skill new-track
/* Apex 26 — recover a circuit centreline from OpenStreetMap (ODbL-1.0).
 *
 * WHY THIS EXISTS. `tools/track/import-circuit-path.mjs` projects a single
 * closed ring out of `bacinger/f1-circuits`. That file carries exactly 40
 * features and the game ships all 40 (measured 2026-09-14,
 * docs/notes/TRACK-ROSTER-RESEARCH-2026-09-14.md), so the upstream source is
 * exhausted and every further circuit has to come from OSM directly.
 *
 * OSM does not hand you a ring. Circuits are mapped in two shapes:
 *
 *   ONE WAY      Fuji, Okayama, Yeongam — a single `highway=raceway` way that
 *                is the lap, closed or near-closed.
 *   FRAGMENTS    Brands Hatch is 41 ways, one per named corner (`Paddock Hill`,
 *                `Druids Bend`, `Clark Curve`…), tangled with the Indy circuit,
 *                the kart track and a rally stage. Jerez is 25. Zolder 24.
 *
 * For the second shape the lap is a CYCLE in the graph whose nodes are way
 * endpoints. There is usually more than one cycle (an alternate layout, a
 * chicane bypass, the pit lane if it survived the name filter), so the
 * researched lap length is what picks the right one — hence --target being
 * required rather than optional. Silverstone alone yields 22 candidate rings.
 *
 * IS THE OUTPUT ANY GOOD? The gate is to stitch a circuit the game ALREADY
 * ships and diff against its committed, hand-made trace. Measured 2026-09-14,
 * with the shape metric and bar that tests/specs/f1-track-accuracy.spec.js
 * uses on the shipped fleet:
 *
 *   silverstone   5875 m vs committed 5879 (-0.07%)   shapeError 0.0208 / 0.31
 *   zandvoort     4252 m vs committed 4257 (-0.12%)   shapeError 0.0248 / 0.31
 *
 * — an order of magnitude inside the bar, direction correct on both. Re-run
 * that diff before trusting this tool after any change to it.
 *
 * Usage:
 *   node tools/track/stitch-osm-ring.mjs <id> --bbox <s,w,n,e> --target <m> [flags]
 *   node tools/track/stitch-osm-ring.mjs fuji --bbox 35.35,138.91,35.39,138.95 --target 4563
 *
 * Then feed the emitted file to the existing importer, which owns the
 * projection and is the only thing that should:
 *   node tools/track/import-circuit-path.mjs --source artifacts/osm-rings.geojson fuji:fuji
 *
 * Network: Overpass, four mirrors tried in turn (see MIRRORS). --save writes the
 * raw response and --cache replays one, so a stitch is reproducible offline and
 * a review can re-derive the same ring. Never run by the test suite.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFlags } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Tried in order, then round again with a backoff. Overpass mirrors answer a
// busy dispatcher with an HTML error page and HTTP 200, and which mirror is
// healthy changes minute to minute — measured 2026-09-14, private.coffee served
// every query in one session and timed out on all of them twenty minutes later
// while the others were up. One mirror is not a source.
const MIRRORS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

// A caller mistake is one line and exit 1, never a node stack trace. The parse
// happens at module scope (top-level await on the fetch), so there is no main()
// for cli-args' runCli to wrap.
const die = (msg) => { console.error(msg); process.exit(1); };

/** Ways whose NAME says they are not the racing lap: OSM tags kart circuits,
 *  rally stages, drag strips and pit lanes as `highway=raceway` too.
 *
 *  Deliberately NARROW, and it was not always. A bare /pit/ dropped
 *  Silverstone's **National Pit Straight** — which is part of the Grand Prix
 *  lap, between Woodcote and Copse — and the lap stopped being a cycle at all:
 *  15 candidate rings, best 1.741 km against a real 5.891 (measured
 *  2026-09-14). Dropping a real segment breaks the search; keeping a spurious
 *  one only adds a candidate, and --target then rejects it. So the filter
 *  errs toward keeping, and only whole phrases that cannot be a racing corner
 *  are dropped. --keep overrides it entirely. */
const DROP_NAME = /\b(pit ?lane|pit entry|pit exit|kart|karting|kartodrom|rally|autocross|drag ?strip|skid ?pan|paddock|service road|access road|c\.i\.k)\b/i;

/** Endpoint identity, as clusters rather than exact coordinates.
 *
 *  OSM shares a node between connected ways most of the time, and exact
 *  equality was the first thing tried. It is too strict: measured 2026-09-14,
 *  Silverstone's 95 ways left 39 DANGLING ENDS under exact matching and the lap
 *  simply is not a cycle in that graph. The gaps are sub-metre — two mappers
 *  tracing adjoining sections, or a way split without re-using the node.
 *
 *  The slop has to stay far below track width or it welds tarmac that only runs
 *  alongside itself (Brands Hatch's GP loop and Indy circuit, Silverstone's
 *  National and GP layouts), inventing cycles that do not exist. A racing
 *  surface is 10 m+ wide, so the default 1.5 m is two orders inside the hazard
 *  and still closes every gap seen in the candidate set. */
function clusterEndpoints(ways, snapM) {
  const cell = snapM / 111320;          // degrees, longitude-worst-case
  const grid = new Map();
  const idOf = new Map();
  let next = 0;
  const put = (p) => {
    const gx = Math.floor(p.lon / cell), gy = Math.floor(p.lat / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${gx + dx}:${gy + dy}`) || []) {
          if (metres(p, other.p) <= snapM) return other.id;
        }
      }
    }
    const id = next++;
    const k = `${gx}:${gy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ p, id });
    return id;
  };
  for (const w of ways) {
    idOf.set(`${w.id}:a`, put(w.geometry[0]));
    idOf.set(`${w.id}:b`, put(w.geometry[w.geometry.length - 1]));
  }
  return idOf;
}

const R = 6378137;
function metres(a, b) {
  const kx = Math.cos((a.lat * Math.PI) / 180) * ((Math.PI / 180) * R);
  const kz = (Math.PI / 180) * R;
  return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * kz);
}
const length = (geom) => geom.reduce((t, p, i) => (i ? t + metres(geom[i - 1], p) : 0), 0);

/* ---------- source ---------- */

async function fetchWays(bbox, cacheFile, saveTo) {
  if (cacheFile) return JSON.parse(await fs.readFile(cacheFile, "utf8"));
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:120];way["highway"="raceway"](${s},${w},${n},${e});out geom;`;
  const tried = [];
  for (let round = 0; round < 2; round++) {
    for (const url of MIRRORS) {
      let text;
      try {
        // The mirrors rate-limit anonymous clients and say so in the body, not
        // the status: "Please include a meaningful User-Agent string".
        const res = await fetch(url, {
          method: "POST",
          body: query,
          headers: { "User-Agent": "apex26-stitch-osm-ring (github.com/brycejmurrin/f1-game)" },
        });
        text = await res.text();
      } catch (e) {
        tried.push(`${new URL(url).host}: ${e.message}`);
        continue;
      }
      // A busy dispatcher returns an HTML error page with HTTP 200, so a status
      // check is not enough to notice.
      if (!text.startsWith("{")) {
        tried.push(`${new URL(url).host}: ${(text.match(/Error[^<]*/) || ["non-JSON response"])[0].trim()}`);
        continue;
      }
      if (saveTo) {
        await fs.mkdir(path.dirname(saveTo), { recursive: true });
        await fs.writeFile(saveTo, text);
      }
      return JSON.parse(text);
    }
    if (round === 0) await new Promise((r) => setTimeout(r, 5000));
  }
  die(`every Overpass mirror refused (two rounds):\n  ${tried.join("\n  ")}\n` +
    `  retry later, or pass --cache <file> with a saved response.`);
}

/* ---------- the cycle search ---------- */

/** Every simple cycle reachable from `start`, as an ordered list of ways.
 *  Bounded by length (a cycle far longer than the target cannot be the lap) and
 *  by edge count, because the raw search over a 41-way graph is exponential. */
function cyclesFrom(adj, start, maxLen, maxEdges) {
  const found = [];
  const walk = (node, usedIds, chain, dist) => {
    if (dist > maxLen || chain.length > maxEdges) return;
    for (const edge of adj.get(node) || []) {
      if (usedIds.has(edge.id)) continue;
      const next = dist + edge.len;
      if (edge.to === start && chain.length >= 2) { found.push({ len: next, chain: [...chain, edge] }); continue; }
      usedIds.add(edge.id);
      walk(edge.to, usedIds, [...chain, edge], next);
      usedIds.delete(edge.id);
    }
  };
  walk(start, new Set(), [], 0);
  return found;
}

/** Concatenate a cycle's ways into one vertex list, flipping each way whose
 *  stored direction runs against the walk. Shared endpoints are de-duplicated
 *  so the seam does not leave a zero-length segment. */
function ringFromChain(chain, snapM) {
  const pts = [];
  for (const edge of chain) {
    const geom = edge.forward ? edge.geom : [...edge.geom].reverse();
    for (const p of geom) {
      const last = pts[pts.length - 1];
      // Snapped joins meet within snapM rather than exactly, so dedupe on the
      // same tolerance the graph was built with or every seam leaves a stub.
      if (last && metres(last, p) <= snapM) continue;
      pts.push(p);
    }
  }
  return pts;
}

/* ---------- shaping ---------- */

/** Ramer-Douglas-Peucker. Decimation, NOT even resampling: the shipped traces
 *  are 80-150 points with 8-389 m spacing (mean 41-53), i.e. dense through
 *  corners and sparse down straights. Resampling at a fixed interval would
 *  flatten exactly the corners the geometry is for. RDP reproduces the shipped
 *  distribution because it keeps a vertex in proportion to how much shape it
 *  carries. */
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  let worst = 0, at = 0;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicular(pts[i], a, b);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [a, b];
  return [...rdp(pts.slice(0, at + 1), tol).slice(0, -1), ...rdp(pts.slice(at), tol)];
}

function perpendicular(p, a, b) {
  const kx = Math.cos((a.lat * Math.PI) / 180) * ((Math.PI / 180) * R), kz = (Math.PI / 180) * R;
  const px = (p.lon - a.lon) * kx, pz = (p.lat - a.lat) * kz;
  const bx = (b.lon - a.lon) * kx, bz = (b.lat - a.lat) * kz;
  const l2 = bx * bx + bz * bz;
  if (l2 === 0) return Math.hypot(px, pz);
  const t = Math.max(0, Math.min(1, (px * bx + pz * bz) / l2));
  return Math.hypot(px - t * bx, pz - t * bz);
}

/** Binary-search an RDP tolerance that lands the vertex count in [lo, hi]. */
function decimateTo(pts, lo, hi) {
  if (pts.length <= hi) return pts;
  let a = 0.1, b = 40, best = pts;
  for (let i = 0; i < 40; i++) {
    const mid = (a + b) / 2;
    const out = rdp(pts, mid);
    if (out.length > hi) a = mid; else { best = out; if (out.length >= lo) return out; b = mid; }
  }
  return best;
}

/** Rotate the ring so index 0 sits mid-way along its longest straight.
 *
 *  docs/tracks/START-LINES.md established the convention: a start line is
 *  always on a straight (mean |curvature| over the 120 m centred on s=0 must be
 *  <= 0.004 rad/m), and 39 of the 40 shipped traces are dead straight at their
 *  own vertex 0. The longest straight is the pit straight on every circuit in
 *  the current candidate set, so this is a good default — but it IS a guess,
 *  and the report says so. Pass --start lat,lon to place it exactly. */
function rotateToStraight(pts, start) {
  const n = pts.length;
  let at = 0;
  if (start) {
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const d = metres(pts[i], { lat: start[0], lon: start[1] });
      if (d < best) { best = d; at = i; }
    }
  } else {
    // Longest run of consecutive near-collinear vertices, then its midpoint.
    let runStart = 0, bestLen = -1;
    const straight = (i) => bend(pts, i) < 0.02;   // rad per vertex
    for (let i = 0; i < n; i++) {
      if (!straight(i)) { runStart = i + 1; continue; }
      const runLen = i - runStart + 1;
      if (runLen > bestLen) { bestLen = runLen; at = runStart + Math.floor(runLen / 2); }
    }
    at %= n;
  }
  return [...pts.slice(at), ...pts.slice(0, at)];
}

function bend(pts, i) {
  const n = pts.length;
  const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
  const h1 = Math.atan2(c.lat - b.lat, c.lon - b.lon), h0 = Math.atan2(b.lat - a.lat, b.lon - a.lon);
  return Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
}

/* ---------- main ---------- */

const argv = process.argv.slice(2);
// Flags that consume the next token in the space form (`--target 4563`); the
// positional id must not be read out of one of those slots.
const VALUED = ["--bbox", "--target", "--name", "--location", "--start", "--out",
  "--cache", "--save", "--keep", "--min-pts", "--max-pts", "--max-edges", "--tolerance", "--snap"];
const flags = parseFlags(argv, [...VALUED, "--multi-start", "--json"]);
const id = argv.find((a, i) => !a.startsWith("-") && !(i > 0 && VALUED.includes(argv[i - 1])));

if (!id) die("usage: stitch-osm-ring.mjs <id> --bbox <s,w,n,e> --target <metres>");
const bboxArg = flags.list("--bbox").map(Number);
const target = Number(flags.flag("--target", ""));
if (!Number.isFinite(target) || target <= 0) die("--target <metres> is required (the researched lap length; it is what picks the right cycle)");
if (bboxArg.length !== 4 && !flags.has("--cache")) die("--bbox <south,west,north,east> is required unless --cache is given");

const keep = flags.flag("--keep", "") ? new RegExp(flags.flag("--keep", ""), "i") : null;
const minPts = Number(flags.flag("--min-pts", "80"));
const maxPts = Number(flags.flag("--max-pts", "150"));
const maxEdges = Number(flags.flag("--max-edges", "24"));
const snap = Number(flags.flag("--snap", "1.5"));
// How far the winning ring may sit from the researched length before this tool
// refuses to vouch for it. 2% is roughly three times the -0.3..-0.6% seen on
// the clean circuits and still far inside the -6% that means "wrong layout".
const tolerance = Number(flags.flag("--tolerance", "0.02"));
const outFile = flags.flag("--out", path.join(ROOT, "artifacts/osm-rings.geojson"));

const data = await fetchWays(bboxArg, flags.flag("--cache", null), flags.flag("--save", null));
let all = (data.elements || []).filter((w) => w.type === "way" && Array.isArray(w.geometry) && w.geometry.length > 1);
// The bbox is applied to the LOADED ways too, not just the query. A --cache
// file may hold several circuits (one Overpass call can cover many bboxes), and
// without this their ways all land in one graph — disconnected, so the cycle
// search is safe, but the single-way scan would happily pick another circuit's
// ring if its length sat closer to --target.
if (bboxArg.length === 4) {
  const [s0, w0, n0, e0] = bboxArg;
  all = all.filter((w) => w.geometry.some((p) => p.lat >= s0 && p.lat <= n0 && p.lon >= w0 && p.lon <= e0));
}
const ways = all.filter((w) => {
  const name = (w.tags && w.tags.name) || "";
  return keep ? keep.test(name) : !DROP_NAME.test(name);
});
if (!ways.length) die(`no raceway ways survived the name filter in that bbox (${all.length} before filtering)`);

/* Candidate 1: a single way that is already the lap. Yeongam's `YEONGAM F1
 * Track` is 5.596 km with an 8.1 m endpoint gap — a ring in all but the closing
 * vertex — so "closed" has to mean "closes within a slack", not exact. */
const candidates = [];
for (const w of ways) {
  const len = length(w.geometry);
  const gap = metres(w.geometry[0], w.geometry[w.geometry.length - 1]);
  if (gap <= Math.max(25, len * 0.01)) candidates.push({ how: `single way ${w.id}`, len, pts: w.geometry.slice() });
}

/* Candidate 2: cycles in the endpoint graph. */
const nodeId = clusterEndpoints(ways, snap);
const adj = new Map();
for (const w of ways) {
  const a = nodeId.get(`${w.id}:a`), b = nodeId.get(`${w.id}:b`);
  if (a === b) continue;                       // already handled as a single ring
  const len = length(w.geometry);
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push({ id: w.id, to: b, len, geom: w.geometry, forward: true });
  adj.get(b).push({ id: w.id, to: a, len, geom: w.geometry, forward: false });
}
// A single start node misses the lap whenever that node is not ON the lap —
// measured at Brands Hatch, where the highest-degree node belongs to the Indy
// loop and the naive search found no cycle at all. --multi-start pays for
// correctness there with a slower search.
const starts = flags.has("--multi-start")
  ? [...adj.keys()]
  : [...adj.keys()].sort((a, b) => adj.get(b).length - adj.get(a).length).slice(0, 1);
const seen = new Set();
for (const s of starts) {
  for (const c of cyclesFrom(adj, s, target * 1.6, maxEdges)) {
    const sig = c.chain.map((e) => e.id).sort((x, y) => x - y).join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    candidates.push({ how: `${c.chain.length}-way cycle`, len: c.len, pts: ringFromChain(c.chain, snap) });
  }
}

if (!candidates.length) {
  console.error(`no ring found for ${id}: ${ways.length} ways, ${adj.size} endpoint nodes.`);
  console.error("  try --multi-start, a wider --bbox, or --keep to override the name filter.");
  process.exit(1);
}

candidates.sort((a, b) => Math.abs(a.len - target) - Math.abs(b.len - target));
const win = candidates[0];
const errFrac = (win.len - target) / target;

/* Shape it into the importer's contract. */
let pts = win.pts;
if (metres(pts[0], pts[pts.length - 1]) < 1) pts = pts.slice(0, -1);   // drop an existing closing vertex first
pts = decimateTo(pts, minPts, maxPts);
pts = rotateToStraight(pts, flags.flag("--start", null) ? flags.list("--start").map(Number) : null);
// import-circuit-path.mjs:84 drops the closing vertex only when it is within
// 1 m of the first, and every index shifts if it does not. Close it exactly.
pts.push({ lat: pts[0].lat, lon: pts[0].lon });

const coords = pts.map((p) => [Number(p.lon.toFixed(7)), Number(p.lat.toFixed(7))]);
const feature = {
  type: "Feature",
  properties: {
    id,
    Name: flags.flag("--name", id),
    Location: flags.flag("--location", ""),
    length: Math.round(win.len),
    source: "OpenStreetMap (ODbL-1.0) via tools/track/stitch-osm-ring.mjs",
  },
  geometry: { type: "LineString", coordinates: coords },
};

/* Merge into the output collection so a run per circuit accumulates one file. */
let out = { type: "FeatureCollection", features: [] };
try { out = JSON.parse(await fs.readFile(outFile, "utf8")); } catch { /* first run */ }
out.features = out.features.filter((f) => f.properties.id !== id).concat(feature);
out.features.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(out, null, 1) + "\n");

if (flags.has("--json")) {
  console.log(JSON.stringify({ id, len: Math.round(win.len), target, errFrac, pts: coords.length, how: win.how }));
} else {
  const pct = (errFrac * 100).toFixed(1);
  console.log(`${Math.abs(errFrac) <= tolerance ? "OK  " : "WARN"} ${id}: ${win.how}, ` +
    `${(win.len / 1000).toFixed(3)} km vs researched ${(target / 1000).toFixed(3)} (${errFrac > 0 ? "+" : ""}${pct}%), ` +
    `${coords.length - 1} pts after decimation, ${candidates.length} candidate ring(s)`);
  if (!flags.flag("--start", null)) {
    console.log(`     v0 placed mid longest straight (a GUESS — pass --start lat,lon to pin the real line, ` +
      `or snap later with tools/track/startline-snap.cjs)`);
  }
  console.log(`     wrote ${path.relative(ROOT, outFile)} — next: ` +
    `node tools/track/import-circuit-path.mjs --source ${path.relative(ROOT, outFile)} ${id}:${id}`);
}
if (Math.abs(errFrac) > tolerance) {
  console.error(`     ${(Math.abs(errFrac) * 100).toFixed(1)}% off the researched length is outside the ${(tolerance * 100).toFixed(0)}% bar — ` +
    `the winning cycle is probably a different LAYOUT (a chicane variant, a short circuit), not a bad stitch.`);
  process.exit(1);
}
