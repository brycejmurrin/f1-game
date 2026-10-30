#!/usr/bin/env node
// merge-gate.mjs — the landing gate: the CI check named `gate` (.github/workflows/land.yml), runnable locally.
// @doc Landing gate (`gate` check): open, no `hold`, Plan closed, CI green, gen:check + ratchets on the merge, base distance.
// @section runner
// @skill steward
//
// Why (docs/plans/2026-10-27-orchestration-redesign.md §3, §4.3): GitHub lands PRs; agents never merge. This gate
// is a pure function of GitHub state plus a throw-away merge of the head onto the CURRENT base tip. It writes
// nothing (no receipt, no bus line), reads no bus, and pins no session identity: the branch ruleset requires the
// `gate` check and `land.yml` arms auto-merge when it is green.
//
//   node tools/ci/merge-gate.mjs --pr <n> [--sha <head>] [--check] [--max-behind N] [--json <path>]
//
// Rows (all must pass; each prints `= gate <row>: ok|FAIL <reason>`, then one final `= merge-gate passed|refused …`
// line, which land.yml reads as the check title):
//   open      the PR is open and not a draft, and its head is the `--sha` the workflow gated (when given)
//   hold      no `hold` label (replaces the body line `MERGE-HOLD:`, which is no longer read)
//   plan      the body's `## Plan` checklist is closed (ready-gate's parser; an item starting `land:` is ignored)
//   ci        the `CI` check-run from the GitHub Actions app, in the check suite of a ci.yml workflow run, is
//             `success` on the PR's current head, newest attempt
//   gen       clean merge onto the current base tip; `gen:check` and the scenery catalog digest pass there
//   ratchets  tools/check/ratchets.mjs and the whole-tree count tests hold on that same merge result
//             (two PRs under a ceiling alone can be over it together, #3236 + #3237, 2026-10-20)
//   distance  the PR's merge-base is at most N (default MAX_BEHIND) GAME merges behind the base tip: a game merge is a
//             first-parent merge commit on the base whose diff touches js/ css/ assets/ index.html or sw.js
//             (replaces GAME-SLOT pacing: red trains were 13.3 % when a merge landed after the PR's green vs 4.3 %)
//             — applied only when the PR's own diff (merge-base..head) touches a game path; otherwise it passes
//
// `--trusted` evaluates only the rows that run no code from the PR (open, hold, plan, ci, distance): it fetches the
// head's objects for the merge-base but never checks them out or runs them. land.yml's `trusted-rows` job runs it,
// so `post` never takes those rows from the artifact of the leg that ran the PR's scripts (WP-L2).
//
// Exit: 0 every row ok, 2 a row failed, 3 waiting on CI, 1 usage or API/git error. `--check` is accepted (the
// workflow's spelling). `--json <path>` writes the row summary there; nothing else is written outside the
// throw-away worktree under artifacts/merge-gate/.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, DEPLOY } from "./github-api.mjs";
import { planVerdict } from "./ready-gate.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** The deploy branch's required CI check (ci.yml `ci-verdict`, Bryce 2026-10-15). */
export const REQUIRED_CHECK = "CI";
/** The only app whose `CI` check-run counts: ci.yml runs under GitHub Actions. Any token with `checks: write` can
 * create a check-run named `CI`, but only under its OWN app, so a run from another app (or none) is ignored. */
export const CI_APP = "github-actions";
/** The workflow file whose run must own the `CI` check-run: a job named `CI` in any OTHER workflow (a PR can add one)
 * is an Actions-app check-run too, so the app alone does not pin it (r2 landing-design, WP-L3e). */
