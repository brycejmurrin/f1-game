#!/usr/bin/env node
// @doc Duration-balanced fat UI spec pieces: static titles + per-title timings, LPT-packed into --test-list files.
// @section runner
//
// WHY (perf hunt P8 #4548, row 6). select-specs shards() splits career,
// career-season, career-hub and hud-layout into native `--shard=i/n` pieces,
// and playwright.config.js is fullyParallel, so Playwright cuts the file into
// n contiguous runs of EQUAL TEST COUNT. Per-title durations differ 2-6x
// (tests/data/spec-timings.json `t`), so equal counts are not equal minutes:
// hud-layout quarters ran 6.1 / 8.6 / 11.8 / 6.3 min at 14 tests each (run
// 41606130214) and the slowest piece set the wall.
//
// THE FIX, with no workflow or playwright.config.js edit. ci.yml's `selected`
// leg still passes `--shard=i/n`; run-playwright.mjs hands a lone fat spec +
// --shard to fatShardArgs() below, which swaps the flag for a Playwright test
// list (`--test-list`, Playwright 1.63):
//   1. list the spec's titles in declaration order WITHOUT a browser — a stub
//      `@playwright/test` records each test() call (listTitlesHere);
//   2. price each title at its measured median, an unknown title at the
//      spec's median rate (never dropped) (titleCosts);
//   3. pack the titles into n pieces longest-first onto the least-loaded piece
//      (LPT, lptPieces) — deterministic, so every leg computes the same plan.
// EXACTLY ONCE, BY CONSTRUCTION: pieces 1..n-1 run `--test-list` of their own
// titles; piece n runs `--test-list-invert` of the union of 1..n-1. A test the
// stub could not see, or whose title it got wrong, matches no list and so
// lands in piece n — it can be mis-balanced, never skipped or doubled. When
// the spec cannot be listed at all, the leg keeps Playwright's count shard.
// THE FILE PART of a list line is matched against the test's path relative to
// Playwright's rootDir (playwright.config.js testDir "./tests"), NOT the repo:
// "specs/x.spec.js › …". A repo-relative "tests/specs/…" line matches nothing,
// so pieces 1..n-1 ran 0 tests green and piece n ran the whole spec (#4812).
//
// CLI: node tools/ci/fat-shard.mjs <spec> [n] [rate]   — the n-piece plan vs the count split.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SELF = fileURLToPath(import.meta.url);

/** The fat UI specs shards() splits into native --shard pieces. */
export const FAT_UI_SPEC = /(?:^|\/)(career|career-season|career-hub|hud-layout)\.spec\.js$/;
/** Playwright's title-path delimiter in a --test-list line. */
const SEP = " › ";
/** Playwright's rootDir (playwright.config.js testDir), repo-relative. A list
 *  line's file is relative to it; select-specs.test.mjs pins it against a real
 *  `playwright test --list` run. */
export const PW_ROOT_DIR = "tests";
/** A repo-relative spec path as a --test-list line names it. */
export const listFile = (file) => path.posix.relative(PW_ROOT_DIR, file.replace(/\\/g, "/").replace(/^\.\//, ""));

// A stand-in for `@playwright/test` that records declarations, in order, as
// Playwright's title path minus project and file ("describe › test").
const STUB = `
const sink = globalThis.__apexSpecTitles;
const stack = [];
const any = () => new Proxy(function () {}, {
  get: (_, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => "" : any()),
  apply: () => any(), construct: () => any() });
const fnOf = (args) => args.find((a) => typeof a === "function");
const declare = (args) => { if (typeof args[0] === "string" && fnOf(args)) sink.push([...stack, args[0]]); };
const describe = (...args) => {
  const fn = fnOf(args);
  if (!fn) return;
  const named = typeof args[0] === "string";
  if (named) stack.push(args[0]);
  try { fn(); } finally { if (named) stack.pop(); }
};
for (const m of ["only", "skip", "fixme", "serial", "parallel"]) describe[m] = describe;
describe.configure = () => {};
const test = (...args) => declare(args);
test.describe = describe;
for (const m of ["only", "skip", "fixme", "fail", "slow"]) test[m] = (...args) => declare(args);
for (const m of ["beforeEach", "afterEach", "beforeAll", "afterAll", "use", "setTimeout"]) test[m] = () => {};
test.extend = () => test;
test.step = any(); test.info = any(); test.expect = any();
export { test };
export const expect = any();
export const devices = any();
export default test;
`;

let hooked = false;
/** IN THIS PROCESS: import `file` against the stub and return its title
 *  paths (arrays). Registers a process-wide module hook, so callers outside
 *  this file's CLI use specTitles(). */
export async function listTitlesHere(file) {
  if (!hooked) {
    hooked = true;
    const url = `data:text/javascript,${encodeURIComponent(STUB)}`;
    registerHooks({
      resolve(specifier, context, next) {
        if (specifier === "@playwright/test") return { url, format: "module", shortCircuit: true };
        return next(specifier, context);
      },
    });
  }
  globalThis.__apexSpecTitles = [];
  await import(`${pathToFileURL(path.resolve(ROOT, file)).href}?titles=${Date.now()}`);
  return globalThis.__apexSpecTitles;
}

/** The spec's test titles ("describe › test") in declaration order, listed in
 *  a child process so the stub hook never leaks into the caller. null when
 *  the spec cannot be loaded. */
export function specTitles(file) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [SELF, "--titles", file], { cwd: ROOT, encoding: "utf8", env });
  if (r.status !== 0) return null;
  try {
    const out = JSON.parse(r.stdout);
    return Array.isArray(out) ? out.map((p) => p.join(SEP)) : null;
  } catch { return null; }
}

