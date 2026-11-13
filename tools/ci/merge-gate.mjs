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
//             failed job (`run_attempt` > 1) fails the row
//   config    a diff touching a CONFIG_PATH (the harness, the gate's own code, the agent config; renames by either
//             name) needs the `config-ok` label, last added by Bryce in person (or, for ROUTINE config paths only, by
//             an agent through the Claude app: PROTECTED_CONFIG_PATH, #5455), and newer than the last push that
//             touched a CONFIG_PATH (configPushState); any other diff passes. A package.json diff that is ONLY the
//             generated `test:*` file lists (generatedPkgVerdict) does not count. Replaces the hook "ask".
//   raise     a diff that RAISES a tree-wide ceiling (tests/data/ratchets.json `tree`, plus the tests/data/ratchets.d
//             deltas, compared head vs merge base; a lowered, unchanged or new ceiling is no raise) needs the
//             `ratchet-raise` label, last added by Bryce in person and newer than the last push touching a ratchet file.
//             Per-file ceilings (`files`, the commit hook's --auto-raise) are not this row's. Bryce's pick, 2026-11-11
//             ~09:10Z: "Build the check (Recommended)" (#5405 option b; .claude/rules/game-code.md).
//   gen       clean merge onto the current base tip; `gen:check` and the scenery catalog digest pass there (an absent catalog is built)
//   ratchets  tools/check/ratchets.mjs and the whole-tree count tests hold on that same merge result
//             (two PRs under a ceiling alone can be over it together, #3236 + #3237, 2026-10-20)
//   retest    the CI run tested a merge ref as of ITS creation, so a PR merged onto the tip since then is untested in
//             combination (#5407: #5300 × #5392 → deploy red #5396). On the same merge result, the unit tests that the
//             newer tip merges and the PR select (tooling-fast's own --changed selection; the touched tests/unit files
//             when that widens to the whole floor) run once; a failing, timed-out or un-runnable re-test refuses.
//             Bryce's pick, 2026-11-11 ~09:02Z: "Quick re-test at merge (Recommended)" (#5407 option b).
//             It catches ACCIDENTAL crossings: the merge result's own scripts (gen:check, the ratchets) ran before it
//             as the same user and could steer it, the same trust the gen and ratchets rows already have.
// The `distance` row (merge-base at most N game merges behind the tip) was retired 2026-11-03 (plan §6): gen and
// ratchets already run on the real merge result, which is what catches composition reds; the row only bought syncs.
//
// `--trusted` evaluates only the rows that run no code from the PR (open, hold, plan, ci, config, raise): GitHub reads only,
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
import { AGENT_APP_SLUG, OWNER, byAgent, byOwner, describeActor, labelEvents, newestLabelEvent } from "./lib/provenance.mjs";

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
/** The PROTECTED config paths (#5455, Bryce 2026-11-11 "Count it, except the gate and safety hooks"): only his own
 *  `config-ok` tap covers a diff that touches one; an agent's `config-ok` covers ROUTINE config paths only (every
 *  other CONFIG_PATH). The gate (this module, which defines both lists; provenance; ready-gate; and the rest of the
 *  gate's import closure, under tools/ci/ and outside it (#5467), because a module's top level runs when the gate imports it — a test pins
 *  the closure), the land workflow, ci.yml (it decides what green means; Bryce 2026-11-11 "Protect ci.yml"), and every
 *  host's hooks and settings. */
