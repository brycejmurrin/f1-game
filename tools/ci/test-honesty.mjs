#!/usr/bin/env node
// test-honesty.mjs — find tests that pass by not testing.
// @doc Finds tests that pass by not testing: unexplained skip/fixme/todo, empty bodies, an early bare return before any assert.
// @section runner
//
// A skipped suite that reports green is worse than a red one
// (docs/PERF-FINDINGS.md: test:visual reported "passed 40/40" while
// self-skipping on missing golden PNGs; test:api sat failing for weeks outside
// CI; two mcp-wrap guards skipped on every deploy until 547d665a/c642c322).
// This is the static half of the defence: it scans every spec and unit suite
// for the skip shapes that have actually shipped false confidence here.
//
//   node tools/ci/test-honesty.mjs            # human report, always exit 0
//   node tools/ci/test-honesty.mjs --json     # machine-readable
//   node tools/ci/test-honesty.mjs --strict   # exit 1 when unexplained skips exist
//
// What counts as EXPLAINED: a `SKIP-OK: <reason>` comment within the three
// lines above the skip site (or on it), or a runtime skip that carries a reason
// string (Playwright's `test.skip(cond, "why")` / node:test's `{ skip: "why" }`,
// `{ skip: cond && "why" }`), or a node:test option whose value is a computed
// reason (`{ skip: probe.skip }`, `{ skip: need("zizmor") }`).
// NOT explained: the declaration form `test.skip("name", fn)` / `describe.skip`
// / `test.todo("name")` (its first argument is the TEST NAME, not a reason), a
// condition with no reason (`test.skip(cond)`, `{ skip: os !== "linux" }`) and
// a bare `{ skip: true }` / `{ todo: true }` option.
// BASELINE: tests/data/test-honesty-baseline.json rows {file, text, reason}
// (`text` a substring of the site's line) excuse sites that predate the strict
// rules. Shrink-only: a row that matches no site is STALE and fails --strict.
// The tool is advisory by default — a baseline-free hard gate would go red on
// day one and teach everyone to ignore it; --strict is for CI once clean.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
// --root/--baseline: the unit test's door (a fixture tree with planted skips).
const SCAN_ROOT = path.resolve(flag("--root") || ROOT);
const BASELINE = path.resolve(flag("--baseline") || path.join(ROOT, "tests/data/test-honesty-baseline.json"));
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")).baseline || [] : [];

/** The quote still open at the end of `prefix` (null when none). A real scan, not a parity count: an apostrophe
 *  inside "Baku's" must not make the rest of the line look quoted. */
export function openQuote(prefix) {
  let q = null;
  for (let k = 0; k < prefix.length; k++) {
    const c = prefix[k];
    if (q) { if (c === "\\") k++; else if (c === q) q = null; }
    else if (c === '"' || c === "'" || c === "`") q = c;
  }
  return q;
}

/** The source text of a call's argument list, from the `(` at lines[i][col] to its balanced `)` (≤ 8 lines),
 *  split at top-level commas. Strings, template literals and nested brackets are respected. */
