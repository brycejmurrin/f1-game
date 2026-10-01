#!/usr/bin/env node
// prune-branches.mjs — delete remote branches that are already merged into the deploy branch.
// @doc Lists or deletes merged branches with no open PR, and expired claude/claims/* markers (prune-branches.yml).
// Full description: Lists, or with --apply deletes, every remote branch that is merged (an ancestor of the deploy branch, or exactly a merged PR's head), has no open pull request and has been quiet for --min-age-days, plus claude/claims/* markers quiet for a day; the deploy and default branches, gh-pages and --keep patterns are never touched. The workflow .github/workflows/prune-branches.yml runs it with the repo token.
// @skill check-changes
//
// WHY A WORKFLOW AND NOT AN AGENT. The remote containers' git proxy refuses
// ref deletion over both git and the REST API (403, measured 2026-09-22 and
// again 2026-10-01; see who-is-on-it.mjs), and 475 branches had piled up. The
// Actions token can delete a ref with `contents: write`
// (https://docs.github.com/en/rest/git/refs#delete-a-reference), so the
// deletion runs there and an agent dispatches it.
//
// WHAT IS PRUNABLE — all of these, or the branch is kept with a reason:
//   * it is MERGED: its tip is an ancestor of the deploy branch, OR its tip is
//     exactly the head commit of a MERGED pull request (--merged-heads; covers a
//     PR whose commits reached the deploy branch by squash or a rewritten
//     history). Either way nothing on it is lost; an abandoned branch, or one
//     pushed to after its PR merged, is neither and stays;
//   * no OPEN pull request has it as its head;
//   * its last commit is at least --min-age-days old (a just-merged branch
//     someone is still about to push a follow-up to is left alone);
//   * it is not the deploy branch, the default branch, gh-pages or a --keep match.
// CLAIMS BRANCHES (claude/claims/*, who-is-on-it.mjs) are never merged — they
// are empty-tree markers — and are pruned on age alone: who-is-on-it calls a
// claim stale after STALE_MIN (2 h), so one quiet for a day (or --min-age-days,
// if longer) is either released or abandoned. 182 had piled up by 2026-10-01.
// Dry run by default: the list is the output, and --apply is the only path
// that deletes anything.
//
// Usage (in a full clone, every remote branch fetched):
//   node tools/ci/prune-branches.mjs [--base <branch>] [--min-age-days N]
//        [--keep <regex>] [--open-heads <file>] [--merged-heads <file>]
//        [--default <branch>] [--apply]
// --merged-heads: `<branch>\t<head sha>` per merged PR (`gh pr list --state merged`).
// --open-heads: one open-PR head branch per line (the workflow writes it with
// `gh pr list`). Without it the tool refuses --apply: an unknown PR set is not
// an empty one.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export const DEPLOY = "claude/f1-game-project-26h3ng";
export const ALWAYS_KEEP = [/^gh-pages$/];
export const CLAIMS = /^claude\/claims\//;
export const CLAIM_MIN_DAYS = 1;

/** Decide, per branch, prune or keep. Pure: git and the clock come in.
 *  branches: [{ name, sha, time }] (time = committer unix seconds).
 *  isMerged(sha) -> boolean; openHeads: Set of branch names. */
export function selectPrunable(branches, { base = DEPLOY, defaultBranch = null, openHeads = new Set(), keep = null,
  minAgeDays = 1, now = Math.floor(Date.now() / 1000), isMerged, mergedHeads = new Map() }) {
  const quiet = (b, days) => Number.isFinite(b.time) && now - b.time >= days * 86400;
  const prune = [], kept = [];
  for (const b of branches) {
    let why = null;
    if (b.name === base) why = "deploy branch";
    else if (defaultBranch && b.name === defaultBranch) why = "default branch";
    else if (ALWAYS_KEEP.some((re) => re.test(b.name))) why = "protected name";
    else if (keep && keep.test(b.name)) why = "--keep";
    else if (openHeads.has(b.name)) why = "open PR";
    else if (CLAIMS.test(b.name)) why = quiet(b, Math.max(minAgeDays, CLAIM_MIN_DAYS)) ? null : "live claim";
    else if (!quiet(b, minAgeDays)) why = "recent";
    else if (!isMerged(b.sha) && !(mergedHeads.get(b.name) || new Set()).has(b.sha)) why = "not merged";
    if (why) kept.push({ name: b.name, why });
    else prune.push(b.name);
  }
  prune.sort();
  return { prune, kept };
}