export const CI_WORKFLOW = "ci.yml";
/** The label that vetoes a landing (plan §4.1: whoever sets it removes it; Bryce can always remove it). */
export const HOLD_LABEL = "hold";
/** Game merges are the ones a Pages train ships; the distance row counts them. */
export const GAME_PATH = /^(js\/|css\/|assets\/|index\.html$|sw\.js$)/;
export const isGamePath = (p) => GAME_PATH.test(String(p || "").replace(/^\.\//, ""));
export const gameFiles = (files) => (files || []).filter(isGamePath);
/** Whether a PR's own changed files touch a game path. Only such a PR is held to the distance row: a docs, tools,
 *  tests or workflow PR gains nothing from it, and gen:check and the ratchets already run on the real merge
 *  result (2026-10-27: #3920, #3957, #3980, #4001, #4021 were refused on distance alone). Pure. */
export const touchesGame = (files) => gameFiles(files).length > 0;
/** Default for --max-behind. Plan §4.3 started at an unmeasured N = 2; on 2026-10-27 the deploy branch took ~15 game
 *  merges per ~40 min full CI tier, so game PRs went green and were refused on distance again and again (#3964, #3932,
 *  #3886: 3 syncs each). 6 was still too tight: on 2026-10-28 #4004 was synced onto tip 1c3263c2, passed distance,
 *  and one CI tier later the tip was 9 merges ahead (8 touching game paths) so the green PR was refused again; the tip
 *  took 11 merges in 2 h. 12 covers one CI tier plus a margin. It stays safe because land-gate still runs gen:check and
 *  the ratchets on the real merge result against the current tip, and the Pages train gates every deploy tip before it
 *  publishes. */
export const MAX_BEHIND = 12;
/** Row order, which is also print order. */
export const ROWS = Object.freeze(["open", "hold", "plan", "ci", "gen", "ratchets", "distance"]);
/** The rows `--trusted` evaluates: none of them runs code from the PR. */
export const TRUSTED_ROWS = Object.freeze(ROWS.filter((k) => k !== "gen" && k !== "ratchets"));

const row = (ok, evidence) => ({ ok: !!ok, evidence });
const git = (args, cwd = ROOT, extra = {}) => spawnSync("git", args, { cwd, encoding: "utf8", timeout: 120_000, ...extra });

// ---- pure rows ------------------------------------------------------------------------------------------

/** open: the PR exists, is open and is not a draft. Pure. */
export function openVerdict(pull) {
  if (!pull || !pull.state) return row(false, "no pull request");
  if (pull.state !== "open") return row(false, `PR is ${pull.state}${pull.merged ? " (merged)" : ""}`);
  if (pull.draft) return row(false, "draft: flip ready first — ready-gate, then update_pull_request draft:false, then land");
  return row(true, "open and ready for review");
}

/** hold: no `hold` label. Labels may be strings or `{ name }` objects (the API's shape). Pure. */
export function holdVerdict(labels) {
  const names = (labels || []).map((l) => String(typeof l === "string" ? l : l?.name || "").toLowerCase());
  return names.includes(HOLD_LABEL) ? row(false, `the \`${HOLD_LABEL}\` label is set: whoever set it removes it (Bryce can always remove it)`) : row(true, `no \`${HOLD_LABEL}\` label`);
}

/** plan: the Plan checklist is closed (ready-gate.mjs planVerdict, `land:` items exempt). No Plan at all passes. Pure. */
export function planRow(body) {
  const p = planVerdict(body);
  if (p.state === "open") {
    const shown = p.open.slice(0, 3).map((t) => `"${t}"`).join(", ");
    return row(false, `${p.open.length} of ${p.items} Plan item(s) open: ${shown}${p.open.length > 3 ? ", ..." : ""} — tick each with its evidence or strike it with why`);
  }
  return row(true, p.state === "none" ? "no ## Plan checklist in the body" : `Plan closed (${p.items} items)`);
}

/**
 * ci: the required check-run on the head from `app` (CI_APP), newest attempt (highest id), success only. `suites`
 * (a Set of check-suite ids of the ci.yml workflow runs on the head, ciSuitesFor) pins it to ci.yml: a check-run of
 * that name in another workflow's suite is ignored. `null` skips the pin (pure callers only). Pure.
 */
export function ciVerdict(checkRuns, name = REQUIRED_CHECK, app = CI_APP, suites = null) {
  let best = null;
  for (const c of checkRuns || []) {
    if (!c || c.name !== name || c.app?.slug !== app) continue;
    if (suites && !suites.has(c.check_suite?.id)) continue;
    if (!best || (c.id || 0) > (best.id || 0)) best = c;
  }
  // Not finished is "waiting", not "refused": a `land` label added while CI still runs must not paint `gate` red.
  if (!best) return { ...row(false, `no ${name} check-run${suites ? ` from ${CI_WORKFLOW}` : ""} on the head yet`), pending: true };
  if (best.status !== "completed") return { ...row(false, `${name} ${best.status}`), pending: true };
  return best.conclusion === "success" ? row(true, `${name} success (check-run ${best.id})`) : row(false, `${name} ${best.conclusion}`);
}

/**
 * Game merges on the base between the PR's merge-base (exclusive) and the tip (inclusive). `commits` is the base's
 * first-parent history, NEWEST first, each `{ sha, parents, files }`; the walk stops at `mergeBase`. A commit counts
 * when it is a merge (two or more parents) and its first-parent diff touches a game path. Pure.
 * @returns {{ count: number, shas: string[], reached: boolean }} reached: the merge-base was found in the list
 */
export function gameMergesBehind(commits, mergeBase) {
  const shas = [];
  let reached = false;
  for (const c of commits || []) {
    if (!c) continue;
    if (c.sha === mergeBase) { reached = true; break; }
    if ((c.parents || []).length > 1 && gameFiles(c.files).length) shas.push(c.sha);
  }
  return { count: shas.length, shas, reached };
}

/** distance: the merge-base is at most `max` game merges behind the tip. Pure. */
export function distanceVerdict(commits, mergeBase, max = MAX_BEHIND) {
  const d = gameMergesBehind(commits, mergeBase);
  // A merge-base off the first-parent line (a PR stacked on another branch): every walked merge landed after it.
  const where = d.reached ? "" : " (merge-base off the base's first-parent line: every merge since it counts)";
  const list = d.shas.slice(0, 4).map((s) => s.slice(0, 8)).join(", ");
  if (d.count > max) return row(false, `base is ${d.count} game merge(s) ahead of the merge-base (max ${max}): ${list}${d.count > 4 ? ", …" : ""}${where} — sync-pr.mjs (merge the base tip), push, and let CI re-run`);
  return row(true, `${d.count} game merge(s) between the merge-base and the base tip (max ${max})${where}`);
}

// ---- git-backed rows --------------------------------------------------------------------------------------

/**
 * The base's first-parent history from `tip` down to and including `mergeBase`, in gameMergesBehind's shape. Only
 * merge commits carry a file list (the only ones the distance row counts). `cwd` has both refs fetched.
 */
export function baseHistory({ tip, mergeBase, cwd = ROOT, run = git } = {}) {
  const list = run(["rev-list", "--first-parent", "--parents", tip, `^${mergeBase}^@`], cwd);
  if (list.status !== 0) return { error: `rev-list failed: ${(list.stderr || "").trim().split("\n")[0]}` };
  const commits = [];
  for (const line of list.stdout.split("\n").filter(Boolean)) {
    const [sha, ...parents] = line.trim().split(/\s+/);
    let files = [];
    if (parents.length > 1) {
      const d = run(["diff-tree", "--no-commit-id", "--name-only", "-r", parents[0], sha], cwd);
      if (d.status !== 0) return { error: `diff-tree ${sha.slice(0, 8)} failed: ${(d.stderr || "").trim().split("\n")[0]}` };
      files = d.stdout.split("\n").filter(Boolean);
    }
    commits.push({ sha, parents, files });
  }
  return { commits };
}

/**
 * The distance row for a real clone: merge-base of `head` and `tip`, then the PR's own changed files (merge-base..head,
 * renames split so a file moved out of js/ still counts); a PR touching no game path passes without the walk, any
 * other gets baseHistory. `{ row, mergeBase, error? }`.
 */
export function distanceFor({ head, tip, cwd = ROOT, max = MAX_BEHIND, run = git } = {}) {
  const mb = run(["merge-base", head, tip], cwd);
  if (mb.status !== 0) return { error: `merge-base of ${String(head).slice(0, 8)} and ${String(tip).slice(0, 8)} failed (shallow clone? fetch-depth: 0)` };
  const mergeBase = mb.stdout.trim();
  const own = run(["diff", "--no-renames", "--name-only", mergeBase, head], cwd);
  if (own.status !== 0) return { error: `diff ${mergeBase.slice(0, 8)}..${String(head).slice(0, 8)} failed: ${(own.stderr || "").trim().split("\n")[0]}` };
  const files = own.stdout.split("\n").filter(Boolean);
  if (!touchesGame(files)) return { row: row(true, `no game files in this PR's diff (${files.length} file(s)): distance not applied`), mergeBase };
  const h = baseHistory({ tip, mergeBase, cwd, run });
  if (h.error) return { error: h.error };
  return { row: distanceVerdict(h.commits, mergeBase, max), mergeBase };
}

/**
 * The shrink-only ratchets, run on the MERGE RESULT (cwd = the merged worktree): tools/check/ratchets.mjs (file and
 * tree-wide metrics, the pin counters among them; exit 1 on overage) and the whole-tree count tests (system audit
 * 2026-10-26: 63 of 86 named red-PR failures in three days). The PR's own CI tests the merge ref as of ITS last run;
 * a base that moved afterwards is not covered. Returns { ok, evidence }; a check that cannot run is a failure.
 */
/**
 * The environment for code from the merge result (gen:check, the ratchet tests): the PR's own scripts run there, so
 * no token and none of the runner's file-command paths (GITHUB_OUTPUT, GITHUB_ENV, …) a script could write a forged
 * verdict through. Defence in depth only: the parent's environment is readable by the same uid, so land.yml runs this
 * gate in a job whose token is read-only (`land-gate`), and a separate job with no repo code posts the check. Pure.
 */
export function untrustedEnv(env = process.env) {
  const out = { ...env };
  for (const k of Object.keys(out)) {
    if (/TOKEN|SECRET|^GH_|^ACTIONS_|^GITHUB_(OUTPUT|ENV|PATH|STATE|STEP_SUMMARY)$/.test(k)) delete out[k];
  }
  return out;
}

export function ratchetsOnMerge({ cwd = ROOT, run = spawnSync } = {}) {
  const tail = (r) => `${r.stdout || ""}\n${r.stderr || ""}`.split("\n").map((l) => l.trim()).filter(Boolean).slice(-2).join(" | ").slice(0, 220);
  const counted = [
    ["assert-match ceiling", "assert-match-ratchet"], ["source-pin ceiling", "source-pin-hygiene"],
    ["vm-filename ceiling", "vm-filename-lint"], ["test-groups", "test-groups"],
    ["docs-integrity", "docs-integrity"], ["output-surface", "output-surface"],
  ];
  const steps = [
    { name: "ratchets.mjs", argv: ["tools/check/ratchets.mjs"] },
    ...counted.map(([name, file]) => ({ name, argv: ["--test", `tests/unit/${file}.test.mjs`] })),
  ];
  // `node --test` started inside another node test inherits NODE_TEST_CONTEXT and then exits 0 on a failing test
  // (measured 2026-10-21). The worktree's HEAD is the base tip and its working tree the merge result, so the pin
  // counters judge the growth THIS merge adds (ratchets.mjs ratchetMode), not an overage the tip already carries.
  const env = { ...untrustedEnv(), APEX_RATCHET_BASE_REF: "HEAD" };
  delete env.NODE_TEST_CONTEXT;
  delete env.APEX_RATCHET_ABSOLUTE;
  const bad = [];
  for (const s of steps) {
    const r = run(process.execPath, s.argv, { cwd, env, encoding: "utf8", timeout: 180_000, maxBuffer: 16 << 20 });
    if (r.error || r.status !== 0) {
      const sites = `${r.stdout || ""}`.match(/\d+ [\w. -]+ \(ceiling \d+[^)]*\)/);
      bad.push(`${s.name}: ${sites ? sites[0] : r.error ? r.error.message : tail(r) || "exit " + r.status}`);
    }
  }
  return bad.length
    ? { ok: false, evidence: `over a ratchet on the merge result: ${bad.join("; ")} — convert the pins or extract, never raise the ceiling for someone else's overage` }
    : { ok: true, evidence: "ratchets.mjs and the whole-tree count tests hold on the merge result" };
}

/**
 * Fetch the base and the head branch, merge `head` onto the base tip in a throw-away worktree, run gen:check
 * and the scenery catalog digest there, then the ratchets. Returns { ok, evidence, tip, ratchets?, error? }: `error` marks a git failure the gate
 * reports as exit 1 (not a row); `ratchets` is absent when the merge or gen:check already refused.
 */
/**
 * Fetch the base tip and the PR head's objects (nothing is checked out or run). Returns { tip } or { error }: the
 * shared first step of the throw-away merge and of `--trusted` (whose distance row needs the merge-base).
 */
export function fetchForGate({ pr, head, headRef, cwd = ROOT, base = DEPLOY } = {}) {
  const f1 = git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`], cwd);
  if (f1.status !== 0) return { error: `fetch ${base} failed: ${(f1.stderr || "").trim().split("\n")[0]}` };
  if (headRef) git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${headRef}:refs/remotes/origin/${headRef}`], cwd);
  // A fork's branch is not under refs/heads here; GitHub mirrors every PR head as refs/pull/<n>/head.
  if (git(["cat-file", "-e", `${head}^{commit}`], cwd).status !== 0) git(["fetch", "--quiet", "--no-tags", "origin", `+refs/pull/${pr}/head:refs/remotes/origin/pr/${pr}`], cwd);
  if (git(["cat-file", "-e", `${head}^{commit}`], cwd).status !== 0) {
    return { error: `head ${head.slice(0, 8)} is not in this clone (fetch its branch${headRef ? " " + headRef : ""})` };
  }
  return { tip: git(["rev-parse", `refs/remotes/origin/${base}`], cwd).stdout.trim() };
}

