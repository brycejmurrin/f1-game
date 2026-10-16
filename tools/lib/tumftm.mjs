// @doc Pure TUMFTM racetrack-database CSV parse/decimate → track-designer design + LGPL attribution envelope.
// @skill new-track
/* Apex 26 — pure TUMFTM racetrack-database → track-designer conversion.
 *
 * Upstream: https://github.com/TUMFTM/racetrack-database (LGPL-3.0).
 * Centreline CSV: x_m, y_m, w_tr_right_m, w_tr_left_m
 * Raceline CSV:   x_m, y_m  (minimum-curvature line, same sample count)
 *
 * Maps into the designer's closed control loop (js/editor/custom-tracks.js):
 * pts on the 0.25 m lattice, baseHW + optional hwZones, theme id, name.
 * Does NOT touch game.js / TrackLine / AiDrive — the shipped bake already
 * relaxes toward minimum curvature (docs/notes/RACING-LINE-RESEARCH.md).
 *
 * License: this module is Apex code. Converted geometry inherits LGPL-3.0
 * obligations from upstream — do not commit derived CSV/designs without
 * the attribution envelope this file attaches. See docs/notes/TUMFTM-RACETRACK-DATABASE.md.
 */
"use strict";

/** Upstream stem → Apex roster id (or null when Apex has no matching circuit). */
export const CATALOG = Object.freeze([
  { tumftm: "Austin",         apexId: "cota",          status: "overlap", theme: "tilke",     label: "CIRCUIT OF THE AMERICAS" },
  { tumftm: "BrandsHatch",    apexId: "brands_hatch",  status: "overlap", theme: "parkland",  label: "BRANDS HATCH" },
  { tumftm: "Budapest",       apexId: "hungaroring",   status: "overlap", theme: "parkland",  label: "HUNGARORING" },
  { tumftm: "Catalunya",      apexId: "catalunya",     status: "overlap", theme: "tilke",     label: "CIRCUIT DE BARCELONA-CATALUNYA" },
  { tumftm: "Hockenheim",     apexId: "hockenheim",    status: "overlap", theme: "parkland",  label: "HOCKENHEIMRING" },
  { tumftm: "IMS",            apexId: "indianapolis",  status: "overlap", theme: "tilke",     label: "INDIANAPOLIS MOTOR SPEEDWAY" },
  { tumftm: "Melbourne",      apexId: "albert_park",   status: "overlap", theme: "parkland",  label: "ALBERT PARK" },
  { tumftm: "MexicoCity",     apexId: "mexico",        status: "overlap", theme: "harbour",   label: "AUTODROMO HERMANOS RODRIGUEZ" },
  { tumftm: "Montreal",       apexId: "montreal",      status: "overlap", theme: "harbour",   label: "CIRCUIT GILLES VILLENEUVE" },
  { tumftm: "Monza",          apexId: "monza",         status: "overlap", theme: "parkland",  label: "AUTODROMO NAZIONALE MONZA" },
  { tumftm: "MoscowRaceway",  apexId: null,            status: "missing", theme: "parkland",  label: "MOSCOW RACEWAY" },
  { tumftm: "Norisring",      apexId: null,            status: "missing", theme: "harbour",   label: "NORISRING" },
  { tumftm: "Nuerburgring",   apexId: "nurburgring",   status: "layout-diff", theme: "alpine", label: "NUERBURGRING (DTM)" },
  { tumftm: "Oschersleben",   apexId: null,            status: "missing", theme: "parkland",  label: "MOTOPARK OSCHERSLEBEN" },
  { tumftm: "Sakhir",         apexId: "bahrain",       status: "overlap", theme: "oasis",     label: "BAHRAIN INTERNATIONAL CIRCUIT" },
  { tumftm: "SaoPaulo",       apexId: "interlagos",    status: "overlap", theme: "parkland",  label: "INTERLAGOS" },
  { tumftm: "Sepang",         apexId: "sepang",        status: "overlap", theme: "tilke",     label: "SEPANG" },
  { tumftm: "Shanghai",       apexId: "shanghai",      status: "overlap", theme: "tilke",     label: "SHANGHAI INTERNATIONAL CIRCUIT" },
  { tumftm: "Silverstone",    apexId: "silverstone",   status: "overlap", theme: "parkland",  label: "SILVERSTONE" },
  { tumftm: "Sochi",          apexId: "sochi",         status: "overlap", theme: "harbour",   label: "SOCHI AUTODROM" },
  { tumftm: "Spa",            apexId: "spa",           status: "overlap", theme: "alpine",    label: "SPA-FRANCORCHAMPS" },
  { tumftm: "Spielberg",      apexId: "redbull",       status: "overlap", theme: "alpine",    label: "RED BULL RING" },
  { tumftm: "Suzuka",         apexId: "suzuka",        status: "overlap", theme: "parkland",  label: "SUZUKA" },
  { tumftm: "YasMarina",      apexId: "abudhabi",      status: "overlap", theme: "marina",    label: "YAS MARINA" },
  { tumftm: "Zandvoort",      apexId: "zandvoort",     status: "overlap", theme: "parkland",  label: "ZANDVOORT" },
]);

