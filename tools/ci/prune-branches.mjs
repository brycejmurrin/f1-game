#!/usr/bin/env node
// prune-branches.mjs — delete remote branches that are already merged into the deploy branch.
// @doc Lists or deletes merged/absorbed branches with no open PR and expired claims, by branch-audit; opted-in verdicts are archived as tags first (prune-branches.yml).
// Full description: Lists, or with --apply deletes, every remote branch that is merged (an ancestor of the deploy branch, or exactly a merged PR's head) or absorbed (branch-audit.mjs: a dry merge changes nothing), or whose audit verdict is opted into with --also (archived first as the tag archive/<branch>), that has no open pull request and has been quiet for --min-age-days, plus claude/claims/* markers quiet for a day; the deploy and default branches, gh-pages and --keep patterns are never touched. Writes the branch-audit report. The workflow .github/workflows/prune-branches.yml runs it with the repo token.
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
//     exactly the head commit of a MERGED pull request (--prs; covers a PR
//     whose commits reached the deploy branch by squash or a rewritten
//     history), OR branch-audit.mjs calls it ABSORBED (a dry merge into the
//     deploy branch changes nothing). Nothing on any of them is lost;
//   * or its branch-audit verdict is one a person opted into with --also
//     (superseded, post-merge, pr-closed, no-history, unmerged) after reading
//     the report. Such a branch may hold work deploy lacks, so --apply first
//     pushes its tip as the tag archive/<branch> (archiveRefs) and deletes it
//     only once that tag landed: `git fetch origin tag archive/<branch>` or
//     `git push origin archive/<branch>:refs/heads/<branch>` brings it back;
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
//        [--keep <regex>] [--prs <json>] [--runs <json>] [--also <verdicts>]
//        [--report <md>] [--json <file>] [--default <branch>] [--apply]
// --prs: `gh pr list --state all --json number,state,headRefName,headRefOid,
// title,mergedAt,closedAt,createdAt` — open heads are kept, merged heads are
// merged. --runs: `gh run list --json headSha,conclusion,status,workflowName,
// createdAt`, the report's CI column. (--open-heads / --merged-heads, plain
// line files, still work.) Without a PR list the tool refuses --apply: an
// unknown PR set is not an empty one.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { audit, indexPrs, indexRuns, inSurvey, parseRefs, readJson, renderMarkdown, surveyScope, SURVEY_QUIET_HOURS, VERDICTS } from "./branch-audit.mjs";

export { parseRefs };
// The branch-audit verdicts --also may opt into. "absorbed" is always on: merging
// such a branch changes nothing, so deleting it loses nothing. The rest are
// judgement calls and need a person to tick them.
export const OPT_IN = ["superseded", "post-merge", "pr-closed", "no-history", "unmerged"];
// Reasons that lose nothing on delete; every other reason is archived first.
export const LOSSLESS = new Set(["merged", "absorbed", "expired claim"]);
export const ARCHIVE_PREFIX = "refs/tags/archive/";

/** The `<sha>:refs/tags/archive/<branch>` refspecs to push before deleting:
 *  one per pruned branch whose reason is not LOSSLESS. shaOf(name) -> sha. */
export function archiveRefs(prune, reasons, shaOf) {
  return prune.filter((n) => !LOSSLESS.has(reasons.get(n))).map((n) => `${shaOf(n)}:${ARCHIVE_PREFIX}${n}`);
}

export const DEPLOY = "claude/f1-game-project-26h3ng";
export const ALWAYS_KEEP = [/^gh-pages$/];
export const CLAIMS = /^claude\/claims\//;
export const CLAIM_MIN_DAYS = 1;

/** Decide, per branch, prune or keep. Pure: git and the clock come in.
 *  branches: [{ name, sha, time }] (time = committer unix seconds).
 *  isMerged(sha) -> boolean; openHeads: Set of branch names; verdicts: Map(name ->
 *  branch-audit verdict) and allow: the verdicts that may be pruned when not merged.
 *  reasons: Map(name -> why it goes). */
