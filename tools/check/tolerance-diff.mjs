#!/usr/bin/env node
// @doc Fails a PR that loosens a test tolerance (toBeCloseTo digits, a bound, tol/eps) beside production edits.
// @section runner
//
// tolerance-diff — AGENTS.md rule 9 ("never widen a tolerance … to get green") was prose only. A test that
// goes red after a production change is most cheaply "fixed" by loosening its assertion; this reads the diff
// and refuses that shape.
//
//   node tools/check/tolerance-diff.mjs --base <ref>          # diff merge-base(<ref>, HEAD)..HEAD; exit 1 on a finding
//   node tools/check/tolerance-diff.mjs --base <ref> --always # also fail when no production file changed
//   node tools/check/tolerance-diff.mjs --diff-file f.diff    # a `git diff -U0` already on disk (the unit test's door)
//   node tools/check/tolerance-diff.mjs --base <ref> --advisory   # print, exit 0
//
// WHAT COUNTS. In a changed test file (tests/**/*.{js,mjs,cjs}) a removed line and an added line that are
// IDENTICAL once their numbers are masked, with the number moved the loosening way:
//   toBeCloseTo(x, D)                      D lowered   (fewer digits of agreement)
//   <= N, < N, toBeLessThan[OrEqual](N)    N raised
//   >= N, > N, toBeGreaterThan[OrEqual](N) N lowered
//   tol/tolerance/eps/epsilon/delta/slack/within = N   |N| raised
// Only lines that assert (expect/assert/toBe…) or name a tolerance are looked at, so a loop bound is not a finding.
// WHEN IT FAILS. Only if the same diff also touches production code (js/, css/, index.html, sw.js), because a
// pure test-tightening or test-only PR cannot be hiding a regression; `--always` removes that condition.
// EXCEPTIONS. tests/data/tolerance-exceptions.json rows {file, line, reason}: `line` is a substring of the ADDED
// line. A row with no reason, or one that matches nothing in this diff, is itself reported (stale rows rot).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseFlags } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXCEPTIONS = path.join(ROOT, "tests/data/tolerance-exceptions.json");
const NUM = String.raw`-?\d+(?:\.\d+)?(?:e-?\d+)?`;

const isTestFile = (f) => /^tests\/.+\.(?:js|mjs|cjs)$/.test(f);
const isProduction = (f) => /^(?:js\/|css\/|index\.html$|sw\.js$)/.test(f);

/** Each rule: a global regex whose capture group 1 is the number, and which direction is looser. */
const RULES = [
  { name: "toBeCloseTo digits", re: new RegExp(String.raw`toBeCloseTo\([^()]*?,\s*(${NUM})\s*\)`, "g"), looser: (o, n) => n < o },
  { name: "upper bound", re: new RegExp(String.raw`(?:toBeLessThan(?:OrEqual)?\(\s*|(?<![<=>-])<=?\s*)(${NUM})`, "g"), looser: (o, n) => n > o },
  { name: "lower bound", re: new RegExp(String.raw`(?:toBeGreaterThan(?:OrEqual)?\(\s*|(?<![<=>-])>=?\s*)(${NUM})`, "g"), looser: (o, n) => n < o },
  { name: "named tolerance", re: new RegExp(String.raw`\b(?:tol(?:erance)?|eps(?:ilon)?|delta|slack|within)\w*\s*[:=,(]\s*(${NUM})`, "gi"),
    looser: (o, n) => Math.abs(n) > Math.abs(o) },
];
const ASSERTISH = /\b(?:expect|assert|toBe\w*|within|tol\w*|eps\w*|delta|slack)\b/i;
const mask = (line) => line.replace(new RegExp(NUM, "g"), "#").replace(/\s+/g, " ").trim();
const numbers = (re, line) => [...line.matchAll(re)].map((m) => Number(m[1]));

/** Compare one removed line to one added line; every loosened number is one finding. */
export function loosenings(oldLine, newLine) {
  if (!ASSERTISH.test(newLine) || mask(oldLine) !== mask(newLine)) return [];
  const out = [];
  for (const rule of RULES) {
    const a = numbers(rule.re, oldLine), b = numbers(rule.re, newLine);
    if (!a.length || a.length !== b.length) continue;
    a.forEach((o, i) => { if (o !== b[i] && rule.looser(o, b[i])) out.push({ rule: rule.name, from: o, to: b[i] }); });
  }
  return out;
}

