#!/usr/bin/env node
// tools/perf/query.mjs — summarise or compare saved profiler artifacts (artifacts/profiles/*.json|*.cpuprofile).
// @doc Summarise a saved profile (spans JSON or .cpuprofile: top-N self/total, fn/file filter) or compare two spans JSONs.
// @skill playwright-probe
//   node tools/perf/query.mjs <file> [--top N] [--fn REGEX] [--file REGEX] [--json]
//   node tools/perf/query.mjs <base.json> <head.json> [--json]      # spans A/B delta, same noise rule as profile.mjs
// Artifacts only: a path must resolve under artifacts/ or scratch/. Never prints a raw profile.
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { diff, formatDiff, formatTable } from "./lib.mjs";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

/** Self and total time per function from a V8 .cpuprofile (sample counts → percent of all samples). */
export function summariseCpu(profile, { top = 20, fn = null, file = null } = {}) {
  const nodes = profile.nodes || [], byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of nodes) for (const c of n.children || []) parent.set(c, n.id);
  const selfById = new Map();
  for (const id of profile.samples || []) selfById.set(id, (selfById.get(id) || 0) + 1);
  const total = (profile.samples || []).length || 1;
  const key = (n) => { const f = n.callFrame || {}; return `${f.functionName || "(anon)"}|${(f.url || "").split("/").pop().split("?")[0]}:${f.lineNumber != null ? f.lineNumber + 1 : 0}`; };
  const self = new Map(), tot = new Map();
  for (const [id, c] of selfById) {
    const n = byId.get(id); if (!n) continue;
    self.set(key(n), (self.get(key(n)) || 0) + c);
    const seen = new Set();
    for (let p = id; p != null; p = parent.get(p)) { const pn = byId.get(p), k = pn && key(pn); if (k && !seen.has(k)) { seen.add(k); tot.set(k, (tot.get(k) || 0) + c); } }
  }
  const fnRe = fn && new RegExp(fn), fileRe = file && new RegExp(file);
  const rows = [...tot.keys()].map((k) => { const [name, loc] = k.split("|"); return { fn: name, loc, selfPct: +(((self.get(k) || 0) / total) * 100).toFixed(2), totalPct: +((tot.get(k) / total) * 100).toFixed(2) }; })
    .filter((r) => (!fnRe || fnRe.test(r.fn)) && (!fileRe || fileRe.test(r.loc)));
  return { samples: total, bySelf: [...rows].sort((a, b) => b.selfPct - a.selfPct).slice(0, top), byTotal: [...rows].sort((a, b) => b.totalPct - a.totalPct).slice(0, top) };
}

function safePath(p) {
  const abs = resolve(ROOT, p);
  if (!abs.startsWith(ROOT + sep + "artifacts" + sep) && !abs.startsWith(ROOT + sep + "scratch" + sep)) throw new Error(`${p}: must be under artifacts/ or scratch/`);
  return abs;
}
const load = (p) => JSON.parse(readFileSync(safePath(p), "utf8"));

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, "query — summarise or compare saved profiles\n\n  node tools/perf/query.mjs <file> [--top N] [--fn RE] [--file RE] [--json]\n  node tools/perf/query.mjs <base.json> <head.json> [--json]");
  parseFlags(argv, ["--top", "--fn", "--file", "--json", "--help"]);
  const V = new Set(["--top", "--fn", "--file"]);
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const files = argv.filter((a, i) => !a.startsWith("--") && !V.has(argv[i - 1]));
  const asJson = argv.includes("--json");
  try {
    if (files.length === 2) {
      const a = load(files[0]), b = load(files[1]), rows = diff(a.head || a.spans || {}, b.head || b.spans || {});
      console.log(asJson ? JSON.stringify(rows) : formatDiff(rows, files[0], files[1]));
    } else if (files.length === 1) {
      const doc = load(files[0]);
      if (Array.isArray(doc.nodes)) {
        const s = summariseCpu(doc, { top: +flag("--top") || 20, fn: flag("--fn"), file: flag("--file") });
        if (asJson) console.log(JSON.stringify(s));
        else {
          console.log(`${files[0]} — ${s.samples} samples\n self%   total%  function`);
          for (const r of s.bySelf) console.log(`${String(r.selfPct).padStart(6)} ${String(r.totalPct).padStart(8)}  ${r.fn}  ${r.loc}`);
        }
      } else console.log(asJson ? JSON.stringify(doc.head || doc) : formatTable(doc.head || doc.spans || {}));
    } else { console.error("usage: query.mjs <file> | <base> <head>"); process.exitCode = 1; }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
