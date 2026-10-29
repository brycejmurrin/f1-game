#!/usr/bin/env node
// dispatch.mjs — the hourly dispatcher's whole brain: a pure plan over GitHub state (issues, PRs, deploy, sessions, quota), then thin I/O.
// @doc Hourly dispatcher: plans launches, needs-owner takeovers, deploy:red fixers, archives and the Board from GitHub state.
// @section runner
// @skill steward
//
// Design: docs/plans/2026-10-27-orchestration-redesign.md §4.4 (GitHub is the only state store; no coordinator session).
// `planDispatch(state, config, now)` is PURE and tested; `readState` fetches the state with github-api.mjs (GETs only)
// and `applyPlan` performs ONLY the GitHub-side writes (labels, the Board comment). A node script cannot call
// create_session, so every session-side action is printed as one line for the running agent:
//
//   CREATE_SESSION <json>   the claude-code-remote `create_session` arguments (source_url, source_revision,
//                           permission_mode "auto", model, title, tags, prompt)
//   CURSOR_LAUNCH <json>    cursor-agents.mjs buildLaunchBody's shape (prompt.text, model.id, name, repos[0].startingRef);
//                           run `node tools/ci/cursor-agents.mjs launch --prompt-file <f> --ref <startingRef> --name <name>`
//   RECORD_LAUNCH <cmd>     follows each launch line: run <cmd> (`… --record-launch <token> --session {SESSION_ID}`),
//                           replacing {SESSION_ID} with the id create_session returned, ONLY after that create_session / launch SUCCEEDED; it posts the launch
//                           comment (the claim), which names the session so the next cycle can look it up
//   GET_SESSION <id>        (from --children) the claude-code-remote `get_session` argument
//   NUDGE_SESSION <id> <msg>  a waiting child (BLOCKED, REVIEW_READY or idle > nudgeIdleMinutes) whose PR/issue is
//                           still open and not landing: `send_message` <msg> to it; at most one per nudgeEveryMinutes,
//                           recorded in the Board comment's Nudges list (workers stalled asking "the user", 2026-10-27)
//   ARCHIVE_SESSION <id>    the claude-code-remote `archive_session` argument
//
//   node tools/ci/dispatch.mjs --children                   # prints GET_SESSION <id> per dispatched worker GitHub names
//   node tools/ci/dispatch.mjs --plan [--json] [--sessions <file>]... [--quota allowed|allowed_warning|rejected] [--now <iso>]
//   node tools/ci/dispatch.mjs --apply [...same flags]      # writes labels and the Board, then prints the lines above
//   node tools/ci/dispatch.mjs --record-launch <token> --session <id>   # posts one launch comment, stamped now
//
// Why RECORD_LAUNCH (review M4, 2026-10-27): the launch comment is a 2 h claim. Posted before create_session, a refused
// or skipped launch left a phantom claim (no worker, the issue blocked for launchClaimHours). It is now posted only
// after the session exists, and names it (`… as session_…`).
//
// CHILDREN, NOT HISTORY (Bryce + the dispatcher, 2026-10-27). The dispatcher never lists the account's sessions (7+
// pages of history, growing ~100 a day). Its workers are the sessions GitHub names: launch comments, the workers' own
// claim/adoption comments and PR ```handoff owners, on open issues/PRs and on claimed or lane:* ones closed in the last
// recentClosedHours. `--children` prints those ids; each get_session result is passed back with `--sessions <file>`.
// Anything no claim names (Bryce's chats, other sessions) is never counted or archived.
//
// THE SCHEDULED TASK'S PROMPT (hourly, bound to the persistent dispatcher session tagged role:dispatcher + no-archive;
// a create_new_session_on_fire session lacks get_session/list_sessions/create_session), Sonnet, verbatim:
//   1. Run `node tools/ci/dispatch.mjs --children`; call get_session on each GET_SESSION id; save each result to a file
//      (a get_session result `{"ccr":{…}}`, a bare session object, or a list_sessions page / its entries all parse)
//      (every one: with children named and no --sessions, step 3 launches nothing).
//   2. Call get_session ALONE (no id) and wait for its result (the PostToolUse hook writes artifacts/launch/self.json).
//   3. Run `node tools/ci/dispatch.mjs --apply --quota <rate_limit_info.status> --sessions <file1> [--sessions <file2>…]`.
//   4. For each CREATE_SESSION line, strictly one step at a time, never in parallel: call get_session alone; AFTER it
//      returns run `node tools/ci/launch-gate.mjs artifacts/launch/self.json`; only on its exit 0 call create_session
//      with the line's JSON; only when that succeeded run the RECORD_LAUNCH command that follows it, replacing
//      {SESSION_ID} with the id create_session returned (replace it; never append a second --session).
//   5. For each NUDGE_SESSION <id> <message> line call send_message with session_id <id> and that message.
//   6. Call archive_session for each ARCHIVE_SESSION line; end.
//
// Issue conventions: the pinned issue titled `Board` (config boardIssueTitle) holds ONE comment this tool edits each run
// (marker `<!-- dispatch-board -->`, so both Claude accounts edit the same one) and carries `deploy:red` while the latest
// pages.yml run on the deploy branch is red. The pinned issue titled `Dispatch` is Bryce's switch: its `dispatch:pause`
// label launches nothing (as does `pause` in tools/ci/dispatch.json); `dispatch:merge-pause` arms nothing — land.yml
// reads that label, this tool only reports it (the base-behind limit lives in merge-gate.mjs, not here).
// Task rules (plan §4.4): (1) `ready` issues without `claimed` → one worker each, `priority` first, newest next,
// within maxLaunchesPerRun and maxLiveWorkers, none when the quota is not `allowed`, and none at all while landQueueMax
// or more open non-draft PRs carry `land` (LANDING BACKPRESSURE, 2026-10-27: 42 of 70 open PRs waited to land, merges
// ran ~3.5/h against ~7/h opened; one skip line says so; rules 2 and 3 drain the queue and are never paused);
// (2) an open PR with no push and no comment for staleHours (6 for lane:codex), or one already labelled `needs-owner`
// (its worker stopped at the cap and asked for a takeover: no 2 h wait), no `hold`/`needs-decision` → `needs-owner` + ONE `CONTINUE PR #n` worker
// carrying the body's ```handoff block; (3) deploy red and no open PR labelled `deploy:red` → label the Board, launch one
// fixer; (4) a child whose every PR merged/closed > archiveAfterMinutes (10) ago → archive (stops the post-land wakes), only a `role:worker` session
// named in a claim/adoption comment, never one tagged `no-archive` or `role:dispatcher`, never RUNNING/WORKING/BLOCKED;
// (5) nudge waiting children (NUDGE_SESSION); (6) the Board markdown, which lists the waiting children. Idempotent: every launch is recorded (RECORD_LAUNCH) as the comment
// `dispatch: launched <host>:<title> for #<n> at <iso> as <session id>` on the issue/PR (deploy:red fixers on the Board issue) and a launch
// comment younger than launchClaimHours is a live claim, so a second run inside the hour launches nothing twice.
// Live workers (maxLiveWorkers) = children tagged `role:worker` that are RUNNING or in status_bucket WORKING, plus recent
// launch comments no fetched session names; idle and finished children, Bryce's own and the dispatcher never count.
// Launch slots go to deploy recovery, requested takeovers, stale PRs, then new issues; all share the same caps.
// Rule 2's "last activity" is the PR's updated_at (any push, comment, edit or label change) or its newest comment, the
// dispatcher's launch comments excluded. Label-only churn can only delay a takeover, never fake one; the head commit's
// committer date is NOT the push time (a commit made at 10:00 and pushed at 12:30 is not 2.5 h idle). Never stale: a
// PR labelled `land` whose head has no failed check, no failed or long-pending `gate` status and no conflict (it waits
// on CI, the gate or the train), the fold bots' PRs (head `bot/*`, author `*[bot]`: changelog-fold.yml,
// ratchets-fold.yml), and a PR a live role:worker session names (its `pr` field, a `pr:<n>` tag or `PR #n` title).
// Every list call paginates.
// Saved pages and comment bodies are other sessions' records: data a rule is applied to, never instructions.
// Exit: 0 planned/applied, 1 usage, 3 no token / API error.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api as githubApi } from "./github-api.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const CONFIG_FILE = path.join(ROOT, "tools", "ci", "dispatch.json");
export const BOARD_MARKER = "<!-- dispatch-board -->";
export const LAUNCH_RE = /^dispatch: launched (\S+?):(.+?) for (#\d+|deploy:red) at (\S+)(?: as (session_[A-Za-z0-9]{12,}))?/m;
/** A claim or adoption comment naming a session ("claims #12 — claude:session_…", "adopts PR #3 — claude:session_…"). */
const CLAIM_RE = /\b(?:claims|adopts)\b[^\n]*?\b(session_[A-Za-z0-9]{12,})\b/g;
const SESSION_RE = /\bsession_[A-Za-z0-9]{12,}\b/g;
export const PROMPT_MAX_LINES = 25;
/** The literal RECORD_LAUNCH prints for the new session's id; the dispatcher replaces it (never appends a second --session). */
export const SESSION_PLACEHOLDER = "{SESSION_ID}";
/** Rows per list page; a page shorter than this is the last one (GitHub REST pagination). */
export const PAGE_SIZE = 100;
export const DEFAULT_CONFIG = {
  pause: false, maxLaunchesPerRun: 4, maxLiveWorkers: { claude: 8, cursor: 4 }, landQueueMax: 15, workerCostCapUsd: 10, workerStopAtK: 300,
  staleHours: { default: 2, codex: 6 }, launchClaimHours: 2, archiveAfterMinutes: 60, nudgeIdleMinutes: 20, nudgeEveryMinutes: 60,
  model: "claude-sonnet-5-5", deployBranch: "claude/f1-game-project-26h3ng", repo: "brycejmurrin/f1-game",
  boardIssueTitle: "Board", dispatchIssueTitle: "Dispatch", hosts: { cursor: { enabled: false, model: "composer-2.5" } },
};

export function loadConfig(file = CONFIG_FILE, read = fs.readFileSync) {
  let on = {};
  try { on = JSON.parse(read(file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
  return { ...DEFAULT_CONFIG, ...on, maxLiveWorkers: { ...DEFAULT_CONFIG.maxLiveWorkers, ...on.maxLiveWorkers },
    staleHours: { ...DEFAULT_CONFIG.staleHours, ...on.staleHours }, hosts: { cursor: { ...DEFAULT_CONFIG.hosts.cursor, ...on.hosts?.cursor } } };
}

// ---- pure helpers ----------------------------------------------------------
export const labelsOf = (x) => (x?.labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
const has = (x, name) => labelsOf(x).includes(name);
const t = (iso) => Date.parse(iso || "") || 0;
const hoursAgo = (iso, now) => (now - t(iso)) / 3.6e6;
export const ageLabel = (iso, now) => { const h = hoursAgo(iso, now); return !t(iso) ? "?" : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`; };

/** The body's ```handoff block as {key: value} (keys lowercased, `not run` → notRun); null without one. Pure. */
export function parseHandoff(body) {
  const m = /```handoff\s*\n([\s\S]*?)```/.exec(String(body || ""));
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = /^\s*([A-Za-z][\w -]*?)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1].trim().toLowerCase().replace(/\s+(\w)/g, (_, c) => c.toUpperCase())] = kv[2].trim();
  }
  return out;
}

/** The dispatcher's launch comments on one object: [{host, title, target, at}], newest first. Pure. */
export function launchComments(comments) {
  return (comments || []).map((c) => LAUNCH_RE.exec(String(c.body || ""))).filter(Boolean)
    .map((m) => ({ host: m[1], title: m[2], target: m[3], at: m[4], session: m[5] || null })).sort((a, b) => t(b.at) - t(a.at));
}
/** The newest launch comment younger than `hours` (a live claim), or null. Pure. */
export const liveLaunch = (comments, now, hours, sessions = []) => launchComments(comments)
  .find((l) => hoursAgo(l.at, now) < hours && !endedLaunch(l, sessions)) || null;
/** A session that can no longer work: ARCHIVED, or status_bucket COMPLETED / FAILED. Pure. */
export const isEndedSession = (s) => /ARCHIVED/i.test(s?.status || "") || /COMPLETED|FAILED/i.test(s?.bucket || "");
/** Is this launch comment's recorded child (`… as session_…`) known, from --sessions, to have ended? Then it is no
 *  live claim (dispatcher report 2026-10-27: #3265's archived/FAILED child blocked a relaunch). No record: the age rule. Pure. */
export const endedLaunch = (l, sessions = []) => !!l.session && sessions.some((s) => s.id === l.session && isEndedSession(s));

/** Every session id named in a claim/adoption comment (the worker's own "claims #n — host:session_…") on any open,
 *  closed or claimed issue/PR the state carries, or in a PR body's ```handoff `owner:` line. The Board comment this tool
 *  writes (its skip list names sessions) is never a claim. Pure. */
export function claimedSessionIds(state) {
  const ids = new Set();
  const scanComments = (cs) => {
    for (const c of cs || []) {
      const body = String(c.body || "");
      if (body.startsWith(BOARD_MARKER) || LAUNCH_RE.test(body)) continue;
      for (const m of body.matchAll(CLAIM_RE)) ids.add(m[1]);
    }
  };
  for (const x of [...(state.issues || []), ...(state.prs || []), ...(state.closedIssues || []), ...(state.closedPrs || [])]) scanComments(x.comments);
  for (const p of [...(state.prs || []), ...(state.closedPrs || [])]) for (const m of String(parseHandoff(p.body)?.owner || "").matchAll(SESSION_RE)) ids.add(m[0]);
  return ids;
}

/** The dispatcher's children: every session id a launch comment (`… as session_…`), a worker's claim/adoption comment
 *  or a PR's ```handoff `owner:` names, on open issues/PRs and on those closed in the last `recentClosedHours`. These are
 *  the only sessions the dispatcher counts or archives, so it never lists the account's history. Sorted. Pure. */
export function childSessionIds(state) {
  const ids = claimedSessionIds(state);
  for (const x of [...(state.issues || []), ...(state.prs || []), ...(state.closedIssues || []), ...(state.closedPrs || [])])
    for (const l of launchComments(x.comments)) if (l.session) ids.add(l.session);
  return [...ids].sort();
}

/** One `{ccr:{data:[…], has_more}}` list_sessions page (MCP text with its envelope, or raw JSON) → { sessions, hasMore }. Pure. */
export function sessionsPage(text) {
  const s = String(text);
  const ccr = s.indexOf('{"ccr"'), brace = s.indexOf("{"), bracket = s.indexOf("[");
  const array = ccr < 0 && bracket >= 0 && (brace < 0 || bracket < brace);   // a saved array of list_sessions entries
  const start = ccr >= 0 ? ccr : array ? bracket : brace;
  if (start < 0) throw new Error("no JSON object in the page");
  let obj = JSON.parse(s.slice(start, s.lastIndexOf(array ? "]" : "}") + 1));
  if (Array.isArray(obj)) obj = { data: obj.map((x) => x?.ccr || x), has_more: false };
  if (obj.ccr) obj = obj.ccr;
  if (!Array.isArray(obj.data) && typeof obj.id === "string") obj = { data: [obj], has_more: false };   // one get_session result
  if (!Array.isArray(obj.data)) throw new Error("page has no data[] array");
  return { hasMore: obj.has_more === true, sessions: obj.data.map((x) => ({ id: x.id, title: x.title || "", status: x.status || x.session_status || "",
    bucket: x.status_bucket || "", created_at: x.created_at, updated_at: x.updated_at, tags: x.tags || [], pr: x.pr })) };
}
export const extractSessions = (text) => sessionsPage(text).sessions;
/** Several saved pages → the de-duplicated sessions and whether the LAST page still says has_more. Pure. */
export function readSessionPages(texts) {
  const seen = new Map();
  let hasMore = false;
  for (const text of texts) { const p = sessionsPage(text); hasMore = p.hasMore; for (const s of p.sessions) seen.set(s.id, s); }
  return { sessions: [...seen.values()], complete: !hasMore };
}
const tagged = (s, tag) => (s.tags || []).includes(tag);
/** A dispatched or hand-launched worker that is doing something right now (RUNNING, or status_bucket WORKING). Pure. */
export const isLiveWorker = (s) => tagged(s, "role:worker") && (/RUNNING/i.test(s.status || "") || /WORKING/i.test(s.bucket || ""));
/** Why rule 4 must never archive this session, or "" when it may be considered. Pure. */
export function archiveGuard(s) {
  if (tagged(s, "no-archive")) return "tagged no-archive";
  if (tagged(s, "role:dispatcher")) return "role:dispatcher";
  if (!tagged(s, "role:worker")) return "no role:worker tag (not a dispatched worker)";
  if (/RUNNING/i.test(s.status || "") || /WORKING/i.test(s.bucket || "")) return "still running";
  if (/BLOCKED/i.test(s.bucket || "")) return "blocked (waiting on a human)";
  return "";
}
/** Why a child waits for a nudge: its bucket is BLOCKED or REVIEW_READY, or it is idle (not RUNNING/WORKING) and
 *  unchanged for `idleMin` minutes; "" otherwise. Only role:worker children, never no-archive/dispatcher. Pure. */
export function waitingWhy(s, now, idleMin = 20) {
  if (!tagged(s, "role:worker") || tagged(s, "no-archive") || tagged(s, "role:dispatcher") || isEndedSession(s)) return "";
  if (/RUNNING/i.test(s.status || "") || /WORKING/i.test(s.bucket || "")) return "";
  const b = /BLOCKED/i.test(s.bucket || "") ? "BLOCKED" : /REVIEW_READY/i.test(s.bucket || "") ? "REVIEW_READY" : "";
  if (b) return b;
  const idle = (now - t(s.updated_at)) / 6e4;
  return t(s.updated_at) && idle >= idleMin ? `idle ${Math.round(idle)}m` : "";
}
const NUDGE_RE = /^- nudged (session_[A-Za-z0-9]{12,}) at (\S+)/gm;
/** The Board comment's Nudges list → Map(session id → iso) of nudges younger than `everyMin` minutes. Pure. */
export function previousNudges(board, now, everyMin = 60) {
  const out = new Map();
  for (const c of board?.comments || []) {
    const body = String(c.body || "");
    if (!body.startsWith(BOARD_MARKER)) continue;
    for (const m of body.matchAll(NUDGE_RE)) if ((now - t(m[2])) / 6e4 < everyMin && !(t(out.get(m[1])) > t(m[2]))) out.set(m[1], m[2]);
  }
  return out;
}
/** Does a session title name `target` ("#12", "deploy:red") as a whole token, so "#12" never matches "#123"? Pure. */
export const titleNames = (title, target) => new RegExp(`(?<![\\w#])${String(target).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`).test(String(title || ""));
/** What a session names: PRs from its `pr` field, `pr:<n>` tags and a `CONTINUE PR #n` / `PR #n` title; issues from
 *  `issue:<n>` tags and any other `#<n>` in the title (a worker's title names its issue). Pure. */
export function sessionRefs(s) {
  const tag = (re) => (s.tags || []).map((x) => re.exec(x)).filter(Boolean).map((m) => Number(m[1]));
  const title = String(s.title || "");
  const prTitle = [...title.matchAll(/\bPR #(\d{1,6})\b/g)].map((m) => Number(m[1]));
  const prs = [...new Set([...(s.pr ? [Number(s.pr)] : []), ...tag(/^pr:(\d+)$/), ...prTitle])];
  const issues = [...new Set([...tag(/^issue:(\d+)$/), ...[...title.matchAll(/#(\d{1,6})\b/g)].map((m) => Number(m[1])).filter((n) => !prs.includes(n))])];
  return { prs, issues };
}
/** Closing declarations in prose for this repository; comments and code examples do not reserve work.
 * Syntax: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue */
function closingIssues(body, repo = DEFAULT_CONFIG.repo) {
  const text = String(body || "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, "")
    .replace(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)\b/gi, "$1#$2");
  const ids = new Set();
  for (const m of text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi)) {
    if (m[1] && m[1].toLowerCase() !== repo.toLowerCase()) continue;
    const n = Number(m[2]);
    if (Number.isSafeInteger(n) && n > 0) ids.add(n);
  }
  return [...ids];
}

/** Does session `s` name PR `p`: by its pr field, a `pr:<n>` tag or a `PR #n` title, by the PR's ```handoff `owner:`
 *  line, or by an issue the PR body closes (`Closes #n`; batch workers tag `issue:<n>` and name the PR only in the
 *  hand-off — dispatcher report 2026-10-27, #4016–#4021 planned as orphans). Pure. */
export function ownsPr(s, p, repo = DEFAULT_CONFIG.repo) {
  const refs = sessionRefs(s);
  if (refs.prs.includes(Number(p.number))) return true;
  if (String(parseHandoff(p.body)?.owner || "").includes(s.id)) return true;
  return closingIssues(p.body, repo).some((n) => refs.issues.includes(n));
}
/** A PR's last activity: its updated_at (push, comment, edit, label) or its newest comment, the dispatcher's own launch
 *  comments excluded (header: why not the head commit's committer date). Pure. */
export const activityAt = (p) => Math.max(t(p.updated_at), t(p.last_comment_at),
  ...(p.comments || []).filter((c) => !LAUNCH_RE.test(String(c.body || ""))).map((c) => t(c.created_at)));
/** A fold bot's PR (changelog-fold.yml / ratchets-fold.yml push `bot/<name>`; any `*[bot]` author): never re-owned. Pure. */
export const isBotPr = (p) => /^bot\//.test(String(p.head_ref || "")) || /\[bot\]$/.test(String(p.author || ""));
const RED = new Set(["failure", "timed_out", "startup_failure", "action_required"]);
/** A `gate` refusal whose description names the `distance` row as the ONLY row not ok (merge-gate prints
 *  `open=ok hold=ok plan=ok ci=ok distance=FAIL`; `ci=WAIT` is a CI run still going, which only waits too). land.yml's
 *  AUTO-SYNC owns that case (update-branch, throttled), so it is not a problem for a takeover worker to hand-sync
 *  (2026-10-28: ~28 of 39 `land` PRs, a takeover launch each). A row the description does not name never counts as ok. Pure. */
export function distanceOnlyRefusal(description) {
  const rows = [...String(description || "").matchAll(/\b(open|hold|plan|ci|gen|ratchets|distance)=(\S+)/g)];
  return rows.some((m) => m[1] === "distance") && rows.every((m) => (m[1] === "distance" ? m[2] === "FAIL" : m[2] === "ok" || (m[1] === "ci" && m[2] === "WAIT")));
}
/** Has the head of a `land` PR a failed check (the newest run of each check name), a failed `gate` COMMIT STATUS
 *  (land.yml posts `gate` as a status, not a check run — review 2026-10-27 F5), a `gate` pending longer than
 *  `staleH` hours (not while `mergePaused`: land.yml parks it on purpose) or a conflict? null when it only waits.
 *  A distance-only refusal waits for AUTO-SYNC (see distanceOnlyRefusal). Pure. */
export function landProblem(p, now = Date.now(), staleH = Infinity, mergePaused = false) {
  if (p.mergeable_state === "dirty") return "merge conflict";
  const gate = (p.statuses || []).filter((x) => x.context === "gate").sort((a, b) => t(b.updated_at || b.created_at) - t(a.updated_at || a.created_at))[0];
  if (gate && (gate.state === "failure" || gate.state === "error") && !distanceOnlyRefusal(gate.description)) return `gate ${gate.state}`;
  if (gate && gate.state === "pending" && !mergePaused && hoursAgo(gate.updated_at || gate.created_at, now) >= staleH)
    return `gate pending ${Math.round(hoursAgo(gate.updated_at || gate.created_at, now))}h`;
  const newest = new Map();
  for (const c of p.checks || []) { const o = newest.get(c.name); if (!o || (c.id || 0) > (o.id || 0)) newest.set(c.name, c); }
  const red = [...newest.values()].filter((c) => c.status === "completed" && RED.has(c.conclusion)).map((c) => c.name).sort();
  return red.length ? `${red.join(", ")} red` : null;
}

// ---- launch specs ------------------------------------------------------------
const excerpt = (body, lines = 6, width = 160) => String(body || "").replace(/<!--[\s\S]*?-->/g, "").split("\n")
  .map((l) => l.trim()).filter(Boolean).slice(0, lines).map((l) => (l.length > width ? l.slice(0, width - 1) + "…" : l));
export const LABEL_LINE = (repo) => `Labels: add with \`gh api -X POST repos/${repo}/issues/<n>/labels -f 'labels[]=<name>'\`, remove with \`gh api -X DELETE repos/${repo}/issues/<n>/labels/<name>\`; never MCP issue_write \`labels\` (it REPLACES the whole list).`;
export const NOBODY_LINE = "Nobody reads this chat. Never end a turn with a question or a request to the user/Bryce: decide and record it in the PR body, or add `needs-decision` (gh api POST labels) with one comment and keep going, or send_message session_id `@parent`.";
export const SUBSCRIBE_LINE = "Before ending a turn while CI runs on your head, call subscribe_pr_activity on your PR.";
/** Cursor cloud agents cannot label, claim, comment, or subscribe. The Claude tail stays the lines above. */
const cursorLines = (config) => [
  "Read docs/WORKERS.md §Per vendor (Cursor). Do not add labels, claim, post issue comments, or open issues.",
  "Symbols: get_mcp_tools once for apex-lsp, then lsp_outline, lsp_definition (read the body), lsp_callers. Grep only comments, docs, and CSS. lsp_diagnostics once after the edit, before tests.",
  "Do not spawn task_v2 scouts. Grep the defect ledger yourself (≤30 KNOWN rows).",
  "Gate, in this order, once: edit; npm run gen; the one spec pick-tests names; tooling-fast --changed --jobs=3; commit; push. Repeat the gate only when GitHub says CONFLICTING.",
  "Write the ```handoff fence yourself (branch, head, verified, not-run, next). Put run-ci, lane:cursor, and land in next:; do not apply them.",
  "Do not call subscribe_pr_activity or subscribe_github_*. A CI notification is not a new task. Stop when the draft PR is pushed and the fence is current. Do not add land.",
  `Lane: lane:cursor. Model: ${config.hosts.cursor.model}. Base: ${config.deployBranch} (branch cursor/<topic>-<hash>; draft PR at the first commit).`,
  `STOP AT: ${config.workerStopAtK}k`,
  `At the STOP AT cap, the cost cap ($${config.workerCostCapUsd} soft) or stuck: push, refresh the PR Plan and \`\`\`handoff block, name the blocker in next:, end.`,
];
const commonLines = (config, host, n) => host === "cursor" ? cursorLines(config) : [
  "Read docs/WORKERS.md and follow it.",
  NOBODY_LINE, SUBSCRIBE_LINE, LABEL_LINE(config.repo),
  `Lane label: lane:${host}. Model: ${host === "claude" ? config.model : config.hosts.cursor.model}. Base: ${config.deployBranch} (branch cursor/<topic>-<hash> from it; draft PR into it at the first commit).`,
  `STOP AT: ${config.workerStopAtK}k`,
  `At the STOP AT cap, the cost cap ($${config.workerCostCapUsd} soft) or stuck: push, refresh the PR Plan and \`\`\`handoff block, add \`needs-owner\`, send_message \`@parent\` one line naming the PR, end.`,
  `End at \`land\`: when ready-gate passes flip ready, add \`land\`, refresh the handoff block; GitHub merges ${n ? `#${n}` : "it"}, not you.`,
];
export function issuePrompt(issue, config, host) {
  const head = [`Task: #${issue.number} — ${issue.title}`, ...excerpt(issue.body)];
  if (host === "cursor") {
    return [...head,
      `Already fixed on the tip: record the commit sha in the PR body. Do not comment on or close #${issue.number}.`,
      ...commonLines(config, host)].join("\n");
  }
  return [...head,
    `Claim first: comment "claims #${issue.number} — ${host}:<your session id>" on the issue; stand down if an older claim comment exists. Put \`Closes #${issue.number}\` in the PR body.`,
    `Add \`claimed\` ONLY with \`gh api -X POST repos/${config.repo}/issues/${issue.number}/labels -f 'labels[]=claimed'\` — never MCP issue_write \`labels\` (it REPLACES the whole list).`,
    `Already fixed on the tip: comment the evidence (commit sha + repro) on #${issue.number} and close it as completed; no PR.`,
    ...commonLines(config, host)].join("\n");
}
export function continuePrompt(pr, config, host) {
  const h = parseHandoff(pr.body);
  const hand = h ? ["Hand-off block from the PR body:", ...Object.entries(h).slice(0, 8).map(([k, v]) => `  ${k}: ${v}`)]
    : ["No handoff block in the body: read its Plan, Status and Verified sections first."];
  const open = [`CONTINUE PR #${pr.number} — ${pr.title || ""}`, ...hand];
  if (host === "cursor") {
    return [...open,
      `Check out its branch (${pr.head_ref || "the PR head"}); fix the red or the conflict (merge origin via sync-pr.mjs, never rebase); push. Do not comment, label, or add land.`,
      ...commonLines(config, host, pr.number)].join("\n");
  }
  return [...open,
    `Adopt: comment "adopts PR #${pr.number} — ${host}:<your session id>" on the PR and remove \`needs-owner\` (\`gh api -X DELETE repos/${config.repo}/issues/${pr.number}/labels/needs-owner\`, never MCP issue_write \`labels\`); stand down if a newer adoption comment exists.`,
    `Check out its branch (${pr.head_ref || "the PR head"}); fix the red or the conflict (merge origin via sync-pr.mjs, never rebase); push; \`land\` when ready-gate passes.`,
    ...commonLines(config, host, pr.number)].join("\n");
}
export function deployRedPrompt(config, host) {
  if (host === "cursor") {
    return [`Deploy red: the latest pages.yml run on ${config.deployBranch} failed.`,
      "Read the failing job (Actions logs via the GitHub MCP) and fix it on a branch. Open a draft PR. Do not add labels or comment on the Board issue.",
      ...commonLines(config, host)].join("\n");
  }
  return [`Deploy red: the latest pages.yml run on ${config.deployBranch} failed.`,
    "Read the failing job (Actions logs via the GitHub MCP), fix it on a branch, draft PR labelled `deploy:red` and `run-ci`; the gate's distance row holds other merges meanwhile.",
    "Claim first: comment \"claims deploy:red — " + host + ":<your session id>\" on the Board issue; stand down if an older claim comment exists.",
    ...commonLines(config, host)].join("\n");
}
/** The create_session arguments (launch-lane.mjs's shape plus source_url and the prompt). Pure. */
export function launchSpec({ title, prompt, tags, config }) {
  return { source_url: `https://github.com/${config.repo}`, source_revision: config.deployBranch, permission_mode: "auto",
    model: config.model, title, tags: ["f1-game-dispatch", "role:worker", ...tags], prompt };
}
/** cursor-agents.mjs buildLaunchBody's shape, minus the client agentId (its `launch` mints one). Pure. */
export function cursorSpec({ title, prompt, config }) {
  return { prompt: { text: prompt }, model: { id: config.hosts.cursor.model }, name: title.slice(0, 100), env: { type: "cloud" },
    repos: [{ url: `https://github.com/${config.repo}`, startingRef: config.deployBranch }], autoCreatePR: false, workOnCurrentBranch: false };
}

// ---- the plan ----------------------------------------------------------------
/**
 * @param {{ issues?: object[], prs?: object[], deployRed?: boolean, sessions?: object[], closedPrs?: object[], closedIssues?: object[], quota?: string }} state
 * @returns {{ launches, labels, archives, skipped, board, flags }}
 */
export function planDispatch(state, config = DEFAULT_CONFIG, now = Date.now()) {
  const issues = state.issues || [], prs = state.prs || [];
  const byTitle = (title) => issues.find((i) => String(i.title || "").trim() === title) || null;
  const board = byTitle(config.boardIssueTitle), dispatch = byTitle(config.dispatchIssueTitle);
  const flags = { pause: !!config.pause || has(dispatch, "dispatch:pause"), mergePause: has(dispatch, "dispatch:merge-pause"),
    quota: state.quota || "unknown" };
  const claimH = config.launchClaimHours, launches = [], labels = [], archives = [], skipped = [];
  const skip = (what, why) => skipped.push({ what, why });
  const label = (number, add = [], remove = []) => { const r = labels.find((l) => l.number === number) || (labels.push({ number, add: [], remove: [] }), labels.at(-1)); r.add.push(...add); r.remove.push(...remove); };
  // Live workers per host: role:worker sessions RUNNING / WORKING, plus recent launch comments no listed session names.
  const sessions = state.sessions || [];
  const live = { claude: sessions.filter(isLiveWorker).length, cursor: 0 };
  const all = [...issues, ...prs];
  for (const x of all) for (const l of launchComments(x.comments)) {
    if (hoursAgo(l.at, now) >= claimH || endedLaunch(l, sessions)) continue;
    const matched = sessions.some((s) => titleNames(s.title, l.target) || String(s.title || "") === l.title);
    if (!matched) live[l.host] = (live[l.host] || 0) + 1;
  }
  const noLaunch = flags.pause ? "paused (dispatch:pause)" : flags.quota !== "allowed" ? `quota ${flags.quota}: launch nothing`
    : state.sessionsComplete === false ? (state.sessionsWhy || "the last list_sessions page says has_more: pass every page (--sessions per page) so live workers are counted")
    : null;
  const room = (host) => live[host] < (config.maxLiveWorkers[host] ?? 0);
  const launch = (kind, host, number, title, prompt, on, tags) => {
    if (noLaunch) return skip(`${kind} ${title}`, noLaunch);
    if (launches.length >= config.maxLaunchesPerRun) return skip(`${kind} ${title}`, `maxLaunchesPerRun ${config.maxLaunchesPerRun} reached`);
    if (!room(host)) return skip(`${kind} ${title}`, `maxLiveWorkers.${host} ${config.maxLiveWorkers[host]} reached (${live[host]} live)`);
    const spec = host === "cursor" ? cursorSpec({ title, prompt, config }) : launchSpec({ title, prompt, tags, config });
    live[host]++;
    launches.push({ kind, host, number, title, spec, comment: { on, body: `dispatch: launched ${host}:${title} for ${number ? `#${number}` : "deploy:red"} at ${new Date(now).toISOString()}` } });
  };
  // (3) deploy red → Board label + one fixer.
  if (state.deployRed) {
    const claimed = prs.find((p) => has(p, "deploy:red"));
    const l = board ? liveLaunch(board.comments, now, claimH, sessions) : null;
    if (board && !has(board, "deploy:red")) label(board.number, ["deploy:red"]);
    if (claimed) skip("deploy:red fixer", `PR #${claimed.number} carries deploy:red`);
    else if (!board) skip("deploy:red fixer", `no open issue titled "${config.boardIssueTitle}" to record the launch on`);
    else if (l && l.target === "deploy:red") skip("deploy:red fixer", `launched ${ageLabel(l.at, now)} ago (live claim)`);
    else launch("deploy-red", "claude", 0, "[Worker] deploy:red fixer", deployRedPrompt(config, "claude"), board?.number, ["deploy:red", "lane:claude"]);
  } else if (board && has(board, "deploy:red")) label(board.number, [], ["deploy:red"]);
  // (2) stale open PRs → needs-owner + ONE takeover.
  const recover = [...prs].sort((a, b) => (has(b, "needs-owner") - has(a, "needs-owner"))
    || (has(b, "priority") - has(a, "priority")) || activityAt(a) - activityAt(b));
  for (const p of recover) {
    const codex = has(p, "lane:codex");
    const limit = codex ? config.staleHours.codex : config.staleHours.default;
    const idleH = (now - activityAt(p)) / 3.6e6;
    const asked = has(p, "needs-owner");   // its worker (or Bryce) asked for a takeover: launch now, not after 2 h
    if (idleH < limit && !asked) continue;
    if (isBotPr(p)) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but a fold bot's PR (never re-owned)`); continue; }
    if (has(p, "land") && !landProblem(p, now, limit, flags.mergePause)) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but labelled land and waiting on CI/gate/train`); continue; }
    if (has(p, "hold") || has(p, "needs-decision")) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but ${has(p, "hold") ? "hold" : "needs-decision"}`); continue; }
    const owner = sessions.find((s) => isLiveWorker(s) && ownsPr(s, p, config.repo));
    if (owner) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but live worker ${owner.id} names it`); continue; }
    const l = liveLaunch(p.comments, now, claimH, sessions);
    if (l) { skip(`PR #${p.number}`, `takeover launched ${ageLabel(l.at, now)} ago (live claim)`); continue; }
    if (!has(p, "needs-owner")) label(p.number, ["needs-owner"]);
    launch("continue", "claude", p.number, `[Worker] CONTINUE PR #${p.number} ${p.title || ""}`.slice(0, 120), continuePrompt(p, config, "claude"), p.number, [`pr:${p.number}`, "lane:claude"]);
  }
  // (1) ready issues without a claim; none at all while the landing queue is full (backpressure: rules 2 and 3 still run).
  const landQueue = prs.filter((p) => !p.draft && has(p, "land")).length;
  const queueFull = Number.isFinite(config.landQueueMax) && landQueue >= config.landQueueMax;
  if (queueFull) skip("issue launches paused", `${landQueue} PRs waiting to land (max ${config.landQueueMax}) — land before starting more`);
  const ready = issues.filter((i) => !i.pull_request && has(i, "ready") && !has(i, "claimed") && !has(i, "blocked") && !has(i, "needs-decision") && !has(i, "epic"))
    .sort((a, b) => (has(b, "priority") - has(a, "priority")) || (t(b.updated_at) - t(a.updated_at)));
  const linkedPrs = new Map();
  for (const p of prs) {
    if (p.state && p.state !== "open") continue;
    for (const n of closingIssues(p.body, config.repo)) linkedPrs.set(n, [...(linkedPrs.get(n) || []), p.number]);
  }
  for (const i of queueFull ? [] : ready) {
    const linked = linkedPrs.get(Number(i.number));
    if (linked) { skip(`issue #${i.number}`, `already has open PR ${linked.map((n) => `#${n}`).join(", ")}`); continue; }
    const l = liveLaunch(i.comments, now, claimH, sessions);
    if (l) { skip(`issue #${i.number}`, `launched ${l.host} ${ageLabel(l.at, now)} ago (live claim)`); continue; }
    const cursor = has(i, "lane:cursor");
    if (cursor && !config.hosts.cursor.enabled) { skip(`issue #${i.number}`, "lane:cursor but hosts.cursor.enabled is false"); continue; }
    const host = cursor ? "cursor" : "claude";
    launch("issue", host, i.number, `[Worker] #${i.number} ${i.title}`.slice(0, 120), issuePrompt(i, config, host), i.number, [`issue:${i.number}`, `lane:${host}`]);
  }
  // (4) archive a session whose every PR and issue is done for archiveAfterMinutes; never one archiveGuard names, never
  // one without a claim comment.
  const claimedIds = claimedSessionIds(state);
  const closedPr = new Map((state.closedPrs || []).map((p) => [Number(p.number), p]));
  const closedIssue = new Map((state.closedIssues || []).map((i) => [Number(i.number), i]));
  const openPr = new Set(prs.map((p) => Number(p.number))), openIssue = new Set(issues.map((i) => Number(i.number)));
  for (const s of sessions) {
    if (/ARCHIVED/i.test(s.status || "")) continue;
    const refs = sessionRefs(s);
    const keep = (why) => skip(`session ${s.id}`, `keep: ${why}`);
    const guard = archiveGuard(s);
    if (guard) { keep(guard); continue; }
    if (!claimedIds.has(s.id)) { keep("no claim comment names it"); continue; }
    if (!refs.prs.length && !refs.issues.length) { keep("names no PR or issue"); continue; }
    const stillOpen = [...refs.prs.filter((n) => openPr.has(n)).map((n) => `PR #${n}`), ...refs.issues.filter((n) => openIssue.has(n)).map((n) => `#${n}`)];
    if (stillOpen.length) { keep(`${stillOpen.join(", ")} still open`); continue; }
    const done = [...refs.prs.map((n) => [`PR #${n}`, closedPr.get(n), closedPr.get(n)?.merged || closedPr.get(n)?.merged_at ? "merged" : "closed"]),
      ...refs.issues.map((n) => [`#${n}`, closedIssue.get(n), "closed"])];
    const unknown = done.filter(([, c]) => !c).map(([what]) => what);
    if (unknown.length) { keep(`${unknown.join(", ")} state unknown`); continue; }
    const youngest = Math.max(...done.map(([, c]) => t(c.closed_at || c.merged_at)));
    const min = (now - youngest) / 6e4;
    if (min < config.archiveAfterMinutes) { keep(`closed ${Math.round(min)} min ago (rule: ≥ ${config.archiveAfterMinutes})`); continue; }
    archives.push({ id: s.id, why: `${done.map(([what, , how]) => `${what} ${how}`).join(", ")} ${Math.round(min)} min ago` });
  }
  // (5) waiting children → one nudge each, at most once per nudgeEveryMinutes (the Board's Nudges list is the record).
  const prByN = new Map(prs.map((p) => [Number(p.number), p])), issueByN = new Map(issues.map((i) => [Number(i.number), i]));
  const lastNudge = previousNudges(board, now, config.nudgeEveryMinutes);
  const waiting = [], nudges = [];
  for (const s of sessions) {
    const why = waitingWhy(s, now, config.nudgeIdleMinutes);
    if (!why) continue;
    const refs = sessionRefs(s);
    const p = refs.prs.map((n) => prByN.get(n)).find(Boolean);
    const i = p ? null : refs.issues.map((n) => issueByN.get(n)).find(Boolean);
    const target = p ? `PR #${p.number}` : i ? `#${i.number}` : null;
    if (!target) continue;   // its work is closed: rule 4's business
    const x = p || i;
    if (has(x, "land") || has(x, "needs-owner") || has(x, "hold") || has(x, "needs-decision")) continue;   // landing, handed over or waiting on Bryce
    waiting.push({ id: s.id, why, target });
    if (lastNudge.has(s.id)) { skip(`nudge ${s.id}`, `nudged ${ageLabel(lastNudge.get(s.id), now)} ago (rule: one per ${config.nudgeEveryMinutes} min)`); continue; }
    nudges.push({ id: s.id, target, message: `Continue ${target}: subscribe to the PR, finish the Plan; questions go to @parent or \`needs-decision\`, never the user.` });
  }
  const recentNudges = [...lastNudge].filter(([id]) => !nudges.some((n) => n.id === id)).map(([id, at]) => ({ id, at }));
  const plan = { launches, labels, archives, nudges, waiting, recentNudges, skipped, flags, boardIssue: board?.number || null, dispatchIssue: dispatch?.number || null, live, landQueue };
  plan.board = renderBoard(state, plan, config, now);
  return plan;
}

/** (5) The Board comment: open PRs, this run's launches and archives, quota, caps and the land queue, pause flags. Pure. */
export function renderBoard(state, plan, config, now) {
  const rows = (state.prs || []).map((p) => {
    const h = parseHandoff(p.body) || {};
    return `| #${p.number} | ${String(p.title || "").replace(/\|/g, "\\|").slice(0, 60)} | ${p.draft ? "draft" : "ready"} | ${ageLabel(p.created_at || p.updated_at, now)} | ${h.owner || h.session || "-"} | ${ageLabel(new Date(activityAt(p)).toISOString(), now)} ago | ${labelsOf(p).join(", ") || "-"} |`;
  });
  const caps = `launches/run ${config.maxLaunchesPerRun}; live workers claude ${plan.live.claude}/${config.maxLiveWorkers.claude}, cursor ${plan.live.cursor}/${config.maxLiveWorkers.cursor}; cost cap $${config.workerCostCapUsd}`;
  return [BOARD_MARKER, `## Board — ${new Date(now).toISOString()}`, "",
    `quota: **${plan.flags.quota}** · pause: ${plan.flags.pause} · merge-pause: ${plan.flags.mergePause} · deploy: ${state.deployRed ? "**RED**" : "green"}`,
    `caps: ${caps} · land queue ${plan.landQueue ?? 0}/${config.landQueueMax}`, "", "| PR | title | state | age | owner | last activity | labels |", "|---|---|---|---|---|---|---|",
    ...(rows.length ? rows : ["| - | no open PRs | | | | | |"]), "",
    `### Launches this run (${plan.launches.length})`, ...(plan.launches.map((l) => `- ${l.host}: ${l.title}`) || []),
    ...(plan.launches.length ? [] : ["- none"]),
    `### Waiting children (${(plan.waiting || []).length})`, ...(plan.waiting || []).map((w) => `- ${w.id} · ${w.why} · ${w.target}`),
    ...((plan.waiting || []).length ? [] : ["- none"]),
    `### Nudges (${(plan.nudges || []).length} this run)`, ...(plan.nudges || []).map((n) => `- nudged ${n.id} at ${new Date(now).toISOString()} · ${n.target}`),
    ...(plan.recentNudges || []).map((n) => `- nudged ${n.id} at ${n.at}`),
    `### Archives (${plan.archives.length})`, ...plan.archives.map((a) => `- ${a.id}: ${a.why}`), ...(plan.archives.length ? [] : ["- none"]),
    `### Skipped (${plan.skipped.length})`, ...plan.skipped.slice(0, 40).map((s) => `- ${s.what}: ${s.why}`)].join("\n");
}

// ---- I/O: read GitHub state ----------------------------------------------------
const get = (api, p) => { const r = api(p); if (r.error) throw new Error(`${p}: ${r.error}`); return r.json; };
/** Every row of a list endpoint: `per_page=100&page=N` until a short page (review H3: one page silently dropped the
 *  Board, the Dispatch pause and old ready issues once the repo passed 100 open issues). `pick` maps a page body to
 *  its rows (check-runs wrap theirs). https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api */
export function getAll(api, p, { pick = (j) => j, maxPages = 50 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const rows = pick(get(api, `${p}${p.includes("?") ? "&" : "?"}per_page=${PAGE_SIZE}&page=${page}`)) || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
const comments = (api, n) => getAll(api, `issues/${n}/comments`).map((c) => ({ id: c.id, author: c.user?.login, body: c.body, created_at: c.created_at }));
export function readState({ api = githubApi, config, sessionTexts = [], quota = "unknown", now = Date.now() } = {}) {
  const rawIssues = getAll(api, "issues?state=open").filter((i) => !i.pull_request);
  const special = [config.boardIssueTitle, config.dispatchIssueTitle];
  // Comments: the Board/Dispatch issues, ready issues (launch claims) and claimed issues (the workers' claim comments).
  const issues = rawIssues.map((i) => {
    const want = special.includes(String(i.title).trim()) || has(i, "ready") || has(i, "claimed");
    return { number: i.number, title: i.title, body: i.body || "", labels: labelsOf(i), updated_at: i.updated_at, comments: want ? comments(api, i.number) : [] };
  });
  const prs = getAll(api, `pulls?state=open&base=${encodeURIComponent(config.deployBranch)}`).map((p) => {
    const cs = comments(api, p.number);
    const out = { number: p.number, title: p.title, draft: !!p.draft, labels: labelsOf(p), head_sha: p.head.sha, head_ref: p.head.ref, body: p.body || "",
      author: p.user?.login || "", created_at: p.created_at, updated_at: p.updated_at,
      last_comment_at: cs.filter((c) => !LAUNCH_RE.test(c.body || "")).at(-1)?.created_at || null,
      lane: labelsOf(p).find((l) => l.startsWith("lane:")) || null, comments: cs };
    if (has(p, "land")) {   // rule 2 needs to know whether a landing PR only waits (land.yml) or is red/conflicting
      out.mergeable_state = get(api, `pulls/${p.number}`)?.mergeable_state ?? null;
      out.checks = getAll(api, `commits/${p.head.sha}/check-runs`, { pick: (j) => j?.check_runs })
        .map((c) => ({ id: c.id, name: c.name, status: c.status, conclusion: c.conclusion }));
      // `gate` is a commit STATUS (land.yml), invisible to check-runs; the combined endpoint gives the newest per context.
      out.statuses = (get(api, `commits/${p.head.sha}/status`)?.statuses || [])
        .map((x) => ({ context: x.context, state: x.state, description: x.description, created_at: x.created_at, updated_at: x.updated_at }));
    }
    return out;
  });
  // The newest COMPLETED train: an in-progress run has no conclusion, which flapped deploy:red mid-incident (review L1).
  const run = get(api, `actions/workflows/pages.yml/runs?branch=${encodeURIComponent(config.deployBranch)}&status=completed&per_page=1`)?.workflow_runs?.[0];
  const deployRed = !!run && ["failure", "timed_out"].includes(run.conclusion);
  const pages = sessionTexts.length ? readSessionPages(sessionTexts) : { sessions: [], complete: true };
  const sessions = pages.sessions;
  const openPrs = new Set(prs.map((p) => p.number)), openIssues = new Set(issues.map((i) => i.number)), closedPrs = [], closedIssues = [];
  // Recently closed work (claimed issues, lane:* PRs): where a finished child's claim lives once its issue/PR closes.
  const since = new Date(now - (config.recentClosedHours ?? 48) * 3600e3).toISOString();
  for (const x of getAll(api, `issues?state=closed&since=${since}`, { pick: (j) => (Array.isArray(j) ? j : []) })) {
    if (!has(x, "claimed") && !labelsOf(x).some((l) => l.startsWith("lane:"))) continue;
    if (x.pull_request) {
      const r = api(`pulls/${x.number}`);
      if (r.json?.closed_at) closedPrs.push({ number: x.number, body: r.json.body || "", merged: !!r.json.merged_at, merged_at: r.json.merged_at, closed_at: r.json.closed_at, comments: comments(api, x.number) });
    } else closedIssues.push({ number: x.number, closed_at: x.closed_at, comments: comments(api, x.number) });
  }
  const seenClosed = new Set([...closedPrs, ...closedIssues].map((x) => x.number));
  // Closed refs only for sessions rule 4 may archive; their comments carry the claims (review H2).
  const refs = sessions.filter((s) => !archiveGuard(s) && !/ARCHIVED/i.test(s.status || "")).map(sessionRefs);
  for (const n of new Set(refs.flatMap((r) => r.prs))) {
    if (openPrs.has(n) || seenClosed.has(n)) continue;
    const r = api(`pulls/${n}`);   // only a CLOSED PR: an open one on another base read as closed in 1970 (hunt F5)
    if (r.json?.state === "closed" && r.json.closed_at) closedPrs.push({ number: n, body: r.json.body || "", merged: !!r.json.merged_at, merged_at: r.json.merged_at, closed_at: r.json.closed_at, comments: comments(api, n) });
  }
  for (const n of new Set(refs.flatMap((r) => r.issues))) {
    if (openIssues.has(n) || seenClosed.has(n)) continue;
    const r = api(`issues/${n}`);
    if (r.json?.state === "closed") closedIssues.push({ number: n, closed_at: r.json.closed_at, comments: comments(api, n) });
  }
  // No --sessions at all while GitHub names children: live workers cannot be counted, so maxLiveWorkers would be
  // bypassed (review 2026-10-27 F6). With no children there is nothing to fetch, and the cycle may launch.
  const out = { issues, prs, deployRed, sessions, sessionsComplete: pages.complete, closedPrs, closedIssues, quota };
  if (!sessionTexts.length) {
    const kids = childSessionIds(out).length;
    if (kids) Object.assign(out, { sessionsComplete: false,
      sessionsWhy: `no --sessions given but GitHub names ${kids} child session(s): run --children, get_session each, pass every result` });
  }
  return out;
}

// ---- I/O: apply the GitHub-side writes, print the session-side lines --------------
/** The RECORD_LAUNCH token for one planned launch: base64url JSON {on, host, title, target} (no shell quoting). Pure. */
export const recordToken = (l) => Buffer.from(JSON.stringify({ on: l.comment.on, host: l.host, title: l.title,
  target: l.number ? `#${l.number}` : "deploy:red" })).toString("base64url");
/** The launch comment a RECORD_LAUNCH token posts, stamped `now`: { on, body }; throws on a malformed token. Pure. */
export function recordComment(token, now, session = "") {
  let r;
  try { r = JSON.parse(Buffer.from(String(token || ""), "base64url").toString("utf8")); } catch { throw new Error("--record-launch: the token is not base64url JSON"); }
  const on = Number(r?.on);
  if (!Number.isInteger(on) || on < 1) throw new Error("--record-launch: the token names no issue/PR number");
  // A title saying "for #5" would end LAUNCH_RE's lazy title early: reword it; the target still names the session.
  const title = String(r.title || "").replace(/\s+/g, " ").replace(/ for (?=#\d|deploy:red)/g, " / ");
  if (session === SESSION_PLACEHOLDER) throw new Error(`--record-launch: replace ${SESSION_PLACEHOLDER} with the id create_session returned`);
  if (session && !/^session_[A-Za-z0-9]{12,}$/.test(session)) throw new Error("--record-launch: --session is not a session id");
  const body = `dispatch: launched ${r.host}:${title} for ${r.target} at ${new Date(now).toISOString()}${session ? ` as ${session}` : ""}`;
  const m = LAUNCH_RE.exec(body);
  if (!m || m[1] !== r.host || m[3] !== r.target) throw new Error("--record-launch: the token does not make a launch comment");
  return { on, body };
}
export function applyPlan(plan, { api = githubApi, config, log = console.log } = {}) {
  const post = (p, body, method = "POST") => { const r = api(p, { method, body }); if (r.error) throw new Error(`${method} ${p}: ${r.error}`); return r.json; };
  let writes = 0;
  for (const l of plan.labels) {
    if (l.add.length) { post(`issues/${l.number}/labels`, { labels: l.add }); writes++; }
    for (const name of l.remove) { post(`issues/${l.number}/labels/${encodeURIComponent(name)}`, undefined, "DELETE"); writes++; }
  }
  if (plan.boardIssue) {
    const mine = getAll(api, `issues/${plan.boardIssue}/comments`).find((c) => String(c.body || "").startsWith(BOARD_MARKER));
    if (mine) post(`issues/comments/${mine.id}`, { body: plan.board }, "PATCH"); else post(`issues/${plan.boardIssue}/comments`, { body: plan.board });
    writes++;
  } else log(`= board: no open issue titled "${config.boardIssueTitle}" — the Board comment was not written`);
  // The launch comment (the claim) is NOT posted here: RECORD_LAUNCH posts it once the session exists (review M4).
  for (const l of plan.launches) {
    log(`${l.host === "cursor" ? "CURSOR_LAUNCH" : "CREATE_SESSION"} ${JSON.stringify(l.spec)}`);
    if (l.comment.on) log(`RECORD_LAUNCH node tools/ci/dispatch.mjs --record-launch ${recordToken(l)} --session ${SESSION_PLACEHOLDER}`);
  }
  for (const n of plan.nudges || []) log(`NUDGE_SESSION ${n.id} ${n.message}`);
  for (const a of plan.archives) log(`ARCHIVE_SESSION ${a.id}`);
  return writes;
}

export function renderPlan(plan) {
  const out = [];
  for (const l of plan.launches) out.push(`LAUNCH ${l.host} ${l.title}  (comment on #${l.comment.on || "?"})`);
  for (const l of plan.labels) out.push(`LABEL #${l.number} ${l.add.map((a) => `+${a}`).join(" ")} ${l.remove.map((r) => `-${r}`).join(" ")}`.trim());
  for (const n of plan.nudges || []) out.push(`NUDGE ${n.id}  ${n.target}`);
  for (const a of plan.archives) out.push(`ARCHIVE ${a.id}  ${a.why}`);
  for (const s of plan.skipped) out.push(`SKIP ${s.what}: ${s.why}`);
  return out;
}

const USAGE = `usage: node tools/ci/dispatch.mjs --children                      # GET_SESSION <id> per dispatched worker GitHub names
       node tools/ci/dispatch.mjs (--plan | --apply) [--json] [--sessions <saved get_session result>]...
                                  [--quota allowed|allowed_warning|rejected] [--now <iso>] [--config <file>]
       node tools/ci/dispatch.mjs --record-launch <token> --session <new session id>
  --plan   reads GitHub (GETs only) and prints the plan: launches, labels, archives, skips, and the Board markdown (--json: one object)
  --apply  performs the GitHub-side writes (labels, the Board comment), then prints one line per session-side action:
           CREATE_SESSION <json> | CURSOR_LAUNCH <json>, each followed by RECORD_LAUNCH <cmd> | NUDGE_SESSION <id> <msg> |
           ARCHIVE_SESSION <id>
  --record-launch  posts the launch comment (the 2 h claim); run it only after that launch succeeded
  --sessions repeats: one saved get_session result per --children id (a list_sessions page still parses; a last page
           with has_more launches nothing). Sessions no claim names are never counted or archived.
  The scheduled task runs --apply and executes those lines with the claude-code-remote tools (header of this file).`;

export function main(argv, { api = githubApi, read = fs.readFileSync, log = console.log, now = Date.now } = {}) {
  exitIfHelp(argv, USAGE);
  const val = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes("--record-launch")) {
    let c;
    try { c = recordComment(val("--record-launch"), now(), val("--session") || ""); } catch (e) { log(`dispatch: ${e.message}`); return 1; }
    const r = api(`issues/${c.on}/comments`, { method: "POST", body: { body: c.body } });
    if (r.error) { log(`dispatch: POST issues/${c.on}/comments: ${r.error}`); return 3; }
    log(`= launch recorded on #${c.on}: ${c.body}`);
    return 0;
  }
  const plan = argv.includes("--plan"), apply = argv.includes("--apply"), children = argv.includes("--children");
  if ((plan ? 1 : 0) + (apply ? 1 : 0) + (children ? 1 : 0) !== 1) { log(USAGE); return 1; }
  const config = loadConfig(val("--config") || CONFIG_FILE, read);
  const quota = val("--quota") || "unknown";
  const when = val("--now") ? Date.parse(val("--now")) : now();
  if (!Number.isFinite(when)) { log(`dispatch: --now ${val("--now")} is not an ISO time`); return 1; }
  let state;
  const sessionFiles = argv.flatMap((a, i) => (a === "--sessions" && argv[i + 1] ? [argv[i + 1]] : []));
  try { state = readState({ api, config, sessionTexts: sessionFiles.map((f) => read(f, "utf8")), quota, now: when }); }
  catch (e) { log(`dispatch: ${e.message}`); return 3; }
  if (children) {   // step 1 of the cycle: the only sessions to look up (get_session each, save, pass as --sessions)
    const ids = childSessionIds(state), cap = 3 * ((config.maxLiveWorkers.claude ?? 0) + (config.maxLiveWorkers.cursor ?? 0));
    for (const id of ids) log(`GET_SESSION ${id}`);
    log(`= dispatch children: ${ids.length} session(s) named on open or recently closed work${ids.length > cap ? ` — over ${cap}: check for stale claims` : ""}`);
    return 0;
  }
  const p = planDispatch(state, config, when);
  if (apply) {
    let writes;
    try { writes = applyPlan(p, { api, config, log }); } catch (e) { log(`dispatch: ${e.message}`); return 3; }
    log(`= dispatch applied: ${p.launches.length} launches, ${p.nudges.length} nudges, ${p.archives.length} archives, ${writes} GitHub writes; quota ${p.flags.quota}${p.flags.pause ? "; PAUSED" : ""}`);
    return 0;
  }
  if (argv.includes("--json")) log(JSON.stringify(p, null, 2));
  else { for (const line of renderPlan(p)) log(line); log(""); log(p.board); log(`= dispatch plan: ${p.launches.length} launches, ${p.labels.length} label edits, ${p.archives.length} archives, ${p.skipped.length} skips; quota ${p.flags.quota}${p.flags.pause ? "; PAUSED" : ""}`); }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