/** Parse `git diff -U0` text: per file, the hunks' removed / added lines. */
export function parseDiff(text) {
  const files = [];
  let cur = null, hunk = null;
  for (const raw of String(text).split("\n")) {
    const f = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw);
    if (f) { cur = { file: f[2], hunks: [] }; files.push(cur); hunk = null; continue; }
    if (!cur) continue;
    if (raw.startsWith("@@")) { hunk = { removed: [], added: [] }; cur.hunks.push(hunk); continue; }
    if (!hunk || raw.startsWith("---") || raw.startsWith("+++")) continue;
    if (raw.startsWith("-")) hunk.removed.push(raw.slice(1));
    else if (raw.startsWith("+")) hunk.added.push(raw.slice(1));
  }
  return files;
}

export function loadExceptions(file = EXCEPTIONS) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")).exceptions || [];
}

/** -> { findings, excepted, staleExceptions, production, fail } */
export function check(diffText, { exceptions = [], always = false } = {}) {
  const files = parseDiff(diffText);
  const production = files.filter((f) => isProduction(f.file)).map((f) => f.file);
  const raw = [];
  for (const f of files) {
    if (!isTestFile(f.file)) continue;
    for (const h of f.hunks) {
      // Pair in order: the i-th removed line with the i-th added line, which is what -U0 emits for an in-place edit.
      for (let i = 0; i < Math.min(h.removed.length, h.added.length); i++) {
        for (const l of loosenings(h.removed[i], h.added[i])) raw.push({ file: f.file, line: h.added[i].trim(), ...l });
      }
    }
  }
  const used = new Set();
  const findings = [], excepted = [];
  for (const r of raw) {
    const hit = exceptions.findIndex((e) => e.file === r.file && e.reason && r.line.includes(e.line));
    if (hit >= 0) { used.add(hit); excepted.push({ ...r, reason: exceptions[hit].reason }); } else findings.push(r);
  }
  const staleExceptions = exceptions.filter((e, i) => !e.reason || !used.has(i));
  return { findings, excepted, staleExceptions, production, fail: findings.length > 0 && (always || production.length > 0) };
}

function gitDiff(base) {
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 << 20 });
  let from = base;
  try { from = git("merge-base", base, "HEAD").trim(); } catch { /* an unrelated ref: diff it directly */ }
  return git("diff", "-U0", "--no-color", from, "HEAD", "--", "tests", "js", "css", "index.html", "sw.js");
}

function main() {
  const argv = process.argv.slice(2);
  const cli = parseFlags(argv, ["--base", "--diff-file", "--always", "--advisory", "--help"]);
  if (cli.has("--help") || (!cli.has("--base") && !cli.has("--diff-file"))) {
    console.log("usage: node tools/check/tolerance-diff.mjs --base <ref> [--always] [--advisory]\n"
      + "       node tools/check/tolerance-diff.mjs --diff-file <git diff -U0 file>\n"
      + "  Fails when a diff loosens a test tolerance next to production changes (rows excepted in tests/data/tolerance-exceptions.json).");
    return;
  }
  let text;
  try { text = cli.has("--diff-file") ? fs.readFileSync(cli.flag("--diff-file"), "utf8") : gitDiff(cli.flag("--base")); }
  catch (e) { console.error(`tolerance-diff: cannot read the diff (${String(e.message).split("\n")[0]}); a shallow clone needs the base fetched`); process.exit(2); }
  const r = check(text, { exceptions: loadExceptions(), always: cli.has("--always") });
  for (const f of r.findings) console.log(`LOOSENED ${f.file}: ${f.rule} ${f.from} -> ${f.to}   ${f.line}`);
  for (const e of r.excepted) console.log(`excepted ${e.file}: ${e.rule} ${e.from} -> ${e.to} (${e.reason})`);
  for (const e of r.staleExceptions) console.log(`STALE exception ${JSON.stringify(e)}: it matches nothing in this diff or has no reason (delete it)`);
  console.log(`tolerance-diff: ${r.findings.length} loosened, ${r.excepted.length} excepted, ${r.production.length} production file(s) changed`);
  if (r.fail && !cli.has("--advisory")) {
    console.log("Fix the code, not the assertion. If the looser bound is the right new truth, add a row with a reason to tests/data/tolerance-exceptions.json.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