export const PROTECTED_CONFIG_PATH = new RegExp("^(" + [
  "tools/ci/merge-gate\\.mjs$", "tools/ci/lib/provenance\\.mjs$", "tools/ci/ready-gate\\.mjs$",
  "tools/ci/github-api\\.mjs$", "tools/ci/github-token\\.mjs$", "tools/ci/preflip-probe\\.mjs$", "tools/ci/pick-tests\\.mjs$",
  "\\.github/workflows/land\\.yml$", "\\.github/workflows/ci\\.yml$", "\\.claude/hooks/", "\\.claude/settings[^/]*\\.json$", "tools/hooks/", "\\.githooks/",
  "\\.cursor/hooks", "\\.codex/hooks", ...GATE_MODULE_OUTSIDE_CI,
].join("|") + ")");
export const isProtectedConfigPath = (p) => PROTECTED_CONFIG_PATH.test(String(p || "").replace(/^\.\//, ""));
export const configFiles = (files) => (files || []).filter(isConfigPath);
/** The paths a pulls/<n>/files or compare row names: `filename`, and `previous_filename` for a rename. Pure. */
export const filePaths = (rows) => (rows || []).flatMap((f) => [f?.filename, f?.previous_filename]).filter(Boolean);
/** Row order, which is also print order. */
export const ROWS = Object.freeze(["open", "hold", "plan", "ci", "config", "raise", "gen", "ratchets", "retest"]);
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

/** Which kind of `config-ok` labeled event is this: "owner" (his own click, byOwner), "agent" (owner login through the
 *  Claude app, byAgent) or null (anything else: another app, another login, no app field). Pure. */
export const configLabelKind = (e, owner = OWNER) => (e?.event !== "labeled" ? null : byOwner(e, owner) ? "owner" : byAgent(e, owner) ? "agent" : null);

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
    // An owner's own removal vetoes agent re-adds until he adds it himself (walked oldest first, like hold).
    const at = (e) => Date.parse(e?.created_at || "") || 0;
    let veto = null;
    for (const e of labelEvents(events, CONFIG_LABEL).map((e, i) => ({ e, i })).sort((x, y) => at(x.e) - at(y.e) || x.i - y.i).map((x) => x.e)) {
      if (!byOwner(e, owner)) continue;
      veto = e.event === "unlabeled" ? e : null;
    }
    if (veto) return row(false, `needs ${CONFIG_LABEL} from ${owner}: he removed it himself at ${veto.created_at || "?"}, so an agent's re-add does not count until his own (the diff edits ${shown})`);
  }
  const by = kind === "owner" ? `${CONFIG_LABEL} by owner (${owner}` : `${CONFIG_LABEL} by agent (${AGENT_APP_SLUG} app), routine paths only (${describeActor(last)}`;
  if (push?.state === "after") return row(false, `needs a fresh ${CONFIG_LABEL}: ${push.evidence} after the label at ${last.created_at || "?"} (${by}; remove and re-add it)`);
  if (push?.state === "unknown") return { ...row(false, `${by}) found, head push not resolved yet: ${push.evidence}`), pending: true };
  return row(true, `${by}) at ${last.created_at || "?"} covers ${shown}${push?.evidence ? ` (${push.evidence})` : ""}`);
}

/**
 * When did the head get pushed relative to the owner's `config-ok` at `labelAt`? Reads ci.yml's pull_request runs of
 * this PR (server timestamps; a commit date can say anything). The head is covered when the label is newer than the
 * head's first run. Otherwise the head at label time is the head of the newest run created before the label, and the
 * compare from it to the head must touch no CONFIG_PATH.
 * → { state: "covered"|"after"|"unknown", evidence }. Side effects only through `request`.
 */
export function configPushState({ pr, head, headRef, labelAt, request, touches = configFiles, what = "config path" }) {
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
  const hit = touches(filePaths(files));
  return hit.length
    ? { state: "after", from, evidence: `a push touching ${hit.slice(0, 3).join(", ")} (${from.slice(0, 8)}...${head.slice(0, 8)}) came` }
    : { state: "covered", evidence: `the pushes since ${from.slice(0, 8)} touch no ${what}` };
}

/**
 * The effective tree-wide ceilings at `ref`: ratchets.json `tree` plus every ratchets.d delta's `tree` part, with
 * tools/check/ratchets.mjs applyFragments' rule (a delta for a metric the table does not carry moves nothing). Kept
 * here, not imported: the gate must not change when a non-config file does. GitHub reads only.
 * → { tree: { metric: ceiling } } | { error }.
 */
