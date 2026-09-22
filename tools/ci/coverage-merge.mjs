#!/usr/bin/env node
// @doc Merges raw V8 coverage (APEX_JS_COVERAGE browser runs + NODE_V8_COVERAGE) into one lcov/html report.
// @section runner
/**
 * coverage-merge — one report for both halves of the suite.
 *
 *   APEX_JS_COVERAGE=1 node tools/ci/test-bg.mjs tiny            # browser half
 *   NODE_V8_COVERAGE=artifacts/coverage-node npm run test:game-vm-b   # node half
 *   node tools/ci/coverage-merge.mjs                               # merge both
 *   node tools/ci/coverage-merge.mjs --json                        # summary only
 *   node tools/ci/coverage-merge.mjs --in <dir> [--in <dir>] --out <dir>
 *
 * WHY ONE FORMAT. Playwright's `page.coverage.stopJSCoverage()` and Node's
 * NODE_V8_COVERAGE both emit V8 script coverage (url + block ranges + counts).
 * Node's own `--experimental-test-coverage` reporter cannot see the browser
 * half, and Playwright has no reporter at all, so the raw lists are written
 * as-is by tests/helpers/js-coverage.js (browser, one file per test) and by
 * Node itself (one file per process), and this tool is the only consumer.
 * monocart-coverage-reports does the range merge and the lcov/html emit.
 *
 * WHAT COUNTS. Only the game's own sources: the served `js/` and `css/` trees.
 * Test helpers, the vendored three.js island (`js/vendor/`), node_modules and
 * the harness's own scripts are dropped. The `?v=dev` / `?v=<hash>` query the
 * shell appends is stripped so a browser entry and a node entry for the same
 * file land on one row.
 *
 * INPUT DISCOVERY (no flags): every artifacts/coverage-<port>/ directory a
 * flagged browser run left, plus artifacts/coverage-node/ (the NODE_V8_COVERAGE
 * target the docs name). A directory that does not exist is skipped, and an
 * empty union is reported, never thrown — this runs from the reporter's
 * `onEnd`, where a bookkeeping failure must not move the verdict line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ARTIFACTS = path.join(ROOT, "artifacts");
export const NODE_DIR = path.join(ARTIFACTS, "coverage-node");
export const REPORT_DIR = path.join(ARTIFACTS, "coverage-report");

/** Directories a default merge reads: coverage-<port>/ (browser) + coverage-node/. */
export function defaultInputDirs() {
  if (!fs.existsSync(ARTIFACTS)) return [];
  return fs.readdirSync(ARTIFACTS)
    .filter((n) => /^coverage-(\d+|node)$/.test(n))
    .map((n) => path.join(ARTIFACTS, n))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort();
}

/** The game-source path a V8 entry url maps to, or null when it is not one of
 *  ours. Handles both shapes: `http://host:port/js/x.js?v=dev` (browser) and
 *  `file:///…/f1-game/js/x.js` (node, from an absolute vm filename). */
