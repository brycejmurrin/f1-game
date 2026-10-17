#!/usr/bin/env node
// iphone-census-summary.mjs — the Verdict step of iphone-census.yml.
// @doc Verdict step of iphone-census.yml: prints and appends the summary, exits 1 on a failed verdict.
// @skill renderer-debug
// Reads <dir>/iphone-census.json, prints the summary, appends it to
// $GITHUB_STEP_SUMMARY, and exits 1 on a failed verdict. Logic: iphone-census-lib.mjs.
import fs from "node:fs";
import path from "node:path";
import { renderSummary, verdict } from "./iphone-census-lib.mjs";

const dir = process.argv[2] || "artifacts/iphone-census";
let res = null;
try { res = JSON.parse(fs.readFileSync(path.join(dir, "iphone-census.json"), "utf8")); } catch (_) { /* named below */ }
if (!res) {
  const msg = `## iPhone census\n\n**Verdict: FAIL** — no ${dir}/iphone-census.json (the driver never produced a result; read the "Run census" step).`;
  console.log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + "\n");
  process.exit(1);
}
const v = verdict(res);
const md = renderSummary(res, v);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
fs.writeFileSync(path.join(dir, "summary.md"), md + "\n");
process.exit(v.bad.length ? 1 : 0);