export function treeCeilingsAt(ref, request) {
  const read = (file) => {
    const r = request(`contents/${file}?ref=${encodeURIComponent(ref)}`);
    if (r.error || r.json?.encoding !== "base64" || typeof r.json?.content !== "string") return { error: `${file} at ${String(ref).slice(0, 8)}: ${r.error || "unreadable"}` };
    try { return { json: JSON.parse(Buffer.from(r.json.content, "base64").toString("utf8")) }; } catch (e) { return { error: `${file} at ${String(ref).slice(0, 8)}: ${e.message}` }; }
  };
  const base = read("tests/data/ratchets.json");
  if (base.error) return base;
  const tree = {};
  for (const [m, v] of Object.entries(base.json?.tree || {})) {
    const c = typeof v === "number" ? v : v?.ceiling;
    if (typeof c === "number" && Number.isFinite(c)) tree[m] = c;
  }
  const dir = request(`contents/tests/data/ratchets.d?ref=${encodeURIComponent(ref)}`);
  if (dir.error && !/\b404\b|Not Found/i.test(String(dir.error))) return { error: `tests/data/ratchets.d at ${String(ref).slice(0, 8)}: ${dir.error}` };
  const frags = dir.error ? [] : (Array.isArray(dir.json) ? dir.json : []).filter((e) => e?.type === "file" && /\.json$/.test(e.name || "")).map((e) => e.path);
  for (const f of frags.sort()) {
    const r = read(f);
    if (r.error) return r;
    for (const [m, d] of Object.entries(r.json?.tree || {})) {
      if (!Object.hasOwn(tree, m)) continue;
      if (typeof d !== "number" || !Number.isFinite(d)) return { error: `${f}: tree delta ${m} is not a number` };
      tree[m] += d;
    }
  }
  return { tree };
}

/** The tree metrics whose ceiling is higher at `after` than at `before`, and those `before` carries that `after` does
 *  not: ratchets.mjs measures only the metrics ratchets.json names, so deleting one removes its ceiling, the widest
 *  raise there is (`to: null`, shown as "removed"). A metric only `after` carries is a new ceiling, no raise. Pure. */
export function treeRaises(before, after) {
  const b = before || {}, a = after || {};
  return Object.keys(b).filter((m) => !Object.hasOwn(a, m) || a[m] > b[m]).sort()
    .map((m) => ({ metric: m, from: b[m], to: Object.hasOwn(a, m) ? a[m] : null }));
}

/**
 * raise: no tree-wide ceiling rises, or Bryce's own newest `ratchet-raise` covers the head (`push` from
 * configPushState over the ratchet files). An agent's label never counts. Pure.
 */
