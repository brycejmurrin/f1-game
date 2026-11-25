#!/usr/bin/env node
// load-census.mjs — the load ladder's bytes and budgets: #6609 §1.1 (bytes per manifest group) and §1.2/§2 (phases).
// @doc Load census (#6609 step 1): raw / gzip -9 / stripped bytes per tools/manifest.cjs group, plus the P0–P4 phase budgets.
//
// Deterministic and browserless: it reads tools/manifest.cjs (read-only here), index.html's importmap and
// tests/data/load-budget.json, and sizes every file on disk. Same tree, same output — the unit test
// tests/unit/load-census.test.mjs holds it to the manifest. The phase table carries the RECORDED sw/phone readings
// from the budget file (their sources named there); it measures no time itself. Phone budgets are advisory until a
// Claude Link window measures them (Bryce's D1 (b), #6609).
//
//   node tools/perf/load-census.mjs [--json] [--files]
//
// Default prints two markdown tables and a `= load-census {…}` summary line; --json prints the whole census as JSON;
// --files adds every file's three sizes under its group (json, or a per-group list in markdown).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";
import { strippedBytes } from "../lib/js-strip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USAGE = `usage: node tools/perf/load-census.mjs [--json] [--files]
  Bytes per tools/manifest.cjs group (raw, gzip -9, comment-stripped code) and the #6609 load ladder
  (P0 shell → P4 restart) from tests/data/load-budget.json. No browser; deterministic on a tree.
  --json   the whole census as one JSON object
  --files  per-file sizes under each group`;

/** The manifest's file groups, in a fixed order: FULL, each DEFERRED backend, then every LAZY_* array (not *_EDGES).
 *  Pure over a manifest object. Each row: { group, files }. */
export function manifestGroups(manifest) {
  const rows = [{ group: "FULL", files: [...manifest.FULL] }];
  for (const [k, files] of Object.entries(manifest.DEFERRED || {})) rows.push({ group: `DEFERRED.${k}`, files: [...files] });
  for (const [k, v] of Object.entries(manifest)) {
    if (!/^LAZY_/.test(k) || /_EDGES$/.test(k) || !Array.isArray(v)) continue;
    rows.push({ group: k, files: [...v] });
  }
  return rows;
}

/** The importmap's three.js files plus their one-level `from"./x"` imports (three.core), relative to root. */
export function vendorThreeFiles(root = ROOT) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!m) return [];
  const imports = JSON.parse(m[1]).imports || {};
  const seen = new Set();
  for (const [name, url] of Object.entries(imports)) {
    if (!/^three(\/|$)/.test(name) || url.endsWith("/")) continue;
    const rel = path.posix.normalize(url.replace(/^\.\//, ""));
    seen.add(rel);
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    for (const dep of src.matchAll(/(?:from|import)\s*"(\.\/[^"]+)"/g)) seen.add(path.posix.join(path.posix.dirname(rel), dep[1]));
  }
  return [...seen].sort();
}

const sizeCache = new Map();
/** { raw, gz, code } of one file under root: bytes on disk, gzip -9, and js-strip's code bytes (same as boot-wall). */
export function fileSizes(rel, root = ROOT) {
  const key = `${root}\0${rel}`;
  if (sizeCache.has(key)) return sizeCache.get(key);
  const buf = fs.readFileSync(path.join(root, rel));
  const out = { raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length, code: strippedBytes(buf.toString("utf8")) };
  sizeCache.set(key, out);
  return out;
}

/** The whole census: { groups: [{ group, phase, count, raw, gz, code, files? }], phases, budgetFile }. */
export function census({ root = ROOT, withFiles = false } = {}) {
  const manifest = createRequire(import.meta.url)(path.join(root, "tools/manifest.cjs"));
  const budget = JSON.parse(fs.readFileSync(path.join(root, "tests/data/load-budget.json"), "utf8"));
  const rows = [...manifestGroups(manifest), { group: "VENDOR_THREE", files: vendorThreeFiles(root) }];
  const groups = rows.map(({ group, files }) => {
    const per = files.map((f) => ({ file: f, ...fileSizes(f, root) }));
    const sum = (k) => per.reduce((a, r) => a + r[k], 0);
    const row = { group, when: budget.groupWhen?.[group] ?? null, count: files.length, raw: sum("raw"), gz: sum("gz"), code: sum("code") };
    if (withFiles) row.files = per;
    return row;
  });
  return { groups, phases: budget.phases, budgetFile: "tests/data/load-budget.json" };
}

const kb = (n) => `${Math.round(n / 1024).toLocaleString("en-US")} KB`;
const cell = (v) => (v == null ? "—" : String(v));

/** Markdown for a census (pure): §1.1 bytes per group, then the phase ladder with budgets and recorded readings. */
export function toMarkdown(c) {
  const out = ["## Bytes per group (tools/manifest.cjs)", "",
    "| group | files | raw | gzip -9 | code (stripped) | when it loads |", "|---|---|---|---|---|---|"];
  for (const g of c.groups) {
    out.push(`| ${g.group} | ${g.count} | ${kb(g.raw)} | ${kb(g.gz)} | ${g.code.toLocaleString("en-US")} B | ${cell(g.when)} |`);
    for (const f of g.files || []) out.push(`| · ${f.file} | | ${f.raw} B | ${f.gz} B | ${f.code} B | |`);
  }
  out.push("", `## Load ladder (${c.budgetFile}; phone budgets advisory)`, "",
    "| phase | ends when | phone budget [advisory] | sw budget (CI) | sw reading | phone reading |", "|---|---|---|---|---|---|");
  for (const p of c.phases) {
    const fmt = (o) => (o ? Object.entries(o).filter(([k]) => !["advisory", "gate", "enforcedBy", "source", "est"].includes(k))
      .map(([k, v]) => `${k} ${v}`).join(", ") + (o.est ? " [est]" : "") : "—");
    const rec = (o) => (o ? `${fmt(o)}${o.source ? ` (${o.source})` : ""}` : "—");
    out.push(`| ${p.id} ${p.name} | ${p.endsWhen} | ${fmt(p.phone)} | ${fmt(p.sw)} | ${rec(p.readings?.sw)} | ${rec(p.readings?.phone)} |`);
  }
  return out.join("\n");
}

/** The one-line summary: FULL's three sums and the lazy total. */
export function summary(c) {
  const full = c.groups.find((g) => g.group === "FULL");
  const lazy = c.groups.filter((g) => g.group.startsWith("LAZY_"));
  return { eagerScripts: full.count, eagerRaw: full.raw, eagerGz: full.gz, eagerCodeBytes: full.code,
    lazyRaw: lazy.reduce((a, g) => a + g.raw, 0), lazyGz: lazy.reduce((a, g) => a + g.gz, 0), groups: c.groups.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, USAGE);
  parseFlags(argv, ["--json", "--files"]);
  const c = census({ withFiles: argv.includes("--files") });
  if (argv.includes("--json")) console.log(JSON.stringify({ ...c, summary: summary(c) }, null, 2));
  else console.log(`${toMarkdown(c)}\n\n= load-census ${JSON.stringify(summary(c))}`);
}