/** Why a title list cannot be written as --test-list lines (null = it can).
 *  A line is split on "›" and trimmed, and an entry also matches any test it
 *  is a title-path PREFIX of, so either case could make one entry claim two
 *  tests. Duplicates are a Playwright load error anyway. */
export function unlistable(titles) {
  const seen = new Set();
  const paths = titles.map((t) => t.split(SEP));
  for (const [i, p] of paths.entries()) {
    if (p.some((x) => x.includes("›") || x !== x.trim() || !x || /[\r\n]/.test(x))) return `title ${JSON.stringify(titles[i])} cannot round-trip a test list`;
    if (seen.has(titles[i])) return `duplicate title ${JSON.stringify(titles[i])}`;
    seen.add(titles[i]);
  }
  for (const t of titles) for (const u of titles) {
    if (u !== t && u.startsWith(t + SEP)) return `title ${JSON.stringify(t)} is a prefix of ${JSON.stringify(u)}`;
  }
  return null;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Seconds per title: its measured median (spec-timings `t`), else the median
 *  of this list's measured titles, else of the spec's table, else
 *  `fallbackSec`. Every title gets a price: an unknown one is never dropped. */
export function titleCosts(file, titles, db, fallbackSec) {
  const known = new Map();
  for (const [title, rows] of Object.entries(db?.specs?.[file]?.t || {})) {
    const m = median((rows || []).map((r) => r[2]).filter((x) => Number.isFinite(x)));
    if (m != null) known.set(title, m);
  }
  const rate = median(titles.map((x) => known.get(x)).filter((x) => x != null))
    ?? median([...known.values()]) ?? fallbackSec;
  return titles.map((x) => known.get(x) ?? rate);
}

/** Longest-processing-time packing of `costs` into n pieces: indices sorted
 *  by cost (ties by declaration order), each onto the least-loaded piece
 *  (ties to the lower piece). Deterministic. Each piece's indices come back
 *  in declaration order. */
export function lptPieces(costs, n) {
  const pieces = Array.from({ length: n }, () => ({ idx: [], sec: 0 }));
  const order = costs.map((_, i) => i).sort((a, b) => costs[b] - costs[a] || a - b);
  for (const i of order) {
    let k = 0;
    for (let j = 1; j < n; j++) if (pieces[j].sec < pieces[k].sec) k = j;
    pieces[k].idx.push(i);
    pieces[k].sec += costs[i];
  }
  for (const p of pieces) p.idx.sort((a, b) => a - b);
  return pieces;
}

/** Playwright's own count shard over a fullyParallel file (filterForShard
 *  with no weights): contiguous runs of floor(m/n), the remainder to the
 *  first shards. Returns the index lists, for comparison with lptPieces. */
export function countSplitPieces(m, n) {
  const base = Math.floor(m / n);
  const out = [];
  let from = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < m - base * n ? 1 : 0);
    out.push(Array.from({ length: size }, (_, k) => from + k));
    from += size;
  }
  return out;
}

/** The n-piece plan for a fat spec: titles, costs, and per piece its titles
 *  and planned seconds. null when the spec cannot be listed, has fewer tests
 *  than pieces, or a title cannot round-trip a test list (the caller then
 *  keeps the count shard). */
