#!/usr/bin/env node
// @doc Fleet audit: turns[] on curvature peaks, bankZones and corner-labelled scenery kits on the corner they name.
// @doc Fleet audit of corner-anchored circuit data: turns[] vs curvature peaks, bankZones vs their named turn, corner-labelled scenery windows vs the built apex (offset metres + outside side).
// @skill survey-track
//
// The defect class (audit 2026-11-09, W5): a circuit's start line moves, or
// control points are added, and the numbers that were tuned against the OLD
// centreline stay put. Each lands on a real piece of road — just the wrong
// one — so nothing throws and verify-track prints OK. This tool reads what the
// BUILD does with each number and compares it with the corner it claims:
//
//   turns   every def.turns[i] (racing frame) against the nearest local peak
//           of smoothed |curvature| on the built centreline (metres).
//   banks   every bankZone, resolved the way TrackMesh.bankingProfile does
//           (`turn:` straight off the table; `frac:` + _sceneryShift, lap
//           mirror, re-seat when it lands on a straight > 60 m from an apex),
//           against the corner its `turn:` or trailing comment names.
//   kits    every scenery(api) placement whose call line, an id string, or the
//           comment block above it names a corner (T5, Turn 5, "the final
//           corner", or a named corner from tools/track/corner-names/<id>.json):
//           the built window (engine frame, after transformSceneryApi) must
//           lie within KIT_M of that corner's apex; trackside barriers/run-off
//           (tyre wall, gravel, run-off apron) must stand on the OUTSIDE.
//
// Usage:
//   node tools/track/corner-frames.cjs [<id>...]        # offenders table (all circuits by default)
//   node tools/track/corner-frames.cjs <id> --all-rows  # every measured row, not just offenders
//   node tools/track/corner-frames.cjs --json           # machine-readable
//   node tools/track/corner-frames.cjs --md             # Markdown table (PR bodies)
//   node tools/track/corner-frames.cjs --baseline       # print the baseline JSON for tests/data/corner-frames-baseline.json
//
// No browser. ~1-3 s per circuit (a full headless build, for the scenery capture).
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const TURN_M = 12;     // a curated apex within this of a curvature peak is "on" it
const BANK_M = 60;     // a bank zone centre within this of its named apex
const KIT_M = 60;      // a corner kit's window within this of its corner's apex
const PEAK_K = 0.004;  // rad/m: smoothed |k| below this is not a corner (BANK_STRAIGHT_K)
// Named corners, one file per circuit (tools/track/corner-names/<id>.json:
// { "why": "...", "names": { "Adelaide": 6 } }, turn numbers 1-based into THIS
// def's turns[]) — one file each so two circuit PRs never conflict.
const NAMES_DIR = path.join(__dirname, "corner-names");
function namesFor(id) {
  const f = path.join(NAMES_DIR, id + ".json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")).names || {}) : {};
}

const wrap01 = (v) => ((v % 1) + 1) % 1;
const lapGap = (a, b) => { const d = Math.abs(wrap01(a) - wrap01(b)); return d > 0.5 ? 1 - d : d; };
// signed a - b on the circle, in (-0.5, 0.5]
const lapDelta = (a, b) => { let d = wrap01(a) - wrap01(b); if (d > 0.5) d -= 1; if (d <= -0.5) d += 1; return d; };

function smoothedCurv(track, halfM) {
  const n = track.n, ds = track.total / n, w = Math.max(1, Math.round(halfM / ds));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -w; j <= w; j++) s += track.curv[(i + j + n) % n];
    out[i] = s / (2 * w + 1);
  }
  return out;
}

// Local maxima of |k| smoothed over ±8 m (|k| BEFORE the average, so an
// S-bend's two apexes both register instead of cancelling).
function peaksOf(track) {
  const n = track.n, ds = track.total / n, w = Math.max(1, Math.round(8 / ds));
  const a = new Float64Array(n), peaks = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -w; j <= w; j++) s += Math.abs(track.curv[(i + j + n) % n]);
    a[i] = s / (2 * w + 1);
  }
  for (let i = 0; i < n; i++) {
    if (a[i] >= a[(i - 1 + n) % n] && a[i] > a[(i + 1) % n] && a[i] > PEAK_K) peaks.push({ f: i / n, k: track.curv[i] });
  }
  return peaks;
}

