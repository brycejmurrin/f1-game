#!/usr/bin/env node
/**
 * gen-circuit-meta.mjs — lightweight TrackDefs for the title/menu script wall.
 * @doc Extracts circuit picker metadata into js/track/circuit-meta.js (LAZY_CIRCUIT hydrates).
 * @skill check-changes
 *
 * Title/menu only needs id/name/country/flags/length — PERF-FINDINGS §circuit-tag.
 * The authored circuit files stay the single home of a def; this file is GENERATED
 * and lives outside js/circuits/ so readdir-based circuit-id discovery stays clean.
 *
 *   node tools/gen/gen-circuit-meta.mjs           # write js/track/circuit-meta.js
 *   node tools/gen/gen-circuit-meta.mjs --check   # exit 1 on drift
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { ROOT, isMain, firstDiff, argGate } from "./gen-lib.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("../manifest.cjs");

export const TARGET = "js/track/circuit-meta.js";

/** Fields the title, track picker filter, career continue line and RACE
 *  SETTINGS read before a circuit is picked. Everything else (path, pal,
 *  sectors, kit, …) hydrates via LAZY_CIRCUIT when ensureCircuit() runs.
 *  `gpLaps`: an authored override (def.js fromRaw) that a stub without it
 *  re-derives a lap off — RACE SETTINGS' FULL reads it before hydration. */
export const META_KEYS = Object.freeze([
  "id", "name", "gp", "country", "night", "theme", "sceneryTheme",
  "lengthKm", "gpLaps", "tyreSeverity", "classic", "street", "banked", "reverse",
  "sunAzimBias", "baseHW", "sceneryCoordinates", "sceneryLapMirror",
  "ownPitStraight", "undulate", "flatTerrain", "terrainOuter",
  "terrainFalloffStart", "terrainMat",
]);

function loadRaw(id) {
  const file = path.join(ROOT, MANIFEST.circuitPath(id));
  const src = fs.readFileSync(file, "utf8");
  const sandbox = { window: { TrackDefs: [] }, console };
  vm.runInNewContext(src, sandbox, { filename: file });
  const defs = sandbox.window.TrackDefs || [];
  const raw = defs.find((d) => d && d.id === id) || defs[defs.length - 1];
  if (!raw || raw.id !== id) {
    throw new Error(`gen-circuit-meta: ${id}.js did not push TrackDefs id=${id}`);
  }
  return raw;
}

function pickMeta(raw) {
  const out = {};
  for (const k of META_KEYS) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  // Marker so ensureCircuit / hydrate can tell a stub from a full payload
  // without guessing from a missing path (customs may author path later).
  out._metaOnly = true;
  return out;
}

function serialize(value) {
  return JSON.stringify(value);
}

/** Generated source for js/track/circuit-meta.js. */
export function generate() {
  const lines = [
    "/* Apex 26 — GENERATED circuit meta (tools/gen/gen-circuit-meta.mjs): picker",
    "   TrackDefs for the title/menu wall; full defs hydrate via LAZY_CIRCUIT. */",
    "(function () {",
    '  "use strict";',
    "  var D = (window.TrackDefs = window.TrackDefs || []);",
  ];
  for (const id of MANIFEST.CIRCUITS) {
    const meta = pickMeta(loadRaw(id));
    lines.push(`  D.push(${serialize(meta)});`);
  }
  lines.push("})();", "");
  return lines.join("\n");
}

export function write() {
  const out = path.join(ROOT, TARGET);
  fs.writeFileSync(out, generate());
  return TARGET;
}

export function check() {
  const want = generate();
  const got = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  if (got === want) return true;
  const diff = firstDiff(got, want);
  console.error(`gen-circuit-meta: ${TARGET} is stale` + (diff ? ` (${diff})` : ""));
  return false;
}

if (isMain(import.meta.url)) {
  const gated = argGate(process.argv.slice(2));
  if (gated !== null) process.exit(gated);
  const mode = process.argv.includes("--check") ? "check" : "write";
  if (mode === "check") process.exit(check() ? 0 : 1);
  console.log("wrote", write());
}
