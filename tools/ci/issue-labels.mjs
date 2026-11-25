#!/usr/bin/env node
// issue-labels.mjs — which open issues miss the label scheme: exactly ONE type label and at least one `area:*`.
// READ-ONLY: GETs only, no label, comment or close.
// @doc Issue label audit (reads only): open issues with no type, two types or no area:* label.
// @section runner
// @skill dispatcher
//
// Why (Bryce, 2026-11-25 ~02:44Z, relayed by the orchestrator): every issue carries one type, one or more areas and,
// where it applies, a `source:*`. The backfill that day left 69 of 69 open issues on the scheme; this is the check
// a dispatcher cycle or the Board runs so it stays that way. `source:*`, `phone` and `needs-device` apply only where
// they fit, so nothing here can require them; the tool reports type and area only.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { api as githubApi } from "./github-api.mjs";
import { getAll, labelsOf } from "./dispatch.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** The type labels (steward references/labels.md §Issue scheme); each must exist in .github/labels.json. */
export const TYPES = ["bug", "enhancement", "perf", "refactor", "flaky", "tracking", "epic", "documentation"];

/** One issue's gaps: [] when it is on the scheme. */
export function gapsOf(labels) {
  const types = labels.filter((l) => TYPES.includes(l));
  const gaps = [];
  if (types.length === 0) gaps.push("no type");
  if (types.length > 1) gaps.push(`${types.length} types: ${types.join(", ")}`);
  if (!labels.some((l) => l.startsWith("area:"))) gaps.push("no area");
  return gaps;
}

export function audit(issues) {
  const open = issues.filter((i) => !i.pull_request);
  const rows = open.map((i) => ({ number: i.number, title: i.title, labels: i.labels, gaps: gapsOf(i.labels) })).filter((r) => r.gaps.length);
  return { rows, counts: { open: open.length, off: rows.length } };
}

export function render(result) {
  const out = result.rows.map((r) => `OFF #${r.number} ${r.gaps.join("; ")} [${r.labels.join(", ") || "no labels"}]  — ${String(r.title).slice(0, 70)}`);
  out.push(`= issue-labels: ${result.counts.open} open, ${result.counts.off} off the scheme`);
  return out;
}

/** The labels .github/labels.json names: the tool's TYPES must all be there (tests pin it). */
export function labelsJsonNames(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, ".github/labels.json"), "utf8")).map((l) => l.name);
}

const USAGE = `usage: node tools/ci/issue-labels.mjs [--json]
  reads the open issues (GETs only) and prints one OFF line per issue with no type label, two or more type labels,
  or no area:* label, then a "= issue-labels:" verdict line. Types: ${TYPES.join(" | ")}.
  Writes nothing; fix a row with the one-label issue_write recipe (skill steward references/labels.md).
  exit 0 = every open issue is on the scheme; 2 = some are off; 1 = usage; 3 = GitHub could not be read.`;

export function main(argv, { api = githubApi, log = console.log } = {}) {
  exitIfHelp(argv, USAGE);
  if (argv.some((a) => a !== "--json")) { log(USAGE); return 1; }
  let issues;
  try {
    issues = getAll(api, "issues?state=open").map((x) => ({ number: x.number, title: x.title, labels: labelsOf(x), pull_request: x.pull_request || null }));
  } catch (e) { log(`issue-labels: ${e.message}`); return 3; }
  const result = audit(issues);
  if (argv.includes("--json")) log(JSON.stringify(result, null, 2));
  else for (const line of render(result)) log(line);
  return result.counts.off ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