// ---------------------------------------------------------------- labels
// A corner reference in a piece of text, as 1-based turn numbers.
function cornersIn(text, def, names) {
  const out = new Set();
  const nT = (def.turns || []).length;
  const add = (t) => { if (t >= 1 && t <= nT) out.add(t); };
  // T5, T2/3, T1-T3, Turn 5, Turns 9-10
  const re = /\b(?:T|Turns?\s+)(\d{1,2})(?:\s*(?:[/-]|–|\s*-\s*T?)\s*T?(\d{1,2}))?\b/g;
  let m;
  while ((m = re.exec(text))) {
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (b >= a && b - a <= 4) for (let t = a; t <= b; t++) add(t); else add(a);
  }
  if (/\b(?:final|last)\s+(?:corner|turn|bend|right|left|hairpin|chicane)\b/i.test(text)) add(nT);
  for (const [name, t] of Object.entries(names || {})) {
    const turns = Array.isArray(t) ? t : [t];
    const nre = new RegExp("(^|[^\\p{L}])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\p{L}])", "iu");
    if (nre.test(text)) turns.forEach(add);
  }
  return [...out].sort((a, b) => a - b);
}

// Labelling of a scenery file: line -> { text, group }. A code line is
// labelled by its OWN trailing comment, else by the FIRST line of the comment
// block heading the code block it sits in (a heading like "// 15. s 0.80 —
// TURN 8"). Prose further down a comment block is not a label: it mentions
// other corners in passing ("not the T3-T4 leg", "real: footbridge at T7").
// `group` is the line the label came from, so a headed block is measured as
// ONE window — the kit — and a trailing-comment line as its own.
function lineLabels(src) {
  const lines = src.split("\n"), lab = new Array(lines.length + 1).fill(null);
  let head = null, headLn = 0, inCode = false, inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { head = null; inCode = false; inBlock = false; continue; }
    if (t.startsWith("//") || t.startsWith("/*") || (t.startsWith("*") && inBlock)) {
      if (inCode || !inBlock) { head = t; headLn = i + 1; inCode = false; }
      inBlock = true;
      continue;
    }
    inBlock = false; inCode = true;
    const c = lines[i].indexOf("//");
    const own = c >= 0 ? lines[i].slice(c) : "";
    lab[i + 1] = { own, code: c >= 0 ? lines[i].slice(0, c) : lines[i], head, headLn };
  }
  return lab;
}

// ---------------------------------------------------------------- scenery capture
const K_FNS = ["place", "prop", "backdrop", "groundPlane", "anchor", "pine", "tree", "palm", "conifer", "building",
  "house", "motorhome", "tower", "billboard", "marshalPost", "bush", "signBoard", "ferrisWheel", "floodMast",
  "runoffApron", "cameraTower", "broadcastCompound", "waterSurface", "cypress", "stonePine", "broadleafFall",
  "acacia", "plane"];
const S_FNS = ["grandstand", "grandstandEx"];
const R_FNS = ["wall", "fence", "guardrail", "tyreWall", "hedge", "forestEdge", "cityFront", "recordBarrier",
  "concreteCanyon", "bankedKerbStrip", "bowlSeatWall", "pastelStreetRow", "spectatorHill",
  "sponsorHoarding", "waterBand", "bleacher", "scaffoldStand", "terrace", "tieredBowl"];
// Furniture that belongs on the outside of the corner it is named for.
const OUTSIDE = new Set(["tyreWall", "runoffApron", "gravel"]);

