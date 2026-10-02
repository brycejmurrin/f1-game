#!/usr/bin/env node
// @doc Converts TUMFTM racetrack-database CSV centrelines into track-designer apex26.track envelopes (LGPL-attributed).
// @skill new-track
/* Apex 26 — tumftm-import.mjs
 *
 * Turns the open TUMFTM racetrack-database CSV format into the track designer's
 * import envelope so those layouts can be loaded via TRACK DESIGNER › IMPORT
 * (or dropped into MY CIRCUITS after a save). Does NOT ship upstream geometry
 * in this repo (LGPL-3.0 + OSM ODbL) — fetch or point --source at a local CSV.
 *
 * Racing lines: optional --raceline writes a lateral-offset sidecar for offline
 * comparison with TrackLine.bake. Runtime AI / suggested-line wiring is
 * intentionally NOT done — the shipped bake already relaxes toward minimum
 * curvature (docs/notes/RACING-LINE-RESEARCH.md §TUMFTM), and concurrent AI /
 * assist work should not share those paths.
 *
 * Usage:
 *   node tools/track/tumftm-import.mjs --help
 *   node tools/track/tumftm-import.mjs --list
 *   node tools/track/tumftm-import.mjs --missing
 *   node tools/track/tumftm-import.mjs --self-check
 *   node tools/track/tumftm-import.mjs Norisring --source path/to/Norisring.csv -o artifacts/tumftm/
 *   node tools/track/tumftm-import.mjs Norisring --fetch -o artifacts/tumftm/ --raceline
 *   node tools/track/tumftm-import.mjs --fetch-missing -o artifacts/tumftm/
 *
 * Refs:
 *   https://github.com/TUMFTM/racetrack-database
 *   https://github.com/ivankarez/RacetrackGenerator (mesh reference from the same CSVs)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CATALOG, RAW_BASE, LICENSE, SOURCE_URL,
  catalogEntry, missingEntries,
  parseTrackCsv, parseRacelineCsv,
  rowsToDesign, racelineOffsets, fileEnvelope,
  syntheticOvalCsv, syntheticRacelineCsv,
} from "../lib/tumftm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HELP = `tumftm-import — TUMFTM CSV → Apex track-designer envelope

Usage:
  node tools/track/tumftm-import.mjs --list
  node tools/track/tumftm-import.mjs --missing
  node tools/track/tumftm-import.mjs --self-check
  node tools/track/tumftm-import.mjs <Stem> --source <csv> [-o <dir>]
  node tools/track/tumftm-import.mjs <Stem> --fetch [-o <dir>] [--raceline]
  node tools/track/tumftm-import.mjs --fetch-missing [-o <dir>]

Upstream (${LICENSE}): ${SOURCE_URL}
Converted designs carry an attribution block; do not commit them without it.
Racing-line CSV is optional research output only — not wired into TrackLine/AI.
`;

function parseArgs(argv) {
  const args = { stems: [], out: path.join(ROOT, "artifacts/tumftm"), maxPts: 160, reverse: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--list") args.list = true;
    else if (a === "--missing") args.missing = true;
    else if (a === "--self-check") args.selfCheck = true;
    else if (a === "--fetch") args.fetch = true;
    else if (a === "--fetch-missing") args.fetchMissing = true;
    else if (a === "--raceline") args.raceline = true;
    else if (a === "--reverse") args.reverse = true;
    else if (a === "--json") args.json = true;
    else if (a === "--source" || a === "-s") args.source = argv[++i];
    else if (a === "--out" || a === "-o") args.out = path.resolve(argv[++i]);
    else if (a === "--max-pts") args.maxPts = Math.max(8, Math.min(200, +argv[++i] || 160));
    else if (a === "--theme") args.theme = argv[++i];
    else if (a.startsWith("-")) throw new Error("unknown flag: " + a + " (try --help)");
    else args.stems.push(a);
  }
  return args;
}

function printList(rows) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("TUMFTM", 16), pad("status", 12), pad("apexId", 14), "theme", "  label");
  for (const e of rows) {
    console.log(pad(e.tumftm, 16), pad(e.status, 12), pad(e.apexId || "—", 14), pad(e.theme, 10), e.label);
  }
  console.log(`\n${rows.length} tracks · license ${LICENSE} · ${SOURCE_URL}`);
  console.log("missing/layout-diff = designer-preset candidates Apex does not already ship as that layout.");
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  return res.text();
}

async function loadTrackCsv(stem, args) {
  if (args.source) return fs.readFile(args.source, "utf8");
  if (!args.fetch && !args.fetchMissing) {
    throw new Error(`no --source for ${stem}; pass a local CSV or --fetch (does not commit upstream data)`);
  }
  return fetchText(`${RAW_BASE}/tracks/${stem}.csv`);
}

async function loadRaceCsv(stem, args) {
  if (args.raceSource) return fs.readFile(args.raceSource, "utf8");
  return fetchText(`${RAW_BASE}/racelines/${stem}.csv`);
}

async function convertOne(stem, args) {
  const entry = catalogEntry(stem) || {
    tumftm: stem, apexId: null, status: "unknown", theme: args.theme || "parkland", label: stem,
  };
  const csv = await loadTrackCsv(entry.tumftm, args);
  const rows = parseTrackCsv(csv);
  const design = rowsToDesign(rows, {
    name: entry.label,
    theme: args.theme || entry.theme,
    maxPts: args.maxPts,
    reverse: args.reverse,
  });
  const env = fileEnvelope(design, entry, {
    sampleCount: rows.length,
    controlPoints: design.pts.length,
    lengthM: design.lengthM,
  });

  await fs.mkdir(args.out, { recursive: true });
  const base = path.join(args.out, entry.tumftm);
  const trackPath = base + ".track.json";
  await fs.writeFile(trackPath, JSON.stringify(env, null, 2) + "\n");

  let linePath = null;
  if (args.raceline) {
    try {
      const rcsv = await loadRaceCsv(entry.tumftm, args);
      const race = parseRacelineCsv(rcsv);
      // Raceline is in the same local frame as the track CSV; recentre like the design.
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (const r of rows) {
        if (r.x < xmin) xmin = r.x; if (r.x > xmax) xmax = r.x;
        if (r.y < ymin) ymin = r.y; if (r.y > ymax) ymax = r.y;
      }
      const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
      const racePts = race.map((r) => ({ x: r.x - cx, y: r.y - cy }));
      const offsets = racelineOffsets(design.pts, racePts);
      linePath = base + ".line.json";
      await fs.writeFile(linePath, JSON.stringify({
        attribution: env.attribution,
        note: "Offline lateral offsets (+right m) at designer control points. NOT consumed by TrackLine, AiDrive, or the suggested-line assist — Apex already bakes a min-curvature line at track build.",
        offsets,
      }, null, 2) + "\n");
    } catch (e) {
      console.warn(`raceline skipped for ${entry.tumftm}: ${e.message}`);
    }
  }

  return { entry, design, trackPath, linePath, env };
}

async function selfCheck() {
  const rows = parseTrackCsv(syntheticOvalCsv());
  const design = rowsToDesign(rows, { name: "SYNTHETIC OVAL", theme: "parkland", maxPts: 40 });
  if (design.pts.length < 8 || design.pts.length > 200) throw new Error("pts out of designer bounds");
  if (!(design.baseHW >= 5 && design.baseHW <= 8)) throw new Error("baseHW out of range: " + design.baseHW);
  if (!(design.lengthM > 1000 && design.lengthM < 5000)) throw new Error("length odd: " + design.lengthM);
  const race = parseRacelineCsv(syntheticRacelineCsv());
  const off = racelineOffsets(design.pts, race.map((r) => ({ x: r.x, y: r.y })));
  if (!off || off.length !== design.pts.length) throw new Error("raceline offset length mismatch");
  const env = fileEnvelope(design, { tumftm: "Synthetic", apexId: null, status: "fixture", theme: "parkland" });
  if (env.format !== "apex26.track" || !env.attribution?.license) throw new Error("envelope incomplete");
  console.log("= self-check passed", {
    pts: design.pts.length,
    baseHW: design.baseHW,
    lengthM: design.lengthM,
    hwZones: (design.hwZones || []).length,
    offsetMean: Math.round(off.reduce((a, b) => a + b, 0) / off.length * 100) / 100,
  });
  return 0;
}

async function main(argv) {
  let args;
  try { args = parseArgs(argv); }
  catch (e) { console.error(e.message); console.error(HELP); return 2; }
  if (args.help || argv.length === 0) { console.log(HELP); return argv.length === 0 ? 2 : 0; }
  if (args.list) { printList(CATALOG); return 0; }
  if (args.missing) { printList(missingEntries()); return 0; }
  if (args.selfCheck) return selfCheck();

  const stems = args.fetchMissing
    ? missingEntries().map((e) => e.tumftm)
    : args.stems;
  if (!stems.length) {
    console.error("name a track stem (e.g. Norisring), or use --list / --missing / --fetch-missing");
    return 2;
  }
  if (args.fetchMissing) args.fetch = true;

  const results = [];
  for (const stem of stems) {
    const r = await convertOne(stem, args);
    results.push(r);
    console.log(`wrote ${path.relative(ROOT, r.trackPath)}  (${r.design.pts.length} pts, ${r.design.lengthM} m, theme=${r.design.theme}, status=${r.entry.status})`);
    if (r.linePath) console.log(`wrote ${path.relative(ROOT, r.linePath)}  (offline raceline offsets)`);
  }
  if (args.json) console.log(JSON.stringify(results.map((r) => ({
    tumftm: r.entry.tumftm, status: r.entry.status, apexId: r.entry.apexId,
    pts: r.design.pts.length, lengthM: r.design.lengthM, path: r.trackPath,
  })), null, 2));
  console.log(`\nImport in-game: TRACK DESIGNER › IMPORT → pick the .track.json file.`);
  console.log(`Attribution (${LICENSE}) is inside each envelope — keep it if you redistribute.`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(err && err.stack || err);
    process.exit(1);
  });
}

export { main, parseArgs, convertOne, selfCheck };
