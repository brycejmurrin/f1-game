#!/usr/bin/env node
// @doc Writes one self-contained three.js viewer page of engine-built team cars and circuits, to open or publish.
// @skill playwright-probe
//
//   node tools/viewer/build-viewer.mjs                         all cars + monza,spa,monaco,suzuka
//   node tools/viewer/build-viewer.mjs --cars=ferrari,mclaren  just these cars (no circuits)
//   node tools/viewer/build-viewer.mjs --circuits=all          every circuit (no cars)
//   node tools/viewer/build-viewer.mjs --cars=all --circuits=imola --out=scratch/v.html
//   node tools/viewer/build-viewer.mjs --list                  the valid team and circuit ids
//   node tools/viewer/build-viewer.mjs --json                  one JSON line: {ok,out,bytes,cars,circuits}
//
// Offline and browser-free: the data is built in node (tools/viewer/viewer-data.mjs)
// and spliced into tools/viewer/viewer.html. The page loads three.js from
// jsDelivr. Default output: artifacts/viewer/apex-viewer.html.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { viewerHtml, teamIds, circuitIds } from "./viewer-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_CIRCUITS = ["monza", "spa", "monaco", "suzuka"];

export function parseArgs(argv) {
  const a = { cars: null, circuits: null, out: null, json: false, list: false };
  for (const s of argv) {
    const m = /^--(cars|circuits|out)=(.*)$/.exec(s);
    if (m) a[m[1]] = m[2];
    else if (s === "--json") a.json = true;
    else if (s === "--list") a.list = true;
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

export function buildViewer(args) {
  const sel = resolveSelection(args);
  if (!sel.cars.length && !sel.circuits.length) throw new Error("nothing selected: pass --cars and/or --circuits");
  const html = viewerHtml(sel);
  const out = path.resolve(ROOT, args.out || "artifacts/viewer/apex-viewer.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { ok: true, out: path.relative(ROOT, out), bytes: Buffer.byteLength(html), ...sel };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.list) {
      console.log("teams:    " + teamIds().join(" "));
      console.log("circuits: " + circuitIds().join(" "));
    } else {
      const r = buildViewer(args);
      if (args.json) console.log(JSON.stringify(r));
      else console.log(`viewer: ${r.out} (${(r.bytes / 1e6).toFixed(2)} MB) — ${r.cars.length} car(s), ${r.circuits.length} circuit(s)`);
    }
  } catch (e) {
    if (process.argv.includes("--json")) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error("build-viewer: " + e.message);
    process.exit(1);
  }
}
