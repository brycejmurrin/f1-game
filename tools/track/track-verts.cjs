#!/usr/bin/env node
/* Apex 26 — per-circuit vertex + diagnostics dump, for before/after diffing.
 * @doc Per-circuit vertex + model-diagnostics dump for exact before/after diffing (`--diff before.json`).
 * @skill agent-view
 *
 * The check that a start-line move did NOT disturb the dressed world: nothing
 * physical changes, so every prop/road/terrain count must come back IDENTICAL.
 * A vertex delta is frequently the ONLY signal that scenery moved — modelGroup
 * fails closed and verify-track still prints OK — so this is deliberately an
 * exact-equality instrument, not a tolerance.
 *
 *   node tools/track/track-verts.cjs > before.json
 *   node tools/track/track-verts.cjs --diff before.json
 */
"use strict";
const fs = require("fs");
const { buildContext } = require("./verify-track.cjs");

function dump() {
  const Tracks = buildContext();
  const out = {};
  for (const def of Tracks.LIST) {
    const t = Tracks.build(def);
    const md = t.modelDiagnostics || {};
    out[def.id] = {
      props: t.meshes.props ? t.meshes.props.verts : 0,
      road: t.meshes.road ? t.meshes.road.verts : 0,
      terrain: t.meshes.terrain ? t.meshes.terrain.verts : 0,
      suppressed: (md.suppressed || []).length,
      invalid: (md.invalid || []).length,
      unsafe: (md.unsafe || []).length,
      total: Math.round(t.total),
    };
  }
  return out;
}

const diffIdx = process.argv.indexOf("--diff");
if (diffIdx >= 0) {
  const before = JSON.parse(fs.readFileSync(process.argv[diffIdx + 1], "utf8"));
  const after = dump();
  const keys = ["props", "road", "terrain", "suppressed", "invalid", "unsafe", "total"];
  let moved = 0;
  for (const id of Object.keys(after)) {
    const a = before[id], b = after[id];
    if (!a) { console.log(`NEW  ${id}`); moved++; continue; }
    const d = keys.filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}->${b[k]}`);
    if (d.length) { console.log(`DIFF ${id.padEnd(13)} ${d.join("  ")}`); moved++; }
  }
  console.log(`\n${moved}/${Object.keys(after).length} circuit(s) changed`);
  process.exit(moved ? 1 : 0);
} else {
  console.log(JSON.stringify(dump(), null, 1));
}
