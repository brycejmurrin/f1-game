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
// IDENTICAL once their numbers, string literals and trailing `//` comment are masked (so a reworded assertion
// message still pairs), with a number moved the loosening way. Lines pair by that masked form inside a hunk, not
// by index, so a comment inserted above an edited assertion does not shift the pairing.
//   toBeCloseTo(x, D)                         D lowered   (fewer digits of agreement)
//   x <= N, x < N, N > x, N >= x, toBeLessThan[OrEqual](N)        N raised
//   x >= N, x > N, N < x, N <= x, toBeGreaterThan[OrEqual](N)     N lowered
//   < X * N / toBeLessThan(X * N) / tol * N   N raised;  > X * N / toBeGreaterThan(X * N)  N lowered
//   tol/tolerance/eps/epsilon/delta/slack/within = N   |N| raised
//   const ANY_NAME = N, when the file compares against ANY_NAME (`< NAME`, `NAME >`, toBeLessThan(NAME) …)
//                                             moved the way that comparison loosens
// Numbers: 1, 1.5, .5, 1e-6, 1E-6, 1_000. Only lines that assert (expect/assert/toBe…) or name a tolerance are
// looked at for the inline rules, so a loop bound is not a finding.
// WHEN IT FAILS. Only if the same diff also touches production code (js/, css/, index.html, sw.js), because a
// pure test-tightening or test-only PR cannot be hiding a regression; `--always` removes that condition.
// EXCEPTIONS. tests/data/tolerance-exceptions.json rows {file, line, reason}: `line` is a substring of the ADDED
// line. A row with no reason, or a ROTTEN one (its file is gone or no longer contains `line`), FAILS the run
// whatever else changed: delete it. A row that is merely idle in this diff (it excused an earlier PR) is listed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseFlags } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXCEPTIONS = path.join(ROOT, "tests/data/tolerance-exceptions.json");
// A numeric literal: not the tail of an identifier (`vec3`) or a property (`a.0`); leading dot, either-case exponent
// and `_` separators allowed.
const NUM = String.raw`-?(?<![\w$.])(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const TOLNAME = String.raw`\b(?:tol(?:erance)?|eps(?:ilon)?|delta|slack|within)\w*`;
const toNum = (s) => Number(String(s).replace(/_/g, ""));

const isTestFile = (f) => /^tests\/.+\.(?:js|mjs|cjs)$/.test(f);
const isProduction = (f) => /^(?:js\/|css\/|index\.html$|sw\.js$)/.test(f);

/** Each rule: a global regex whose capture group 1 is the number, and which direction is looser. */
const up = (o, n) => n > o, down = (o, n) => n < o;
const RULES = [
  { name: "toBeCloseTo digits", re: new RegExp(String.raw`toBeCloseTo\([^()]*?,\s*(${NUM})\s*\)`, "g"), looser: down },
  { name: "upper bound", re: new RegExp(String.raw`(?:toBeLessThan(?:OrEqual)?\(\s*|(?<![<=>-])<=?\s*)(${NUM})`, "g"), looser: up },
  { name: "lower bound", re: new RegExp(String.raw`(?:toBeGreaterThan(?:OrEqual)?\(\s*|(?<![<=>-])>=?\s*)(${NUM})`, "g"), looser: down },
  // literal first: `0.01 > err` is `err < 0.01`
  { name: "upper bound (literal first)", re: new RegExp(String.raw`(${NUM})\s*>(?![>=]?>)`, "g"), looser: up },
  { name: "lower bound (literal first)", re: new RegExp(String.raw`(${NUM})\s*<(?!<)`, "g"), looser: down },
  // a scaled bound: `< TOL * 2`, `toBeLessThan(ref * 1.1)`, `tol * 3`; `> ref * 0.9`
  { name: "scaled upper bound", re: new RegExp(String.raw`(?:toBeLessThan(?:OrEqual)?\(\s*|(?<![<=>-])<=?\s*)[\w$.]+\s*\*\s*(${NUM})`, "g"), looser: up },
  { name: "scaled lower bound", re: new RegExp(String.raw`(?:toBeGreaterThan(?:OrEqual)?\(\s*|(?<![<=>-])>=?\s*)[\w$.]+\s*\*\s*(${NUM})`, "g"), looser: down },
  { name: "scaled tolerance", re: new RegExp(String.raw`(?:${TOLNAME}\s*\*\s*(${NUM}))`, "gi"), looser: up },
  { name: "named tolerance", re: new RegExp(String.raw`${TOLNAME}\s*[:=,(]\s*(${NUM})`, "gi"),
    looser: (o, n) => Math.abs(n) > Math.abs(o) },
];
const TOLNAME_RE = new RegExp(`^${TOLNAME.slice(2)}$`, "i");
const ASSERTISH = /\b(?:expect|assert|toBe\w*|within|tol\w*|eps\w*|delta|slack)\b/i;
/** Blank string literals and a trailing line comment: an edited message or note is not a different assertion. */
const STRINGS = /(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g;
const code = (line) => String(line).replace(STRINGS, '""').replace(/\/\/.*$/, "");
const mask = (line) => code(line).replace(new RegExp(NUM, "g"), "#").replace(/\s+/g, " ").trim();
const numbers = (re, line) => [...code(line).matchAll(re)].map((m) => toNum(m[1]));

/** `const NAME = N` (also let/var, a NAME: N object field): the declared name and number. */
const DECL = new RegExp(String.raw`(?:\b(?:const|let|var)\s+|^\s*)([A-Za-z_$][\w$]*)\s*[:=]\s*(${NUM})\s*[;,]?\s*$`);
/** How a file's assertions compare against NAME: "up" (NAME is a ceiling), "down" (a floor), or null when it is never a bound. */
export function boundUse(source, name) {
  if (!source) return null;
  const n = name.replace(/\$/g, "\\$");
  const ceil = new RegExp(String.raw`(?:(?<![<=>-])<=?\s*|toBeLessThan(?:OrEqual)?\(\s*)${n}\b|\b${n}\s*>(?![>=]?>)`);
  const floor = new RegExp(String.raw`(?:(?<![<=>-])>=?\s*|toBeGreaterThan(?:OrEqual)?\(\s*)${n}\b|\b${n}\s*<(?!<)`);
  // only asserting lines count: `i < N_LAPS` in a loop is not a bound
  const src = String(source).split("\n").filter((l) => ASSERTISH.test(l)).map(code).join("\n");
  const c = ceil.test(src), f = floor.test(src);
  return c && !f ? "up" : f && !c ? "down" : null;
}

/** Compare one removed line to one added line; every loosened number is one finding. */
export function loosenings(oldLine, newLine, { source = "" } = {}) {
  if (mask(oldLine) !== mask(newLine)) return [];
  const out = [];
  const d = DECL.exec(code(newLine)), od = DECL.exec(code(oldLine));
  if (d && od && !TOLNAME_RE.test(d[1])) {
    const use = boundUse(source, d[1]), o = toNum(od[2]), v = toNum(d[2]);
    if (use && o !== v && (use === "up" ? up : down)(o, v)) out.push({ rule: `bound constant ${d[1]}`, from: o, to: v });
  }
  if (!ASSERTISH.test(newLine)) return out;
  for (const rule of RULES) {
    const a = numbers(rule.re, oldLine), b = numbers(rule.re, newLine);
    if (!a.length || a.length !== b.length) continue;
    a.forEach((o, i) => { if (o !== b[i] && rule.looser(o, b[i])) out.push({ rule: rule.name, from: o, to: b[i] }); });
  }
  // `< TOL * 2` is both a scaled bound and a scaled tolerance: one number moved is one finding.
  return out.filter((f, i) => out.findIndex((g) => g.from === f.from && g.to === f.to) === i);
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

/** The test file's text at HEAD (the checkout): bound-constant uses and rotten exception rows read it. */
export function diskSource(file) {
  try { return fs.readFileSync(path.join(ROOT, file), "utf8"); } catch { return null; }
}

/** -> { findings, excepted, staleExceptions, idleExceptions, production, fail }
 *  `readSource(file)` -> text or null; the unit test passes fixtures, the CLI reads the checkout. */
export function check(diffText, { exceptions = [], always = false, readSource = diskSource } = {}) {
  const files = parseDiff(diffText);
  const production = files.filter((f) => isProduction(f.file)).map((f) => f.file);
  const raw = [];
  const cache = new Map();
  const src = (file) => { if (!cache.has(file)) cache.set(file, readSource(file)); return cache.get(file); };
  for (const f of files) {
    if (!isTestFile(f.file)) continue;
    for (const h of f.hunks) {
      // Pair by masked form, not index: an inserted comment or line above the edit must not shift the pairing.
      const used = new Set();
      for (const add of h.added) {
        const k = mask(add);
        const j = h.removed.findIndex((r, i) => !used.has(i) && mask(r) === k);
        if (j < 0) continue;
        used.add(j);
        for (const l of loosenings(h.removed[j], add, { source: src(f.file) })) raw.push({ file: f.file, line: add.trim(), ...l });
      }
    }
  }
  const used = new Set();
  const findings = [], excepted = [];
  for (const r of raw) {
    const hit = exceptions.findIndex((e) => e.file === r.file && e.reason && r.line.includes(e.line));
    if (hit >= 0) { used.add(hit); excepted.push({ ...r, reason: exceptions[hit].reason }); } else findings.push(r);
  }
  // STALE fails: no reason, or rotten (the file is gone or no longer holds the excused text). An idle row that is
  // still true of the tree excused an earlier PR and is only listed.
  const staleExceptions = [], idleExceptions = [];
  exceptions.forEach((e, i) => {
    if (used.has(i) && e.reason) return;
    const text = e.file ? src(e.file) : null;
    if (!e.reason || !e.line || text == null || !text.includes(e.line)) staleExceptions.push(e);
    else idleExceptions.push(e);
  });
  const fail = (findings.length > 0 && (always || production.length > 0)) || staleExceptions.length > 0;
  return { findings, excepted, staleExceptions, idleExceptions, production, fail };
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
  for (const e of r.staleExceptions) console.log(`STALE exception ${e.file} ${JSON.stringify(e.line)}: no reason, or its file no longer holds that text (delete the row)`);
  console.log(`tolerance-diff: ${r.findings.length} loosened, ${r.excepted.length} excepted, ${r.staleExceptions.length} stale, `
    + `${r.idleExceptions.length} idle exception row(s), ${r.production.length} production file(s) changed`);
  if (r.fail && !cli.has("--advisory")) {
    if (r.staleExceptions.length) console.log("Delete the stale rows from tests/data/tolerance-exceptions.json.");
    console.log("Fix the code, not the assertion. If the looser bound is the right new truth, add a row with a reason to tests/data/tolerance-exceptions.json.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
