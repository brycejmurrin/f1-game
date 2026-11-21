#!/usr/bin/env node
// merge-gate.mjs — the landing gate: the CI check named `gate` (.github/workflows/land.yml), runnable locally.
// @doc Landing gate (`gate` check): open, hold (Bryce lifts), Plan, CI, config-ok, gen + ratchets + re-test on the merge.
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
//             `success` on the PR's current head, newest attempt; a run that went green only on a re-run after a
//             failed job (`run_attempt` > 1) fails the row. CREDIT ACROSS A CLEAN TIP-SYNC (D-045, Bryce 2026-11-21
//             ~03:47Z): while the head's own CI is missing or still running, the row passes on a prior head H0's green
//             CI (attempt 1, same rules) when the head is a chain of at most CREDIT_CHAIN_MAX clean tip-sync merges
//             of H0 (cleanTipSync: two parents, the second a deploy first-parent commit, `git merge-tree --write-tree`
//             reproduces the head's tree byte for byte, so no conflict resolution and no hand edit). The row and the
//             summary (`credited=<sha>`) name H0, and the retest row then always runs against H0. A red head CI is
//             never credited over.
//   base      the deploy tip is not red on CODE (#5425, Bryce's decision 1 "Gate holds merges, one fixer"): the newest
//             completed pages.yml run on the base branch, read through its jobs (tools/ci/lib/deploy-tip.mjs). A
//             failed job other than a Pages-side publish failure (`deploy` with PLATFORM_STEP failed; run 42880431465)
//             makes the row WAIT (pending, so the next Pages train re-gates). The fixer is never held, two ways:
//             (1) proof: the PR carries `deploy:red` (anyone's, the fixer's claim) AND its head CONTAINS the red
//             run's commit, so the `ci` row's green was earned on top of the red tip; (2) `deploy:red` or `priority`
//             last added by Bryce in person after the red run started. An agent's label without the proof does not
//             count. An infrastructure red holds too and clears on a re-run, the pages.yml cron or route (1).
//             When that run is not on the base tip's own sha (Pages queued or cancelled in a backlog: #5714 + #5634
//             red the tip on 2026-11-19 and eight PRs merged onto it), the tip's own budget tests decide on a worktree
//             of the tip (tools/ci/lib/tip-gate.mjs; ~4 s, cached per sha): a red WAITs like a Pages red, a gate
//             that cannot run WAITs as `unverified`, and the fixer routes are the same with the tip sha as the red.
//   config    a diff touching a CONFIG_PATH (the harness, the gate's own code, the agent config; renames by either
//             name) needs the `config-ok` label, last added by Bryce in person (or, for ROUTINE config paths only, by
//             an agent through the Claude app: PROTECTED_CONFIG_PATH, #5455, D-034), and every push after it must leave the
//             PR's own config diff as the label saw it (configPushState: a tip sync keeps it, #5432); any other diff
//             passes. A package.json diff that is ONLY the generated `test:*` file lists (generatedPkgVerdict) does not count. Replaces the hook "ask".
//   raise     a diff that RAISES a tree-wide ceiling (tests/data/ratchets.json `tree`, plus the tests/data/ratchets.d
//             deltas, compared head vs merge base; a lowered, unchanged or new ceiling is no raise) needs the
//             `ratchet-raise` label, last added by Bryce in person or by an agent through the Claude app (D-042; his
//             own removal vetoes agent re-adds), and newer than the last push touching a ratchet file.
//             Per-file ceilings (`files`, the commit hook's --auto-raise) are not this row's. Bryce's pick, 2026-11-11
//             ~09:10Z: "Build the check (Recommended)" (#5405 option b; .claude/rules/game-code.md).
//   gen       clean merge onto the current base tip; `gen:check` passes and the scenery catalog builds there
//   ratchets  tools/check/ratchets.mjs and the whole-tree count tests hold on that same merge result
//             (two PRs under a ceiling alone can be over it together, #3236 + #3237, 2026-10-20)
//   retest    the CI run tested a merge ref as of ITS creation, so a PR merged onto the tip since then is untested in
//             combination (#5407: #5300 × #5392 → deploy red #5396). On the same merge result, the unit tests that
//             BOTH the newer tip merges and the PR select (tooling-fast's own --changed selection, once per side) plus
//             the touched tests/unit files of either side run once (only the touched files when the selection widens
//             to the whole floor); a failing, timed-out, too-broad or un-runnable re-test refuses. Both sides, not
//             either (#5597): a test only the PR selects reads nothing the tip merges changed, so the PR's CI run is
//             still its verdict, and a test only the tip selects was green on the tip. This trusts the selection per
//             side, as ci.yml's --changed guard shards do: a test that reads a path its side's selection does not pin
//             it to is not re-tested.
//             Bryce's pick, 2026-11-11 ~09:02Z: "Quick re-test at merge (Recommended)" (#5407 option b).
//             It catches ACCIDENTAL crossings: the merge result's own scripts (gen:check, the ratchets) ran before it
//             as the same user and could steer it, the same trust the gen and ratchets rows already have.
// A MERGE TRAIN (a head branch starting `train/`, built by tools/ci/merge-train.mjs; docs/notes/MERGE-TRAIN-2026-11-18.md)
// has the same rows, but its config and raise rows are its CARS' rows: the head must be exactly the clean fold of the manifest's car heads
// onto a deploy-branch commit (git objects only: rev-list, merge-tree), and each car must be open at that head, carry
// `land` and pass its own open, hold, plan, ci, config and raise rows (evaluate --trusted per car). Its own diff is
// never read. So Bryce's per-PR labels stay per PR, and a `hold` on any car refuses the train.
// The `distance` row (merge-base at most N game merges behind the tip) was retired 2026-11-03 (plan §6): gen and
// ratchets already run on the real merge result, which is what catches composition reds; the row only bought syncs.
//
// `--trusted` evaluates only the rows that run no code from the PR (open, hold, plan, ci, base, config, raise): GitHub reads only,
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
import { planVerdict, nowHint } from "./ready-gate.mjs";
import { renderPkg } from "../gen/gen-test-groups.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { AGENT_APP_SLUG, OWNER, byAgent, byOwner, describeActor, labelEvents, newestLabelEvent, ownerSet } from "./lib/provenance.mjs";
import { readDeployTip } from "./lib/deploy-tip.mjs";
import { runTipGate, tipView } from "./lib/tip-gate.mjs";
import { TRAIN_PREFIX, trainManifest, trainRow, verifyTrain } from "./merge-train.mjs";

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
/** The label Bryce adds in person to let a PR that raises a tree-wide ratchet ceiling land (the raise row, #5405). */
export const RAISE_LABEL = "ratchet-raise";
/** The ratchet ceiling files: the base table and the per-branch delta fragments (tools/check/ratchets.mjs). */
export const RATCHET_FILE = /^tests\/data\/(ratchets\.json|ratchets\.d\/[^/]+\.json)$/;
export const ratchetFiles = (files) => (files || []).filter((f) => RATCHET_FILE.test(String(f || "").replace(/^\.\//, "")));
/** The label Bryce adds in person to let a PR that edits the agent harness land (the config row). */
export const CONFIG_LABEL = "config-ok";
/** The paths whose edit needs CONFIG_LABEL: the hooks, settings, workflows and actions that enforce every other rule,
 *  the CI tools that compute this gate and the dispatcher, the MCP and hook tooling, the generated-path list, the
 *  package scripts, every host's hook and agent config, the tracked memory and the issue templates. */
/** The gate's import-closure modules (gateClosure in tools/lib/gate-receipt.mjs) that live OUTSIDE tools/ci/ (#5467):
 *  their top level runs when the gate imports them and gen-test-groups decides generatedPkgVerdict, so each is a
 *  config path AND a protected one. A test fails on any closure module either list misses. */
const GATE_MODULE_OUTSIDE_CI = ["tools/gen/gen-test-groups\\.mjs$", "tools/lib/changed-files\\.mjs$", "tools/lib/cli-args\\.mjs$",
  "tools/lib/gate-receipt\\.mjs$", "tools/lib/work-tree-id\\.mjs$"];
export const CONFIG_PATH = new RegExp("^(" + [
  "\\.claude/hooks/", "\\.claude/settings(\\.local)?\\.json$", "\\.claude/agents/", "\\.claude/memory/",
  "\\.github/workflows/", "\\.github/actions/", "\\.github/ISSUE_TEMPLATE/", "\\.githooks/", "\\.mcp\\.json$",
  "tools/ci/", "tools/hooks/", "tools/mcp/", "tools/lib/generated-paths\\.mjs$", "package\\.json$",
  "\\.cursor/hooks", "\\.codex/hooks", ...GATE_MODULE_OUTSIDE_CI,
].join("|") + ")");
export const isConfigPath = (p) => CONFIG_PATH.test(String(p || "").replace(/^\.\//, ""));
/** The PROTECTED config paths (#5455; D-034 narrowed them on 2026-11-18): only Bryce's own `config-ok` tap covers a
 *  diff that touches one; an agent's `config-ok` covers ROUTINE config paths only (every other CONFIG_PATH). Kept: the
 *  gate (this module, which defines both lists; provenance; deploy-tip; ready-gate; the GitHub client and token, and
 *  the rest of the gate's import closure, under tools/ci/ and outside it (#5467), because a module's top level runs
 *  when the gate imports it — a test pins the closure), the land workflow, and every host's hooks and settings.
 *  D-034 ("Shrink the list") supersedes the 2026-11-11 ci.yml call ("Protect ci.yml"): ci.yml, pick-tests and
 *  preflip-probe are ROUTINE now, still config paths, so they still need a `config-ok`, but an agent's counts. */
export const PROTECTED_CONFIG_PATH = new RegExp("^(" + [
  "tools/ci/merge-gate\\.mjs$", "tools/ci/lib/provenance\\.mjs$", "tools/ci/lib/deploy-tip\\.mjs$", "tools/ci/lib/tip-gate\\.mjs$", "tools/ci/ready-gate\\.mjs$",
  "tools/ci/github-api\\.mjs$", "tools/ci/merge-train\\.mjs$", "tools/ci/github-token\\.mjs$",
  "\\.github/workflows/land\\.yml$", "\\.claude/hooks/", "\\.claude/settings[^/]*\\.json$", "tools/hooks/", "\\.githooks/",
  "\\.cursor/hooks", "\\.codex/hooks", ...GATE_MODULE_OUTSIDE_CI,
].join("|") + ")");
export const isProtectedConfigPath = (p) => PROTECTED_CONFIG_PATH.test(String(p || "").replace(/^\.\//, ""));
export const configFiles = (files) => (files || []).filter(isConfigPath);
/** The paths a pulls/<n>/files or compare row names: `filename`, and `previous_filename` for a rename. Pure. */
export const filePaths = (rows) => (rows || []).flatMap((f) => [f?.filename, f?.previous_filename]).filter(Boolean);
/** Row order, which is also print order. */
export const ROWS = Object.freeze(["open", "hold", "plan", "ci", "base", "config", "raise", "gen", "ratchets", "retest"]);
/** The rows that need the throw-away merge (git + the merge result's code); `--trusted` evaluates none of them. */
export const LOCAL_ROWS = Object.freeze(["gen", "ratchets", "retest"]);
/** The rows `--trusted` evaluates: none of them runs code from the PR. */
export const TRUSTED_ROWS = Object.freeze(ROWS.filter((k) => !LOCAL_ROWS.includes(k)));

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

/** The labels that let a PR land over a code-red deploy tip, counted only when Bryce added them in person (#5425). */
export const BASE_ESCAPE_LABELS = Object.freeze(["deploy:red", "priority"]);

/** The label a fixer's PR carries; with the proof (below) it passes `base` whoever set it. */
export const FIXER_LABEL = "deploy:red";

/** Does `head` contain the red run's commit `redSha`? One compare read: "ahead" or "identical" means every commit of
 *  the red tip is in the head, so the head's own CI ran on top of the red. → { contains, redSha } | { error }. */
export function fixerProof({ redSha, head, request }) {
  if (!redSha || !head) return { contains: false, redSha: redSha || null };
  const c = request(`compare/${encodeURIComponent(redSha)}...${encodeURIComponent(head)}`);
  if (c.error) return { error: `compare ${redSha.slice(0, 8)}...${head.slice(0, 8)}: ${c.error}` };
  const status = c.json?.status;
  if (typeof status !== "string") return { error: `compare ${redSha.slice(0, 8)}...${head.slice(0, 8)}: no status in the response` };
  return { contains: status === "ahead" || status === "identical", redSha };
}

/** base: `tip` is tipState() from tools/ci/lib/deploy-tip.mjs. A code red WAITS (pending) unless this PR is the fixer:
 *  (1) proof: FIXER_LABEL is on the PR (set by anyone) and `proof.contains` (fixerProof: the head contains the red
 *  run's commit), so the head's CI ran on top of the red and the `ci` row is the evidence that it is fixed; a later
 *  red has another commit, so the proof never carries over; or
 *  (2) one of BASE_ESCAPE_LABELS is on the PR, its newest event is Bryce's own `labeled` (ownerSet:
 *  performed_via_github_app null, actor the owner), AND that click is newer than the red run's start (`tip.runAt`):
 *  a label he set for an earlier red, or `priority` set for scheduling, does not wave through a later red.
 *  Any other state passes. `events` null honours no owner escape; `proof` null honours no proof. Pure. */
export function baseVerdict(tip, labels, events = null, owner = OWNER, proof = null) {
  if (tip?.state !== "code-red" && tip?.state !== "unverified") return row(true, tip?.evidence || "deploy tip state not given");
  const names = (labels || []).map((l) => (typeof l === "string" ? l : l?.name));
  const sha8 = String(tip.sha || "").slice(0, 8) || "?";
  if (names.includes(FIXER_LABEL) && proof?.contains === true) {
    return row(true, `${tip.evidence}; \`${FIXER_LABEL}\` is set and this head contains the red commit ${sha8}: its CI ran on top of the red tip, so the ci row is the proof (the fixer)`);
  }
  const redAt = Date.parse(tip.runAt || "");
  const after = (l) => { const t = Date.parse(newestLabelEvent(events, l)?.created_at || ""); return !!t && !!redAt && t > redAt; };
  const mine = BASE_ESCAPE_LABELS.filter((l) => ownerSet(labels, events, l, owner) && after(l));
  if (mine.length) {
    const e = newestLabelEvent(events, mine[0]);
    return row(true, `${tip.evidence}; \`${mine[0]}\` added by ${owner} in person at ${e?.created_at || "?"}: this PR may land over the red tip (the fixer)`);
  }
  const notHis = BASE_ESCAPE_LABELS.filter((l) => names.includes(l));
  const why = notHis.length ? `; \`${notHis.join("`, `")}\` is set but not added by ${owner} in person after this red run started (${tip.runAt || "?"}), with no proof that this head contains the red commit ${sha8}, so it does not count` : "";
  return { ...row(false, `${tip.evidence}: merges wait until the tip is green${why}; the fixer's PR lands with \`${FIXER_LABEL}\` once its head contains ${sha8} (sync-pr --onto-red-tip) and its CI is green, or once ${owner} adds \`${FIXER_LABEL}\` to it himself`), pending: true };
}

/** Which kind of `config-ok` labeled event is this: "owner" (his own click, byOwner), "agent" (owner login through the
 *  Claude app, byAgent) or null (anything else: another app, another login, no app field). Pure. */
export const configLabelKind = (e, owner = OWNER) => (e?.event !== "labeled" ? null : byOwner(e, owner) ? "owner" : byAgent(e, owner) ? "agent" : null);

/** The owner's own newest `unlabeled` of `label`, when no own `labeled` came after it (walked oldest first, like
 *  hold): it vetoes every agent re-add until his own click (#5455). → the event, or null. Pure. */
export function ownerVeto(events, label, owner = OWNER) {
  const at = (e) => Date.parse(e?.created_at || "") || 0;
  let veto = null;
  for (const e of labelEvents(events, label).map((e, i) => ({ e, i })).sort((x, y) => at(x.e) - at(y.e) || x.i - y.i).map((x) => x.e)) {
    if (!byOwner(e, owner)) continue;
    veto = e.event === "unlabeled" ? e : null;
  }
  return veto;
}

/** config: a diff touching a CONFIG_PATH needs `config-ok`, and its newest label event must be a `labeled` one that
 *  counts. The owner's own click covers any diff. An agent's (configLabelKind "agent") covers a diff of ROUTINE config
 *  paths only: one PROTECTED path in the diff needs the owner's click for the whole row; and an owner's own `unlabeled`
 *  voids every later agent re-add until his own `labeled` (#5455). A diff touching none passes. `files` are the PR's
 *  changed paths (filePaths over pulls/<n>/files). `push` (configPushState) binds the label to the head: "after" (a
 *  CONFIG_PATH push came after the label) fails, "unknown" waits; null skips the binding (pure callers only). Pure. */
export function configVerdict(files, labels, events = null, owner = OWNER, push = null) {
  const touched = configFiles(files);
  if (!touched.length) return row(true, `no config path (harness, CI tools, agent config) in the diff (${(files || []).length} file(s))`);
  const list = (a) => a.slice(0, 4).join(", ") + (a.length > 4 ? ", …" : "");
  const shown = list(touched);
  const prot = touched.filter(isProtectedConfigPath);
  const protNote = prot.length ? `; protected path(s), his own tap only: ${list(prot)}` : "";
  const names = (labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
  const last = newestLabelEvent(events, CONFIG_LABEL);
  if (!names.includes(CONFIG_LABEL)) return row(false, `needs ${CONFIG_LABEL} from ${owner}: the diff edits ${shown}${protNote}`);
  const kind = configLabelKind(last, owner);
  if (!kind) {
    return row(false, `needs ${CONFIG_LABEL} from ${owner}: the label was ${last ? `last ${last.event === "labeled" ? "added" : "removed"} by ${describeActor(last)}` : "found but its label event was not"} — only his own click, or an agent's (${AGENT_APP_SLUG} app) on routine paths, counts (the diff edits ${shown}${protNote})`);
  }
  if (kind === "agent") {
    if (prot.length) return row(false, `needs ${CONFIG_LABEL} from ${owner} himself: an agent's label (${describeActor(last)}) covers routine config paths only, and the diff edits protected path(s) ${list(prot)}`);
    const veto = ownerVeto(events, CONFIG_LABEL, owner);
    if (veto) return row(false, `needs ${CONFIG_LABEL} from ${owner}: he removed it himself at ${veto.created_at || "?"}, so an agent's re-add does not count until his own (the diff edits ${shown})`);
  }
  const by = kind === "owner" ? `${CONFIG_LABEL} by owner (${owner}` : `${CONFIG_LABEL} by agent (${AGENT_APP_SLUG} app), routine paths only (${describeActor(last)}`;
  if (push?.state === "after") return row(false, `needs a fresh ${CONFIG_LABEL}: ${push.evidence} after the label at ${last.created_at || "?"} (${by}; remove and re-add it)`);
  if (push?.state === "unknown") return { ...row(false, `${by}) found, head push not resolved yet: ${push.evidence}`), pending: true };
  return row(true, `${by}) at ${last.created_at || "?"} covers ${shown}${push?.evidence ? ` (${push.evidence})` : ""}`);
}

/** The compare API lists at most this many files; a list that long may be truncated. */
export const COMPARE_FILE_CAP = 300;

/**
 * The PR's own config-path changes at `ref`: the CONFIG_PATH rows of the three-dot `compare/<base>...<ref>` (only the
 * PR's side of the merge base, the diff the PR's Files tab shows). `skipPkg` drops a plain (not renamed) package.json
 * row; `touches` picks the paths (CONFIG_PATH by default). Each row's key holds what the compare shows (names, status, blob sha, patch) plus the file's MODE at `ref`
 * from the recursive tree: the compare never shows a mode, and a `chmod -x` on a hook disables it with the same blob.
 * → { rows: [{ path, key }] } sorted by path, or { error } when the compare or the tree is unreadable or may be
 * truncated, or a changed config row carries no patch to compare. Side effects only through `request`.
 */
export function ownConfigDiff({ base, ref, request, skipPkg = false, touches = configFiles }) {
  const at = `${base}...${String(ref).slice(0, 8)}`;
  const cmp = request(`compare/${encodeURIComponent(base)}...${encodeURIComponent(ref)}`);
  if (cmp.error) return { error: `compare ${at}: ${cmp.error}` };
  const files = cmp.json?.files;
  if (!Array.isArray(files)) return { error: `compare ${at} lists no files` };
  if (files.length >= COMPARE_FILE_CAP) return { error: `compare ${at} lists ${files.length} files (the API stops at ${COMPARE_FILE_CAP})` };
  const own = files.filter((f) => touches(filePaths([f])).length && !(skipPkg && f.filename === GENERATED_PKG && !f.previous_filename));
  let modes = null;
  if (own.some((f) => f.status !== "removed")) {
    const tr = request(`git/trees/${encodeURIComponent(ref)}?recursive=1`);
    if (tr.error) return { error: `tree ${String(ref).slice(0, 8)}: ${tr.error}` };
    if (!Array.isArray(tr.json?.tree) || tr.json.truncated) return { error: `tree ${String(ref).slice(0, 8)} is unreadable or truncated` };
    modes = new Map(tr.json.tree.map((e) => [e.path, String(e.mode || "")]));
  }
  const rows = [];
  for (const f of own) {
    // The patch pins the base side too: the same head blob over a different base (a resolution that reverts what
    // the tip changed in that file) is a different change. A pure rename has no patch and no changes.
    const patch = typeof f.patch === "string" ? f.patch : (Number(f.changes) === 0 ? "" : null);
    if (patch == null) return { error: `compare ${at}: ${f.filename} has no patch to compare` };
    const mode = f.status === "removed" ? "" : modes.get(f.filename);
    if (f.status !== "removed" && !mode) return { error: `tree ${String(ref).slice(0, 8)} has no mode for ${f.filename}` };
    rows.push({ path: f.filename, key: JSON.stringify([f.filename, f.previous_filename || "", f.status || "", f.sha || "", patch, mode]),
      // The same change with the line numbers and the head blob left out (#6045 defect A): a clean sync that moved
      // the tip's lines elsewhere in the PR's own file keeps it; configPushState still proves where each hunk sits.
      loose: JSON.stringify([f.filename, f.previous_filename || "", f.status || "", hunkBodies(patch), mode]),
      basePath: f.previous_filename || f.filename, status: f.status || "", patch });
  }
  const mb = String(cmp.json?.merge_base_commit?.sha || "").toLowerCase();
  return { rows: rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)), mb };
}

/** A unified-diff patch with every hunk header reduced to `@@`: the hunk bodies (context, removed and added lines)
 *  in order, without the line numbers or the section heading a tip edit elsewhere in the file shifts. Pure. */
export function hunkBodies(patch) {
  return String(patch || "").split("\n").map((l) => (l.startsWith("@@") ? "@@" : l)).join("\n");
}

/** Each hunk's old side (its context and removed lines, in order). Pure. */
export function hunkOldSides(patch) {
  const hunks = [];
  for (const l of String(patch || "").split("\n")) {
    if (l.startsWith("@@")) { hunks.push([]); continue; }
    if (!hunks.length || l.startsWith("\\")) continue;
    if (l[0] === " " || l[0] === "-") hunks[hunks.length - 1].push(l.slice(1));
  }
  return hunks;
}

/** Does each hunk's old side occur exactly once in `text` (the file at the merge base)? Then the hunk bodies alone
 *  pin the head's file: the base is the deploy tip, and every hunk has one place to go. An empty old side (a hunk
 *  into an empty file) is placed only in an empty file. Pure. */
export function hunksPlaced(patch, text) {
  const lines = String(text).split("\n");
  for (const old of hunkOldSides(patch)) {
    if (!old.length) { if (String(text).length) return false; continue; }
    let hits = 0;
    for (let i = 0; i + old.length <= lines.length && hits < 2; i++) {
      let k = 0;
      while (k < old.length && lines[i + k] === old[k]) k++;
      if (k === old.length) hits++;
    }
    if (hits !== 1) return false;
  }
  return true;
}

/**
 * When did the head get pushed relative to the owner's `config-ok` at `labelAt`? Reads ci.yml's pull_request runs of
 * this PR (server timestamps; a commit date can say anything). The head is covered when the label is newer than the
 * head's first run. Otherwise the head at label time (`from`) is the head of the newest run created before the label,
 * and the PR's OWN config-path changes (ownConfigDiff, three-dot against `base`) must be the same at `from` and at
 * the head: the same files, blob shas, patches and file modes, or (#6045) the same hunk bodies and modes when each
 * hunk's old side sits exactly once in the file at the head's merge base (a tip that also edited the PR's own config
 * file elsewhere). A merge of the deploy tip that leaves them alone keeps the label
 * (#5432: 24 of 40 re-clicks in 2026-11-09..11 were such syncs); a commit of the PR, or a conflict resolution, that
 * changes any of them voids it. An unreadable or possibly truncated compare is "unknown" (waits; a fresh click
 * covers it). `pkgGeneratedAt(ref)` → true when package.json's change at `ref` is only the generated test lists:
 * package.json is skipped on both sides only when that holds at the head AND at `from`.
 * → { state: "covered"|"after"|"unknown", evidence, from? } (`from`: the head at label time, once known; the
 * ratchet-raise row reads it). `touches` picks the paths compared (the raise row passes ratchetFiles) and `what`
 * names them. Side effects only through `request` and `pkgGeneratedAt`.
 */
export function configPushState({ pr, head, headRef, labelAt, request, base = DEPLOY, pkgGeneratedAt = null, touches = configFiles, what = "config path", credited = "" }) {
  const t = (iso) => Date.parse(iso || "") || 0;
  const L = t(labelAt);
  if (!L) return { state: "unknown", evidence: "no config-ok label time" };
  const runs = listAll(`actions/workflows/${CI_WORKFLOW}/runs?event=pull_request&branch=${encodeURIComponent(headRef || "")}`, request, (j) => j?.workflow_runs, 10);
  if (runs.error) return { state: "unknown", evidence: `${CI_WORKFLOW} runs: ${runs.error}` };
  const mine = runs.rows.filter((w) => (w?.pull_requests || []).some((p) => Number(p?.number) === Number(pr)) && t(w.created_at));
  const onHead = mine.filter((w) => String(w.head_sha || "").toLowerCase() === head);
  // A credited head (D-045) may have no run of its own yet: its push time is unknown, so skip the "labelled after
  // the push" shortcut and compare the own config diff with the newest run before the label (never looser).
  if (!onHead.length && !credited) return { state: "unknown", evidence: `no ${CI_WORKFLOW} pull_request run of PR #${pr} on ${head.slice(0, 8)} yet` };
  const pushedAt = onHead.length ? Math.min(...onHead.map((w) => t(w.created_at))) : Infinity;
  if (L > pushedAt) return { state: "covered", evidence: `labelled after the head ${head.slice(0, 8)} was pushed` };
  const before = mine.filter((w) => t(w.created_at) < L).sort((a, b) => t(b.created_at) - t(a.created_at))[0];
  if (!before) return { state: "after", evidence: `no run of PR #${pr} predates the label, so the head ${head.slice(0, 8)} was pushed` };
  const from = String(before.head_sha || "").toLowerCase();
  const skipPkg = !!(pkgGeneratedAt && pkgGeneratedAt(head) && pkgGeneratedAt(from));
  const was = ownConfigDiff({ base, ref: from, request, skipPkg, touches });
  if (was.error) return { state: "unknown", evidence: was.error };
  const now = ownConfigDiff({ base, ref: head, request, skipPkg, touches });
  if (now.error) return { state: "unknown", evidence: now.error };
  const byPath = (d) => new Map(d.rows.map((r) => [r.path, r]));
  const a = byPath(was), b = byPath(now);
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changed = paths.filter((p) => a.get(p)?.key !== b.get(p)?.key);
  // #6045 defect A: a clean sync of a tip that ALSO edited one of the PR's own config files changes that file's
  // blob and patch line numbers, never its hunk bodies. Kept only when every hunk's old side sits exactly once in
  // the file at the head's merge base (the deploy tip): then the head's file is that tip file plus the same hunks.
  // A hand edit inside the merge, a dropped tip change, a later own commit or a tip edit inside a hunk's context
  // changes the hunk bodies and voids the label as before.
  const moved = [];
  for (const p of changed) {
    const x = a.get(p), y = b.get(p);
    if (!x || !y || x.loose !== y.loose || !now.mb || y.status === "added" || y.status === "removed") continue;
    const r = request(`contents/${y.basePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(now.mb)}`);
    if (r.error || r.json?.encoding !== "base64" || typeof r.json?.content !== "string") continue;
    if (hunksPlaced(y.patch, Buffer.from(r.json.content, "base64").toString("utf8"))) moved.push(p);
  }
  const differ = changed.filter((p) => !moved.includes(p));
  const also = moved.length ? `; ${moved.length} moved by the tip only (${moved.slice(0, 3).join(", ")}${moved.length > 3 ? ", …" : ""}: same hunks, one place each on ${now.mb.slice(0, 8)})` : "";
  return differ.length
    ? { state: "after", from, evidence: `a push changing the PR's own ${what} diff (${differ.slice(0, 3).join(", ")}${differ.length > 3 ? ", …" : ""}; ${from.slice(0, 8)} → ${head.slice(0, 8)}) came` }
    : { state: "covered", from, evidence: `the PR's own ${what} diff is unchanged since ${from.slice(0, 8)} (${b.size} file(s), same ${moved.length ? "hunks" : "blobs, patches"} and modes${also})` };
}

const RATCHET_TABLE = "tests/data/ratchets.json";
const RATCHET_DIR = "tests/data/ratchets.d";

/** Full-depth gate checkouts normally already contain both compared commits.
 * Read only committed regular blobs, without a worktree checkout, attributes or
 * replacement refs. A fork or historical commit may be absent: use Contents at
 * that exact ref in that case. Errors reading a resident tree are gate errors. */
function localRatchetFiles(ref, root) {
  if (!root || !/^[0-9a-f]{40}$/.test(ref)) return null;
  const object = args => git(["--no-replace-objects", ...args], root);
  const type = object(["cat-file", "-t", ref]);
  if (type.status !== 0) return null;
  if (type.stdout.trim() !== "commit") return { error: `ratchet ref ${ref} is not a commit` };
  const listing = object(["ls-tree", "-r", "-t", "-z", ref, "--", RATCHET_TABLE, RATCHET_DIR]);
  if (listing.status !== 0) return { error: `ratchet tree at ${ref}: ${listing.error || listing.stderr}` };
  const files = new Map(), fragments = [];
  for (const entry of listing.stdout.split("\0").filter(Boolean)) {
    const tab = entry.indexOf("\t"), file = entry.slice(tab + 1);
    const [mode, kind, oid] = entry.slice(0, tab).split(" ");
    if (file === RATCHET_DIR && kind !== "tree") return { error: `${file} at ${ref} is not a directory` };
    const fragment = /^tests\/data\/ratchets\.d\/[^/]+\.json$/s.test(file);
    if (file !== RATCHET_TABLE && (!fragment || kind === "tree")) continue;
    if (!/^100(644|755)$/.test(mode) || kind !== "blob" || files.has(file)) return { error: `${file} at ${ref} is not a unique regular blob` };
    files.set(file, oid);
    if (fragment) fragments.push(file);
  }
  const read = file => {
    const oid = files.get(file);
    if (!oid) return { error: `${file} at ${ref} is missing` };
    const blob = object(["cat-file", "blob", oid]);
    if (blob.status !== 0) return { error: `${file} at ${ref}: ${blob.error || blob.stderr}` };
    try { return { json: JSON.parse(blob.stdout) }; } catch (e) { return { error: `${file} at ${ref}: ${e.message}` }; }
  };
  return { read, fragments };
}

/**
 * The effective tree-wide ceilings at `ref`: ratchets.json `tree` plus every ratchets.d delta's `tree` part, with
 * tools/check/ratchets.mjs applyFragments' rule (a delta for a metric the table does not carry moves nothing). Kept
 * here, not imported: the gate must not change when a non-config file does.
 * → { tree: { metric: ceiling } } | { error }.
 */
export function treeCeilingsAt(ref, request, root) {
  const local = localRatchetFiles(ref, root);
  if (local?.error) return local;
  const read = local?.read || ((file) => {
    const r = request(`contents/${file}?ref=${encodeURIComponent(ref)}`);
    if (r.error || r.json?.encoding !== "base64" || typeof r.json?.content !== "string") return { error: `${file} at ${String(ref).slice(0, 8)}: ${r.error || "unreadable"}` };
    try { return { json: JSON.parse(Buffer.from(r.json.content, "base64").toString("utf8")) }; } catch (e) { return { error: `${file} at ${String(ref).slice(0, 8)}: ${e.message}` }; }
  });
  const base = read(RATCHET_TABLE);
  if (base.error) return base;
  const tree = {}, absorb = {};
  for (const [m, v] of Object.entries(base.json?.tree || {})) {
    const c = typeof v === "number" ? v : v?.ceiling;
    if (typeof c === "number" && Number.isFinite(c)) tree[m] = c;
    // B+D (2026-11-20): an entry's `absorb` is growth a PR may add with no label (treeRaises below).
    if (v && typeof v === "object" && Number.isFinite(v.absorb) && v.absorb > 0) absorb[m] = v.absorb;
  }
  let frags = local?.fragments;
  if (!frags) {
    const dir = request(`contents/${RATCHET_DIR}?ref=${encodeURIComponent(ref)}`);
    if (dir.error && !/\b404\b|Not Found/i.test(String(dir.error))) return { error: `${RATCHET_DIR} at ${String(ref).slice(0, 8)}: ${dir.error}` };
    frags = dir.error ? [] : (Array.isArray(dir.json) ? dir.json : []).filter((e) => e?.type === "file" && /\.json$/.test(e.name || "")).map((e) => e.path);
  }
  for (const f of frags.sort()) {
    const r = read(f);
    if (r.error) return r;
    for (const [m, d] of Object.entries(r.json?.tree || {})) {
      if (!Object.hasOwn(tree, m)) continue;
      if (typeof d !== "number" || !Number.isFinite(d)) return { error: `${f}: tree delta ${m} is not a number` };
      tree[m] += d;
    }
  }
  return { tree, absorb };
}

/** The tree metrics whose ceiling is higher at `after` than at `before`, and those `before` carries that `after` does
 *  not: ratchets.mjs measures only the metrics ratchets.json names, so deleting one removes its ceiling, the widest
 *  raise there is (`to: null`, shown as "removed"). A metric only `after` carries is a new ceiling, no raise. Pure. */
export function treeRaises(before, after, absorbBefore = {}, absorbAfter = {}) {
  const b = before || {}, a = after || {}, ab = absorbBefore || {}, aa = absorbAfter || {};
  // B+D (2026-11-20): growth inside the absorb the BASE granted is no raise; a wider absorb is one (`<m> absorb`).
  const inside = (m) => Object.hasOwn(a, m) && ab[m] > 0 && a[m] - b[m] <= ab[m] && (aa[m] || 0) <= ab[m];
  const rows = Object.keys(b).filter((m) => (!Object.hasOwn(a, m) || a[m] > b[m]) && !inside(m))
    .map((m) => ({ metric: m, from: b[m], to: Object.hasOwn(a, m) ? a[m] : null }));
  for (const m of Object.keys(aa)) if (Object.hasOwn(b, m) && aa[m] > (ab[m] || 0)) rows.push({ metric: `${m} absorb`, from: ab[m] || 0, to: aa[m] });
  return rows.sort((x, y) => (x.metric < y.metric ? -1 : x.metric > y.metric ? 1 : 0));
}

/**
 * raise: no tree-wide ceiling rises, or the newest `ratchet-raise` covers the head (`push` from configPushState over
 * the ratchet files). Bryce's own click counts, and so does an agent's (configLabelKind "agent", D-042: Bryce
 * 2026-11-20 "Routine both"), except that his own `unlabeled` vetoes agent re-adds until his own `labeled`. Pure.
 */
export function raiseVerdict(raises, labels, events = null, owner = OWNER, push = null) {
  if (!raises?.length) return row(true, "no tree-wide ratchet ceiling rises or is removed in the diff (per-file ceilings are the commit hook's --auto-raise, not this row's)");
  const shown = raises.slice(0, 4).map((r) => `${r.metric} ${r.from}→${r.to === null ? "removed" : r.to}`).join(", ") + (raises.length > 4 ? ", …" : "");
  const names = (labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
  const last = newestLabelEvent(events, RAISE_LABEL);
  if (!names.includes(RAISE_LABEL)) return row(false, `needs ${RAISE_LABEL} from ${owner}: the diff raises a tree-wide ceiling (${shown}) — lower the count instead, or ask him`);
  const kind = configLabelKind(last, owner);
  if (!kind) {
    return row(false, `needs ${RAISE_LABEL} from ${owner}: the label was ${last ? `last added by ${describeActor(last)}` : "found but its label event was not"} — only his own click, or an agent's (${AGENT_APP_SLUG} app), counts (raises ${shown})`);
  }
  if (kind === "agent") {
    const veto = ownerVeto(events, RAISE_LABEL, owner);
    if (veto) return row(false, `needs ${RAISE_LABEL} from ${owner}: he removed it himself at ${veto.created_at || "?"}, so an agent's re-add does not count until his own (raises ${shown})`);
    const by = `agent (${describeActor(last)})`;
    if (push?.state === "after") return row(false, `needs a fresh ${RAISE_LABEL}: ${push.evidence} after the label by ${by} at ${last.created_at || "?"} (remove and re-add it)`);
    if (push?.state === "unknown") return { ...row(false, `${RAISE_LABEL} by ${by} found, head push not resolved yet: ${push.evidence}`), pending: true };
    return row(true, `${RAISE_LABEL} added by ${by} at ${last.created_at || "?"} covers ${shown}${push?.evidence ? ` (${push.evidence})` : ""}`);
  }
  if (push?.state === "after") return row(false, `needs a fresh ${RAISE_LABEL} from ${owner}: ${push.evidence} after his label at ${last.created_at || "?"} (remove and re-add it)`);
  if (push?.state === "unknown") return { ...row(false, `${RAISE_LABEL} from ${owner} found, head push not resolved yet: ${push.evidence}`), pending: true };
  return row(true, `${RAISE_LABEL} added by ${owner} at ${last.created_at || "?"} covers ${shown}${push?.evidence ? ` (${push.evidence})` : ""}`);
}

/** The PR's own tree raises at `sha`: its ceilings vs those at its merge base with `base` (so a sync, which moves the
 *  merge base, brings other PRs' fragments into both sides and they cancel). → { raises } | { error }. */
export function prRaisesAt(sha, base, request, root) {
  const cmp = request(`compare/${encodeURIComponent(base)}...${encodeURIComponent(sha)}`);
  const mb = cmp.json?.merge_base_commit?.sha;
  if (cmp.error || !mb) return { error: `merge base of ${String(sha).slice(0, 8)}: ${cmp.error || "unreadable"}` };
  const before = treeCeilingsAt(mb, request, root);
  if (before.error) return before;
  const after = treeCeilingsAt(sha, request, root);
  if (after.error) return after;
  return { raises: treeRaises(before.tree, after.tree, before.absorb, after.absorb) };
}

/** Does `now` raise nothing beyond `then` (the raises Bryce saw when he clicked)? Every metric raised now was raised
 *  then by at least as much; a removal is covered only by a removal. Pure. */
export function raisesCovered(now, then) {
  const amt = (r) => (r.to === null ? Infinity : r.to - r.from);
  const was = new Map((then || []).map((r) => [r.metric, amt(r)]));
  return (now || []).every((r) => was.has(r.metric) && amt(r) <= was.get(r.metric));
}

/** The raise row for PR `pr` (GitHub reads only: compare for the merge base, the ceilings at it and at the head).
 *  Bound to what Bryce labelled: a push after his click that touches a ratchet file still counts as covered when the
 *  PR's own raise at the head is no wider than its own raise at the head he labelled, so a sync that brings in other
 *  PRs' ratchets.d fragments does not need a fresh click, and any further raise does. */
export function raiseRow({ pr, head, headRef, base, changed, labels, events, owner = OWNER, request, credited = "", root }) {
  if (!ratchetFiles(changed).length) return row(true, "no ratchet ceiling file in the diff");
  const now = prRaisesAt(head, base, request, root);
  if (now.error) return { error: now.error };
  const raises = now.raises;
  const last = newestLabelEvent(events, RAISE_LABEL);
  let push = raises.length && configLabelKind(last, owner)
    ? configPushState({ pr, head, headRef, labelAt: last.created_at, request, base, touches: ratchetFiles, what: "ratchet file", credited }) : null;
  if (push?.state === "after" && push.from) {
    const then = prRaisesAt(push.from, base, request, root);
    if (then.error) return { error: then.error };
    if (raisesCovered(raises, then.raises)) push = { state: "covered", evidence: `the pushes since ${push.from.slice(0, 8)} touch a ratchet file but raise nothing beyond what he labelled there` };
  }
  return raiseVerdict(raises, labels, events, owner, push);
}

/** plan: the Plan checklist is closed (ready-gate.mjs planVerdict, `land:` items exempt). No Plan fails (skill steward
 *  §Open: every agent PR carries one), except on a fold bot's PR (`author` a `*[bot]` login). Pure. */
export function planRow(body, author = "") {
  const p = planVerdict(body);
  if (p.state === "none" && !/\[bot\]$/.test(String(author || ""))) return row(false, "no ## Plan checklist in the body (skill steward §Open) — add the template's Plan and close it");
  if (p.state === "open") {
    const shown = p.open.slice(0, 3).map((t) => `"${t}"`).join(", ");
    return row(false, `${p.open.length} of ${p.items} Plan item(s) open: ${shown}${p.open.length > 3 ? ", ..." : ""} — tick each with its evidence or strike it with why${nowHint(p.open)}`);
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
  return best.conclusion === "success" ? { ...row(true, `${name} success (check-run ${best.id})`), suite: best.check_suite?.id ?? null } : row(false, `${name} ${best.conclusion}`);
}

/** The one config path a generator owns in part: package.json's `test:*` scripts (tools/gen/gen-test-groups.mjs). */
export const GENERATED_PKG = "package.json";
const GROUP_KINDS = new Set(["node", "browser"]);

/**
 * Is the package.json diff ONLY the generated `test:*` file lists? Inputs are the texts at the merge base and the
 * head. Holds when (1) the deploy branch's own generator (renderPkg) run on the head's tests/groups.json and the BASE
 * package.json reproduces the head package.json byte for byte, so nothing outside the `test:*` scripts changed, and
 * (2) every changed script belongs to a `node`/`browser` group whose kind and flags equal the base's, so only file
 * lists moved (a `command` group, a new group, or a flag change stays a config edit). Any parse or generator error
 * refuses. → { ok, evidence }. Pure.
 */
export function generatedPkgVerdict({ basePkg, headPkg, baseGroups, headGroups, render = renderPkg }) {
  let bp, hp, bg, hg, expected;
  try { bp = JSON.parse(basePkg); hp = JSON.parse(headPkg); bg = JSON.parse(baseGroups); hg = JSON.parse(headGroups); }
  catch (e) { return row(false, `package.json / tests/groups.json unreadable: ${e.message}`); }
  try { expected = render(hg, basePkg); } catch (e) { return row(false, `the test-groups generator refused the head's tests/groups.json: ${e.message}`); }
  if (expected !== headPkg) return row(false, "package.json carries edits the test-groups generator does not reproduce");
  const names = [...new Set([...Object.keys(bp.scripts || {}), ...Object.keys(hp.scripts || {})])].filter((k) => bp.scripts?.[k] !== hp.scripts?.[k]);
  for (const k of names) {
    const b = bg.groups?.[k], h = hg.groups?.[k];
    if (!b) return row(false, `script ${k} has no group at the base (a new group is a config edit)`);
    if (!GROUP_KINDS.has(b.kind) || (h && (h.kind !== b.kind || JSON.stringify(h.flags || []) !== JSON.stringify(b.flags || []))))
      return row(false, `script ${k}: its group's kind or flags changed (only file lists are generated data)`);
  }
  return row(true, `package.json changes only generated test file lists (${names.join(", ") || "none"})`);
}

/** Read one file at `ref` through the contents API → its text, or null. */
function fileAt(request, file, ref) {
  const r = request(`contents/${file}?ref=${encodeURIComponent(ref)}`);
  if (r.error || r.json?.encoding !== "base64" || typeof r.json?.content !== "string") return null;
  return Buffer.from(r.json.content, "base64").toString("utf8");
}

/** The generated-lists check for PR head `head` (merge base from compare). → { ok, evidence }. */
export function generatedPkgCheck({ head, base, request }) {
  const cmp = request(`compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  const mb = cmp.json?.merge_base_commit?.sha;
  if (cmp.error || !mb) return row(false, `merge base of ${head.slice(0, 8)} unreadable${cmp.error ? `: ${cmp.error}` : ""}`);
  const texts = [["basePkg", "package.json", mb], ["headPkg", "package.json", head], ["baseGroups", "tests/groups.json", mb], ["headGroups", "tests/groups.json", head]]
    .map(([k, f, ref]) => [k, fileAt(request, f, ref)]);
  const missing = texts.filter(([, v]) => v == null).map(([k]) => k);
  if (missing.length) return row(false, `could not read ${missing.join(", ")}`);
  return generatedPkgVerdict(Object.fromEntries(texts));
}

/** Job conclusions that make an earlier attempt red (a cancelled or skipped job is not a failure). */
const RED_JOB = new Set(["failure", "timed_out", "startup_failure"]);

/**
 * ci, retry half: the ci.yml run that owns the green `CI` check-run passed only on a re-run (`run_attempt` > 1) and an
 * earlier attempt had a red job → the row fails (AGENTS.md rule 9: a pass that needed a retry is a red). `run` is the
 * workflow run ({ id, run_attempt }); reads actions/runs/<id>/attempts/<n>/jobs for each earlier attempt.
 * → { ok, evidence } | { error }. Side effects only through `request`.
 */
export function ciRetryVerdict(run, request) {
  const attempt = Number(run?.run_attempt) || 1;
  if (attempt <= 1) return row(true, "first attempt");
  const red = [];
  for (let n = 1; n < attempt; n++) {
    const jobs = listAll(`actions/runs/${run.id}/attempts/${n}/jobs`, request, (j) => j?.jobs, 5);
    if (jobs.error) return { error: `jobs of ${CI_WORKFLOW} run ${run.id} attempt ${n}: ${jobs.error}` };
    for (const j of jobs.rows) if (RED_JOB.has(j?.conclusion)) red.push(`${j.name} (attempt ${n}: ${j.conclusion})`);
  }
  if (!red.length) return row(true, `attempt ${attempt}; earlier attempts had no failed job`);
  return row(false, `${REQUIRED_CHECK} passed only on re-run ${attempt} of ${CI_WORKFLOW} run ${run.id}: ${red.slice(0, 3).join(", ")}${red.length > 3 ? ", …" : ""} failed before — a pass that needed a retry is a red: push a fresh commit, or quarantine the test by name in tests/data/flaky-quarantine.json`);
}

// ---- ci credit across a clean tip-sync (D-045) ---------------------------------------------------------------

/** How many clean tip-sync merges the credit walks back through (H2 → H1 → H0). */
export const CREDIT_CHAIN_MAX = 5;

/**
 * Is `sha` a CLEAN tip-sync of its first parent? → { ok: true, parent, tip } | { ok: false, why }. All four hold:
 * exactly two parents; the second is a first-parent commit of the deploy branch (`firstParents`, a Set) and not
 * already in the first; and `git merge-tree --write-tree <parent> <tip>` merges without a conflict to the SAME tree
 * as `sha`, so the commit carries no conflict resolution and no hand edit. Git objects only, in `cwd`.
 */
export function cleanTipSync({ cwd, sha, firstParents, gitRun = git }) {
  const short = String(sha).slice(0, 8);
  const p = gitRun(["rev-list", "--parents", "-n", "1", sha], cwd);
  if (p.status !== 0) return { ok: false, kind: "unknown", why: `${short} is not in this clone` };
  const [, parent, tip, ...more] = String(p.stdout || "").trim().split(/\s+/);
  if (!parent || !tip || more.length) return { ok: false, kind: "not-merge", why: `${short} is not a two-parent merge` };
  if (!firstParents.has(tip)) return { ok: false, kind: "off-deploy", why: `${short}'s second parent ${tip.slice(0, 8)} is not a first-parent commit of the deploy branch` };
  if (gitRun(["merge-base", "--is-ancestor", tip, parent], cwd).status === 0) return { ok: false, kind: "noop", why: `${short} merges nothing new (${tip.slice(0, 8)} is already in ${parent.slice(0, 8)})` };
  const m = gitRun(["merge-tree", "--write-tree", "--no-messages", parent, tip], cwd);
  if (m.status !== 0) return { ok: false, kind: "conflict", why: `${short}: merging ${tip.slice(0, 8)} into ${parent.slice(0, 8)} conflicts (a resolved merge needs its own CI)` };
  const want = String(m.stdout || "").trim().split("\n")[0];
  const have = gitRun(["rev-parse", `${sha}^{tree}`], cwd);
  if (have.status !== 0 || String(have.stdout || "").trim() !== want) return { ok: false, kind: "edited", why: `${short}'s tree differs from the clean merge of ${parent.slice(0, 8)} and ${tip.slice(0, 8)}: a hand edit needs its own CI` };
  return { ok: true, parent, tip };
}

/**
 * The ci row's credit (D-045, Bryce 2026-11-21 ~03:47Z "Credit CI across sync"): when the head's own ci.yml `CI` is
 * missing or still running, walk back first parents through CLEAN tip-sync merges only (cleanTipSync), at most
 * CREDIT_CHAIN_MAX hops, and credit the first prior head whose CI is green under the SAME rules the row applies to a
 * head (ciVerdict on ci.yml's suites, ciRetryVerdict: attempt 1 or no earlier red job). A red CI on a hop, a hop that
 * is not a clean sync, or the cap ends the walk with no credit. The retest row must then run against the credited
 * head (evaluate passes `credited`). `ciOf(sha)` → { verdict, run } | { error }. → { credit } | { none } | { error }.
 */
export function creditPriorCi({ cwd, head, base, ciOf, gitRun = git, max = CREDIT_CHAIN_MAX }) {
  const fp = gitRun(["rev-list", "--first-parent", `refs/remotes/origin/${base}`], cwd);
  if (fp.status !== 0) return { error: `git rev-list --first-parent ${base}: ${(fp.stderr || "").trim().split("\n")[0]}` };
  const firstParents = new Set(String(fp.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean));
  const hops = [];
  let cur = head;
  for (let i = 1; i <= max; i++) {
    const s = cleanTipSync({ cwd, sha: cur, firstParents, gitRun });
    if (!s.ok) return { none: s.why, kind: s.kind };
    hops.push(s);
    cur = s.parent;
    const c = ciOf(cur);
    if (c.error) return { error: c.error };
    if (c.verdict.ok) return { credit: { sha: cur, run: c.run, hops, evidence: c.verdict.evidence } };
    if (!c.verdict.pending) return { kind: "red", none: `prior head ${cur.slice(0, 8)}'s CI is not green (${c.verdict.evidence})` };
  }
  return { kind: "cap", none: `no green CI within ${max} clean tip-syncs of the head` };
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

// ---- retest: the merge's newer half -------------------------------------------------------------------------

/** How far before the CI run's creation a tip merge still counts as "maybe not in its merge ref": GitHub builds
 *  refs/pull/<n>/merge when the event fires, a little before the run is created, so a merge just before it may be
 *  missing. A wider window only re-tests more (stricter), never less. */
export const RETEST_MARGIN_MIN = 15;
/** Cap on one re-test (the land-gate job is 20 min with gen:check and the ratchets): a timeout refuses. */
export const RETEST_TIMEOUT_MS = 420_000;
const UNIT_TEST = /^tests\/unit\/.+\.test\.mjs$/;
/** Workers for the re-test (a land-gate runner has 4 vCPU, gen:check and the ratchets already ran; the committed
 *  timings the estimate reads were recorded at 4 workers). 2 until #5597: the 56 files both sides of #5568 × #5566
 *  selected measured 339 s at 2 and 226 s at 3, against the 336 s refusal line. */
export const RETEST_JOBS = 3;
/** tooling-fast's per-file bound for the re-test, inside RETEST_TIMEOUT_MS: it only stops a hung file's grandchildren
 *  (ci.yml's own bound is tooling-fast's 600 s default). 180 until #5597: the files every js/ change selects run
 *  longer than that on a runner (apex-tools-mcp.test.mjs 226.8 s, select-specs.test.mjs 188.2 s in ci.yml run
 *  43939091964), so the bound would have failed a green file as a crossing. */
export const RETEST_FILE_TIMEOUT_S = 300;

/**
 * The first-parent commits on `tip` that are not in `head` and are newer than `ciAt` − RETEST_MARGIN_MIN, and the
 * paths each changed against its first parent, plus the PR's own paths (merge-base..head). Git only, in `cwd` (the
 * throw-away worktree). → { commits, newer, pr } | { error }.
 */
export function newerTipPaths({ cwd, tip, head, ciAt, ciBase = "", gitRun = git }) {
  const at = Date.parse(String(ciAt || ""));
  if (!Number.isFinite(at)) return { error: `the CI run's creation time is unreadable (${JSON.stringify(ciAt ?? null)})` };
  const since = new Date(at - RETEST_MARGIN_MIN * 60_000).toISOString();
  const lines = (r) => String(r.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const list = gitRun(["rev-list", "--first-parent", `--since=${since}`, tip, `^${head}`], cwd);
  if (list.status !== 0) return { error: `git rev-list on ${String(tip).slice(0, 8)}: ${(list.stderr || "").trim().split("\n")[0]}` };
  // A date is not a commit (reuse-draft-fast.sh, 2026-11-10): when the run recorded the base its merge ref sat on
  // (the `apex-guards` annotation), every first-parent tip commit after THAT base is re-tested too. Union only: the
  // record can widen the window, never narrow it; an unreadable or unknown base leaves the time window alone.
  const recorded = /^[0-9a-f]{40}$/.test(String(ciBase || "")) && gitRun(["cat-file", "-e", `${ciBase}^{commit}`], cwd).status === 0;
  let byBase = [];
  if (recorded) {
    const r = gitRun(["rev-list", "--first-parent", tip, `^${head}`, `^${ciBase}`], cwd);
    if (r.status !== 0) return { error: `git rev-list ${String(tip).slice(0, 8)} since base ${ciBase.slice(0, 8)}: ${(r.stderr || "").trim().split("\n")[0]}` };
    byBase = lines(r);
  }
  const commits = [...new Set([...lines(list), ...byBase])], newer = new Set();
  for (const c of commits) {
    const d = gitRun(["diff", "--name-only", `${c}^1`, c], cwd);
    if (d.status !== 0) return { error: `git diff of tip commit ${c.slice(0, 8)}: ${(d.stderr || "").trim().split("\n")[0]}` };
    for (const f of lines(d)) newer.add(f);
  }
  let pr = [];
  if (commits.length) {
    const mb = gitRun(["merge-base", tip, head], cwd);
    const d = mb.status === 0 ? gitRun(["diff", "--name-only", mb.stdout.trim(), head], cwd) : mb;
    if (d.status !== 0) return { error: `the PR's own paths (merge-base..head): ${(d.stderr || "").trim().split("\n")[0]}` };
    pr = lines(d);
  }
  return { commits, newer: [...newer].sort(), pr, base: recorded ? ciBase : "" };
}

/** The base SHA the green CI run's merge ref sat on, from its tooling A `apex-guards` annotation
 *  (`mode=<m> base=<sha>`, tools/ci/reuse-draft-fast.sh THE RECORD) → sha, or "" when unreadable. GitHub reads only. */
export function ciRecordedBase(run, request) {
  if (!run?.id) return "";
  const jobs = listAll(`actions/runs/${run.id}/jobs`, request, (j) => j?.jobs, 5);
  if (jobs.error) return "";
  const a = jobs.rows.find((j) => String(j?.name || "").replace(/^ci \/ /, "") === "Structural guards (tooling A)");
  if (!a?.id) return "";
  const ann = request(`check-runs/${a.id}/annotations?per_page=100`);
  const rec = (Array.isArray(ann.json) ? ann.json : []).find((x) => x?.title === "apex-guards");
  return /\bbase=([0-9a-f]{40})\b/.exec(String(rec?.message || ""))?.[1] || "";
}

/** The gate checkout's own tooling-fast `--changed` selection for `paths` (never the PR's copy: a PR must not choose
 *  what re-tests it). A child process, because tooling-fast needs node_modules, which only the land-gate leg has. */
export function gateSelection(paths, { root = ROOT, run = spawnSync } = {}) {
  const src = `import(${JSON.stringify(path.join(root, "tools/ci/tooling-fast.mjs"))}).then((m) => { const s = m.selectToolingFastChanged(JSON.parse(process.argv[1])); process.stdout.write(JSON.stringify({ files: s.files, reason: s.reason, widened: s.widened || "" })); })`;
  const r = run(process.execPath, ["--input-type=module", "-e", src, JSON.stringify(paths)], { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 16 << 20 });
  if (r.error || r.status !== 0) return { error: `tooling-fast selection failed: ${r.error?.message || String(r.stderr || "").trim().split("\n").slice(-1)[0] || "exit " + r.status}` };
  try { return JSON.parse(r.stdout); } catch (e) { return { error: `tooling-fast selection unreadable: ${e.message}` }; }
}

/** The gate checkout's measured wall time for `files` at RETEST_JOBS workers (tooling-fast's committed timings) → ms,
 *  or null when it cannot be read (the re-test then runs against its timeout, which refuses the same way). */
export function gateEstimate(files, { root = ROOT, run = spawnSync } = {}) {
  const src = `import(${JSON.stringify(path.join(root, "tools/ci/tooling-fast.mjs"))}).then((m) => { process.stdout.write(JSON.stringify(m.estimateToolingFast(JSON.parse(process.argv[1]), m.loadTimings(), ${RETEST_JOBS}).criticalPathMs)); })`;
  const r = run(process.execPath, ["--input-type=module", "-e", src, JSON.stringify(files)], { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 16 << 20 });
  if (r.error || r.status !== 0) return null;
  try { const ms = JSON.parse(r.stdout); return Number.isFinite(ms) ? ms : null; } catch { return null; }
}

/**
 * Which unit files the re-test runs (#5597). `selection` is the gate's selection for (newer tip paths ∪ the PR's
 * paths): when it widens to the whole floor (an infra path), the touched tests/unit files of either side, and the
 * evidence says so. Otherwise the files BOTH `sides` select — `sides.newer` for the tip paths alone, `sides.pr` for the
 * PR's alone; a side that widens on its own reaches everything, so the other side's files stand, and two widened sides
 * leave `selection`'s — plus the touched tests/unit files, kept to files that exist in the merge result. A missing side
 * is read as the union selection (never fewer files than it). Pure. → { files, how }.
 */
export function retestPlan({ newer = [], pr = [], selection, sides = {}, exists = () => true }) {
  const touched = [...new Set([...newer, ...pr])].sort();
  const literal = touched.filter((f) => UNIT_TEST.test(f) && exists(f));
  if (!selection || selection.widened) {
    return { files: literal, how: `the touched tests/unit files${selection?.widened ? ` (the selection widened: ${selection.widened})` : ""}` };
  }
  const all = (side) => !side || !!side.widened;
  const n = sides.newer, p = sides.pr;
  const pSet = new Set(p?.files || []);
  const shared = all(n) && all(p) ? (selection.files || []) : all(n) ? p.files || [] : all(p) ? n.files || [] : (n.files || []).filter((f) => pSet.has(f));
  const files = [...new Set([...shared, ...literal])].filter((f) => exists(f)).sort();
  const count = (side) => (all(side) ? "every file" : `${(side.files || []).length}`);
  return { files, how: `the unit files both sides select (tooling-fast's --changed selection: newer tip ${count(n)}, the PR ${count(p)}) and the touched tests/unit files` };
}

/**
 * retest row, on the merge result in `cwd`: no tip merge since the CI run (less the margin) → ok without running
 * anything; otherwise run the planned unit files (retestPlan) with the merge result's tooling-fast, stripped environment, once.
 * Every failure to read, select or run refuses (never a silent pass). → { ok, evidence }.
 */
export function retestOnMerge({ cwd, tip, head, ciAt, ciBase = "", credited = "", run = spawnSync, gitRun = git, select = gateSelection, estimate = gateEstimate } = {}) {
  // A credited CI (D-045) tested the prior head, not this one: compare the tip against THAT head, and never skip. When
  // the run's window and base leave nothing, every tip commit not in the credited head is re-tested (stricter only).
  const tested = credited || head;
  let t = newerTipPaths({ cwd, tip, head: tested, ciAt, ciBase, gitRun });
  if (t.error) return row(false, `re-test not runnable: ${t.error}`);
  if (credited && !t.commits.length) {
    t = newerTipPaths({ cwd, tip, head: tested, ciAt: "2000-01-01T00:00:00Z", gitRun });
    if (t.error) return row(false, `re-test not runnable: ${t.error}`);
    if (!t.commits.length) return { ...row(false, `re-test not runnable: the credited head ${String(credited).slice(0, 8)} already holds the tip ${String(tip).slice(0, 8)}, so the credit has nothing to stand for`), kind: "nothing" };
  }
  if (!t.commits.length) return row(true, `no tip merge since the CI run's base (created ${ciAt}, margin ${RETEST_MARGIN_MIN} min${t.base ? `; recorded base ${t.base.slice(0, 8)}` : "; no recorded base"}): CI tested this combination`);
  const sel = select([...new Set([...t.newer, ...t.pr])].sort());
  if (sel?.error) return row(false, `re-test not runnable: ${sel.error}`);
  // Once per side (#5597): only a test both sides select can cross. A widened union keeps the touched-files plan.
  const sides = sel?.widened ? {} : { newer: select(t.newer), pr: select(t.pr) };
  const sideError = sides.newer?.error || sides.pr?.error;
  if (sideError) return row(false, `re-test not runnable: ${sideError}`);
  const plan = retestPlan({ newer: t.newer, pr: t.pr, selection: sel, sides, exists: (f) => fs.existsSync(path.join(cwd, f)) });
  const since = `${t.commits.length} tip merge(s) since the CI run${credited ? ` of the credited head ${String(credited).slice(0, 8)}` : ""} (${t.commits.slice(0, 3).map((c) => c.slice(0, 8)).join(", ")}${t.commits.length > 3 ? ", …" : ""})`;
  if (!plan.files.length) return row(true, `${since}: ${plan.how} names no unit test — nothing to re-test`);
  // Too broad to finish inside the cap (tooling-fast's measured timings): refuse now instead of burning the runner
  // into the same refusal. The cure is the one a timeout gets: sync, push, and the fresh CI run tests the combination.
  const estMs = sel?.widened ? null : estimate(plan.files);
  if (Number.isFinite(estMs) && estMs > RETEST_TIMEOUT_MS * 0.8) {
    return row(false, `${since}; the re-test would run ${plan.files.length} unit file(s) (${plan.how}), measured ~${Math.round(estMs / 1000)} s at --jobs=${RETEST_JOBS}, over the ${RETEST_TIMEOUT_MS / 1000} s cap — too broad to re-test at merge: sync-pr.mjs and push, so a fresh CI run tests this combination`);
  }
  const env = untrustedEnv();
  delete env.NODE_TEST_CONTEXT;
  // Output to a file, not a pipe: spawnSync's timeout kills only the direct child, and a test grandchild still
  // holding the pipe would keep the gate waiting until the job cap. A per-file bound inside the cap as well.
  const log = path.join(cwd, "artifacts", "merge-gate-retest.log");
  let fd = null;
  try { fs.mkdirSync(path.dirname(log), { recursive: true }); fd = fs.openSync(log, "w"); } catch (e) { return row(false, `re-test not runnable: its log ${log}: ${e.message}`); }
  let r;
  try {
    r = run(process.execPath, ["tools/ci/tooling-fast.mjs", `--jobs=${RETEST_JOBS}`, "--quiet", `--file-timeout=${RETEST_FILE_TIMEOUT_S}`, ...plan.files], { cwd, env, stdio: ["ignore", fd, fd], timeout: RETEST_TIMEOUT_MS });
  } finally { try { fs.closeSync(fd); } catch { /* closed */ } }
  if (r && r.stdout == null) { let text = ""; try { text = fs.readFileSync(log, "utf8"); } catch { /* no log */ } r = { ...r, stdout: text, stderr: "" }; }
  const shown = plan.files.slice(0, 4).join(", ") + (plan.files.length > 4 ? ` (+${plan.files.length - 4})` : "");
  if (r.error || r.status !== 0) {
    const fails = `${r.stdout || ""}\n${r.stderr || ""}`.split("\n").map((l) => l.trim()).filter((l) => /\bFAIL\b/.test(l)).slice(0, 3).join(" | ");
    const why = r.error ? (r.error.code === "ETIMEDOUT" ? `timed out after ${RETEST_TIMEOUT_MS / 1000} s` : r.error.message) : fails || `exit ${r.status}`;
    return row(false, `${since}; the re-test of ${plan.files.length} unit file(s) on the merge onto ${String(tip).slice(0, 8)} failed: ${why} — the PR and the newer tip cross; sync-pr.mjs, fix, and push (a fresh CI run)`);
  }
  return row(true, `${since}; ${plan.files.length} unit file(s) re-tested on the merge result (${plan.how}): ${shown} passed`);
}

/**
 * Fetch the base and the head branch, merge `head` onto the base tip in a throw-away worktree, run gen:check
 * and build the scenery catalog there, then the ratchets. Returns { ok, evidence, tip, ratchets?, error? }: `error` marks a git failure the gate
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

/** Built on demand, never tracked (ON_DEMAND_PATHS): the gate builds it on the merge. */
const SCENERY_CATALOG = "tools/shot/scenery-locations.json";
export function localMergeGenCheck({ pr, head, headRef, cwd = ROOT, base = DEPLOY, run = spawnSync, ratchets = ratchetsOnMerge, ciAt = null, ciBase = "", credited = "", retest = retestOnMerge } = {}) {
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
  // The scenery catalog is BUILT ON DEMAND, not committed (ON_DEMAND_PATHS, issue #5427): two circuit PRs no longer
  // conflict in it. gen:check omits it (it builds every circuit, ~47 s), so the gate builds it on THIS merge: a
  // generator that throws (a viewpoint that no longer emits, a duplicate id) refuses, as a stale committed copy
  // used to (#4160). A merge that still TRACKS the file (an old branch re-added it) refuses too: it must stay out.
  // PR code runs in a child with the same stripped environment as gen:check.
  const tracked = git(["ls-files", "--", SCENERY_CATALOG], wt).stdout.trim();
  if (tracked) return fail(`scenery catalog fails on the merge onto ${tip.slice(0, 8)}: ${SCENERY_CATALOG} is tracked; it is built on demand — git rm --cached it on the synced branch and push`);
  const catalog = run(process.execPath, ["tools/gen/ensure-built.mjs", "--quiet", "--with", SCENERY_CATALOG], { cwd: wt, env: untrustedEnv(), encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
  if (catalog.error || catalog.status !== 0) {
    const detail = catalog.error?.message || `${catalog.stdout || ""}\n${catalog.stderr || ""}`.split("\n")
      .map((line) => line.trim()).find((line) => /Error:|FAILED/.test(line)) || `exit ${catalog.status}`;
    return fail(`scenery catalog fails on the merge onto ${tip.slice(0, 8)}: ${detail} — node tools/gen/ensure-built.mjs --with ${SCENERY_CATALOG} on the synced branch names the circuit`);
  }
  const rat = ratchets({ cwd: wt, run });
  // `ciAt` null: the ci row has no green run to compare against, so the re-test waits for it (evaluate says so).
  const re = ciAt === null ? null : retest({ cwd: wt, tip, head, ciAt, ciBase, run, ...(credited ? { credited } : {}) });
  cleanup();
  return { ok: true, evidence: `merges clean onto ${tip.slice(0, 8)}; gen:check and scenery catalog build 0`, tip, ratchets: rat, retest: re };
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
 * Which ci.yml run is the PR's own CI: a `pull_request` run, or, for the fold bots' `bot/*` PRs (no LAND_TOKEN, so
 * they dispatch ci.yml on their branch), a `workflow_dispatch` run on that same head ref. Any other event is refused:
 * ci.yml names a dispatched run's verdict job `CI` too, and REQUIRE_SUCCESS is empty there. Pure.
 */
export function prCiRun(w, headRef = "") {
  if (w?.event === "pull_request") return true;
  return w?.event === "workflow_dispatch" && String(headRef).startsWith("bot/") && w.head_branch === headRef;
}

/**
 * The check-suite ids of the ci.yml workflow runs on `sha` (the workflow-file endpoint, path re-checked) that are the
 * PR's own CI (prCiRun), so the ci row reads only ci.yml's own `CI` check-run. Returns { suites: Set } or { error }.
 */
export function ciSuitesFor(sha, request, headRef = "") {
  const suites = new Set(), runs = new Map();
  const want = `.github/workflows/${CI_WORKFLOW}`;
  for (let page = 1; page <= 5; page++) {
    const r = request(`actions/workflows/${CI_WORKFLOW}/runs?head_sha=${encodeURIComponent(sha)}&per_page=100${page > 1 ? `&page=${page}` : ""}`);
    if (r.error) return { error: r.error };
    const batch = r.json?.workflow_runs || [];
    for (const w of batch) if (String(w?.path || "").replace(/@.*$/, "") === want && w.check_suite_id != null && prCiRun(w, headRef)) { suites.add(w.check_suite_id); runs.set(w.check_suite_id, w); }
    if (batch.length < 100) break;
  }
  return { suites, runs };
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
/** The train PR's car rows (merge-train.mjs trainRow): fetch the head (its ancestors are the cars and the base), prove
 *  the fold with git (objects only, no checkout, no PR code), then each car's own trusted rows through evaluate. */
export function trainGate({ pr, pull, head, base, request, root = ROOT, owner = OWNER }) {
  const fetched = fetchForGate({ pr, head, headRef: pull.head?.ref || "", cwd: root, base });
  if (fetched.error) return { error: `train #${pr}: ${fetched.error}` };
  return trainRow({
    manifest: trainManifest(pull.body), head, headRef: pull.head?.ref || "", tip: fetched.tip,
    verify: (a) => verifyTrain({ ...a, cwd: root }),
    carPull: (n) => request(`pulls/${n}`),
    carGate: (n, h) => evaluate({ pr: n, sha: h, request, root, trusted: true, owner }),
  });
}

/** The ci row's credit with real GitHub and git (D-045): fetch the base and the head's objects, then creditPriorCi
 *  reading each prior head's ci.yml CI through the same ciVerdict and ciRetryVerdict as the head's own. */
export function ciCredit({ pr, pull, head, base, request, root = ROOT }) {
  const fetched = fetchForGate({ pr, head, headRef: pull.head?.ref || "", cwd: root, base });
  if (fetched.error) return { error: `ci credit: ${fetched.error}` };
  const ciOf = (sha) => {
    const checks = checkRunsFor(sha, request);
    if (checks.error) return { error: `check-runs on ${sha.slice(0, 8)}: ${checks.error}` };
    const ci = ciSuitesFor(sha, request, pull.head?.ref || "");
    if (ci.error) return { error: `${CI_WORKFLOW} runs on ${sha.slice(0, 8)}: ${ci.error}` };
    const verdict = ciVerdict(checks.list, REQUIRED_CHECK, CI_APP, ci.suites);
    if (!verdict.ok) return { verdict };
    const run = ci.runs?.get(verdict.suite);
    const retry = ciRetryVerdict(run, request);
    if (retry.error) return { error: retry.error };
    return retry.ok && (Number(run?.run_attempt) || 1) <= 1 ? { verdict, run } : { verdict: row(false, retry.ok ? `${REQUIRED_CHECK} green only on attempt ${run.run_attempt}` : retry.evidence) };
  };
  return creditPriorCi({ cwd: root, head, base, ciOf });
}

export function evaluate({ pr, sha = "", request = api, root = ROOT, localMerge = localMergeGenCheck, trusted = false, owner = OWNER, trainCheck = trainGate, tipCheck = runTipGate, credit = ciCredit } = {}) {
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
  const ci = ciSuitesFor(head, request, pull.head?.ref || "");
  if (ci.error) return { error: `${CI_WORKFLOW} runs on ${head.slice(0, 8)}: ${ci.error}` };
  rows.ci = ciVerdict(checks.list, REQUIRED_CHECK, CI_APP, ci.suites);
  let ciRun = rows.ci.ok ? ci.runs?.get(rows.ci.suite) : undefined;
  if (rows.ci.ok) {
    const retry = ciRetryVerdict(ci.runs?.get(rows.ci.suite), request);
    if (retry.error) return { error: retry.error };
    rows.ci = retry.ok ? row(true, rows.ci.evidence) : retry;
  }
  // D-045: the head's own CI missing or still running → a clean tip-sync chain may carry a prior head's green CI.
  let credited = null;
  if (!rows.ci.ok && rows.ci.pending && rows.open.ok && !String(pull.head?.ref || "").startsWith(TRAIN_PREFIX)) {
    const c = credit({ pr, pull, head, base, request, root });
    if (c.error) return { error: c.error };
    if (c.credit) {
      credited = c.credit;
      const n = c.credit.hops.length;
      rows.ci = { ...row(true, `credited H0 ${c.credit.sha} across clean tip-sync${n > 1 ? ` (a chain of ${n})` : ""}: ${c.credit.evidence}, first attempt, on ${c.credit.sha.slice(0, 8)}; the head's own: ${rows.ci.evidence}; the retest row runs against the credited head`), credited: c.credit.sha };
    } else rows.ci = { ...rows.ci, evidence: `${rows.ci.evidence} (no CI credit: ${c.none})` };
  }
  const pages = readDeployTip(base, request);
  if (pages.error) return { error: pages.error };
  // The tip itself (#5714 + #5634, 2026-11-19): Pages lags the tip by hours in a backlog, so when no completed run
  // covers the tip's sha its own cheap unit gate decides (tools/ci/lib/tip-gate.mjs). Read once: trusted's tip too.
  const br = request(`branches/${encodeURIComponent(base)}`);
  if (br.error) return { error: `branch ${base}: ${br.error}` };
  const baseTip = String(br.json?.commit?.sha || "").toLowerCase();
  if (!baseTip) return { error: `branch ${base}: no tip sha` };
  const deployTip = tipView(pages, { tipSha: baseTip, tipAt: br.json?.commit?.commit?.committer?.date || null, gate: () => tipCheck({ sha: baseTip, base, root }) });
  // The fixer's proof: one compare read, only on a code red and only for a PR that claims to be the fixer.
  let proof = null;
  if ((deployTip.state === "code-red" || deployTip.state === "unverified") && (pull.labels || []).some((l) => (typeof l === "string" ? l : l?.name) === FIXER_LABEL)) {
    proof = fixerProof({ redSha: deployTip.sha, head, request });
    if (proof.error) return { error: proof.error };
  }
  rows.base = baseVerdict(deployTip, pull.labels, ev.rows, owner, proof);
  // A merge train (tools/ci/merge-train.mjs; docs/notes/MERGE-TRAIN-2026-11-18.md): its config and raise rows are
  // its cars' own rows, read per car, after proving the head is exactly the clean fold of those car heads onto a deploy-branch commit.
  const isTrain = String(pull.head?.ref || "").startsWith(TRAIN_PREFIX);
  if (isTrain) {
    const t = trainCheck({ pr, pull, head, base, request, root, owner });
    if (t.error) return { error: t.error };
    rows.config = row(t.ok, t.evidence);
    rows.raise = row(t.ok, t.ok ? "read per car (each car's own raise row, config row above)" : "not evaluated: the train's car rows refused (config row)");
  }
  const files = isTrain ? { rows: [] } : listAll(`pulls/${pr}/files`, request);
  if (files.error) return { error: `files of PR #${pr}: ${files.error}` };
  let changed = filePaths(files.rows), generated = null;
  // package.json whose only change is the generated test lists is not a config edit (adding a unit test touches it).
  const pkgRow = files.rows.find((f) => f?.filename === GENERATED_PKG);
  if (pkgRow && !pkgRow.previous_filename && configFiles(changed).includes(GENERATED_PKG)) {
    generated = generatedPkgCheck({ head, base, request });
    if (generated.ok) changed = changed.filter((f) => f !== GENERATED_PKG);
  }
  const cfgLast = newestLabelEvent(ev.rows, CONFIG_LABEL);
  const needsPush = configFiles(changed).length && !!configLabelKind(cfgLast, owner);
  const pkgGeneratedAt = generated?.ok ? (ref) => (ref === head ? true : generatedPkgCheck({ head: ref, base, request }).ok) : null;
  const push = needsPush ? configPushState({ pr, head, headRef: pull.head?.ref || "", labelAt: cfgLast.created_at, request, base, pkgGeneratedAt, ...(credited ? { credited: credited.sha } : {}) }) : null;
  if (!isTrain) {
    rows.config = configVerdict(changed, pull.labels, ev.rows, owner, push);
    // The raise row reads the PR's own paths (not the generated-package filter's narrowed list).
    const raise = raiseRow({ pr, head, headRef: pull.head?.ref || "", base: baseTip, root, changed: filePaths(files.rows), labels: pull.labels, events: ev.rows, owner, request, credited: credited?.sha || "" });
    if (raise.error) return { error: raise.error };
    rows.raise = raise;
  }
  if (generated) rows.config = { ...rows.config, evidence: `${rows.config.evidence}; ${generated.ok ? generated.evidence : `package.json counted as a config edit: ${generated.evidence}`}` };
  let tip = "";
  if (!rows.open.ok) {
    for (const k of order.filter((r) => LOCAL_ROWS.includes(r))) rows[k] = row(false, "not evaluated: the PR is not open and ready");
  } else if (trusted) {
    // GitHub only (no PR code): land.yml post requires this tip to equal the land-gate leg's (#4592). The base
    // row's tip gate ran deploy-branch code on this same sha, never the PR's.
    tip = baseTip;
  } else {
    // The re-test compares against the green CI run's creation (the merge ref it tested is that old or newer).
    if (credited) ciRun = credited.run;
    const ciAt = rows.ci.ok ? String(ciRun?.created_at || "") : null;
    const ciBase = rows.ci.ok ? ciRecordedBase(ciRun, request) : "";
    const g = localMerge({ pr, head, headRef: pull.head?.ref || "", cwd: root, base, ciAt, ciBase, ...(credited ? { credited: credited.sha } : {}) });
    if (g.error) return { error: g.evidence };
    tip = g.tip || "";
    rows.gen = row(g.ok, g.evidence);
    rows.ratchets = g.ratchets ? row(g.ratchets.ok, g.ratchets.evidence) : row(false, "not evaluated: the merge or gen:check refused first");
    rows.retest = !rows.ci.ok
      ? { ...row(false, "not evaluated: waits for a green ci row (the CI run's base is what it compares against)"), ...(rows.ci.pending ? { pending: true } : {}) }
      : g.retest ? row(g.retest.ok, g.retest.evidence) : row(false, "not evaluated: the merge or gen:check refused first");
  }
  const ordered = {};
  for (const k of order) ordered[k] = rows[k];
  const ok = order.every((k) => ordered[k].ok);
  // Waiting: every row that is not ok is a pending one (`ci` running, `base` on a red tip), so the verdict is not known yet.
  const waiting = !ok && order.every((k) => ordered[k].ok || ordered[k].pending);
  return { ok, waiting, rows: ordered, pr, head, base, tip, trusted: !!trusted };
}

/** The printed rows: one `= gate <row>: ok|FAIL <reason>` line each, then the summary line. Pure. */
export function rowLines(v) {
  const mark = (r) => (r.ok ? "ok" : r.pending ? "WAIT" : "FAIL");
  const lines = ROWS.filter((k) => v.rows?.[k]).map((k) => `= gate ${k}: ${mark(v.rows[k])} ${v.rows[k].evidence}`);
  const credit = v.rows?.ci?.credited ? ` credited=${v.rows.ci.credited}` : "";
  lines.push(`= merge-gate ${v.ok ? "passed" : v.waiting ? "waiting" : "refused"} — ${ROWS.filter((k) => v.rows?.[k]).map((k) => `${k}=${mark(v.rows[k])}`).join(" ")}${credit} pr=#${v.pr} sha=${v.head || ""} tip=${v.tip || ""}`);
  return lines;
}

const USAGE = `usage: node tools/ci/merge-gate.mjs --pr <n> [--sha <head>] [--check] [--trusted] [--json <path>]
  The landing gate: the CI check named \`gate\` (land.yml), also runnable locally with a GitHub token
  (GH_TOKEN / GITHUB_TOKEN or \`gh auth token\`). Rows, each printed as \`= gate <row>: ok|FAIL <reason>\`, then one
  final \`= merge-gate passed|refused …\` line (the check title):
    open (open, not a draft, head = --sha when given), hold (no \`hold\` label; a hold ${OWNER} set in person is lifted
    only by a later click of his own, an agent's hold by anyone), plan (Plan present and closed; \`land:\` items exempt), ci (\`CI\` success on
    the head, or on a prior head across clean tip-sync merges while the head's own CI is missing or running, D-045), base (the deploy tip's newest completed pages.yml run is not red on code; waits otherwise, unless
    the PR is the fixer: \`deploy:red\` on a head that contains the red commit, or \`deploy:red\` / \`priority\` added by ${OWNER} in person), config (a diff touching a config path — harness, CI tools, agent config; see CONFIG_PATH — needs
    \`${CONFIG_LABEL}\` added by ${OWNER} in person after the last push touching one), raise (a tree-wide ratchet ceiling
    rises only with \`${RAISE_LABEL}\` added by ${OWNER} in person after the last push touching a ratchet file), gen (clean merge onto the current base tip + gen:check), ratchets (on
    that merge result), retest (the unit tests both the tip merges since the CI run and the PR select, re-run on that merge result).
  --trusted: only the rows that run no PR code (open, hold, plan, ci, base, config, raise); land.yml's trusted-rows job.
  A row still waiting (CI, a red deploy tip) prints WAIT. Exit 0 all rows ok, 2 a row failed, 3 waiting (every other
  row ok, CI not finished or the tip red on code), 1 usage or API/git error. Writes nothing but an optional --json summary.`;

export function main(argv, { request = api, root = ROOT, log = console.log, localMerge = localMergeGenCheck, write = fs.writeFileSync, owner = OWNER, credit = ciCredit } = {}) {
  exitIfHelp(argv, USAGE);
  const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : null; };
  const pr = Number(opt("--pr"));
  if (!Number.isInteger(pr) || pr < 1) { log("= merge-gate error — --pr <n> is required"); return 1; }
  if (argv.includes("--max-behind")) {
    log("= merge-gate error — --max-behind is gone: the distance row was retired 2026-11-03; sync only when needs-sync.mjs says conflict|stale-red|retest-refused (node tools/ci/needs-sync.mjs <branch>)");
    return 1;
  }
  const v = evaluate({ pr, sha: opt("--sha") || "", request, root, localMerge, trusted: argv.includes("--trusted"), owner, credit });
  if (v.error) { log(`= merge-gate error — ${v.error}`); return 1; }
  for (const l of rowLines(v)) log(l);
  const jsonPath = opt("--json");
  if (jsonPath) write(path.resolve(root, jsonPath), JSON.stringify({ ...v, at: new Date().toISOString() }, null, 2) + "\n");
  return v.ok ? 0 : v.waiting ? 3 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
