#!/usr/bin/env node
// post-merge.mjs — after a PR merges: was it a merge commit, release the claim, list check-ins to delete.
// @doc Checks a merged PR's merge commit has 2 parents, releases the claim, lists check-ins to delete.
// Full description: Reads the PR and its merge commit through the REST API: `merge ok (2 parents)` or `SQUASH` (one parent; the repo only merges with merge commits). Then runs `who-is-on-it.mjs --release` and prints the fleet block's `checkin=` triggers as `delete_trigger <id>` lines. Evidence: 7 of 14 workers hand-checked the merge parents (`git log --merges --grep`).
// @skill agent-fleet
//
//   node tools/ci/post-merge.mjs 12 [--no-release]
//
// Exit 0 merge ok, 1 squash / not merged, 3 API error.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ghRequest, fleetEntries } from "./pr-body.mjs";
import { CliArgError, exitIfHelp, makeFlags } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Pure: classify a merged PR from its REST objects. */
export function mergeVerdict(pr, commit) {
  if (!pr?.merged) return { state: "not-merged", ok: false, evidence: `PR is ${pr?.state || "unknown"}, not merged` };
  const n = commit?.parents?.length;
  if (n === 2) return { state: "merge", ok: true, evidence: "merge ok (2 parents)" };
  if (n === 1) return { state: "squash", ok: false, evidence: `SQUASH (1 parent) — ${String(pr.merge_commit_sha).slice(0, 7)} is not a merge commit; tell Merge Desk (AGENTS.md §Concurrent PRs)` };
  return { state: "unknown", ok: false, evidence: `merge commit has ${n ?? "no"} parents` };
}

const USAGE = `usage: node tools/ci/post-merge.mjs <pr> [--no-release]
  Prints "merge ok (2 parents)" or "SQUASH" for the merged PR's merge commit, runs
  who-is-on-it.mjs --release (skip with --no-release), and lists the fleet block's checkin= triggers to delete.`;

export function main(argv, { request = ghRequest, run = spawnSync, log = console.log } = {}) {
  const f = makeFlags(argv, ["--no-release", "--help"]);
  const n = argv.find((a) => !a.startsWith("--"));
  if (!/^\d+$/.test(n || "")) throw new CliArgError("a PR number is required");
  const pr = request("GET", `pulls/${n}`);
  if (pr.error) { log(`[post-merge] = post-merge unknown — PR #${n}: ${pr.error}`); return 3; }
  let commit = null;
  if (pr.json?.merged && pr.json.merge_commit_sha) {
    const c = request("GET", `commits/${pr.json.merge_commit_sha}`);
    if (c.error) { log(`[post-merge] = post-merge unknown — merge commit: ${c.error}`); return 3; }
    commit = c.json;
  }
  const v = mergeVerdict(pr.json, commit);
  log(`[post-merge] = post-merge ${v.state} — #${n}: ${v.evidence}`);
  if (!f.has("--no-release")) {
    const r = run("node", ["tools/ci/who-is-on-it.mjs", "--release"], { cwd: ROOT, encoding: "utf8" });
    log(`[post-merge] who-is-on-it --release ${r.status === 0 ? "ok" : `exit ${r.status}: ${(r.stderr || r.stdout || "").trim().split("\n").pop()}`}`);
  }
  const checkins = fleetEntries(pr.json?.body).filter(([k]) => k === "checkin").flatMap(([, t]) => t.split(",")).map((t) => t.trim()).filter((t) => t && t !== "none");
  if (checkins.length) for (const t of checkins) log(`delete_trigger ${t}`);
  else log("no checkin= in the fleet block: list_triggers and delete your own check-ins");
  return v.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, USAGE);
  try { process.exit(main(argv)); }
  catch (e) {
    if (!(e instanceof CliArgError)) throw e;
    console.error(`${e.message}\n\n${USAGE}`);
    process.exit(1);
  }
}