function captureScenery(Tracks, def, nodes) {
  const TS = Tracks._vmContext.TrackSpace;
  const calls = [];
  const fnSrc = Tracks._vmContext.TrackScenery && Tracks._vmContext.TrackScenery[def.id];
  if (!fnSrc) return calls;
  const tag = "js/circuits/scenery/" + def.id + ".js:";
  const frames = () => {
    const st = String(new Error().stack).split("\n");
    const out = [];
    for (const l of st) {
      const i = l.indexOf(tag);
      if (i >= 0) out.push(+l.slice(i + tag.length).split(":")[0]);
    }
    return out;
  };
  const n = nodes;
  const fr = (k) => wrap01(TS.sceneryNode(def, k, n) / n);
  const sideOf = (side) => (def.reverse ? -1 : 1) * (side < 0 ? -1 : side > 0 ? 1 : 0);
  def.scenery = function (api) {
    const w = Object.assign({}, api);
    const rec = (name, a, b, side, args) => {
      const ids = args.filter((x) => typeof x === "string").join(" ");
      calls.push({ name, a, b, side, lines: frames(), ids });
    };
    for (const nm of K_FNS) if (typeof api[nm] === "function")
      w[nm] = function (k, side, ...r) { if (Number.isFinite(k)) { const f = fr(k); rec(nm, f, f, Number.isFinite(side) ? sideOf(side) : 0, r); } return api[nm].apply(this, arguments); };
    if (typeof api.bakedModel === "function")
      w.bakedModel = function (id, k, side, ...r) { if (Number.isFinite(k)) { const f = fr(k); rec("bakedModel", f, f, sideOf(side), [id, ...r]); } return api.bakedModel.apply(this, arguments); };
    for (const nm of S_FNS) if (typeof api[nm] === "function")
      w[nm] = function (s, side, ...r) { if (Number.isFinite(s)) { const f = TS.sceneryFrac(def, s); rec(nm, f, f, sideOf(side), r); } return api[nm].apply(this, arguments); };
    for (const nm of R_FNS) if (typeof api[nm] === "function")
      w[nm] = function (s0, s1, side, ...r) {
        if (Number.isFinite(s0) && Number.isFinite(s1)) {
          const g = TS.sceneryRange(def, s0, s1);
          rec(nm, g.s0, g.s1, sideOf(side), r);
        }
        return api[nm].apply(this, arguments);
      };
    if (typeof api.gantry === "function")
      w.gantry = function (s, ...r) { if (Number.isFinite(s)) { const f = TS.sceneryFrac(def, s); rec("gantry", f, f, 0, r); } return api.gantry.apply(this, arguments); };
    if (typeof api.groundPatch === "function")
      w.groundPatch = function (k, side, ...r) {
        if (Number.isFinite(k)) {
          const shift = Math.round(TS.sceneryOriginDelta(def) * n);
          const f = wrap01((Math.round(k) + shift) / n);
          const mat = r.find((x) => typeof x === "string") || "";
          rec(/gravel|sand/i.test(mat) ? "gravel" : "groundPatch", f, f, side < 0 ? -1 : side > 0 ? 1 : 0, r);
        }
        return api.groundPatch.apply(this, arguments);
      };
    return fnSrc.call(this, w);
  };
  try { Tracks.build(def); } finally { delete def.scenery; }
  return calls;
}

