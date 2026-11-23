#!/usr/bin/env node
// @doc Names EVERY failing guard in a `node --test` TAP log with its fix command (efficiency review 2026-10-30, finding 4).
// The commit hook (.githooks/pre-commit) ran the whole guard suite already but printed `grep | tail -20`, so a
// second red guard surfaced one commit later. This lists them all in one pass.
//   node tools/ci/guards-report.mjs <tap-log>        # prints the report; exit 1 when it found a failure
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** First match wins; `fix` is a literal command, or a note when no command can repair it. */
export const HINTS = [
  { re: /ratchet|assert-?pin|ceiling|shrink|slack/i,
    fix: "npm run precommit:fix   (= ratchets.mjs --update --lower-only, then npm run gen: a count that FELL is snapped down); a count that GREW: shrink it, or --update --fragment --reason=\"<why>\"" },
  { re: /groups\.json|gen:check|@gen-shell|generated|drift|TESTING\.md/i, fix: "npm run gen   (then stage the regenerated files)" },
  { re: /merge hygiene|conflict marker|<<<<<<</i, fix: "resolve the marker, then re-stage; check `git diff --cached --check`" },
  { re: /docs-integrity|docs\/|\.md\b/i, fix: "node --test tests/unit/docs-integrity.test.mjs   (first failing line names the file)" },
];

/** Parse TAP text into failing tests: [{ name, file, error }]. */
export function parseFailures(tap) {
  const out = [], lines = String(tap).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)not ok \d+ - (.*)$/.exec(lines[i]);
    if (!m) continue;
    const f = { name: m[2].trim(), file: "", error: "" };
    for (let j = i + 1; j < lines.length && !/^\s*\.\.\.\s*$/.test(lines[j]) && !/^\s*(not )?ok \d+ - /.test(lines[j]); j++) {
      const loc = /^\s*location: '(.*?)(?::\d+:\d+)?'/.exec(lines[j]);
      if (loc) f.file = path.isAbsolute(loc[1]) ? path.relative(ROOT, loc[1]) : loc[1];
      const err = /^\s*error: (?:'(.*)'|(\|[-+]?))\s*$/.exec(lines[j]);
      if (err) f.error = err[1] ?? String(lines[j + 1] || "").trim();
    }
    // A file-level wrapper ("not ok N - /abs/x.test.mjs") restates its nested failures; keep the nested ones.
    if (/\.(m?js|cjs)$/.test(f.name) && out.length) continue;
    out.push(f);
  }
  return out;
}

export function fixFor(f) {
  const text = `${f.file} ${f.name} ${f.error}`;
  const hit = HINTS.find((h) => h.re.test(text));
  return hit ? hit.fix : `node --test ${f.file || "<the failing guard file>"}   (reproduce alone, read the first assertion)`;
}

export function report(tap) {
  const fails = parseFailures(tap);
  if (!fails.length) return "";
  const lines = [`pre-commit: ${fails.length} failing guard${fails.length === 1 ? "" : "s"} — fix them ALL, then commit once:`];
  fails.slice(0, 30).forEach((f, n) => {
    lines.push(`  ${n + 1}. ${f.name}${f.file ? `  [${f.file}]` : ""}`);
    if (f.error) lines.push(`       why: ${f.error.slice(0, 220)}`);
    lines.push(`       fix: ${fixFor(f)}`);
  });
  if (fails.length > 30) lines.push(`  … and ${fails.length - 30} more (see the log)`);
  return lines.join("\n");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error("usage: node tools/ci/guards-report.mjs <tap-log>"); process.exit(2); }
  const text = report(fs.readFileSync(file, "utf8"));
  if (text) console.error(text);
  process.exit(text ? 1 : 0);
}
