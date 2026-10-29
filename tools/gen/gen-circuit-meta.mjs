#!/usr/bin/env node
/**
 * gen-circuit-meta.mjs — lightweight TrackDefs for the title/menu script wall.
 * @doc Builds js/track/circuit-meta.js (circuit picker metadata; a gitignored build product, LAZY_CIRCUIT hydrates).
 * @skill check-changes
 *
 * Title/menu only needs id/name/country/flags/length — PERF-FINDINGS §circuit-tag.
 * The authored circuit files stay the single home of a def; this file is GENERATED
 * and lives outside js/circuits/ so readdir-based circuit-id discovery stays clean.
 *
 * BUILT, NOT COMMITTED (2026-10-28, stage 1 of docs/notes/DEPLOY-TIME-GEN-2026-10-28.md;
 * Bryce: "Build at deploy"). The output is gitignored. tools/gen/ensure-built.mjs builds
 * it wherever a checkout is served or tested, and tools/desktop/stage.mjs renders it
 * into the staged site from source, so two PRs that each touch a circuit can no longer
 * leave the deploy tip with a stale committed copy.
 *
 *   node tools/gen/gen-circuit-meta.mjs           # write js/track/circuit-meta.js
 *   node tools/gen/gen-circuit-meta.mjs --check   # gen:check: exit 1 when git TRACKS the file
 *                                                 # (it must stay a build product); a missing or
 *                                                 # stale local copy is rebuilt, not reported
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { ROOT, isMain, argGate, ensureFile } from "./gen-lib.mjs";

const require = createRequire(import.meta.url);

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

function loadRaw(id, root, manifest) {
  const file = path.join(root, manifest.circuitPath(id));
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

/** Generated picker source from the selected checkout, not the generator module's checkout. */
export function generate({ root = ROOT } = {}) {
  root = path.resolve(root);
  // Reusable builders can render again after a branch switch or source edit.
  // Invalidate only this selected checkout's manifest, not unrelated modules.
  const manifestPath = require.resolve(path.join(root, "tools/manifest.cjs"));
  delete require.cache[manifestPath];
  const manifest = require(manifestPath);
  const lines = [
    "/* Apex 26 — GENERATED circuit meta (tools/gen/gen-circuit-meta.mjs): picker",
    "   TrackDefs for the title/menu wall; full defs hydrate via LAZY_CIRCUIT. */",
    "(function () {",
    '  "use strict";',
    "  var D = (window.TrackDefs = window.TrackDefs || []);",
  ];
  for (const id of manifest.CIRCUITS) {
    const meta = pickMeta(loadRaw(id, root, manifest));
    lines.push(`  D.push(${serialize(meta)});`);
  }
  lines.push("})();", "");
  return lines.join("\n");
}

export function write() {
  ensureFile(path.join(ROOT, TARGET), generate());
  return TARGET;
}

/** Build the local copy when it is missing or stale. @returns {"fresh"|"missing"|"stale"} */
export function ensure() {
  return ensureFile(path.join(ROOT, TARGET), generate());
}

/** Does git track TARGET in this checkout? false when git cannot say (no repo, no git). */
export function trackedInGit() {
  const r = spawnSync("git", ["ls-files", "--", TARGET], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() !== "";
}

/** gen:check for a build product. There is no committed copy to drift, so the
 *  check is: the generator still runs on today's sources, and git does not track
 *  the output (a merge that kept an old branch's copy, or a `git add -f`, would
 *  commit bytes that go stale on the next circuit edit). A missing or stale local
 *  copy is rebuilt here, so the generators after this one in gen:check read
 *  today's roster. */
export function check() {
  if (trackedInGit()) {
    console.error(`gen-circuit-meta: ${TARGET} is tracked by git, but it is a build product (gitignored; `
      + `docs/notes/DEPLOY-TIME-GEN-2026-10-28.md). Untrack it: git rm --cached ${TARGET}`);
    return false;
  }
  const was = ensure();
  if (was !== "fresh") console.log(`gen-circuit-meta: ${TARGET} was ${was}; rebuilt (a build product, not committed)`);
  return true;
}

if (isMain(import.meta.url)) {
  const gated = argGate(process.argv.slice(2));
  if (gated !== null) process.exit(gated);
  const mode = process.argv.includes("--check") ? "check" : "write";
  if (mode === "check") process.exit(check() ? 0 : 1);
  console.log("wrote", write());
}
