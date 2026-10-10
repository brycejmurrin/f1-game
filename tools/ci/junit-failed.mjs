#!/usr/bin/env node
// junit-failed — which SPEC FILES failed, read from Playwright's junit.xml.
// @doc Spec files with a failed/errored testcase in `artifacts/test-results-*/junit.xml`, for `select-specs --failed-from`.
// @section runner
//
// The change-aware gate carries last run's failures forward through this
// list. The inline parser it replaced never matched a single failure:
// Playwright writes <system-out> BEFORE <failure>/<error> inside each
// <testcase>, so a "testcase immediately followed by failure" regex saw
// nothing (two red runs on 2026-09-02 both logged "no failures to carry"),
// and the classname it would have captured is "specs/x.spec.js" — without
// the tests/ prefix the selector's existsSync filter drops it anyway.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Walk every <testcase> with a failure/error child. Yields {name, file}:
 *  `file` is the normalised tests/specs path, or "" when the case has no
 *  classname or one that is not a spec (a setup / import / reporter error). */
function* failedCases(xml) {
  // Self-closing testcases are passes; a block has children only on failure
  // or when the reporter attached output.
  for (const m of String(xml).matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = m[1] || "", body = m[2] || "";
    if (!/<(?:failure|error)\b/.test(body)) continue;
    const cn = /\bclassname="([^"]*)"/.exec(attrs);
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1] || "";
    let file = "";
    if (cn) {
      file = cn[1].split(" ")[0].replace(/^\.\//, "");
      if (!file.startsWith("tests/")) file = "tests/" + file;
      if (!/\.spec\.js$/.test(file)) file = "";
    }
    yield { name, file };
  }
}

/** Spec paths (tests/specs/...) with at least one failed/errored testcase. */
export function failedSpecsFrom(xml) {
  const out = new Set();
  for (const c of failedCases(xml)) if (c.file) out.add(c.file);
  return [...out].sort();
}

/** Failed/errored testcases that name no spec (no classname, or a classname
 *  that is not a spec file) — a load error, a setup throw, a reporter error.
 *  They cannot be carried forward as a path, but they are still a red: the
 *  selected-gate verdict must count them (15-F2, 2026-10-10). */
export function unattributedFailuresFrom(xml) {
  const out = new Set();
  for (const c of failedCases(xml)) if (!c.file) out.add(`(no spec) ${c.name || "unnamed testcase"}`);
  return [...out].sort();
}

/** Number of <testcase> elements: a junit with none ran no test body. */
export function testcaseCount(xml) {
  return (String(xml).match(/<testcase\b/g) || []).length;
}

/** Every junit.xml under the per-run reporter folders (root/test-results-NNN/). */
export function failedSpecsUnder(root, reader = failedSpecsFrom) {
  const out = new Set();
  let dirs = [];
  try { dirs = fs.readdirSync(root).filter((d) => d.startsWith("test-results-")); } catch { return []; }
  for (const d of dirs) {
    const f = path.join(root, d, "junit.xml");
    if (!fs.existsSync(f)) continue;
    for (const s of reader(fs.readFileSync(f, "utf8"))) out.add(s);
  }
  return [...out].sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || "artifacts";
  const list = failedSpecsUnder(root);
  process.stdout.write(list.join("\n") + (list.length ? "\n" : ""));
  console.error(list.length ? `carrying ${list.length} failing spec(s) forward` : "no failures to carry");
}
