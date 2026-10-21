#!/usr/bin/env node
// tools/perf/cpuprofile-summary.mjs — self time by file and by function (url:line) and inclusive time by function
// for a V8 .cpuprofile (DevTools / CDP Profiler.stop; tools/perf/race-entry-timer.mjs APEX_PROFILE). Self time =
// samples attributed to the node itself; inclusive = the node and its descendants, each function counted once per
// sample. B·H14 2026-10-21 (docs/notes/RACE-ENTRY-TOOLING-RESEARCH-2026-10-21.md, I5 is the diff of two of these).
// @doc Summarise a .cpuprofile: self ms by file, top-N self and inclusive ms by function url:line.
//
//   node tools/perf/cpuprofile-summary.mjs <file.cpuprofile> [top=40]
import { readFileSync } from "node:fs";
const file = process.argv[2];
if (!file) { console.error("usage: node tools/perf/cpuprofile-summary.mjs <file.cpuprofile> [top=40]"); process.exit(2); }
const p = JSON.parse(readFileSync(file, "utf8"));
const top = +(process.argv[3] || 40);
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
// sample weights (µs) from timeDeltas
const selfUs = new Map();
for (let i = 0; i < p.samples.length; i++) { const id = p.samples[i], dt = p.timeDeltas[i] || 0; selfUs.set(id, (selfUs.get(id) || 0) + dt); }
const total = [...selfUs.values()].reduce((a, b) => a + b, 0);
const key = (n) => { const f = n.callFrame; const url = (f.url || "").replace(/^.*?\/\/[^/]+\//, ""); return `${f.functionName || "(anon)"} ${url}:${f.lineNumber + 1}`; };
const byFn = new Map(), byFile = new Map();
for (const [id, us] of selfUs) { const n = byId.get(id); const k = key(n); byFn.set(k, (byFn.get(k) || 0) + us); const f = (n.callFrame.url || "(native)").replace(/^.*?\/\/[^/]+\//, ""); byFile.set(f, (byFile.get(f) || 0) + us); }
// inclusive by function: walk each sample up its parents, counting each distinct function once per sample
const incl = new Map();
for (const [id, us] of selfUs) { const seen = new Set(); let cur = id; while (cur != null) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } cur = parent.get(cur); } }
const ms = (us) => (us / 1000).toFixed(0).padStart(6);
console.log(`total sampled ${ms(total)} ms over ${p.samples.length} samples`);
console.log("\n== self time by file");
for (const [f, us] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${ms(us)} ms  ${f}`);
console.log(`\n== self time by function (top ${top})`);
for (const [k, us] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${ms(us)} ms  ${k}`);
console.log(`\n== inclusive time by function (top ${top}, (root)/(program)/(idle)/(garbage collector) excluded)`);
for (const [k, us] of [...incl].filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${ms(us)} ms  ${k}`);
