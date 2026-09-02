#!/usr/bin/env node
// junit-failed — which SPEC FILES failed, read from Playwright's junit.xml.
// @doc Lists the spec files with a failed or errored testcase in artifacts/test-results-*/junit.xml, as `tests/specs/...` paths for select-specs --failed-from.
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

/** Spec paths (tests/specs/...) with at least one failed/errored testcase. */
export function failedSpecsFrom(xml) {
  const out = new Set();
  // Self-closing testcases are passes; a block has children only on failure
  // or when the reporter attached output.
  for (const m of String(xml).matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = m[1] || "", body = m[2] || "";
    if (!/<(?:failure|error)\b/.test(body)) continue;
    const cn = /\bclassname="([^"]*)"/.exec(attrs);
    if (!cn) continue;
    let file = cn[1].split(" ")[0].replace(/^\.\//, "");
    if (!file.startsWith("tests/")) file = "tests/" + file;
    if (/\.spec\.js$/.test(file)) out.add(file);
  }
  return [...out].sort();
}

/** Every junit.xml under the per-run reporter folders (root/test-results-NNN/). */
export function failedSpecsUnder(root) {
  const out = new Set();
  let dirs = [];
  try { dirs = fs.readdirSync(root).filter((d) => d.startsWith("test-results-")); } catch { return []; }
  for (const d of dirs) {
    const f = path.join(root, d, "junit.xml");
    if (!fs.existsSync(f)) continue;
    for (const s of failedSpecsFrom(fs.readFileSync(f, "utf8"))) out.add(s);
  }
  return [...out].sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || "artifacts";
  const list = failedSpecsUnder(root);
  process.stdout.write(list.join("\n") + (list.length ? "\n" : ""));
  console.error(list.length ? `carrying ${list.length} failing spec(s) forward` : "no failures to carry");
}