// ---------------------------------------------------------------- measure
function measure(Tracks, id) {
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error("unknown circuit " + id);
  const track = Tracks.buildCenterline(def, { line: false });
  const n = track.n, L = track.total;
  const ksm = smoothedCurv(track, 12);
  const peaks = peaksOf(track);
  const turns = def.turns || [];
  const names = namesFor(id);
  const src = fs.readFileSync(path.join(ROOT, "js/circuits", id + ".js"), "utf8");
  const rows = [];

  // turns ----------------------------------------------------------
  turns.forEach((t, i) => {
    let best = null;
    for (const p of peaks) { const d = lapGap(p.f, t); if (!best || d < best.d) best = { d, p }; }
    const m = best ? best.d * L : Infinity;
    rows.push({ circuit: id, kind: "turn", key: "T" + (i + 1), offsetM: Math.round(m),
      bad: m > TURN_M, detail: `turns[${i}]=${t} ${best ? (lapDelta(t, best.p.f) < 0 ? "before" : "past") + " peak " + best.p.f.toFixed(4) : "no peak"}` });
  });

  // bank zones ------------------------------------------------------
  const zones = def.bankZones || [];
  if (zones.length) {
    // the trailing comment of each zone row, in source order
    const zoneLines = [];
    const bz = src.indexOf("bankZones");
    if (bz >= 0) {
      const tail = src.slice(bz).split("\n");
      for (const l of tail.slice(1)) {
        if (/^\s*\]/.test(l)) break;
        if (/\{\s*(frac|turn)\s*:/.test(l)) zoneLines.push(l);
      }
    }
    const dress = def._sceneryShift || 0;
    const mirror = def.reverse && def.sceneryLapMirror ? -1 : 1;
    const nearestTurn = (f) => { let b = -1, bd = 1; turns.forEach((t, i) => { const d = lapGap(t, f); if (d < bd) { bd = d; b = i; } }); return { t: b + 1, m: bd * L }; };
    const lift = track.bankP && track.bankP.lift;
    zones.forEach((z, i) => {
      const text = zoneLines[i] || "";
      const comment = (text.split("//")[1] || "").trim();
      let centre, claim = [];
      if (Number.isFinite(z.turn)) {
        centre = turns[((Math.round(z.turn) - 1) % turns.length + turns.length) % turns.length];
        claim = [Math.round(z.turn)];
      } else {
        centre = wrap01((z.frac || 0) * mirror + dress);
        claim = cornersIn(comment, def, names);
      }
      // where the BUILT lift actually peaks within the zone's half-width
      let at = centre;
      if (lift) {
        const half = Math.round(((z.widthM || 120) / 2) / (L / n));
        const k0 = Math.round(centre * n);
        let best = -1;
        for (let j = -half * 3; j <= half * 3; j++) { const k = ((k0 + j) % n + n) % n; if (lift[k] > best) { best = lift[k]; at = k / n; } }
      }
      const near = nearestTurn(at);
      let m, bad, detail;
      if (claim.length) {
        m = Math.min(...claim.map((t) => lapGap(turns[t - 1], at) * L));
        bad = m > BANK_M;
        detail = `claims T${claim.join("/")} builds at ${at.toFixed(4)} (nearest T${near.t})`;
      } else {
        m = near.m; bad = m > BANK_M;
        detail = `no claim; builds at ${at.toFixed(4)} nearest T${near.t}`;
      }
      const key = "bank:" + (Number.isFinite(z.turn) ? "turn" + z.turn : "frac" + z.frac);
      rows.push({ circuit: id, kind: "bank", key, offsetM: Math.round(m), bad, detail: detail + (comment ? ` — "${comment}"` : "") });
    });
  }

  // scenery kits ----------------------------------------------------
  const sfile = path.join(ROOT, "js/circuits/scenery", id + ".js");
  if (fs.existsSync(sfile) && turns.length) {
    const labels = lineLabels(fs.readFileSync(sfile, "utf8"));
    const calls = captureScenery(Tracks, def, n);
    const groups = new Map();   // label line -> { corners, calls }
    for (const c of calls) {
      let hit = null;
      for (const ln of c.lines) {   // innermost first
        const l = labels[ln];
        if (!l) continue;
        let cs = cornersIn(l.own, def, names);
        if (cs.length) { hit = { ln, cs, text: l.own }; break; }
        if (l.head) {
          cs = cornersIn(l.head, def, names);
          if (cs.length) { hit = { ln: l.headLn, cs, text: l.head }; break; }
        }
      }
      if (!hit && c.ids) {
        const cs = cornersIn(c.ids.replace(/[-_]/g, " "), def, names);
        if (cs.length) hit = { ln: c.lines[0], cs, text: c.ids };
      }
      if (!hit) continue;
      const key = hit.ln;
      if (!groups.has(key)) groups.set(key, { ln: key, corners: hit.cs, text: hit.text, calls: [] });
      groups.get(key).calls.push(c);
    }
    for (const g of groups.values()) {
      // the window: span of every placement this line made, relative to the
      // nearest claimed apex (so a window straddling s=0 stays one window)
      const apexes = g.corners.map((t) => turns[t - 1]);
      const ref = apexes[0];
      let lo = Infinity, hi = -Infinity;
      for (const c of g.calls) {
        let a = lapDelta(c.a, ref), b = lapDelta(c.b, ref);
        if (b < a) b += 1;   // a wrapped range
        lo = Math.min(lo, a); hi = Math.max(hi, b);
      }
      const dist = (f) => { const d = lapDelta(f, ref); return d < lo ? (lo - d) * L : d > hi ? (d - hi) * L : 0; };
      let m = Infinity, tBest = g.corners[0];
      g.corners.forEach((t, j) => { const d = dist(apexes[j]); if (d < m) { m = d; tBest = t; } });
      // Outside: +k is a LEFT turn, whose outside is the right (+1).
      const kApex = ksm[Math.round(turns[tBest - 1] * n) % n];
      const outside = kApex > 0 ? 1 : -1;
      const text = g.text || "";
      const wantsInside = /\binside\b/i.test(text);
      const sided = g.calls.filter((c) => OUTSIDE.has(c.name) && c.side);
      const inside = !wantsInside && sided.length > 0 && sided.every((c) => c.side === -outside);
      const names2 = [...new Set(g.calls.map((c) => c.name))].join(",");
      const winLo = wrap01(ref + lo), winHi = wrap01(ref + hi);
      let nt = 0, nd = Infinity;
      turns.forEach((t, i) => { const d = dist(t); if (d < nd) { nd = d; nt = i + 1; } });
      rows.push({ circuit: id, kind: "kit", key: `kit:L${g.ln}`, offsetM: Math.round(m), bad: m > KIT_M || inside,
        inside, line: g.ln, label: text,
        detail: `L${g.ln} T${g.corners.join("/")} apex ${turns[tBest - 1].toFixed(4)} window ${winLo.toFixed(4)}-${winHi.toFixed(4)} [${names2}] nearest T${nt} ${Math.round(nd)} m${inside ? " INSIDE" : ""}` });
    }
  }
  return rows;
}

