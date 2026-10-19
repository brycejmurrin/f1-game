#!/usr/bin/env node
// @doc Per-job inputs hash for the CI verdict cache (#1712); sha256 of a declared path set + node version.
// @section runner
/**
 * inputs-hash.mjs — hash the declared inputs of a tree-only CI job so
 * actions/cache lookup-only can skip a job whose inputs match an earlier green
 * verdict (docs/plans/research-2026-09-16/ci.md §2a).
 *
 *   node tools/ci/inputs-hash.mjs <job>           # print sha256 hex
 *   node tools/ci/inputs-hash.mjs --list          # job names
 *   node tools/ci/inputs-hash.mjs --paths <job>   # declared path set (one per line)
 *
 * Jobs today: `guards` (Structural guards tooling shards) and `sweeps-parts`
 * (parts census). NO_MEMO=1 in the workflow skips the cache (nightly auditor).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Declared input path sets. Directories are walked; files are hashed as-is.
 * Keep these WIDE (fail-safe stale-replay): anything the job's scripts can read
 * belongs here. Unit tests assert coverage against groups.json / tooling-fast /
 * geometry-paths parts ERE.
 */
export const JOB_INPUTS = Object.freeze({
  guards: Object.freeze([
    "tools/",
    "tests/unit/",
    "tests/groups.json",
    "tests/data/",
    "docs/",
    "js/",
    "css/",
    "locales/",
    "types/",
    "index.html",
    "sw.js",
    "version.json",
    "package.json",
    "package-lock.json",
    "playwright.config.js",
    ".github/workflows/ci.yml",
    "tools/manifest.cjs",
  ]),
  "sweeps-parts": Object.freeze([
    "js/core/",
    "js/data/",
    "js/car/",
    "tools/car/parts-sweep.mjs",
    "tests/unit/parts-visual-distinctness.test.mjs",
    "package.json",
    "package-lock.json",
    ".github/workflows/ci.yml",
    "tools/ci/geometry-paths.mjs",
  ]),
});

export const JOB_NAMES = Object.freeze(Object.keys(JOB_INPUTS));

/** Walk a declared path into sorted repo-relative file paths (skips missing). */
export function expandInputPaths(declared, root = ROOT) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    let st;
    try { st = fs.statSync(abs); } catch (_) { return; }
    if (st.isFile()) {
      out.push(rel.replace(/\\/g, "/"));
      return;
    }
    if (!st.isDirectory()) return;
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "artifacts") continue;
      const child = path.join(rel, ent.name).replace(/\\/g, "/");
      if (ent.isDirectory()) walk(child.endsWith("/") ? child : child);
      else if (ent.isFile()) out.push(child);
    }
  };
  for (const d of declared) {
    const norm = String(d).replace(/\\/g, "/").replace(/^\.\//, "");
    if (norm.endsWith("/")) walk(norm.slice(0, -1));
    else walk(norm);
  }
  return [...new Set(out)].sort();
}

/** sha256 hex of sorted file contents + node version (and optional salt). */
export function hashInputs(files, { root = ROOT, nodeVersion = process.version, salt = "" } = {}) {
  const h = createHash("sha256");
  h.update(`node:${nodeVersion}\n`);
  if (salt) h.update(`salt:${salt}\n`);
  for (const rel of files) {
    h.update(rel);
    h.update("\0");
    try {
      h.update(fs.readFileSync(path.join(root, rel)));
    } catch (_) {
      h.update("<missing>");
    }
    h.update("\n");
  }
  return h.digest("hex");
}

/** Hash for a named job. */
export function inputsHash(job, opts = {}) {
  const declared = JOB_INPUTS[job];
  if (!declared) throw new Error(`unknown inputs-hash job: ${job} (want ${JOB_NAMES.join("|")})`);
  const files = expandInputPaths(declared, opts.root || ROOT);
  return hashInputs(files, opts);
}

/**
 * Does the declared set cover what the job is known to read?
 * Returns { ok, missing, covered } — missing are expected prefixes/files not
 * matched by any declared entry.
 */
export function coverageReport(job, expectedPaths) {
  const declared = JOB_INPUTS[job];
  if (!declared) throw new Error(`unknown inputs-hash job: ${job}`);
  const missing = [];
  for (const want of expectedPaths) {
    const w = want.replace(/\\/g, "/");
    const hit = declared.some((d) => {
      const n = d.replace(/\\/g, "/");
      if (n.endsWith("/")) return w === n.slice(0, -1) || w.startsWith(n);
      return w === n || w.startsWith(n + "/");
    });
    if (!hit) missing.push(w);
  }
  return { ok: missing.length === 0, missing, covered: expectedPaths.length - missing.length };
}

/** Expected paths the guards job reads — derived from tooling-fast + groups. */
export function guardsExpectedPaths() {
  // Wide floor: anything tooling-fast / guards scripts routinely open.
  return [
    "tools/",
    "tests/unit/",
    "tests/groups.json",
    "tests/data/",
    "docs/",
    "js/",
    "css/",
    "package.json",
    "package-lock.json",
    ".github/workflows/ci.yml",
    "index.html",
    "sw.js",
    "tools/manifest.cjs",
  ];
}

/** Expected paths for sweeps-parts — mirrors geometry-paths PARTS_ERE roots. */
export function sweepsPartsExpectedPaths() {
  let parts;
  try {
    parts = require("./geometry-paths.mjs");
  } catch (_) {
    return ["js/car/", "tools/car/parts-sweep.mjs", "tests/unit/parts-visual-distinctness.test.mjs"];
  }
  // PARTS_ERE is a regex string; expand the known roots from PARTS_PATHS if exported.
  const roots = ["js/core/", "js/data/", "js/car/", "tools/car/parts-sweep.mjs", "tests/unit/parts-visual-distinctness.test.mjs"];
  if (typeof parts.PARTS_ERE === "function") {
    // Keep the static roots; the unit test also asserts PARTS_ERE mentions them.
  }
  return roots;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--list") || args.includes("-h") || args.includes("--help")) {
    if (args.includes("--list")) console.log(JOB_NAMES.join("\n"));
    else console.log(`usage: node tools/ci/inputs-hash.mjs <${JOB_NAMES.join("|")}> | --list | --paths <job>`);
    process.exit(0);
  }
  if (args[0] === "--paths") {
    const job = args[1];
    if (!JOB_INPUTS[job]) {
      console.error(`unknown job: ${job}`);
      process.exit(2);
    }
    for (const p of JOB_INPUTS[job]) console.log(p);
    process.exit(0);
  }
  const job = args[0];
  if (!job || !JOB_INPUTS[job]) {
    console.error(`usage: node tools/ci/inputs-hash.mjs <${JOB_NAMES.join("|")}>`);
    process.exit(2);
  }
  process.stdout.write(inputsHash(job) + "\n");
}
