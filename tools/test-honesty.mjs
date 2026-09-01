#!/usr/bin/env node
// test-honesty.mjs — find tests that pass by not testing.
// @doc Finds tests that pass by not testing: bare `test.skip`/`fixme`/`todo` without a `SKIP-OK:` reason, and empty bodies.
// @section runner
//
// A skipped suite that reports green is worse than a red one
// (docs/PERF-FINDINGS.md: test:visual reported "passed 40/40" while
// self-skipping on missing golden PNGs; test:api sat failing for weeks outside
// CI; two mcp-wrap guards skipped on every deploy until 547d665a/c642c322).
// This is the static half of the defence: it scans every spec and unit suite
// for the skip shapes that have actually shipped false confidence here.
//
//   node tools/test-honesty.mjs            # human report, always exit 0
//   node tools/test-honesty.mjs --json     # machine-readable
//   node tools/test-honesty.mjs --strict   # exit 1 when unexplained skips exist
//
// What counts as EXPLAINED: a `SKIP-OK: <reason>` comment within the three
// lines above the skip site, or a runtime skip that carries a reason string
// (Playwright's `test.skip(cond, "why")` / node:test's `{ skip: "why" }`).
// The tool is advisory by default — a baseline-free hard gate would go red on
// day one and teach everyone to ignore it; --strict is for CI once clean.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(spec|test)\.(js|mjs|cjs)$/.test(e.name)) files.push(p);
  }
})(path.join(ROOT, "tests"));

const findings = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  // Backtick parity: a line reached with an odd count of prior backticks sits
  // inside a template literal — fixture SOURCE for a parser test, not a test
  // (tests/unit/test-observed.test.mjs embeds whole suites as strings).
  let ticks = 0;
  const inString = (i, col, line) =>
    ticks % 2 === 1 || /["'`]/.test(line.slice(0, col).replace(/\/\/.*/, "").match(/["'`=]*$/)?.[0] || "") ||
    (line.slice(0, col).match(/["'`]/g) || []).length % 2 === 1;
  lines.forEach((line, i) => {
    const check = () => {
      // Declaration-form skips: test.skip("name", fn) / describe.skip / fixme.
      const m = line.match(/\b(test|it|describe)\.(skip|fixme|todo)\s*\(/);
      if (!m) return;
      const col = m.index;
      // not a finding when the mention is commented out or inside a string
      const beforeMatch = line.slice(0, col);
      if (beforeMatch.includes("//") || inString(i, col, line)) return;
      const explained =
        lines.slice(Math.max(0, i - 3), i + 1).some((l) => /SKIP-OK:/.test(l)) ||
        // any argument = the conditional runtime form (test.skip(cond, "why"),
        // possibly spanning lines) — it names its condition, so it explains
        // itself; the target is the BARE declaration-form skip.
        /\.(skip|fixme|todo)\s*\(\s*[^)\s]/.test(line);
      findings.push({
        file: rel, line: i + 1, kind: m[2],
        explained,
        text: line.trim().slice(0, 120),
      });
    };
    const empty = () => {
      // Empty test bodies — a test that asserts nothing always passes.
      const m = line.match(/\b(test|it)\s*\(\s*["'`][^"'`]+["'`]\s*,\s*(async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
      if (!m) return;
      if (inString(i, m.index, line)) return;
      findings.push({ file: rel, line: i + 1, kind: "empty-body", explained: false, text: line.trim().slice(0, 120) });
    };
    check(); empty();
    ticks += (line.match(/`/g) || []).length;
  });
}

const unexplained = findings.filter((f) => !f.explained);
const out = {
  scanned: files.length,
  findings: findings.length,
  unexplained: unexplained.length,
  detail: unexplained,
};
if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`scanned ${out.scanned} test files: ${out.findings} skip/fixme/empty site(s), ${out.unexplained} unexplained`);
  for (const f of unexplained.slice(0, 30)) console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.text}`);
  if (unexplained.length > 30) console.log(`  … and ${unexplained.length - 30} more`);
  if (unexplained.length) console.log(`\nexplain with a "// SKIP-OK: <reason>" comment above the site, or a reason argument.`);
}
process.exit(argv.includes("--strict") && unexplained.length ? 1 : 0);
