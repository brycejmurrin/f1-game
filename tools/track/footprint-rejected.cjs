#!/usr/bin/env node
// @doc Shrink-only ratchet on modelGroups whose emitted footprint is rejected every build (non-pit "footprint rejected").
// @skill scenery-dress
/* footprint-rejected.cjs — a modelGroup that never lands, as a ratchet.
 *
 * verify-track.cjs prints "footprint rejected" for an assembly the road guard
 * refuses (modelDiagnostics.suppressed, reason "footprint rejected" or
 * "emitted footprint rejected"). A non-required group is allowed to fail, so a
 * circuit can ask for a landmark every build that never ships and nothing
 * fails: four at Interlagos on 2026-11-09 (arq-senna, favela-17, crowd-905,
 * crowd-921). Pit-complex rejections ("superseded by the pit complex") are the
 * pit's doing, not the guard's, and are not counted.
 *
 * The baseline tests/data/footprint-rejected-baseline.json lists, per circuit,
 * the ids that are rejected today. It only SHRINKS:
 *   - a rejected id not in the baseline fails (a NEW never-landing group);
 *   - a baseline id that now lands is stale and fails too, so the fix that
 *     landed it must also delete its row (`--update` does that, and only that).
 *
 * Usage:
 *   node tools/track/footprint-rejected.cjs <id>...|--all        # gate
 *   node tools/track/footprint-rejected.cjs --all --update       # drop stale rows
 *   node tools/track/footprint-rejected.cjs <id> --json
 * --all honours APEX_CIRCUITS (tools/lib/circuit-scope.cjs).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const BASELINE = path.join(ROOT, "tests/data/footprint-rejected-baseline.json");
const IS_REJECT = /^(emitted )?footprint rejected$/;

/** Non-pit "footprint rejected" ids in one built track's diagnostics, sorted, unique. */
function rejectedIds(track) {
  const d = track && track.modelDiagnostics;
  const list = (d && d.suppressed) || [];
  return [...new Set(list.filter((e) => e && IS_REJECT.test(e.reason || "")).map((e) => String(e.id)))].sort();
}

function readBaseline(file = BASELINE) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/** Compare measured {circuit: ids[]} with the baseline over `ids`: new rows and stale rows. */
function compare(measured, baseline, ids) {
  const added = [], stale = [];
  for (const id of ids) {
    const now = new Set(measured[id] || []), was = new Set(baseline[id] || []);
    for (const g of now) if (!was.has(g)) added.push(`${id}: ${g}`);
    for (const g of was) if (!now.has(g)) stale.push(`${id}: ${g}`);
  }
  return { added, stale };
}

/** Baseline with the stale rows of `ids` removed; never adds a row. */
function shrink(measured, baseline, ids) {
  const next = JSON.parse(JSON.stringify(baseline));
  for (const id of ids) {
    if (!next[id]) continue;
    const now = new Set(measured[id] || []);
    next[id] = next[id].filter((g) => now.has(g));
    if (!next[id].length) delete next[id];
  }
  return next;
}

function measure(ids, Tracks) {
  const out = {};
  for (const id of ids) {
    const def = Tracks.LIST.find((d) => d.id === id);
    if (!def) throw new Error(`no such track: ${id}`);
    const r = rejectedIds(Tracks.build(def, {}));
    if (r.length) out[id] = r;
  }
  return out;
}

function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("usage: node tools/track/footprint-rejected.cjs <id>...|--all [--update] [--json]\n" +
      "  shrink-only ratchet: a non-pit 'footprint rejected' modelGroup not in tests/data/footprint-rejected-baseline.json fails. No browser.\n");
    return 0;
  }
  const { buildContext } = require("./verify-track.cjs");
  const { scope } = require("../lib/circuit-scope.cjs");
  const Tracks = buildContext(null, { quiet: true });
  const named = args.filter((a) => !a.startsWith("--"));
  const ids = args.includes("--all") || !named.length ? scope(Tracks.LIST.map((d) => d.id)) : named;
  const measured = measure(ids, Tracks);
  const baseline = readBaseline();
  if (args.includes("--json")) { process.stdout.write(JSON.stringify(measured, null, 1) + "\n"); return 0; }
  const { added, stale } = compare(measured, baseline, ids);
  if (args.includes("--update")) {
    fs.writeFileSync(BASELINE, JSON.stringify(shrink(measured, baseline, ids), null, 2) + "\n");
    console.log(`footprint-rejected: removed ${stale.length} stale row(s)`);
    if (added.length) { console.error(`NEW (not added — the baseline only shrinks):\n  ${added.join("\n  ")}`); return 1; }
    return 0;
  }
  for (const a of added) console.error(`NEW never-landing modelGroup ${a} — move it clear of the road or drop the call`);
  for (const s of stale) console.error(`STALE baseline row ${s} — it lands now; run --all --update to drop it`);
  if (!added.length && !stale.length) console.log(`footprint-rejected: ${ids.length} circuit(s) at baseline`);
  return added.length || stale.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { rejectedIds, readBaseline, compare, shrink, measure, BASELINE, IS_REJECT };
