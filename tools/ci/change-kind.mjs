#!/usr/bin/env node
// Classify a changed-path list for CI step skips (docs / css / code).
// @doc PR diff kind: docs-only, css-only (plus prose), or code — step-level skips, never a pull_request paths filter.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DOCS = [/^docs\//, /\.md$/, /^\.claude\//, /^\.cursor\//, /^\.codex\//];
const isDocs = (f) => DOCS.some((re) => re.test(f));
const isCss = (f) => /^css\//.test(f);

/** @param {string[]} files */
export function changeKind(files) {
  const changed = files.filter(Boolean);
  if (!changed.length) return "empty";
  if (changed.every(isDocs)) return "docs";
  if (changed.every((f) => isDocs(f) || isCss(f)) && changed.some(isCss)) return "css";
  return "code";
}

/** Parse `git diff --name-status -z` into unique paths, rename/copy sources
 *  included (ledger M36). Local twin of tools/lib/changed-files.mjs
 *  parseNameStatusZ — kept here so this module does not import that helper
 *  (importing it rewrites tests/data/impact-map.json, owned by open CI PRs). */
function parseNameStatusZ(out) {
  const f = String(out || "").split("\0");
  if (f[f.length - 1] === "") f.pop();
  const paths = [];
  for (let i = 0; i < f.length;) {
    const status = f[i++];
    const two = /^[RC]/.test(status);
    const a = f[i++];
    if (a !== undefined && a !== "") paths.push(a);
    if (two) { const b = f[i++]; if (b !== undefined && b !== "") paths.push(b); }
  }
  return [...new Set(paths)];
}

/** Paths changed since `ref`, rename/copy sources included (ledger M36).
 *  `--name-only` would list only the destination of a `git mv` and mis-classify
 *  a moved circuit as docs-only. */
export function changedSince(ref, { cwd = ROOT, run = execFileSync } = {}) {
  const out = run("git", ["diff", "--name-status", "-z", "-M", ref], {
    cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  return parseNameStatusZ(out);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--since");
  const files = si >= 0 && argv[si + 1] ? changedSince(argv[si + 1]) : argv.filter((a) => !a.startsWith("--"));
  const kind = changeKind(files);
  if (argv.includes("--github-output")) {
    const gh = process.env.GITHUB_OUTPUT;
    const line = `kind=${kind}\n`;
    if (gh) fs.appendFileSync(gh, line);
    else process.stdout.write(line);
  } else {
    console.log(kind);
  }
}
