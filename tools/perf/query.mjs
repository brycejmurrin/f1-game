#!/usr/bin/env node
// tools/perf/query.mjs — summarise or compare saved profiler artifacts (artifacts/profiles/*.json|*.cpuprofile).
// @doc Summarise a saved profile (spans JSON or .cpuprofile: top-N self/total, fn/file filter) or compare two spans JSONs.
// @skill playwright-probe
//   node tools/perf/query.mjs <file> [--top N] [--fn REGEX] [--file REGEX] [--json]
//   node tools/perf/query.mjs <base.json> <head.json> [--json]      # spans A/B delta, same noise rule as profile.mjs
// Artifacts only: a path must resolve under artifacts/ or scratch/. Never prints a raw profile.
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { diff, formatDiff, formatTable, profileComparability } from "./lib.mjs";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

/** Self and total time per function from a V8 .cpuprofile (sample counts → percent of all samples). */
export function summariseCpu(profile, { top = 20, fn = null, file = null } = {}) {
  if (!Array.isArray(profile?.nodes) || (profile.samples != null && !Array.isArray(profile.samples))) throw new Error("invalid CPU profile: nodes and samples must be arrays");
  const nodes = profile.nodes, samples = profile.samples || [], byId = new Map();
  for (const n of nodes) {
    if (!Number.isInteger(n?.id) || byId.has(n.id) || !n.callFrame || (n.children != null && !Array.isArray(n.children))) throw new Error("invalid CPU profile: malformed or duplicate node");
    byId.set(n.id, n);
  }
  const parent = new Map();
  for (const n of nodes) for (const c of n.children || []) {
    if (!byId.has(c) || parent.has(c)) throw new Error("invalid CPU profile: unknown child or multiple parents");
    parent.set(c, n.id);
  }
  // CDP ProfileNode describes a tree. Validate every component iteratively so
  // malformed saved evidence cannot hang a query or overflow the JS stack.
  // https://chromedevtools.github.io/devtools-protocol/tot/Profiler/#type-ProfileNode
  const checked = new Set();
  for (const n of nodes) {
    const chain = new Set();
    for (let id = n.id; id != null && !checked.has(id); id = parent.get(id)) {
      if (chain.has(id)) throw new Error("invalid CPU profile: cycle in node tree");
      chain.add(id);
    }
    for (const id of chain) checked.add(id);
  }
  const selfById = new Map();
  for (const id of samples) {
    if (!byId.has(id)) throw new Error("invalid CPU profile: unknown sample node");
    selfById.set(id, (selfById.get(id) || 0) + 1);
  }
  const total = samples.length;
  // Runtime.CallFrame identity includes the complete source and column: equal
  // basenames (circuit/scenery), same-line functions and evaluated scripts differ.
  const locations = new Map();
  const key = (n) => {
    const f = n.callFrame, name = f.functionName || "(anon)", url = f.url || "";
    const k = JSON.stringify([name, url, f.scriptId ?? null, f.lineNumber ?? null, f.columnNumber ?? null]);
    if (!locations.has(k)) locations.set(k, { fn: name, loc: `${url}:${f.lineNumber != null ? f.lineNumber + 1 : 0}${f.columnNumber != null ? ":" + (f.columnNumber + 1) : ""}` });
    return k;
  };
  const self = new Map(), tot = new Map();
  for (const [id, c] of selfById) {
    const n = byId.get(id);
    self.set(key(n), (self.get(key(n)) || 0) + c);
    const seen = new Set();
    for (let p = id; p != null; p = parent.get(p)) { const k = key(byId.get(p)); if (!seen.has(k)) { seen.add(k); tot.set(k, (tot.get(k) || 0) + c); } }
  }
  const fnRe = fn && new RegExp(fn), fileRe = file && new RegExp(file);
  const rows = [...tot.keys()].map((k) => { return { ...locations.get(k), selfPct: +(((self.get(k) || 0) / total) * 100).toFixed(2), totalPct: +((tot.get(k) / total) * 100).toFixed(2) }; })
    .filter((r) => (!fnRe || fnRe.test(r.fn)) && (!fileRe || fileRe.test(r.loc)));
  return { samples: total, bySelf: [...rows].sort((a, b) => b.selfPct - a.selfPct).slice(0, top), byTotal: [...rows].sort((a, b) => b.totalPct - a.totalPct).slice(0, top) };
}

function safePath(p) {
  const abs = realpathSync(resolve(ROOT, p));
  const root = realpathSync(ROOT);
  if (!abs.startsWith(root + sep + "artifacts" + sep) && !abs.startsWith(root + sep + "scratch" + sep)) throw new Error(`${p}: must be under artifacts/ or scratch/`);
  return abs;
}
const load = (p) => JSON.parse(readFileSync(safePath(p), "utf8"));

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, "query — summarise or compare saved profiles\n\n  node tools/perf/query.mjs <file> [--top N] [--fn RE] [--file RE] [--json]\n  node tools/perf/query.mjs <base.json> <head.json> [--json]");
  const flags = parseFlags(argv, ["--top", "--fn", "--file", "--json", "--help"]);
  const V = new Set(["--top", "--fn", "--file"]);
  const flag = (n) => flags.flag(n, null);
  const files = argv.filter((a, i) => !a.startsWith("--") && !V.has(argv[i - 1]));
  const asJson = flags.has("--json");
  try {
    const top = flags.has("--top") ? Number(flag("--top")) : 20;
    if (!Number.isInteger(top) || top < 1 || top > 100) throw new Error("--top must be an integer from 1 to 100");
    for (const name of ["--fn", "--file"]) if (flags.has(name) && !flag(name)) throw new Error(`${name} requires a regex value`);
    if (files.length === 2) {
      const a = load(files[0]), b = load(files[1]), compatibility = profileComparability(a, b);
      const rows = diff(a.head || a.spans || {}, b.head || b.spans || {}, { incomparable: !compatibility.comparable });
      if (!compatibility.comparable) console.error(`Profile comparison incomparable: ${compatibility.reason}`);
      console.log(asJson ? JSON.stringify(rows) : formatDiff(rows, files[0], files[1]));
    } else if (files.length === 1) {
      const doc = load(files[0]);
      if (Array.isArray(doc.nodes)) {
        const s = summariseCpu(doc, { top, fn: flag("--fn"), file: flag("--file") });
        if (asJson) console.log(JSON.stringify(s));
        else {
          console.log(`${files[0]} — ${s.samples} samples\n self%   total%  function`);
          for (const r of s.bySelf) console.log(`${String(r.selfPct).padStart(6)} ${String(r.totalPct).padStart(8)}  ${r.fn}  ${r.loc}`);
        }
      } else console.log(asJson ? JSON.stringify(doc.head || doc) : formatTable(doc.head || doc.spans || {}));
    } else { console.error("usage: query.mjs <file> | <base> <head>"); process.exitCode = 1; }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
