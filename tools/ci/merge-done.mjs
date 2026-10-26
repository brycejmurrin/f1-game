#!/usr/bin/env node
// merge-done.mjs — post the fleet bus DONE line for a merge, read from the merge commit itself.
// @doc DONE bus line from a merge commit (PR #, both parents, actor), idempotent; for a deploy-branch push workflow.
// @section runner
// @skill agent-fleet
//
// WHY (system audit 2026-10-26 §1): of 326 merges in a week, 238 had a DONE
// line and 88 had none — the bookkeeping depended on the merging session
// remembering to post, and a merge Bryce made by hand never posted at all. The
// merge commit already says everything the DONE line carries: GitHub writes
// "Merge pull request #<n> from <owner>/<branch>" as its subject, the two
// parents prove it is a merge commit (not a squash, #1743), and the actor is
// the workflow's `github.actor` (or a `Merged-by:` trailer, else the author).
// A workflow on push to the deploy branch runs this once per merge commit in
// the push, so every merge gets exactly one DONE line whoever merged it.
//
//   node tools/ci/merge-done.mjs <merge sha> [--actor <login>] [--as <bus from>] [--dry-run] [--json]
//   node tools/ci/merge-done.mjs --range <before>..<after> [--actor <login>]   # every merge commit a push added
//
// Idempotent: a DONE line on the bus that already names `#<n>` and this sha
// (7+ hex) is not posted twice (a re-run, or a session that posted by hand).
// Not a merge commit (one parent) or no PR number in the subject: nothing is
// posted; exit 3 says why. Exit 0 posted / already there / dry run, 1 bus
// write failed, 2 bad args, 3 not a PR merge.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { readBus, sendBusLine, parseLine } from "./fleet-bus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_FROM = "github:merge-done";

const git = (args, cwd = ROOT) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 16 << 20 });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};

/** `git log -1` fields for one commit → { sha, parents[], author, subject, body }, or null. */
export function readCommit(sha, { run = git } = {}) {
  const r = run(["log", "-1", "--format=%H%x00%P%x00%an%x00%s%x00%b", sha]);
  if (r.code !== 0 || !r.out) return null;
  const [full, parents, author, subject, body = ""] = r.out.split("\0");
  return { sha: full, parents: parents.split(" ").filter(Boolean), author, subject, body };
}

/** The DONE facts from a commit. Pure. → { ok, pr, sha, parents, actor } | { ok: false, why } */
export function doneFacts(c, { actor = "" } = {}) {
  if (!c) return { ok: false, why: "unknown commit" };
  const pr = /^Merge pull request #(\d+)\b/.exec(c.subject || "");
  if (c.parents.length !== 2) {
    return { ok: false, why: `${c.sha.slice(0, 7)} has ${c.parents.length} parent(s): not a merge commit${pr ? "" : " (a squash or a direct push?)"}` };
  }
  if (!pr) return { ok: false, why: `${c.sha.slice(0, 7)} is a merge but its subject names no PR (a sync merge?): ${(c.subject || "").slice(0, 80)}` };
  const trailer = /^Merged-by:\s*(\S+)/m.exec(c.body || "");
  return { ok: true, pr: Number(pr[1]), sha: c.sha, parents: c.parents, actor: actor || (trailer ? trailer[1] : "") || c.author || "?" };
}

/** The bus line text (type DONE, to `*`). Pure; matches comms.md `DONE <PR> <merge sha>`. */
export const doneText = (f) =>
  `#${f.pr} ${f.sha} merge commit (parents ${f.parents.map((p) => p.slice(0, 7)).join(" ")}) by ${f.actor} — posted from the commit by merge-done.mjs`;

/** Is a DONE for this PR and sha already on the bus? Pure over parsed entries. */
export function alreadyDone(entries, f) {
  return (entries || []).some((e) => {
    const l = e.type ? e : parseLine(e.subject || e.text || "");
    if (!l || l.type !== "DONE") return false;
    const text = String(l.text || "");
    return new RegExp(`#${f.pr}\\b`).test(text) && /\b([0-9a-f]{7,40})\b/.test(text)
      && [...text.matchAll(/\b([0-9a-f]{7,40})\b/g)].some((m) => f.sha.startsWith(m[1]));
  });
}

/** Merge commits a push added (first-parent walk of before..after). */
export function mergesIn(range, { run = git } = {}) {
  const r = run(["rev-list", "--merges", "--first-parent", "--reverse", range]);
  return r.code === 0 ? r.out.split("\n").filter(Boolean) : null;
}

export function postDone(sha, { actor = "", from = DEFAULT_FROM, dryRun = false, run = git,
  bus = () => readBus({ last: 500 }).entries, send = sendBusLine, log = console.log } = {}) {
  const f = doneFacts(readCommit(sha, { run }), { actor });
  if (!f.ok) { log(`= merge-done skip: ${f.why}`); return { code: 3, ...f }; }
  const text = doneText(f);
  let entries = [];
  try { entries = bus() || []; } catch (e) { log(`merge-done: bus unreadable (${e.message}); posting anyway`); }
  if (alreadyDone(entries, f)) { log(`= merge-done already: #${f.pr} ${f.sha.slice(0, 7)} has a DONE line`); return { code: 0, already: true, ...f }; }
  if (dryRun) { log(`= merge-done dry-run: DONE to:* from:${from} ${text}`); return { code: 0, dryRun: true, ...f, text }; }
  const r = send("DONE", "*", from, text, { log });
  return { code: r.ok ? 0 : 1, posted: !!r.ok, ...f, text };
}

const USAGE = `usage: node tools/ci/merge-done.mjs <merge sha> | --range <before>..<after> [--actor <login>] [--as <from>] [--dry-run] [--json]
  Posts "DONE to:* from:${DEFAULT_FROM} #<n> <sha> merge commit (parents …) by <actor>" for a GitHub PR merge commit,
  once (an existing DONE naming the PR and sha is not repeated). Exit 0 posted/already/dry-run, 1 bus write failed,
  2 bad args, 3 not a two-parent PR merge.`;

export function main(argv, deps = {}) {
  exitIfHelp(argv, USAGE);
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const known = new Set(["--actor", "--as", "--range", "--dry-run", "--json"]);
  const bad = argv.find((a) => a.startsWith("--") && !known.has(a));
  if (bad) { console.error(`merge-done: unknown flag ${bad}\n${USAGE}`); return 2; }
  const takes = new Set(["--actor", "--as", "--range"]);
  const pos = argv.filter((a, i) => !a.startsWith("--") && !takes.has(argv[i - 1]));
  const range = val("--range");
  if ((!range && pos.length !== 1) || (range && pos.length)) { console.error(USAGE); return 2; }
  const opts = { actor: val("--actor") || "", from: val("--as") || DEFAULT_FROM, dryRun: argv.includes("--dry-run"), ...deps };
  const shas = range ? mergesIn(range, deps) : pos;
  if (!shas) { console.error(`merge-done: cannot list merges in ${range}`); return 2; }
  const results = shas.map((s) => postDone(s, opts));
  if (argv.includes("--json")) console.log(JSON.stringify(results, null, 2));
  if (range) return results.some((r) => r.code === 1) ? 1 : 0;   // a range skips non-PR merges silently
  return results[0].code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
