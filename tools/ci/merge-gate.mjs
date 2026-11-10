#!/usr/bin/env node
// merge-gate.mjs — the landing gate: the CI check named `gate` (.github/workflows/land.yml), runnable locally.
// @doc Landing gate (`gate` check): open, hold (Bryce lifts), Plan, CI, config-ok for harness edits, gen + ratchets.
// @section runner
// @skill steward
//
// Why (docs/plans/2026-10-27-orchestration-redesign.md §3, §4.3): GitHub lands PRs; agents never merge. This gate
// is a pure function of GitHub state plus a throw-away merge of the head onto the CURRENT base tip. It writes
// nothing (no receipt, no bus line), reads no bus, and pins no session identity: the branch ruleset requires the
// `gate` check and `land.yml` arms auto-merge when it is green.
//
//   node tools/ci/merge-gate.mjs --pr <n> [--sha <head>] [--check] [--trusted] [--json <path>]
//
// Rows (all must pass; each prints `= gate <row>: ok|FAIL <reason>`, then one final `= merge-gate passed|refused …`
// line, which land.yml reads as the check title):
//   open      the PR is open and not a draft, and its head is the `--sha` the workflow gated (when given)
//   hold      no `hold` label, and the label events walked oldest first: once Bryce has set `hold` in person
//             (performed_via_github_app null), the PR stays held until a LATER unlabel of his own; any other
//             unlabel or re-label in between changes nothing. A hold only an agent ever set is lifted by any
//             removal. (provenance, docs/plans/2026-11-03-agent-surface-reset.md §4.3; tools/ci/lib/provenance.mjs)
//   plan      the body's `## Plan` checklist is closed (ready-gate's parser; an item starting `land:` is ignored);
//             a body with no Plan fails, except a fold bot's PR (author `*[bot]`), whose body has none
//   ci        the `CI` check-run from the GitHub Actions app, in the check suite of a ci.yml workflow run, is
//             `success` on the PR's current head, newest attempt
//   config    a diff touching a CONFIG_PATH (the harness, the gate's own code, the agent config; renames by either
//             name) needs the `config-ok` label, last added by Bryce in person, and newer than the last push that
//             touched a CONFIG_PATH (configPushState); any other diff passes. Replaces the hook "ask".
//   gen       clean merge onto the current base tip; `gen:check` and the scenery catalog digest pass there
//   ratchets  tools/check/ratchets.mjs and the whole-tree count tests hold on that same merge result
//             (two PRs under a ceiling alone can be over it together, #3236 + #3237, 2026-10-20)
// The `distance` row (merge-base at most N game merges behind the tip) was retired 2026-11-03 (plan §6): gen and
// ratchets already run on the real merge result, which is what catches composition reds; the row only bought syncs.
//
// `--trusted` evaluates only the rows that run no code from the PR (open, hold, plan, ci, config): GitHub reads only,
// nothing checked out or run. land.yml's `trusted-rows` job runs it, so `post` never takes those rows from the
// artifact of the leg that ran the PR's scripts (WP-L2).
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
import { OWNER, byOwner, describeActor, labelEvents, newestLabelEvent } from "./lib/provenance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** The deploy branch's required CI check (ci.yml `ci-verdict`, Bryce 2026-10-15). */
export const REQUIRED_CHECK = "CI";
/** The only app whose `CI` check-run counts: ci.yml runs under GitHub Actions. Any token with `checks: write` can
 * create a check-run named `CI`, but only under its OWN app, so a run from another app (or none) is ignored. */
export const CI_APP = "github-actions";
/** The workflow file whose run must own the `CI` check-run: a job named `CI` in any OTHER workflow (a PR can add one)
 * is an Actions-app check-run too, so the app alone does not pin it (r2 landing-design, WP-L3e). */
export const CI_WORKFLOW = "ci.yml";
/** The label that vetoes a landing (plan §4.1); since 2026-11-03 only Bryce's own click lifts it (the hold row). */
export const HOLD_LABEL = "hold";
/** The label Bryce adds in person to let a PR that edits the agent harness land (the config row). */
export const CONFIG_LABEL = "config-ok";
/** The paths whose edit needs CONFIG_LABEL: the hooks, settings, workflows and actions that enforce every other rule,
 *  the CI tools that compute this gate and the dispatcher, the MCP and hook tooling, the generated-path list, the
 *  package scripts, every host's hook and agent config, the tracked memory and the issue templates. */
