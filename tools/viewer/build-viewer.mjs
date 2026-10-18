#!/usr/bin/env node
// @doc Writes one self-contained three.js viewer page of engine-built team cars and circuits, to open or publish.
// @skill playwright-probe
//
//   node tools/viewer/build-viewer.mjs                         all cars + monza,spa,monaco,suzuka
//   node tools/viewer/build-viewer.mjs --cars=ferrari,mclaren  just these cars (no circuits)
//   node tools/viewer/build-viewer.mjs --circuits=all          every circuit (no cars)
//   node tools/viewer/build-viewer.mjs --cars=all --circuits=imola --out=scratch/v.html
//   node tools/viewer/build-viewer.mjs --cars=all --shots      also PNG stills + a contact sheet (artifacts/viewer/shots/)
//   node tools/viewer/build-viewer.mjs --cars=ferrari --sheet=liveries:ferrari   every livery of one team on one sheet
//       (also finishes:<team>, parts:<category>:<team> or parts:all:<team>; implies --shots of that axis only)
//   ... --sheet=liveries:haas --match='^(neo_|retro_)'   only the variants whose id matches
//   node tools/viewer/build-viewer.mjs --list                  the valid team and circuit ids
//   node tools/viewer/build-viewer.mjs --json                  one JSON line: {ok,out,bytes,cars,circuits[,shots,sheet]}
//
// Offline and browser-free: the data is built in node (tools/viewer/viewer-data.mjs)
// and spliced into tools/viewer/viewer.html. The page loads three.js from
// jsDelivr. Default output: artifacts/viewer/apex-viewer.html. --shots renders
// the page in headless Chromium (viewer-shots.mjs) for a still to post in chat.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { viewerHtml, teamIds, circuitIds } from "./viewer-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_CIRCUITS = ["monza", "spa", "monaco", "suzuka"];

export function parseArgs(argv) {
  const a = { cars: null, circuits: null, out: null, json: false, list: false, shots: false, sheet: null, match: null };
  for (const s of argv) {
    const m = /^--(cars|circuits|out|sheet|match)=(.*)$/.exec(s);
    if (m) a[m[1]] = m[2];
    else if (s === "--json") a.json = true;
    else if (s === "--list") a.list = true;
    else if (s === "--shots") a.shots = true;
    else throw new Error(`unknown argument "${s}" (see the header of tools/viewer/build-viewer.mjs)`);
  }
  return a;
}

/** Resolve "--cars"/"--circuits" against the valid ids. Neither given → all cars + DEFAULT_CIRCUITS. */
export function resolveSelection({ cars, circuits }, valid = { cars: teamIds(), circuits: circuitIds() }) {
  const pick = (spec, all, kind) => {
    if (spec == null) return [];
    if (spec === "all") return all.slice();
    const ids = spec.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = ids.filter((id) => !all.includes(id));
    if (bad.length) throw new Error(`unknown ${kind}: ${bad.join(", ")} (valid: ${all.join(", ")})`);
    return ids;
  };
  if (cars == null && circuits == null) return { cars: valid.cars.slice(), circuits: DEFAULT_CIRCUITS.filter((c) => valid.circuits.includes(c)) };
  return { cars: pick(cars, valid.cars, "team"), circuits: pick(circuits, valid.circuits, "circuit") };
}

export async function buildViewer(args) {
  // A variant sheet needs the car code in the page and nothing else.
  if (args.sheet && args.cars == null) args = { ...args, cars: "all", circuits: args.circuits == null ? "" : args.circuits };
  const sel = resolveSelection(args);
  if (!sel.cars.length && !sel.circuits.length) throw new Error("nothing selected: pass --cars and/or --circuits");
  const html = viewerHtml(sel);
  const out = path.resolve(ROOT, args.out || "artifacts/viewer/apex-viewer.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  const result = { ok: true, out: path.relative(ROOT, out), bytes: Buffer.byteLength(html), ...sel };
  if (args.shots || args.sheet) {
    const { shootViewer } = await import("./viewer-shots.mjs");
    const dir = path.join(path.dirname(out), "shots");
    const r = await shootViewer(out, { ...sel, sheet: args.sheet, match: args.match, outDir: dir, cacheDir: path.join(ROOT, "artifacts/viewer/cdn") });
    result.shots = r.shots.map((s) => path.relative(ROOT, s.png));
    result.sheet = r.sheet && path.relative(ROOT, r.sheet);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.list) {
      console.log("teams:    " + teamIds().join(" "));
      console.log("circuits: " + circuitIds().join(" "));
    } else {
      const r = await buildViewer(args);
      if (args.json) console.log(JSON.stringify(r));
      else {
        console.log(`viewer: ${r.out} (${(r.bytes / 1e6).toFixed(2)} MB) — ${r.cars.length} car(s), ${r.circuits.length} circuit(s)`);
        if (r.shots) console.log(`shots: ${r.shots.length} PNG(s)` + (r.sheet ? `, sheet ${r.sheet}` : ""));
      }
    }
  } catch (e) {
    if (process.argv.includes("--json")) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error("build-viewer: " + e.message);
    process.exit(1);
  }
}