export function localMergeGenCheck({ pr, head, headRef, cwd = ROOT, base = DEPLOY, run = spawnSync, ratchets = ratchetsOnMerge } = {}) {
  const wt = path.join(cwd, "artifacts", "merge-gate", `wt-${pr}`);
  const cleanup = () => { git(["worktree", "remove", "--force", wt], cwd); git(["worktree", "prune"], cwd); fs.rmSync(wt, { recursive: true, force: true }); };
  const fetched = fetchForGate({ pr, head, headRef, cwd, base });
  if (fetched.error) return { ok: false, evidence: fetched.error, tip: "", error: true };
  const tip = fetched.tip;
  // A refusal carries the fetched tip: with `tip: ""` evaluate's distance row failed its merge-base and the gate
  // reported an error ("will retry") in place of the real conflict or gen:check refusal (2026-10-27 23:20Z, #3964).
  const fail = (why) => { cleanup(); return { ok: false, evidence: why, tip }; };
  cleanup();
  const add = git(["worktree", "add", "--detach", wt, tip], cwd);
  if (add.status !== 0) return { ok: false, evidence: `worktree add failed: ${(add.stderr || "").trim().split("\n")[0]}`, tip, error: true };
  // A runner has no user.name/user.email and a merge without one fails even under --no-commit. Nothing is committed.
  const m = git(["-c", "user.name=merge-gate", "-c", "user.email=merge-gate@localhost", "merge", "--no-commit", "--no-ff", "--quiet", head], wt, { timeout: 300_000 });
  if (m.status !== 0) {
    const conflicted = git(["diff", "--name-only", "--diff-filter=U"], wt).stdout.split("\n").filter(Boolean);
    return fail(conflicted.length ? `conflicts with the current tip ${tip.slice(0, 8)}: ${conflicted.slice(0, 6).join(", ")}${conflicted.length > 6 ? ", …" : ""} — sync-pr.mjs first` : `merge onto ${tip.slice(0, 8)} failed: ${(m.stderr || m.stdout || "").trim().split("\n")[0]}`);
  }
  try { fs.symlinkSync(path.join(cwd, "node_modules"), path.join(wt, "node_modules")); } catch { /* exists */ }
  const gen = run("npm", ["run", "-s", "gen:check"], { cwd: wt, env: untrustedEnv(), encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
  if (gen.status !== 0) {
    const first = `${gen.stdout || ""}\n${gen.stderr || ""}`.split("\n").map((l) => l.trim()).filter((l) => l && !/^>|^npm /.test(l)).slice(-3).join(" | ");
    return fail(`gen:check fails on the merge onto ${tip.slice(0, 8)}: ${first || "see output"} — sync-pr.mjs (it runs npm run gen) and push`);
  }
  // The full scenery generator builds every circuit (~2 min), so gen:check
  // deliberately omits it. Its cheap input fingerprint must still hold on THIS
  // merge: a green head can inherit a stale catalog from a changed base (#4160).
  // Keep PR code in a child with the same stripped environment as gen:check.
  const catalog = run(process.execPath, ["-e", [
    "const fs = require('node:fs');",
    "const { scenerySourceDigest } = require('./tools/shot/scenery-source-hash.cjs');",
    "const stored = JSON.parse(fs.readFileSync('tools/shot/scenery-locations.json', 'utf8')).sourceDigest;",
    "if (typeof stored !== 'string' || !/^[a-f0-9]{64}$/.test(stored)) throw new Error('catalog sourceDigest is missing or malformed');",
    "if (stored !== scenerySourceDigest(process.cwd())) throw new Error('catalog sourceDigest does not match scenery inputs');",
  ].join("\n")], { cwd: wt, env: untrustedEnv(), encoding: "utf8", timeout: 60_000, maxBuffer: 1 << 20 });
  if (catalog.error || catalog.status !== 0) {
    const detail = catalog.error?.message || `${catalog.stdout || ""}\n${catalog.stderr || ""}`.split("\n")
      .map((line) => line.trim()).find((line) => /Error:/.test(line)) || `exit ${catalog.status}`;
    return fail(`scenery catalog fails on the merge onto ${tip.slice(0, 8)}: ${detail} — regenerate with node tools/shot/gen-scenery-locations.cjs on the synced branch and push`);
  }
  const rat = ratchets({ cwd: wt, run });
  cleanup();
  return { ok: true, evidence: `merges clean onto ${tip.slice(0, 8)}; gen:check and scenery catalog digest 0`, tip, ratchets: rat };
}

// ---- evaluator and CLI --------------------------------------------------------------------------------------

function checkRunsFor(sha, request) {
  const list = [];
  let page = 1;
  for (;;) {
    const r = request(`commits/${encodeURIComponent(sha)}/check-runs?per_page=100${page > 1 ? `&page=${page}` : ""}`);
    if (r.error) return { error: r.error };
    const batch = r.json?.check_runs || [];
    list.push(...batch);
    if (!batch.length || (r.json?.total_count != null ? list.length >= r.json.total_count : batch.length < 100)) break;
    page++;
  }
  return { list };
}

/**
 * The check-suite ids of the ci.yml workflow runs on `sha` (the workflow-file endpoint, path re-checked), so the ci
 * row reads only ci.yml's own `CI` check-run. Returns { suites: Set } or { error }.
 */
export function ciSuitesFor(sha, request) {
  const suites = new Set();
  const want = `.github/workflows/${CI_WORKFLOW}`;
  for (let page = 1; page <= 5; page++) {
    const r = request(`actions/workflows/${CI_WORKFLOW}/runs?head_sha=${encodeURIComponent(sha)}&per_page=100${page > 1 ? `&page=${page}` : ""}`);
    if (r.error) return { error: r.error };
    const batch = r.json?.workflow_runs || [];
    for (const w of batch) if (String(w?.path || "").replace(/@.*$/, "") === want && w.check_suite_id != null) suites.add(w.check_suite_id);
    if (batch.length < 100) break;
  }
  return { suites };
}

/**
 * Every row for PR `pr`. Side effects only through the injected `request` (GitHub), `localMerge` (the throw-away
 * merge) and `distance` (git). Returns { ok, rows, pr, head, base, tip } or { error } for an API/git failure.
 */
export function evaluate({ pr, sha = "", request = api, root = ROOT, maxBehind = MAX_BEHIND, localMerge = localMergeGenCheck, distance = distanceFor, trusted = false, fetchTip = fetchForGate } = {}) {
  const order = trusted ? TRUSTED_ROWS : ROWS;
  const one = request(`pulls/${pr}`);
  if (one.error) return { error: `PR #${pr}: ${one.error}` };
  const pull = one.json || {};
  const head = String(pull.head?.sha || "").toLowerCase();
  const base = pull.base?.ref || DEPLOY;
  const rows = {};
  rows.open = openVerdict(pull);
  const want = String(sha || "").toLowerCase();
  if (rows.open.ok && want && !(head.startsWith(want) || want.startsWith(head))) rows.open = row(false, `PR head is ${head.slice(0, 8)}, not the --sha ${want.slice(0, 8)} this run gated: a newer push gets its own run`);
  rows.hold = holdVerdict(pull.labels);
  rows.plan = planRow(pull.body);
  if (!head) return { error: `PR #${pr}: no head sha` };
  const checks = checkRunsFor(head, request);
  if (checks.error) return { error: `check-runs on ${head.slice(0, 8)}: ${checks.error}` };
  const ci = ciSuitesFor(head, request);
  if (ci.error) return { error: `${CI_WORKFLOW} runs on ${head.slice(0, 8)}: ${ci.error}` };
  rows.ci = ciVerdict(checks.list, REQUIRED_CHECK, CI_APP, ci.suites);
  let tip = "";
  // No tip is a FAIL row, not an error: an error posts "will retry" and hides the row that actually refused.
  const distanceRow = () => {
    if (!tip) return { row: row(false, "not evaluated: no tip") };
    return distance({ head, tip, cwd: root, max: maxBehind });
  };
  if (!rows.open.ok) {
    for (const k of order.filter((r) => r === "gen" || r === "ratchets" || r === "distance")) rows[k] = row(false, "not evaluated: the PR is not open and ready");
  } else if (trusted) {
    // No merge and no PR script: the base tip and the head's objects only, for the merge-base.
    const f = fetchTip({ pr, head, headRef: pull.head?.ref || "", cwd: root, base });
    if (f.error) return { error: f.error };
    tip = f.tip || "";
    const d = distanceRow();
    if (d.error) return { error: d.error };
    rows.distance = d.row;
  } else {
    const g = localMerge({ pr, head, headRef: pull.head?.ref || "", cwd: root, base });
    if (g.error) return { error: g.evidence };
    tip = g.tip || "";
    rows.gen = row(g.ok, g.evidence);
    rows.ratchets = g.ratchets ? row(g.ratchets.ok, g.ratchets.evidence) : row(false, "not evaluated: the merge or gen:check refused first");
    const d = distanceRow();
    if (d.error) return { error: d.error };
    rows.distance = d.row;
  }
  const ordered = {};
  for (const k of order) ordered[k] = rows[k];
  const ok = order.every((k) => ordered[k].ok);
  // Waiting: every row that is not ok is a pending one (only `ci` can be), so the verdict is not known yet.
  const waiting = !ok && order.every((k) => ordered[k].ok || ordered[k].pending);
  return { ok, waiting, rows: ordered, pr, head, base, tip, trusted: !!trusted };
}

/** The printed rows: one `= gate <row>: ok|FAIL <reason>` line each, then the summary line. Pure. */
export function rowLines(v) {
  const mark = (r) => (r.ok ? "ok" : r.pending ? "WAIT" : "FAIL");
  const lines = ROWS.filter((k) => v.rows?.[k]).map((k) => `= gate ${k}: ${mark(v.rows[k])} ${v.rows[k].evidence}`);
  lines.push(`= merge-gate ${v.ok ? "passed" : v.waiting ? "waiting" : "refused"} — ${ROWS.filter((k) => v.rows?.[k]).map((k) => `${k}=${mark(v.rows[k])}`).join(" ")} pr=#${v.pr} sha=${v.head || ""} tip=${v.tip || ""}`);
  return lines;
}

const USAGE = `usage: node tools/ci/merge-gate.mjs --pr <n> [--sha <head>] [--check] [--trusted] [--max-behind N] [--json <path>]
  The landing gate: the CI check named \`gate\` (land.yml), also runnable locally with a GitHub token
  (GH_TOKEN / GITHUB_TOKEN or \`gh auth token\`). Rows, each printed as \`= gate <row>: ok|FAIL <reason>\`, then one
  final \`= merge-gate passed|refused …\` line (the check title):
    open (open, not a draft, head = --sha when given), hold (no \`hold\` label), plan (Plan closed; \`land:\` items
    exempt), ci (\`CI\` success on the head), gen (clean merge onto the current base tip + gen:check),
    ratchets (on that merge result), distance (merge-base at most N game merges behind the base tip; default ${MAX_BEHIND};
    a PR whose own diff touches no game path passes it).
  --trusted: only the rows that run no PR code (open, hold, plan, ci, distance); land.yml's trusted-rows job.
  A row still waiting on CI prints WAIT. Exit 0 all rows ok, 2 a row failed, 3 waiting (every other row ok, CI not
  finished), 1 usage or API/git error. Writes nothing but an optional --json summary.`;

export function main(argv, { request = api, root = ROOT, log = console.log, localMerge = localMergeGenCheck, distance = distanceFor, write = fs.writeFileSync, fetchTip = fetchForGate } = {}) {
  exitIfHelp(argv, USAGE);
  const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : null; };
  const pr = Number(opt("--pr"));
  if (!Number.isInteger(pr) || pr < 1) { log("= merge-gate error — --pr <n> is required"); return 1; }
  const maxBehind = opt("--max-behind") == null ? MAX_BEHIND : Number(opt("--max-behind"));
  if (!Number.isInteger(maxBehind) || maxBehind < 0) { log("= merge-gate error — --max-behind expects a non-negative integer"); return 1; }
  const v = evaluate({ pr, sha: opt("--sha") || "", request, root, maxBehind, localMerge, distance, trusted: argv.includes("--trusted"), fetchTip });
  if (v.error) { log(`= merge-gate error — ${v.error}`); return 1; }
  for (const l of rowLines(v)) log(l);
  const jsonPath = opt("--json");
  if (jsonPath) write(path.resolve(root, jsonPath), JSON.stringify({ ...v, maxBehind, at: new Date().toISOString() }, null, 2) + "\n");
  return v.ok ? 0 : v.waiting ? 3 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