export function selectPrunable(branches, { base = DEPLOY, defaultBranch = null, openHeads = new Set(), keep = null,
  minAgeDays = 1, now = Math.floor(Date.now() / 1000), isMerged, mergedHeads = new Map(), verdicts = new Map(), allow = new Set(["absorbed"]) }) {
  const quiet = (b, days) => Number.isFinite(b.time) && now - b.time >= days * 86400;
  const prune = [], kept = [], reasons = new Map();
  for (const b of branches) {
    let why = null;
    if (b.name === base) why = "deploy branch";
    else if (defaultBranch && b.name === defaultBranch) why = "default branch";
    else if (ALWAYS_KEEP.some((re) => re.test(b.name))) why = "protected name";
    else if (keep && keep.test(b.name)) why = "--keep";
    else if (openHeads.has(b.name)) why = "open PR";
    else if (CLAIMS.test(b.name)) why = quiet(b, Math.max(minAgeDays, CLAIM_MIN_DAYS)) ? null : "live claim";
    else if (!quiet(b, minAgeDays)) why = "recent";
    else if (!isMerged(b.sha) && !(mergedHeads.get(b.name) || new Set()).has(b.sha)) {
      const v = verdicts.get(b.name);
      if (v && allow.has(v)) reasons.set(b.name, v);
      else why = v ? v : "not merged";
    }
    if (why) kept.push({ name: b.name, why });
    else { prune.push(b.name); if (!reasons.has(b.name)) reasons.set(b.name, CLAIMS.test(b.name) ? "expired claim" : "merged"); }
  }
  prune.sort();
  return { prune, kept, reasons };
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
  const prsFile = arg(argv, "--prs", null);
  const apply = argv.includes("--apply");
  const also = (arg(argv, "--also", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const bad = also.filter((v) => !OPT_IN.includes(v));
  if (bad.length) { console.error(`prune-branches: --also takes ${OPT_IN.join(", ")}; not ${bad.join(", ")}`); return 2; }
  if (!Number.isFinite(minAgeDays) || minAgeDays < 0) { console.error("prune-branches: --min-age-days must be a number >= 0"); return 2; }
  if (apply && !headsFile && !prsFile) { console.error("prune-branches: --apply needs --prs or --open-heads (an unknown PR set is not an empty one)"); return 2; }
  const prs = indexPrs(readJson(prsFile));
  const openHeads = new Set(headsFile ? fs.readFileSync(headsFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : []);
  const mergedHeads = new Map();
  for (const [name, p] of prs) {
    if (p.state === "open") openHeads.add(name);
    if (p.state === "merged" && p.headSha) mergedHeads.set(name, new Set([p.headSha]));
  }
  const mergedFile = arg(argv, "--merged-heads", null);
  for (const [n, set] of parseHeads(mergedFile ? fs.readFileSync(mergedFile, "utf8") : "")) mergedHeads.set(n, new Set([...(mergedHeads.get(n) || []), ...set]));
  const baseRef = "refs/remotes/origin/" + base;
  try { git("rev-parse", "--verify", "--quiet", baseRef); } catch (_) { console.error(`prune-branches: ${baseRef} not found — fetch every branch first`); return 2; }
  const branches = parseRefs(git("for-each-ref", "--format=%(refname)\t%(objectname)\t%(committerdate:unix)", "refs/remotes/origin"));
  // THE AUDIT (branch-audit.mjs): every branch that is not a claims marker gets
  // a verdict. It is the report, and its "absorbed" verdict is a prune rule.
  // The audit surveys only branches with NO PR ever and no commit for
  // --quiet-hours (default 48; branch-audit.mjs inSurvey). --audit-all widens it.
  const quietHours = Number(arg(argv, "--quiet-hours", String(SURVEY_QUIET_HOURS)));
  const auditAll = argv.includes("--audit-all");
  const rows = argv.includes("--no-audit") ? [] : audit(branches, { base, prs, runs: indexRuns(readJson(arg(argv, "--runs", null))), minAgeDays,
    skip: (n) => CLAIMS.test(n), survey: auditAll ? null : (b) => inSurvey(b, { prs, quietHours }) });
  const verdicts = new Map(rows.map((r) => [r.name, r.verdict]));
  const ancestor = new Map(rows.map((r) => [r.sha, r.ancestor]));
  const isMerged = (sha) => {
    if (ancestor.has(sha)) return ancestor.get(sha);
    try { git("merge-base", "--is-ancestor", sha, baseRef); return true; } catch (_) { return false; }
  };
  const { prune, kept, reasons } = selectPrunable(branches, {
    base, defaultBranch: arg(argv, "--default", null), openHeads, keep: keepSrc ? new RegExp(keepSrc) : null, minAgeDays, isMerged, mergedHeads,
    verdicts, allow: new Set(["absorbed", ...also]),
  });
  if (arg(argv, "--report", null)) fs.writeFileSync(arg(argv, "--report"), renderMarkdown(rows, base, { scope: auditAll ? "" : surveyScope(quietHours) }));
  if (arg(argv, "--json", null)) fs.writeFileSync(arg(argv, "--json"), JSON.stringify(rows, null, 1));
  const count = (list, key) => { const t = {}; for (const x of list) { const k = key(x); t[k] = (t[k] || 0) + 1; } return Object.entries(t).map(([k, n]) => `${n} ${k}`).join(", ") || "none"; };
  console.log(`prune-branches: ${branches.length} remote branches; ${prune.length} prunable (${count(prune, (n) => reasons.get(n))}; no open PR, quiet ${minAgeDays}+ days)`);
  console.log("kept: " + count(kept, (k) => k.why));
  if (also.length) console.log("opted in: " + also.map((v) => `${v} (${VERDICTS[v]})`).join("; "));
  for (const n of prune) console.log(`${apply ? "delete" : "would delete"} ${n}  [${reasons.get(n)}]`);
  if (!apply) { console.log("= prune dry-run " + prune.length); return 0; }
  // ARCHIVE FIRST: a lossy prune is deleted only after its tag landed.
  const shaOf = new Map(branches.map((b) => [b.name, b.sha]));
  const refs = archiveRefs(prune, reasons, (n) => shaOf.get(n));
  const unarchived = new Set();
  for (let i = 0; i < refs.length; i += 50) {
    const batch = refs.slice(i, i + 50);
    try { execFileSync("git", ["push", "origin", ...batch], { stdio: "inherit" }); }
    catch (_) { for (const r of batch) unarchived.add(r.slice(r.indexOf(ARCHIVE_PREFIX) + ARCHIVE_PREFIX.length)); console.error(`prune-branches: archiving a batch of ${batch.length} failed — those branches are kept`); }
  }
  if (refs.length) console.log(`archived ${refs.length - unarchived.size} as ${ARCHIVE_PREFIX}<branch>`);
  const doomed = prune.filter((n) => !unarchived.has(n));
  // Batches of 50 refs per push: one push per branch is ~475 round trips.
  let failed = unarchived.size;
  for (let i = 0; i < doomed.length; i += 50) {
    const batch = doomed.slice(i, i + 50);
    try { execFileSync("git", ["push", "origin", "--delete", ...batch], { stdio: "inherit" }); }
    catch (_) { failed += batch.length; console.error(`prune-branches: a batch of ${batch.length} failed (a protected branch?) — re-run lists what is left`); }
  }
  console.log(`= prune deleted ${prune.length - failed} failed ${failed}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith("prune-branches.mjs")) process.exitCode = main();