export const SOURCE_URL = "https://github.com/TUMFTM/racetrack-database";
export const RAW_BASE = "https://raw.githubusercontent.com/TUMFTM/racetrack-database/master";
export const LICENSE = "LGPL-3.0";
export const FILE_FORMAT = "apex26.track";
export const PTS_MAX = 200;
export const PTS_DEFAULT = 160;
export const HW_ZONE_CAP = 16;

const q = (v) => Math.round(v * 4) / 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Look up a catalog row by stem (case-insensitive, ignores underscores/spaces). */
export function catalogEntry(stem) {
  const key = String(stem || "").replace(/[_\s-]/g, "").toLowerCase();
  return CATALOG.find((e) => e.tumftm.toLowerCase() === key) || null;
}

export function missingEntries() {
  return CATALOG.filter((e) => e.status === "missing" || e.status === "layout-diff");
}

/** Parse a TUMFTM track CSV (centreline + widths). Skips # comments and blank lines. */
export function parseTrackCsv(text) {
  if (typeof text !== "string") throw new TypeError("parseTrackCsv: expected string");
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length < 4) continue;
    const x = +parts[0], y = +parts[1], wRight = +parts[2], wLeft = +parts[3];
    if (![x, y, wRight, wLeft].every(Number.isFinite)) continue;
    if (wRight <= 0 || wLeft <= 0) continue;
    rows.push({ x, y, wRight, wLeft });
  }
  if (rows.length < 8) throw new RangeError("parseTrackCsv: need ≥ 8 samples, got " + rows.length);
  return rows;
}

/** Parse a TUMFTM raceline CSV (x_m, y_m). */
export function parseRacelineCsv(text) {
  if (typeof text !== "string") throw new TypeError("parseRacelineCsv: expected string");
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length < 2) continue;
    const x = +parts[0], y = +parts[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    rows.push({ x, y });
  }
  if (rows.length < 8) throw new RangeError("parseRacelineCsv: need ≥ 8 samples, got " + rows.length);
  return rows;
}

/** Closed-loop arc lengths and half-widths (mean of left/right). */
function pathMetrics(rows) {
  const n = rows.length;
  const ds = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = rows[i], b = rows[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    ds[i] = d;
    total += d;
  }
  const s = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { s[i] = acc; acc += ds[i]; }
  const hw = rows.map((r) => (r.wLeft + r.wRight) / 2);
  return { s, ds, total, hw };
}

/** Uniform stride downsample to ≤ maxPts, keeping index 0 (start). */
export function decimate(rows, maxPts = PTS_DEFAULT) {
  const n = rows.length;
  if (n <= maxPts) return rows.slice();
  const step = n / maxPts;
  const out = [];
  const seen = new Set();
  for (let k = 0; k < maxPts; k++) {
    const i = Math.min(n - 1, Math.round(k * step));
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(rows[i]);
  }
  // Always keep the last unique sample so the loop closure gap stays honest.
  if (!seen.has(n - 1)) out.push(rows[n - 1]);
  return out.length > maxPts ? out.slice(0, maxPts) : out;
}

function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Collapse consecutive half-width runs that differ from baseHW into ≤ cap zones. */
export function widthZones(sFracs, hwArr, baseHW, cap = HW_ZONE_CAP) {
  const n = hwArr.length;
  if (n < 2) return [];
  const thresh = 0.35;
  const runs = [];
  let i0 = 0;
  for (let i = 1; i <= n; i++) {
    const same = i < n && Math.abs(hwArr[i] - hwArr[i0]) < thresh;
    if (same) continue;
    const mean = hwArr.slice(i0, i).reduce((a, b) => a + b, 0) / (i - i0);
    if (Math.abs(mean - baseHW) >= thresh) {
      const s0 = sFracs[i0];
      const s1 = sFracs[Math.min(n - 1, i - 1)];
      runs.push({ s0, s1: s1 >= s0 ? s1 : 1, hw: Math.round(clamp(mean, 3, 8) * 10) / 10 });
    }
    i0 = i;
  }
  if (runs.length <= cap) return runs;
  // Merge the smallest deltas into neighbours until under the codec cap.
  const scored = runs.map((r, i) => ({ i, d: Math.abs(r.hw - baseHW) }));
  scored.sort((a, b) => a.d - b.d);
  const drop = new Set(scored.slice(0, runs.length - cap).map((x) => x.i));
  return runs.filter((_, i) => !drop.has(i)).slice(0, cap);
}