export function callArgs(lines, i, col) {
  const text = lines.slice(i, i + 8).join("\n").slice(col);
  const args = [];
  let depth = 0, cur = "", q = null;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (q) { cur += c; if (c === "\\") { cur += text[++k] ?? ""; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; }
    if ("([{".includes(c)) { depth++; if (depth === 1 && c === "(") continue; }
    else if (")]}".includes(c)) { depth--; if (depth === 0) { if (cur.trim()) args.push(cur.trim()); return args; } }
    else if (c === "," && depth === 1) { args.push(cur.trim()); cur = ""; continue; }
    if (depth >= 1) cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}
const isStr = (a) => /^(["'`])[\s\S]*\1$/.test(a || "");
const isFn = (a) => /^(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>|\{)/.test(a || "");
/** A reason string inside an expression: `cond && "why"`, `c ? "why" : false` — not a comparison operand or call argument. */
const carriesReason = (expr) => /(?:^|&&|\|\||\?|:)\s*["'`]/.test(expr) && !/^\s*["'`]\s*$/.test(expr);
/** A skip/todo option value: "bare" (true), "reason" (a string or computed reason) or "condition" (a bare boolean test). */
export function optionKind(value) {
  const v = value.trim();
  if (/^(?:true|1|!0|!false)$/.test(v)) return "bare";
  if (/^(?:false|0|undefined|null)$/.test(v)) return "off";
  if (isStr(v) || carriesReason(v)) return "reason";
  // `probe.skip` / `need("zizmor")`: a value computed to the reason; a comparison or negation is only a condition
  if (/^[\w$.]+(?:\([^()]*\))?$/.test(v)) return "reason";
  return "condition";
}

const ASSERTS = /\b(?:assert|expect|t\.(?:assert|plan|skip|todo))\b|\bthrow\b/;
/**
 * The first top-level `if (…) return;` (a BARE return: no value) in the body of the test that starts at
 * lines[i][col], when it comes before any assertion; `{line}` (0-based) or null. Only the body's own top level
 * counts (a `return` inside a nested callback returns from that callback), strings and comments are skipped, and
 * the scan stops at the first assert / expect / t.skip / throw or after 60 lines.
 */
export function earlyReturn(lines, i, col) {
  let depth = 0, body = -1, q = null, stmt = "", stmtLine = i;
  for (let li = i; li < Math.min(lines.length, i + 60); li++) {
    const L = lines[li];
    for (let k = li === i ? col : 0; k < L.length; k++) {
      const c = L[k];
      if (q) { if (c === "\\") k++; else if (c === q) q = null; if (depth === body) stmt += " "; continue; }
      if (c === "/" && L[k + 1] === "/") break;
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "{" || c === "(" || c === "[") {
        depth++;
        if (body < 0 && c === "{" && /=>\s*$|\)\s*$/.test(L.slice(0, k))) { body = depth; stmt = ""; stmtLine = li; continue; }
      } else if (c === "}" || c === ")" || c === "]") {
        depth--;
        if (body >= 0 && depth < body) return null;
      }
      if (body < 0) continue;
      if (depth === body && c === ";") {
        if (/^\s*if\s*\(.*\)\s*return\s*$/.test(stmt)) return { line: stmtLine };
        if (ASSERTS.test(stmt)) return null;
        stmt = ""; stmtLine = li; continue;
      }
      if (depth >= body) { if (!stmt.trim()) stmtLine = li; stmt += c; }
    }
    if (body >= 0) {
      if (ASSERTS.test(stmt) && !/^\s*if\s*\(/.test(stmt)) return null;
      stmt += " ";
    }
  }
  return null;
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(spec|test)\.(js|mjs|cjs)$/.test(e.name)) files.push(p);
  }
})(path.join(SCAN_ROOT, "tests"));

const findings = [];
for (const file of files) {
  const rel = path.relative(SCAN_ROOT, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  // Backtick parity: a line reached with an odd count of prior backticks sits
  // inside a template literal — fixture SOURCE for a parser test, not a test
  // (tests/unit/test-observed.test.mjs embeds whole suites as strings).
  let ticks = 0;
  const inString = (i, col, line) => ticks % 2 === 1 || openQuote(line.slice(0, col)) !== null;
  lines.forEach((line, i) => {
    const check = () => {
      // Declaration-form skips: test.skip("name", fn) / describe.skip / fixme.
      const m = line.match(/\b(test|it|describe)\.(skip|fixme|todo)\s*\(/);
      if (!m) return;
      const col = m.index;
      // not a finding when the mention is commented out or inside a string
      const beforeMatch = line.slice(0, col);
      if (beforeMatch.includes("//") || inString(i, col, line)) return;
      const skipOk = lines.slice(Math.max(0, i - 3), i + 1).some((l) => /SKIP-OK:/.test(l));
      const args = callArgs(lines, i, col + m[0].length - 1);
      // `test.skip("name", fn)` / `describe.skip(...)` / `test.todo("name")` is the DECLARATION form: its string is the
      // test's name, not a reason. `test.skip(cond, "why")` is the runtime form and needs its reason string.
      const declaration = m[1] === "describe" || m[2] === "todo" || args.length === 0 || (isStr(args[0]) && (args.length === 1 || isFn(args[1])));
      const reasoned = !declaration && args.slice(1).some(isStr);
      findings.push({
        file: rel, line: i + 1, kind: m[2] + (declaration ? "" : "-cond"),
        explained: skipOk || reasoned,
        text: line.trim().slice(0, 120),
      });
    };
    const option = () => {
      // node:test options: test("name", { skip: true }, fn) — the option may sit on the line after `test(`.
      const near = line + "\n" + (lines[i - 1] || "");
      if (!/\b(?:test|it|describe|suite)\s*\(/.test(near)) return;
      for (const o of line.matchAll(/([{,]\s*)(skip|todo)\s*:\s*/g)) {
        const col = o.index + o[1].length;
        if (line.slice(0, col).includes("//") || inString(i, col, line)) continue;
        const value = callArgs([`(${line.slice(o.index + o[0].length)}`], 0, 0)[0] || "";
        const kind = optionKind(value.replace(/\}\s*$/, ""));
        if (kind === "off") continue;
        const skipOk = lines.slice(Math.max(0, i - 3), i + 1).some((l) => /SKIP-OK:/.test(l));
        findings.push({ file: rel, line: i + 1, kind: `${o[2]}-option`, explained: skipOk || kind === "reason", text: line.trim().slice(0, 120) });
      }
    };
    const empty = () => {
      // Empty test bodies — a test that asserts nothing always passes.
      const m = line.match(/\b(test|it)\s*\(\s*["'`][^"'`]+["'`]\s*,\s*(async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
      if (!m) return;
      if (inString(i, m.index, line)) return;
      findings.push({ file: rel, line: i + 1, kind: "empty-body", explained: false, text: line.trim().slice(0, 120) });
    };
    const early = () => {
      // An early bare `return` at the top of a test body, before any assertion (#5014): the test passes without
      // testing (`if (!fs.existsSync(chrome)) return;` hid the only real-browser Home prepaint check in CI).
      const m = line.match(/\b(test|it)\s*\(\s*["'`]/);
      if (!m || inString(i, m.index, line) || line.slice(0, m.index).includes("//")) return;
      const site = earlyReturn(lines, i, m.index);
      if (!site) return;
      const skipOk = lines.slice(Math.max(0, site.line - 3), site.line + 1).some((l) => /SKIP-OK:/.test(l));
      findings.push({ file: rel, line: site.line + 1, kind: "early-return", explained: skipOk, text: lines[site.line].trim().slice(0, 120) });
    };
    check(); option(); empty(); early();
    ticks += (line.match(/`/g) || []).length;
  });
}

// The shrink-only baseline: each row excuses unexplained sites in its file whose line holds `text`.
const usedRows = new Set();
for (const f of findings) {
  if (f.explained) continue;
  const k = baseline.findIndex((b) => b.file === f.file && b.reason && b.text && f.text.includes(b.text));
  if (k >= 0) { usedRows.add(k); f.explained = "baseline"; }
}
const stale = baseline.filter((b, k) => !usedRows.has(k));
const unexplained = findings.filter((f) => !f.explained);
const out = {
  scanned: files.length,
  findings: findings.length,
  unexplained: unexplained.length,
  baselined: findings.filter((f) => f.explained === "baseline").length,
  stale,
  detail: unexplained,
};
if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`scanned ${out.scanned} test files: ${out.findings} skip/fixme/todo/empty/early-return site(s), ${out.unexplained} unexplained, ${out.baselined} baselined, ${stale.length} stale baseline row(s)`);
  for (const f of unexplained.slice(0, 30)) console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.text}`);
  if (unexplained.length > 30) console.log(`  … and ${unexplained.length - 30} more`);
  for (const b of stale) console.log(`  STALE baseline row ${b.file} ${JSON.stringify(b.text)}: matches no site (delete it; the baseline only shrinks)`);
  if (unexplained.length) console.log(`\nexplain with a "// SKIP-OK: <reason>" comment above the site, or a reason argument.`);
}
process.exit(argv.includes("--strict") && (unexplained.length || stale.length) ? 1 : 0);