export function raiseVerdict(raises, labels, events = null, owner = OWNER, push = null) {
  if (!raises?.length) return row(true, "no tree-wide ratchet ceiling rises or is removed in the diff (per-file ceilings are the commit hook's --auto-raise, not this row's)");
  const shown = raises.slice(0, 4).map((r) => `${r.metric} ${r.from}→${r.to === null ? "removed" : r.to}`).join(", ") + (raises.length > 4 ? ", …" : "");
  const names = (labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
  const last = newestLabelEvent(events, RAISE_LABEL);
  if (!names.includes(RAISE_LABEL)) return row(false, `needs ${RAISE_LABEL} from ${owner}: the diff raises a tree-wide ceiling (${shown}) — lower the count instead, or ask him`);
  if (!last || last.event !== "labeled" || !byOwner(last, owner)) {
    return row(false, `needs ${RAISE_LABEL} from ${owner}: the label was ${last ? `last added by ${describeActor(last)}` : "found but its label event was not"} — only his own click counts (raises ${shown})`);
  }
  if (push?.state === "after") return row(false, `needs a fresh ${RAISE_LABEL} from ${owner}: ${push.evidence} after his label at ${last.created_at || "?"} (remove and re-add it)`);
  if (push?.state === "unknown") return { ...row(false, `${RAISE_LABEL} from ${owner} found, head push not resolved yet: ${push.evidence}`), pending: true };
  return row(true, `${RAISE_LABEL} added by ${owner} at ${last.created_at || "?"} covers ${shown}${push?.evidence ? ` (${push.evidence})` : ""}`);
}

/** The PR's own tree raises at `sha`: its ceilings vs those at its merge base with `base` (so a sync, which moves the
 *  merge base, brings other PRs' fragments into both sides and they cancel). → { raises } | { error }. */
export function prRaisesAt(sha, base, request) {
  const cmp = request(`compare/${encodeURIComponent(base)}...${encodeURIComponent(sha)}`);
  const mb = cmp.json?.merge_base_commit?.sha;
  if (cmp.error || !mb) return { error: `merge base of ${String(sha).slice(0, 8)}: ${cmp.error || "unreadable"}` };
  const before = treeCeilingsAt(mb, request);
  if (before.error) return before;
  const after = treeCeilingsAt(sha, request);
  if (after.error) return after;
  return { raises: treeRaises(before.tree, after.tree) };
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
export function raiseRow({ pr, head, headRef, base, changed, labels, events, owner = OWNER, request }) {
  if (!ratchetFiles(changed).length) return row(true, "no ratchet ceiling file in the diff");
  const now = prRaisesAt(head, base, request);
  if (now.error) return { error: now.error };
  const raises = now.raises;
  const last = newestLabelEvent(events, RAISE_LABEL);
  let push = raises.length && last?.event === "labeled" && byOwner(last, owner)
    ? configPushState({ pr, head, headRef, labelAt: last.created_at, request, touches: ratchetFiles, what: "ratchet file" }) : null;
  if (push?.state === "after" && push.from) {
    const then = prRaisesAt(push.from, base, request);
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
/** Workers for the re-test (a land-gate runner has 4 vCPU, gen:check and the ratchets already ran). */
export const RETEST_JOBS = 2;
/** tooling-fast's per-file bound for the re-test, inside RETEST_TIMEOUT_MS. */
export const RETEST_FILE_TIMEOUT_S = 180;

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
  const src = `import(${JSON.stringify(path.join(root, "tools/ci/tooling-fast.mjs"))}).then((m) => { const s = m.selectToolingFastChanged(JSON.parse(process.argv[1])); let estMs = null; try { estMs = m.estimateToolingFast(s.files, m.loadTimings(), ${RETEST_JOBS}).criticalPathMs; } catch {} process.stdout.write(JSON.stringify({ files: s.files, reason: s.reason, widened: s.widened || "", estMs })); })`;
  const r = run(process.execPath, ["--input-type=module", "-e", src, JSON.stringify(paths)], { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 16 << 20 });
  if (r.error || r.status !== 0) return { error: `tooling-fast selection failed: ${r.error?.message || String(r.stderr || "").trim().split("\n").slice(-1)[0] || "exit " + r.status}` };
  try { return JSON.parse(r.stdout); } catch (e) { return { error: `tooling-fast selection unreadable: ${e.message}` }; }
}

/**
 * Which unit files the re-test runs: the selection for (newer tip paths ∪ the PR's paths), kept to files that exist in
 * the merge result; when the selection widens to the whole floor (an infra path), the touched tests/unit files of
 * either side instead, and the evidence says so. Pure. → { files, how }.
 */
export function retestPlan({ newer = [], pr = [], selection, exists = () => true }) {
  const touched = [...new Set([...newer, ...pr])].sort();
  const literal = touched.filter((f) => UNIT_TEST.test(f) && exists(f));
  if (!selection || selection.widened) {
    return { files: literal, how: `the touched tests/unit files${selection?.widened ? ` (the selection widened: ${selection.widened})` : ""}` };
  }
  const files = [...new Set([...(selection.files || []), ...literal])].filter((f) => exists(f)).sort();
  return { files, how: `tooling-fast's --changed selection (${selection.reason || "matched"})` };
}

/**
 * retest row, on the merge result in `cwd`: no tip merge since the CI run (less the margin) → ok without running
 * anything; otherwise run the planned unit files with the merge result's tooling-fast, stripped environment, once.
 * Every failure to read, select or run refuses (never a silent pass). → { ok, evidence }.
 */
export function retestOnMerge({ cwd, tip, head, ciAt, ciBase = "", run = spawnSync, gitRun = git, select = gateSelection } = {}) {
  const t = newerTipPaths({ cwd, tip, head, ciAt, ciBase, gitRun });
  if (t.error) return row(false, `re-test not runnable: ${t.error}`);
  if (!t.commits.length) return row(true, `no tip merge since the CI run's base (created ${ciAt}, margin ${RETEST_MARGIN_MIN} min${t.base ? `; recorded base ${t.base.slice(0, 8)}` : "; no recorded base"}): CI tested this combination`);
  const sel = select([...new Set([...t.newer, ...t.pr])].sort());
  if (sel?.error) return row(false, `re-test not runnable: ${sel.error}`);
  const plan = retestPlan({ newer: t.newer, pr: t.pr, selection: sel, exists: (f) => fs.existsSync(path.join(cwd, f)) });
  const since = `${t.commits.length} tip merge(s) since the CI run (${t.commits.slice(0, 3).map((c) => c.slice(0, 8)).join(", ")}${t.commits.length > 3 ? ", …" : ""})`;
  if (!plan.files.length) return row(true, `${since}: ${plan.how} names no unit test — nothing to re-test`);
  // Too broad to finish inside the cap (tooling-fast's measured timings): refuse now instead of burning the runner
  // into the same refusal. The cure is the one a timeout gets: sync, push, and the fresh CI run tests the combination.
  if (!sel?.widened && Number.isFinite(sel?.estMs) && sel.estMs > RETEST_TIMEOUT_MS * 0.8) {
    return row(false, `${since}; the re-test would run ${plan.files.length} unit file(s), measured ~${Math.round(sel.estMs / 1000)} s at --jobs=${RETEST_JOBS}, over the ${RETEST_TIMEOUT_MS / 1000} s cap — too broad to re-test at merge: sync-pr.mjs and push, so a fresh CI run tests this combination`);
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

/** The catalog child's exit code for "no sourceDigest field": the gate then runs the generator's full `--check`. */
const NO_DIGEST = 3;
export function localMergeGenCheck({ pr, head, headRef, cwd = ROOT, base = DEPLOY, run = spawnSync, ratchets = ratchetsOnMerge, ciAt = null, ciBase = "", retest = retestOnMerge } = {}) {
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
  // A catalog with NO sourceDigest field (the committed fingerprint made every garage/scenery PR conflict on one
  // line, tooling hunt 2026-11-09 row 2) is not waved through: the child exits NO_DIGEST and the generator's own
  // `--check` rebuilds every circuit on this merge and compares (about a minute). A digest that is present must
  // still be well-formed and equal. Keep PR code in a child with the same stripped environment as gen:check.
  // An ABSENT catalog (the merge of a branch that builds it on demand, #5427) is built here in write mode, with the
  // same environment and timeout; the generator's exit code is the verdict. A present catalog takes the path above.
  const absent = !fs.existsSync(path.join(wt, "tools/shot/scenery-locations.json"));
  if (absent) {
    const built = run(process.execPath, ["tools/shot/gen-scenery-locations.cjs"], { cwd: wt, env: untrustedEnv(), encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
    if (built.error || built.status !== 0) {
      const detail = built.error?.message || `${built.stdout || ""}\n${built.stderr || ""}`.split("\n")
        .map((line) => line.trim()).find((line) => /Error:|FAILED/.test(line)) || `exit ${built.status}`;
      return fail(`scenery catalog fails to build on the merge onto ${tip.slice(0, 8)}: ${detail} — node tools/shot/gen-scenery-locations.cjs on the synced branch names the circuit`);
    }
    const rat = ratchets({ cwd: wt, run });
    cleanup();
    return { ok: true, evidence: `merges clean onto ${tip.slice(0, 8)}; gen:check and scenery catalog build 0`, tip, ratchets: rat };
  }
  let catalog = run(process.execPath, ["-e", [
    "const fs = require('node:fs');",
    "const { scenerySourceDigest } = require('./tools/shot/scenery-source-hash.cjs');",
    "const stored = JSON.parse(fs.readFileSync('tools/shot/scenery-locations.json', 'utf8')).sourceDigest;",
    `if (stored === undefined) process.exit(${NO_DIGEST});`,
    "if (typeof stored !== 'string' || !/^[a-f0-9]{64}$/.test(stored)) throw new Error('catalog sourceDigest is missing or malformed');",
    "if (stored !== scenerySourceDigest(process.cwd())) throw new Error('catalog sourceDigest does not match scenery inputs');",
  ].join("\n")], { cwd: wt, env: untrustedEnv(), encoding: "utf8", timeout: 60_000, maxBuffer: 1 << 20 });
  const rebuilt = !catalog.error && catalog.status === NO_DIGEST;
  if (rebuilt) catalog = run(process.execPath, ["tools/shot/gen-scenery-locations.cjs", "--check"], { cwd: wt, env: untrustedEnv(), encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
  if (catalog.error || catalog.status !== 0) {
    const detail = catalog.error?.message || `${catalog.stdout || ""}\n${catalog.stderr || ""}`.split("\n")
      .map((line) => line.trim()).find((line) => /Error:|catalog is stale/.test(line)) || `exit ${catalog.status}`;
    return fail(`scenery catalog fails on the merge onto ${tip.slice(0, 8)}: ${detail} — regenerate with node tools/shot/gen-scenery-locations.cjs on the synced branch and push`);
  }
  const rat = ratchets({ cwd: wt, run });
  // `ciAt` null: the ci row has no green run to compare against, so the re-test waits for it (evaluate says so).
  const re = ciAt === null ? null : retest({ cwd: wt, tip, head, ciAt, ciBase, run });
  cleanup();
  return { ok: true, evidence: `merges clean onto ${tip.slice(0, 8)}; gen:check and scenery catalog ${rebuilt ? "rebuild check" : "digest"} 0`, tip, ratchets: rat, retest: re };
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
  const suites = new Set(), runs = new Map();
  const want = `.github/workflows/${CI_WORKFLOW}`;
  for (let page = 1; page <= 5; page++) {
    const r = request(`actions/workflows/${CI_WORKFLOW}/runs?head_sha=${encodeURIComponent(sha)}&per_page=100${page > 1 ? `&page=${page}` : ""}`);
    if (r.error) return { error: r.error };
    const batch = r.json?.workflow_runs || [];
    for (const w of batch) if (String(w?.path || "").replace(/@.*$/, "") === want && w.check_suite_id != null) { suites.add(w.check_suite_id); runs.set(w.check_suite_id, w); }
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
  const ciRun = rows.ci.ok ? ci.runs?.get(rows.ci.suite) : undefined;
  if (rows.ci.ok) {
    const retry = ciRetryVerdict(ci.runs?.get(rows.ci.suite), request);
    if (retry.error) return { error: retry.error };
    rows.ci = retry.ok ? row(true, rows.ci.evidence) : retry;
  }
  const files = listAll(`pulls/${pr}/files`, request);
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
  const push = needsPush ? configPushState({ pr, head, headRef: pull.head?.ref || "", labelAt: cfgLast.created_at, request }) : null;
  rows.config = configVerdict(changed, pull.labels, ev.rows, owner, push);
  // The raise row reads the PR's own paths (not the generated-package filter's narrowed list).
  const raise = raiseRow({ pr, head, headRef: pull.head?.ref || "", base, changed: filePaths(files.rows), labels: pull.labels, events: ev.rows, owner, request });
  if (raise.error) return { error: raise.error };
  rows.raise = raise;
  if (generated) rows.config = { ...rows.config, evidence: `${rows.config.evidence}; ${generated.ok ? generated.evidence : `package.json counted as a config edit: ${generated.evidence}`}` };
  let tip = "";
  if (!rows.open.ok) {
    for (const k of order.filter((r) => LOCAL_ROWS.includes(r))) rows[k] = row(false, "not evaluated: the PR is not open and ready");
  } else if (trusted) {
    // GitHub only (no git, no PR code): land.yml post requires this tip to equal the land-gate leg's (#4592).
    const b = request(`branches/${encodeURIComponent(base)}`);
    if (b.error) return { error: `branch ${base}: ${b.error}` };
    tip = String(b.json?.commit?.sha || "").toLowerCase();
    if (!tip) return { error: `branch ${base}: no tip sha` };
  } else {
    // The re-test compares against the green CI run's creation (the merge ref it tested is that old or newer).
    const ciAt = rows.ci.ok ? String(ciRun?.created_at || "") : null;
    const ciBase = rows.ci.ok ? ciRecordedBase(ciRun, request) : "";
    const g = localMerge({ pr, head, headRef: pull.head?.ref || "", cwd: root, base, ciAt, ciBase });
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
    \`${CONFIG_LABEL}\` added by ${OWNER} in person after the last push touching one), raise (a tree-wide ratchet ceiling
    rises only with \`${RAISE_LABEL}\` added by ${OWNER} in person after the last push touching a ratchet file), gen (clean merge onto the current base tip + gen:check), ratchets (on
    that merge result), retest (the unit tests the tip merges since the CI run select, re-run on that merge result).
  --trusted: only the rows that run no PR code (open, hold, plan, ci, config, raise); land.yml's trusted-rows job.
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