export const CONFIG_PATH = new RegExp("^(" + [
  "\\.claude/hooks/", "\\.claude/settings(\\.local)?\\.json$", "\\.claude/agents/", "\\.claude/memory/",
  "\\.github/workflows/", "\\.github/actions/", "\\.github/ISSUE_TEMPLATE/", "\\.githooks/", "\\.mcp\\.json$",
  "tools/ci/", "tools/hooks/", "tools/mcp/", "tools/lib/generated-paths\\.mjs$", "package\\.json$",
  "\\.cursor/hooks", "\\.codex/hooks",
].join("|") + ")");
export const isConfigPath = (p) => CONFIG_PATH.test(String(p || "").replace(/^\.\//, ""));
export const configFiles = (files) => (files || []).filter(isConfigPath);
/** The paths a pulls/<n>/files or compare row names: `filename`, and `previous_filename` for a rename. Pure. */
export const filePaths = (rows) => (rows || []).flatMap((f) => [f?.filename, f?.previous_filename]).filter(Boolean);
/** Row order, which is also print order. */
export const ROWS = Object.freeze(["open", "hold", "plan", "ci", "config", "gen", "ratchets"]);
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

/** hold: no `hold` label, and (when the PR's label events are given) the `hold` events walked in order (created_at,
 *  then list order): an owner's in-person `labeled` sets a hold that only a LATER owner `unlabeled` clears; nothing
 *  anyone else does in between clears it. Labels may be strings or `{ name }` objects (the API's shape); `events`
 *  null skips the provenance half (pure callers without events). Pure. */
export function holdVerdict(labels, events = null, owner = OWNER) {
  const names = (labels || []).map((l) => String(typeof l === "string" ? l : l?.name || "").toLowerCase());
  if (names.includes(HOLD_LABEL)) return row(false, `the \`${HOLD_LABEL}\` label is set: whoever set it removes it; one ${owner} set, only his own click`);
  const at = (e) => Date.parse(e?.created_at || "") || 0;
  const walk = labelEvents(events, HOLD_LABEL).map((e, i) => ({ e, i })).sort((a, b) => at(a.e) - at(b.e) || a.i - b.i).map((x) => x.e);
  let ownerHold = null, lifted = null;
  for (const e of walk) {
    if (e.event === "labeled" && byOwner(e, owner)) ownerHold = e;
    else if (e.event === "unlabeled") { lifted = e; if (ownerHold && byOwner(e, owner)) ownerHold = null; }
  }
  if (ownerHold) {
    return row(false, `hold set by ${owner} at ${ownerHold.created_at || "?"} was not removed by ${owner} himself (last unlabel: ${lifted ? `${describeActor(lifted)} at ${lifted.created_at || "?"}` : "none recorded"}): still held until he removes it`);
  }
  return row(true, lifted ? `no \`${HOLD_LABEL}\` label (last removed by ${describeActor(lifted)})` : `no \`${HOLD_LABEL}\` label`);
}

/** config: a diff touching a CONFIG_PATH needs the `config-ok` label whose newest `labeled` event is the owner's own
 *  click; a diff touching none passes. `files` are the PR's changed paths (filePaths over pulls/<n>/files). `push`
 *  (configPushState) binds the label to the head: "after" (a CONFIG_PATH push came after the label) fails, "unknown"
 *  waits; null skips the binding (pure callers only). Pure. */
export function configVerdict(files, labels, events = null, owner = OWNER, push = null) {
  const touched = configFiles(files);
  if (!touched.length) return row(true, `no config path (harness, CI tools, agent config) in the diff (${(files || []).length} file(s))`);
  const shown = touched.slice(0, 4).join(", ") + (touched.length > 4 ? ", …" : "");
  const names = (labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
  const last = newestLabelEvent(events, CONFIG_LABEL);
  if (!names.includes(CONFIG_LABEL)) return row(false, `needs ${CONFIG_LABEL} from ${owner}: the diff edits ${shown}`);
  if (!last || last.event !== "labeled" || !byOwner(last, owner)) {
    return row(false, `needs ${CONFIG_LABEL} from ${owner}: the label was ${last ? `last added by ${describeActor(last)}` : "found but its label event was not"} — only his own click counts (the diff edits ${shown})`);
  }
  if (push?.state === "after") return row(false, `needs a fresh ${CONFIG_LABEL} from ${owner}: ${push.evidence} after his label at ${last.created_at || "?"} (remove and re-add it)`);
  if (push?.state === "unknown") return { ...row(false, `${CONFIG_LABEL} from ${owner} found, head push not resolved yet: ${push.evidence}`), pending: true };
  return row(true, `${CONFIG_LABEL} added by ${owner} at ${last.created_at || "?"} covers ${shown}${push?.evidence ? ` (${push.evidence})` : ""}`);
}

/**
 * When did the head get pushed relative to the owner's `config-ok` at `labelAt`? Reads ci.yml's pull_request runs of
 * this PR (server timestamps; a commit date can say anything). The head is covered when the label is newer than the
 * head's first run. Otherwise the head at label time is the head of the newest run created before the label, and the
 * compare from it to the head must touch no CONFIG_PATH.
 * → { state: "covered"|"after"|"unknown", evidence }. Side effects only through `request`.
 */
export function configPushState({ pr, head, headRef, labelAt, request }) {
  const t = (iso) => Date.parse(iso || "") || 0;
  const L = t(labelAt);
  if (!L) return { state: "unknown", evidence: "no config-ok label time" };
  const runs = listAll(`actions/workflows/${CI_WORKFLOW}/runs?event=pull_request&branch=${encodeURIComponent(headRef || "")}`, request, (j) => j?.workflow_runs, 10);
  if (runs.error) return { state: "unknown", evidence: `${CI_WORKFLOW} runs: ${runs.error}` };
  const mine = runs.rows.filter((w) => (w?.pull_requests || []).some((p) => Number(p?.number) === Number(pr)) && t(w.created_at));
  const onHead = mine.filter((w) => String(w.head_sha || "").toLowerCase() === head);
  if (!onHead.length) return { state: "unknown", evidence: `no ${CI_WORKFLOW} pull_request run of PR #${pr} on ${head.slice(0, 8)} yet` };
  const pushedAt = Math.min(...onHead.map((w) => t(w.created_at)));
  if (L > pushedAt) return { state: "covered", evidence: `labelled after the head ${head.slice(0, 8)} was pushed` };
  const before = mine.filter((w) => t(w.created_at) < L).sort((a, b) => t(b.created_at) - t(a.created_at))[0];
  if (!before) return { state: "after", evidence: `no run of PR #${pr} predates the label, so the head ${head.slice(0, 8)} was pushed` };
  const from = String(before.head_sha || "").toLowerCase();
  const cmp = request(`compare/${encodeURIComponent(from)}...${encodeURIComponent(head)}`);
  if (cmp.error) return { state: "unknown", evidence: `compare ${from.slice(0, 8)}...${head.slice(0, 8)}: ${cmp.error}` };
  const files = cmp.json?.files;
  if (!Array.isArray(files) || files.length >= 300) return { state: "after", evidence: `the compare ${from.slice(0, 8)}...${head.slice(0, 8)} is unreadable or truncated, so a push` };
  const hit = configFiles(filePaths(files));
  return hit.length
    ? { state: "after", evidence: `a push touching ${hit.slice(0, 3).join(", ")} (${from.slice(0, 8)}...${head.slice(0, 8)}) came` }
    : { state: "covered", evidence: `the pushes since ${from.slice(0, 8)} touch no config path` };
}

/** plan: the Plan checklist is closed (ready-gate.mjs planVerdict, `land:` items exempt). No Plan fails (skill steward
 *  §Open: every agent PR carries one), except on a fold bot's PR (`author` a `*[bot]` login). Pure. */
export function planRow(body, author = "") {
  const p = planVerdict(body);
  if (p.state === "none" && !/\[bot\]$/.test(String(author || ""))) return row(false, "no ## Plan checklist in the body (skill steward §Open) — add the template's Plan and close it");
  if (p.state === "open") {
    const shown = p.open.slice(0, 3).map((t) => `"${t}"`).join(", ");
    return row(false, `${p.open.length} of ${p.items} Plan item(s) open: ${shown}${p.open.length > 3 ? ", ..." : ""} — tick each with its evidence or strike it with why`);
  }
  return row(true, p.state === "none" ? "no ## Plan checklist in the body (a fold bot's PR)" : `Plan closed (${p.items} items)`);
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

// ---- git-backed rows --------------------------------------------------------------------------------------

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
 * first step of the throw-away merge; `--trusted` reads GitHub only and never calls it.
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
  // A refusal carries the fetched tip: land.yml compares it with the deploy tip at post time (2026-10-27 23:20Z, #3964).
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

/** Every page of a list endpoint through `request` → { rows } | { error }. A full last allowed page is an error
 *  (fail closed): on an oldest-first list the rows past it are the newest ones. */
export function listAll(pathQs, request, pick = (j) => j, maxPages = 30) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = request(`${pathQs}${pathQs.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (r.error) return { error: r.error };
    const batch = pick(r.json);
    const rows = Array.isArray(batch) ? batch : [];
    out.push(...rows);
    if (rows.length < 100) return { rows: out };
  }
  return { error: `more than ${maxPages} pages of 100: truncated, refusing to judge a partial list` };
}

/**
 * Every row for PR `pr`. Side effects only through the injected `request` (GitHub) and `localMerge` (the throw-away
 * merge). The hold and config rows read the PR's label events (provenance) and the config row its changed files.
 * Returns { ok, rows, pr, head, base, tip } or { error } for an API/git failure.
 */
export function evaluate({ pr, sha = "", request = api, root = ROOT, localMerge = localMergeGenCheck, trusted = false, owner = OWNER } = {}) {
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
  // The label events: who added or removed `hold` / `config-ok`, and through which app (provenance).
  const ev = listAll(`issues/${pr}/events`, request, (j) => j, 10);
  if (ev.error) return { error: `events of PR #${pr}: ${ev.error}` };
  rows.hold = holdVerdict(pull.labels, ev.rows, owner);
  rows.plan = planRow(pull.body, pull.user?.login || "");
  if (!head) return { error: `PR #${pr}: no head sha` };
  const checks = checkRunsFor(head, request);
  if (checks.error) return { error: `check-runs on ${head.slice(0, 8)}: ${checks.error}` };
  const ci = ciSuitesFor(head, request);
  if (ci.error) return { error: `${CI_WORKFLOW} runs on ${head.slice(0, 8)}: ${ci.error}` };
  rows.ci = ciVerdict(checks.list, REQUIRED_CHECK, CI_APP, ci.suites);
  const files = listAll(`pulls/${pr}/files`, request);
  if (files.error) return { error: `files of PR #${pr}: ${files.error}` };
  const changed = filePaths(files.rows);
  const cfgLast = newestLabelEvent(ev.rows, CONFIG_LABEL);
  const needsPush = configFiles(changed).length && cfgLast?.event === "labeled" && byOwner(cfgLast, owner);
  const push = needsPush ? configPushState({ pr, head, headRef: pull.head?.ref || "", labelAt: cfgLast.created_at, request }) : null;
  rows.config = configVerdict(changed, pull.labels, ev.rows, owner, push);
  let tip = "";
  if (!rows.open.ok) {
    for (const k of order.filter((r) => r === "gen" || r === "ratchets")) rows[k] = row(false, "not evaluated: the PR is not open and ready");
  } else if (trusted) {
    // GitHub only (no git, no PR code): land.yml post requires this tip to equal the land-gate leg's (#4592).
    const b = request(`branches/${encodeURIComponent(base)}`);
    if (b.error) return { error: `branch ${base}: ${b.error}` };
    tip = String(b.json?.commit?.sha || "").toLowerCase();
    if (!tip) return { error: `branch ${base}: no tip sha` };
  } else {
    const g = localMerge({ pr, head, headRef: pull.head?.ref || "", cwd: root, base });
    if (g.error) return { error: g.evidence };
    tip = g.tip || "";
    rows.gen = row(g.ok, g.evidence);
    rows.ratchets = g.ratchets ? row(g.ratchets.ok, g.ratchets.evidence) : row(false, "not evaluated: the merge or gen:check refused first");
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

const USAGE = `usage: node tools/ci/merge-gate.mjs --pr <n> [--sha <head>] [--check] [--trusted] [--json <path>]
  The landing gate: the CI check named \`gate\` (land.yml), also runnable locally with a GitHub token
  (GH_TOKEN / GITHUB_TOKEN or \`gh auth token\`). Rows, each printed as \`= gate <row>: ok|FAIL <reason>\`, then one
  final \`= merge-gate passed|refused …\` line (the check title):
    open (open, not a draft, head = --sha when given), hold (no \`hold\` label; a hold ${OWNER} set in person is lifted
    only by a later click of his own, an agent's hold by anyone), plan (Plan present and closed; \`land:\` items exempt), ci (\`CI\` success on
    the head), config (a diff touching a config path — harness, CI tools, agent config; see CONFIG_PATH — needs
    \`${CONFIG_LABEL}\` added by ${OWNER} in person after the last push touching one), gen (clean merge onto the current base tip + gen:check), ratchets (on
    that merge result).
  --trusted: only the rows that run no PR code (open, hold, plan, ci, config); land.yml's trusted-rows job.
  A row still waiting on CI prints WAIT. Exit 0 all rows ok, 2 a row failed, 3 waiting (every other row ok, CI not
  finished), 1 usage or API/git error. Writes nothing but an optional --json summary.`;

export function main(argv, { request = api, root = ROOT, log = console.log, localMerge = localMergeGenCheck, write = fs.writeFileSync, owner = OWNER } = {}) {
  exitIfHelp(argv, USAGE);
  const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : null; };
  const pr = Number(opt("--pr"));
  if (!Number.isInteger(pr) || pr < 1) { log("= merge-gate error — --pr <n> is required"); return 1; }
  if (argv.includes("--max-behind")) { log("= merge-gate error — --max-behind is gone: the distance row was retired 2026-11-03 (header of this file)"); return 1; }
  const v = evaluate({ pr, sha: opt("--sha") || "", request, root, localMerge, trusted: argv.includes("--trusted"), owner });
  if (v.error) { log(`= merge-gate error — ${v.error}`); return 1; }
  for (const l of rowLines(v)) log(l);
  const jsonPath = opt("--json");
  if (jsonPath) write(path.resolve(root, jsonPath), JSON.stringify({ ...v, at: new Date().toISOString() }, null, 2) + "\n");
  return v.ok ? 0 : v.waiting ? 3 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
