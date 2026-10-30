#!/usr/bin/env node
// ship-pr.mjs — the one ready→flip→land route: run ready-gate, then print the exact next two calls.
// @doc Runs ready-gate on a draft PR; on a pass prints the two calls that land it (MCP draft:false flip, `land` label).
// @skill ship
//
// It never calls the ready or merge endpoints itself: the draft→ready flip stays the GitHub MCP `update_pull_request`
// call the hooks gate on a fresh ready-gate receipt (10 min, tools/lib/gate-receipt.mjs), and `land` stays a label
// (docs/WORKERS.md §5). A receipt older than that: re-run this command.
//
//   node tools/ci/ship-pr.mjs --pr <n> [--repo owner/name]
//
// Exit: ready-gate's own (0 pass, 1 refused, 3 no token / API error).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { MAX_AGE_MIN } from "../lib/gate-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USAGE = "usage: node tools/ci/ship-pr.mjs --pr <n> [--repo owner/name]\n  Runs ready-gate on the draft PR; on exit 0 prints the two calls that land it. Flips and labels nothing itself.";

/** The two calls after a passing ready-gate, as lines to print. Pure. */
export function nextCalls(pr, repo = "brycejmurrin/f1-game") {
  return [
    `1. GitHub MCP update_pull_request  owner/repo=${repo}  pullNumber=${pr}  draft:false   (receipt good for ${MAX_AGE_MIN} min; older: re-run ready-gate)`,
    `2. gh api -X POST repos/${repo}/issues/${pr}/labels -f 'labels[]=land'   (after the flip: \`land\` on a draft does nothing)`,
    `then refresh the Hand-off block and subscribe_pr_activity (re-subscribe after the flip); GitHub merges it, not you.`,
  ];
}

export function main(argv, { run = (a) => spawnSync(process.execPath, [path.join(ROOT, "tools/ci/ready-gate.mjs"), ...a], { stdio: "inherit" }).status ?? 3, log = console.log } = {}) {
  exitIfHelp(argv, USAGE);
  const i = argv.indexOf("--pr"), pr = i >= 0 ? argv[i + 1] : "";
  if (!/^\d{1,7}$/.test(pr || "")) { log(USAGE); return 1; }
  const j = argv.indexOf("--repo");
  const code = run(["--pr", pr]);
  if (code === 0) nextCalls(pr, j >= 0 ? argv[j + 1] : undefined).forEach((l) => log(l));
  else log(code === 1 ? `ready-gate refused #${pr}: fix what its \`= ready-gate\` line names, then re-run ship-pr (no flip, no \`land\` yet)` : `ready-gate could not judge #${pr} (exit ${code}): re-run ship-pr`);
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