/** Stable seed from a string (FNV-1a 32-bit). */
export function seedFrom(str) {
  let h = 0x811c9dc5;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Centreline rows → a designer design object (not yet CustomTracks.sanitize).
 * opts: { name, theme, maxPts, reverse, seed }
 */
export function rowsToDesign(rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length < 8) throw new RangeError("rowsToDesign: need ≥ 8 samples");
  let work = rows.slice();
  if (opts.reverse) work = work.slice().reverse();

  // Recentre on bbox mid (same spirit as import-circuit-path.mjs).
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const r of work) {
    if (r.x < xmin) xmin = r.x; if (r.x > xmax) xmax = r.x;
    if (r.y < ymin) ymin = r.y; if (r.y > ymax) ymax = r.y;
  }
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  work = work.map((r) => ({
    x: r.x - cx,
    y: r.y - cy,
    wLeft: r.wLeft,
    wRight: r.wRight,
  }));

  const slim = decimate(work, opts.maxPts || PTS_DEFAULT);
  const { s, total, hw } = pathMetrics(slim);
  const sFrac = Array.from(s, (v) => (total > 0 ? v / total : 0));
  const baseHW = Math.round(clamp(median(hw), 5, 8) * 10) / 10;
  const pts = slim.map((r) => [q(r.x), q(r.y)]); // designer [x, z] ← TUMFTM [x, y]
  const name = String(opts.name || "TUMFTM CIRCUIT").slice(0, 48);
  const theme = opts.theme || "parkland";
  const seed = Number.isFinite(opts.seed) ? (opts.seed >>> 0) : seedFrom(name + "|" + pts.length);
  const hwZones = widthZones(sFrac, hw, baseHW);
  let lengthM = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    lengthM += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return {
    name,
    seed,
    theme,
    baseHW,
    pts,
    hwZones: hwZones.length ? hwZones : null,
    bankZones: null,
    elevations: null,
    bridges: null,
    turns: [],
    lengthM: Math.round(lengthM),
  };
}

/**
 * Optional raceline → lateral offsets (metres, +right) at each design control
 * point, for offline comparison with TrackLine. Not consumed at runtime.
 */
export function racelineOffsets(designPts, racePts) {
  if (!designPts?.length || !racePts?.length) return null;
  const n = designPts.length;
  const offsets = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = designPts[i];
    const prev = designPts[(i - 1 + n) % n];
    const next = designPts[(i + 1) % n];
    const tx = next[0] - prev[0], tz = next[1] - prev[1];
    const len = Math.hypot(tx, tz) || 1;
    // Right-hand normal in the x/z plane (Apex: +x right along the tangent when looking forward).
    const nx = tz / len, nz = -tx / len;
    let best = Infinity, ox = 0;
    for (const r of racePts) {
      const dx = r.x - p[0], dz = r.y - p[1];
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; ox = dx * nx + dz * nz; }
    }
    offsets[i] = Math.round(ox * 100) / 100;
  }
  return offsets;
}

/** Attribution block every converted envelope must carry. */
export function attribution(entry, extra = {}) {
  return Object.assign({
    source: SOURCE_URL,
    license: LICENSE,
    notice: "Derived from TUMFTM racetrack-database (LGPL-3.0). Centreline GPS from OpenStreetMap (ODbL). Do not redistribute without upstream attribution and LGPL notices.",
    tumftm: entry ? entry.tumftm : null,
    apexId: entry ? entry.apexId : null,
    status: entry ? entry.status : null,
  }, extra);
}

/** Designer file envelope ready for TrackDesigner IMPORT / TrackCodec.fromFile. */
export function fileEnvelope(design, entry, extra = {}) {
  return {
    format: FILE_FORMAT,
    v: 1,
    build: null,
    exportedAt: new Date().toISOString(),
    code: null,
    design,
    attribution: attribution(entry, extra),
  };
}

/** Tiny synthetic oval (for --self-check / unit tests) — NOT upstream data. */
export function syntheticOvalCsv(n = 48, a = 400, b = 250, hw = 7) {
  const lines = ["# x_m,y_m,w_tr_right_m,w_tr_left_m"];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    // Slight outer widen on the "long" sides so hwZones has something to do.
    const w = hw + 0.8 * Math.abs(Math.cos(t));
    lines.push([x.toFixed(6), y.toFixed(6), w.toFixed(3), w.toFixed(3)].join(","));
  }
  return lines.join("\n") + "\n";
}

export function syntheticRacelineCsv(n = 48, a = 400, b = 250, inset = 2) {
  const lines = ["# x_m,y_m"];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    // Bias toward the inside of a CCW oval (negative radial = inside).
    const rScale = 1 - inset / ((a + b) / 2);
    lines.push([(a * rScale * Math.cos(t)).toFixed(6), (b * rScale * Math.sin(t)).toFixed(6)].join(","));
  }
  return lines.join("\n") + "\n";
}
