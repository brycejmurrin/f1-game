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

function changedSince(ref) {
  return execFileSync("git", ["diff", "--name-only", ref], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
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