// Stable baseline key for a kit row: the line number moves on every edit, so
// key the baseline by the label text instead (first 60 chars of the source line).
function stableKey(row) {
  if (row.kind !== "kit") return `${row.circuit}|${row.key}`;
  const t = String(row.label || "").replace(/^\/\/\s*/, "").trim().replace(/\s+/g, " ").slice(0, 60);
  return `${row.circuit}|kit:${t}`;
}

function context() {
  return require("./verify-track.cjs").buildContext(null, { quiet: true });
}

function audit(ids, Tracks) {
  Tracks = Tracks || context();
  ids = ids && ids.length ? ids : Tracks.LIST.map((d) => d.id);
  const rows = [];
  for (const id of ids) rows.push(...measure(Tracks, id));
  for (const r of rows) r.stable = stableKey(r);
  return rows;
}

module.exports = { audit, measure, cornersIn, lineLabels, stableKey, context, TURN_M, BANK_M, KIT_M };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const ids = argv.filter((a) => !a.startsWith("--"));
  const rows = audit(ids);
  const show = flags.has("--all-rows") ? rows : rows.filter((r) => r.bad);
  if (flags.has("--baseline")) {
    const out = {};
    for (const r of rows.filter((x) => x.bad).sort((a, b) => a.stable < b.stable ? -1 : 1)) out[r.stable] = r.offsetM;
    console.log(JSON.stringify({
      why: "Shrink-only baseline of corner-frame offenders (tests/unit/corner-frames.test.mjs): stable key -> measured offset m. Delete a row when it is fixed; never add one. Regenerate: node tools/track/corner-frames.cjs --baseline",
      rows: out }, null, 2));
  } else if (flags.has("--json")) {
    console.log(JSON.stringify(show, null, 2));
  } else if (flags.has("--md")) {
    console.log("| circuit | kind | key | offset m | detail |\n|---|---|---|---:|---|");
    for (const r of show) console.log(`| ${r.circuit} | ${r.kind} | ${r.key} | ${r.offsetM} | ${r.detail.replace(/\|/g, "\\|")} |`);
  } else {
    for (const r of show) console.log(`${r.bad ? "BAD" : "ok "} ${r.circuit.padEnd(14)} ${r.kind.padEnd(5)} ${r.key.padEnd(18)} ${String(r.offsetM).padStart(5)} m  ${r.detail}`);
    const by = {};
    for (const r of rows.filter((x) => x.bad)) by[r.kind] = (by[r.kind] || 0) + 1;
    console.log(`\n${rows.filter((x) => x.bad).length} offenders of ${rows.length} rows (${Object.entries(by).map(([k, v]) => k + " " + v).join(", ") || "none"})`);
  }
}
