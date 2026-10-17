#!/usr/bin/env node
// @doc Lists single-node centreline kinks (node radius < half-width) per circuit; `--gate` pins counts, `--update` lowers.
"use strict";
//   node tools/track/centreline-kinks.cjs [id…]      # table: circuit, node, frac, R, hw, nearest turn
//   node tools/track/centreline-kinks.cjs --gate     # exit 1 when any circuit exceeds tests/data/centreline-kinks.json
//   node tools/track/centreline-kinks.cjs --update   # lower the pinned counts to the measured ones (never raises)
const fs = require("fs");
const path = require("path");
const { buildContext } = require("./verify-track.cjs");
const { kinkNodes, nearestTurn } = require("../lib/centreline-kinks.cjs");

const FILE = path.join(__dirname, "../../tests/data/centreline-kinks.json");
const args = process.argv.slice(2);
const gate = args.includes("--gate"), update = args.includes("--update");
const ids = args.filter((a) => !a.startsWith("--"));

const Tracks = buildContext(null, { quiet: true });
const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
const measured = {}, over = [];
for (const def of Tracks.LIST) {
  if (ids.length && !ids.includes(def.id)) continue;
  const kinks = kinkNodes(Tracks.build(def));
  measured[def.id] = kinks.length;
  const pinned = doc.counts[def.id] || 0;
  if (kinks.length > pinned) over.push(`${def.id}: ${kinks.length} > pinned ${pinned}`);
  if (!gate && !update) for (const x of kinks)
    console.log(`${def.id.padEnd(14)} node ${String(x.k).padStart(5)}  frac ${x.frac.toFixed(3)}  R ${x.R.toFixed(1)} m < hw ${x.hw.toFixed(1)} m  turn #${nearestTurn(def, x.frac)}`);
}
const total = Object.values(measured).reduce((a, b) => a + b, 0);
if (update) {
  let lowered = 0;
  for (const [id, n] of Object.entries(measured)) {
    const had = doc.counts[id] || 0;
    if (n < had) { if (n) doc.counts[id] = n; else delete doc.counts[id]; lowered++; }
  }
  fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + "\n");
  console.log(`centreline-kinks: lowered ${lowered} circuit(s)`);
}
console.log(`centreline-kinks: ${total} kink node(s) over ${Object.keys(measured).length} circuit(s)` + (over.length ? `; OVER: ${over.join("; ")}` : ""));
process.exit(gate && over.length ? 1 : 0);