/** `git for-each-ref` lines (name\tsha\ttime) of refs/remotes/origin -> branches. */
export function parseRefs(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const [ref, sha, time] = line.split("\t");
    if (!ref || !sha) continue;
    const name = ref.replace(/^refs\/remotes\/origin\//, "");
    if (name === "HEAD" || name === ref) continue;
    out.push({ name, sha, time: Number(time) });
  }
  return out;
}

/** `<branch>\t<sha>` lines (merged PR heads) -> Map(branch -> Set(sha)). */
export function parseHeads(text) {
  const m = new Map();
  for (const line of String(text).split("\n")) {
    const [name, sha] = line.trim().split("\t");
    if (!name || !sha) continue;
    if (!m.has(name)) m.set(name, new Set());
    m.get(name).add(sha);
  }
  return m;
}

function arg(argv, flag, dflt) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
}

export function main(argv = process.argv.slice(2)) {
  const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20 });
  const base = arg(argv, "--base", DEPLOY);
  const minAgeDays = Number(arg(argv, "--min-age-days", "1"));
  const keepSrc = arg(argv, "--keep", "");
  const headsFile = arg(argv, "--open-heads", null);
  const apply = argv.includes("--apply");
  if (!Number.isFinite(minAgeDays) || minAgeDays < 0) { console.error("prune-branches: --min-age-days must be a number >= 0"); return 2; }
  if (apply && !headsFile) { console.error("prune-branches: --apply needs --open-heads (an unknown PR set is not an empty one)"); return 2; }
  const openHeads = new Set(headsFile ? fs.readFileSync(headsFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : []);
  const mergedFile = arg(argv, "--merged-heads", null);
  const mergedHeads = parseHeads(mergedFile ? fs.readFileSync(mergedFile, "utf8") : "");
  const baseRef = "refs/remotes/origin/" + base;
  try { git("rev-parse", "--verify", "--quiet", baseRef); } catch (_) { console.error(`prune-branches: ${baseRef} not found — fetch every branch first`); return 2; }
  const branches = parseRefs(git("for-each-ref", "--format=%(refname)\t%(objectname)\t%(committerdate:unix)", "refs/remotes/origin"));
  const isMerged = (sha) => { try { git("merge-base", "--is-ancestor", sha, baseRef); return true; } catch (_) { return false; } };
  const { prune, kept } = selectPrunable(branches, {
    base, defaultBranch: arg(argv, "--default", null), openHeads, keep: keepSrc ? new RegExp(keepSrc) : null, minAgeDays, isMerged, mergedHeads,
  });
  const tally = {};
  for (const k of kept) tally[k.why] = (tally[k.why] || 0) + 1;
  const claims = prune.filter((n) => CLAIMS.test(n)).length;
  console.log(`prune-branches: ${branches.length} remote branches; ${prune.length} prunable — ${prune.length - claims} merged (into ${base} or as a merged PR's head, no open PR, quiet ${minAgeDays}+ days), ${claims} expired claims`);
  console.log("kept: " + (Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ") || "none"));
  for (const n of prune) console.log((apply ? "delete " : "would delete ") + n);
  if (!apply) { console.log("= prune dry-run " + prune.length); return 0; }
  // Batches of 50 refs per push: one push per branch is ~475 round trips.
  let failed = 0;
  for (let i = 0; i < prune.length; i += 50) {
    const batch = prune.slice(i, i + 50);
    try { execFileSync("git", ["push", "origin", "--delete", ...batch], { stdio: "inherit" }); }
    catch (_) { failed += batch.length; console.error(`prune-branches: a batch of ${batch.length} failed (a protected branch?) — re-run lists what is left`); }
  }
  console.log(`= prune deleted ${prune.length - failed} failed ${failed}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith("prune-branches.mjs")) process.exitCode = main();