export function fatShardPlan(file, n, db, fallbackSec, titles = specTitles(file)) {
  if (!titles || titles.length < n || n < 2 || unlistable(titles)) return null;
  const costs = titleCosts(file, titles, db, fallbackSec);
  const pieces = lptPieces(costs, n).map((p) => ({ titles: p.idx.map((i) => titles[i]), sec: p.sec }));
  return { titles, costs, pieces };
}

/** Rewrite one leg's Playwright argv: a lone fat spec + `--shard=i/n` becomes
 *  `--test-list` (pieces 1..n-1) or `--test-list-invert` (piece n) over a
 *  list file under `outDir`. Anything else, or a plan that cannot be made,
 *  returns the argv unchanged. `note` says what happened, for the log. */
export function fatShardArgs(args, { db, fallbackSec, outDir, titlesOf = specTitles }) {
  const at = args.findIndex((a) => a === "--shard" || /^--shard=/.test(a));
  if (at < 0) return { args, note: null };
  const tok = args[at] === "--shard" ? args[at + 1] : args[at].slice("--shard=".length);
  const m = /^(\d+)\/(\d+)$/.exec(tok || "");
  const specs = args.filter((a, i) => !a.startsWith("-") && !(args[at] === "--shard" && i === at + 1));
  if (!m || specs.length !== 1 || !FAT_UI_SPEC.test(specs[0])
      || args.some((a) => /^(--test-list|--test-list-invert|--grep|-g|--grep-invert|-G|--last-failed|--list)(=|$)/.test(a))) {
    return { args, note: null };
  }
  const i = +m[1], n = +m[2];
  const file = specs[0].replace(/^\.\//, "");
  const plan = n >= 2 && i >= 1 && i <= n ? fatShardPlan(file, n, db, fallbackSec, titlesOf(file)) : null;
  if (!plan) return { args, note: `fat-shard: no plan for ${file} (${n} pieces) — keeping Playwright's count shard` };
  const head = listFile(file);
  if (head.startsWith("..")) return { args, note: `fat-shard: ${file} is outside ${PW_ROOT_DIR}/ — keeping Playwright's count shard` };
  const lines = (pieces) => pieces.flatMap((p) => p.titles.map((t) => `${head}${SEP}${t}`)).join("\n") + "\n";
  const last = i === n;
  const list = path.join(outDir, `${path.basename(file, ".spec.js")}-${i}of${n}.txt`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(list, lines(last ? plan.pieces.slice(0, n - 1) : [plan.pieces[i - 1]]));
  const flag = last ? `--test-list-invert=${list}` : `--test-list=${list}`;
  const out = args.filter((_, k) => k !== at && !(args[at] === "--shard" && k === at + 1));
  const secs = plan.pieces.map((p) => Math.round(p.sec)).join("/");
  return { args: [...out, flag], plan,
    note: `fat-shard ${i}/${n}: ${plan.pieces[i - 1].titles.length} of ${plan.titles.length} tests, ~${Math.round(plan.pieces[i - 1].sec)} s `
      + `(planned ${secs} s by measured title time${last ? "; this piece also takes any test the other lists miss" : ""})` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--titles") {
    process.stdout.write(JSON.stringify(await listTitlesHere(argv[1])));
    process.exit(0);
  }
  if (!argv[0] || argv[0] === "--help" || argv[0] === "-h") {
    console.log("usage: node tools/ci/fat-shard.mjs <spec> [n] [unknown-title s, default 45]   (the n-piece duration-balanced plan vs Playwright's count shard)");
    process.exit(0);
  }
  const { timings } = await import("./select-budget.mjs");
  // select-specs.mjs imports this file, so its FAT_UI_SEC_PER_TEST (45) cannot
  // be awaited from here (a top-level-await cycle); the CLI takes it as [rate].
  const n = Number(argv[1] || 2);
  const plan = fatShardPlan(argv[0], n, timings(), Number(argv[2] || 45));
  if (!plan) { console.error(`no plan for ${argv[0]} in ${n} pieces`); process.exit(1); }
  const sum = (idx) => Math.round(idx.reduce((t, k) => t + plan.costs[k], 0));
  console.log(JSON.stringify({ tests: plan.titles.length,
    balancedSec: plan.pieces.map((p) => Math.round(p.sec)), balancedTests: plan.pieces.map((p) => p.titles.length),
    countSplitSec: countSplitPieces(plan.titles.length, n).map(sum) }));
}