export function sourcePathOf(url) {
  if (typeof url !== "string") return null;
  let p = url.replace(/[?#].*$/, "");
  if (p.startsWith("file://")) {
    p = decodeURIComponent(p.slice("file://".length));
    if (!p.startsWith(ROOT + path.sep)) return null;
    p = p.slice(ROOT.length + 1);
  } else if (/^https?:\/\//.test(p)) {
    p = p.replace(/^https?:\/\/[^/]+\//, "");
  } else if (path.isAbsolute(p)) {
    if (!p.startsWith(ROOT + path.sep)) return null;
    p = p.slice(ROOT.length + 1);
  } else {
    return null;
  }
  p = p.split(path.sep).join("/");
  if (!/^(js|css)\//.test(p)) return null;
  if (p.startsWith("js/vendor/")) return null;
  return p;
}

/** Node's dump carries no source text, and monocart's `add()` (unlike its
 *  NODE_V8_COVERAGE-only `addFromDir()`) reports nothing for an entry without
 *  one. The VM harnesses also run `^const` -> `var` on every file, which
 *  shifts every later offset by two per rewritten line, so the offsets index
 *  the REWRITTEN text. The top-level function's range ends at the script's
 *  length, which says which text V8 measured; the wrong one is dropped rather
 *  than mis-attributed. Returns false when no text fits. */
export function attachSource(entry) {
  if (typeof entry.source === "string") return true;
  const rel = sourcePathOf(entry.url);
  if (!rel) return false;
  let raw;
  try { raw = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (_) { return false; }
  const top = entry.functions.find((f) => f.ranges?.[0]?.startOffset === 0);
  const len = top ? top.ranges[0].endOffset : -1;
  if (len === raw.length) { entry.source = raw; return true; }
  const rewritten = raw.replace(/^const\b/gm, "var");
  if (len === rewritten.length) { entry.source = rewritten; return true; }
  return false;
}

/** Read every *.json under `dir` as either a bare V8 list (browser) or a
 *  `{ result: [...] }` dump (node). Malformed files are counted, not thrown. */
export function readDir(dir) {
  const lists = [];
  let bad = 0;
  if (!fs.existsSync(dir)) return { lists, bad, files: 0 };
  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  for (const n of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
      const list = Array.isArray(j) ? j : Array.isArray(j?.result) ? j.result : null;
      if (!list) { bad++; continue; }
      lists.push(list.filter((e) => e && typeof e.url === "string" && Array.isArray(e.functions)));
    } catch (_) { bad++; }
  }
  return { lists, bad, files: files.length };
}

/** Merge every input into one report. Returns a summary; never throws on an
 *  empty union (the reporter calls this after the verdict line). */
export async function mergeCoverage(opts = {}) {
  const inputs = opts.inputs && opts.inputs.length ? opts.inputs : defaultInputDirs();
  const outputDir = opts.outputDir || REPORT_DIR;
  const reports = opts.reports || ["v8", "lcovonly", "console-summary"];
  let entries = 0, files = 0, bad = 0;
  const lists = [];
  for (const dir of inputs) {
    const r = readDir(dir);
    files += r.files; bad += r.bad;
    for (const list of r.lists) {
      const kept = list.filter((e) => sourcePathOf(e.url) && attachSource(e));
      if (kept.length) { lists.push(kept); entries += kept.length; }
    }
  }
  if (!lists.length) {
    return { ok: false, inputs, files, bad, entries: 0, sources: 0, outputDir, reason: "no coverage entries for js/ or css/ in any input" };
  }
  const { CoverageReport } = await import("monocart-coverage-reports");
  const mcr = new CoverageReport({
    name: "Apex 26 — js/ + css/ coverage (browser + node VM)",
    outputDir,
    reports,
    logging: opts.logging || "error",
    cleanCache: true,
    entryFilter: (e) => Boolean(sourcePathOf(e.url)),
    sourceFilter: (p) => /^(js|css)\//.test(p) && !p.startsWith("js/vendor/"),
    sourcePath: (filePath, info) => sourcePathOf(info?.url) || filePath,
  });
  for (const list of lists) await mcr.add(list);
  const result = await mcr.generate();
  const summary = result?.summary || {};
  return {
    ok: true, inputs, files, bad, entries,
    sources: (result?.files || []).length,
    lines: summary.lines?.pct, functions: summary.functions?.pct, branches: summary.branches?.pct, bytes: summary.bytes?.pct,
    outputDir,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const inputs = [];
  let outputDir;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") inputs.push(path.resolve(argv[++i]));
    else if (argv[i] === "--out") outputDir = path.resolve(argv[++i]);
  }
  return mergeCoverage({ inputs, outputDir, reports: argv.includes("--json") ? ["v8-json"] : undefined }).then((r) => {
    if (argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1; return; }
    if (!r.ok) { console.log(`coverage-merge: ${r.reason} (read ${r.files} file(s) from ${r.inputs.length} dir(s))`); process.exitCode = 1; return; }
    console.log(`coverage-merge: ${r.entries} script entries from ${r.files} file(s) -> ${r.sources} sources; ` +
      `lines ${r.lines}%  functions ${r.functions}%  branches ${r.branches}%  -> ${path.relative(ROOT, r.outputDir)}/index.html`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
