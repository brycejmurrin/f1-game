#!/usr/bin/env node
// dispatch.mjs — the dispatcher that GitHub Actions runs: a pure plan over GitHub state, then GitHub writes and worker fires.
// @doc The Actions dispatcher: launches, takeovers, deploy:red fixers, nudges, digests, the Board; --fire starts workers.
// @section runner
// @skill steward
//
// Design (docs/plans/2026-11-03-agent-surface-reset.md §4.1, §4.3, §5): GITHUB IS THE DISPATCHER; THE CLOUD ONLY RUNS
// WORKERS. `.github/workflows/dispatch.yml` runs this file hourly and on issue / PR / check-suite / comment events, from
// the DEPLOY branch's checkout (a PR cannot change the dispatcher that judges it), with the Action's own GITHUB_TOKEN.
// There is no persistent dispatcher session, no Board lock, no PAUSE/RESUME of a scheduled task, no launch receipt, no
// session listing (`--children`) and no `@parent`: every write is a label or a comment, every launch is one HTTP POST.
//
//   node tools/ci/dispatch.mjs --plan [--json] [--now <iso>] [--config <file>]   # GETs only; prints the plan + Board
//   node tools/ci/dispatch.mjs --apply [--fire] [--now <iso>] [--config <file>]  # labels, Board, digests, nudges, launches
//
// `planDispatch(state, config, now)` is PURE and tested; `readState` fetches with github-api.mjs (GETs only);
// `applyPlan` performs the writes. A launch is one fire of Bryce's "Apex worker" scheduled task (its saved prompt is
// tools/ci/worker-prompt.md) with a ONE-LINE ADDRESS as the fire text — exactly one of
//     ISSUE <n>   |   CONTINUE PR <n>   |   DEPLOY-RED <pages.yml run id>
// The worker reads the issue / PR from GitHub itself; the text is an address, never instructions (the platform wraps it
// in <routine-fire-payload> as untrusted data, so the saved prompt opts in to reading it as an address only).
//   POST ${WORKER_FIRE_URL}  Authorization: Bearer ${WORKER_FIRE_TOKEN}  anthropic-version: 2026-10-21
//   body {"text": "<address>"}  → 200 {"type":"routine_fire","claude_code_session_id":"session_…"}
//   https://platform.claude.com/docs/en/api/claude-code/routines-fire (read 2026-11-03: headers, body, 200 shape,
//   429 with Retry-After, 30 fires/h per task, no idempotency key) and https://code.claude.com/docs/en/routines
//   (read 2026-11-03: the <routine-fire-payload> wrapper, skills committed to the repo load in the fired session).
// The claim comment (`dispatch: launched claude:<title> for #<n> at <iso> as <session id>`) is posted ONLY after a 200,
// so a refused fire leaves no phantom claim; a non-200 prints `= fire failed <status>` and posts nothing. Without
// WORKER_FIRE_URL / WORKER_FIRE_TOKEN, --apply still writes labels and the Board and prints `= fire skipped: …` per launch.
// Without `--fire`, --apply prints `LAUNCH <address>` lines and fires nothing (the 24 h plan-only soak, plan §7 Wave 1A).
//
// Authority is PROVENANCE, not quoted relays (tools/ci/lib/provenance.mjs): `priority`, `dispatch:pause` and
// `dispatch:merge-pause` count only when the newest `labeled` event is Bryce's own click (actor brycejmurrin,
// performed_via_github_app null); an agent's label is reported in the Board and ignored. `needs-decision` is cleared
// only by a Bryce `decision:` comment newer than the label (his own unlabel clears it by itself); a `needs-decision` an
// agent added gets ONE digest comment starting with `@brycejmurrin` from the Action's token (an agent writing as
// brycejmurrin never notifies his phone), and no second digest while the previous one is the latest bot comment.
//
// Trust: only this repository's own PRs by the owner or a `*[bot]` (no fork head) are re-owned or nudged; a `ready`
// issue launches only when the owner's account authored it or added `ready` (in person or through an agent); launch
// claims and nudges count only when github-actions[bot] wrote them and their stamp is not in the future; the Board and
// Dispatch issues are the numbers pinned in dispatch.json (`boardIssue`, `dispatchIssue`).
// Task rules: (1) `ready` issues without `claimed` → one worker each (a `batch` issue is the ONE launch for its
// `batched` members, and waits for what its "## Merge order" lands after), `priority` (Bryce's) first, newest next, within
// maxLaunchesPerRun, maxLiveWorkers (launch comments younger than launchClaimHours) and maxLaunchesPerDay (launch
// comments in the last 24 h), and none at all while landQueueMax or more open non-draft PRs carry `land` (LANDING
// BACKPRESSURE; rules 2 and 3 drain the queue and are never paused); (2) an open PR with no push and no comment for
// staleHours (6 for lane:codex), or one already labelled `needs-owner`, no `hold`/`needs-decision` → `needs-owner` +
// ONE `CONTINUE PR <n>` worker, unless a live worker's claim, foreign activity (a commit by another author in
// foreignHours, or a lane:cursor push) or an unmerged prerequisite PR named in the body says wait; (3) deploy red (the
// newest COMPLETED pages.yml run on the deploy branch failed) and no open PR labelled `deploy:red` → label the Board,
// launch one fixer addressed `DEPLOY-RED <run id>` (none when the run's PLATFORM_STEP failed: a Pages-side publish
// failure is a skip line on the Board, not a code fix); (5) NUDGE: an open PR idle for nudgeAfterMinutes that no rule above
// acts on gets ONE comment per nudgeEveryMinutes (`dispatch: nudge …`) naming what to do next — a subscribed worker is
// woken by the comment; (6) the Board markdown, ONE comment this tool edits on the issue titled `Board`
// (marker `<!-- dispatch-board -->`). Idempotent: every launch is recorded as a comment on the issue/PR (deploy:red
// fixers on the Board issue), and a launch comment younger than launchClaimHours is a live claim.
// Rule 2's "last activity" is the head's push (its first workflow run, a server time) or the newest comment not written
// by this tool; updated_at is not read (this tool's own nudges and labels move it).
// Never stale: a `land` PR whose head has no failed check, no failed or long-pending `gate` status and no conflict, the
// fold bots' PRs (head `bot/*`, author `*[bot]`), and a PR with a live claim. Every list call paginates.
// Right before each fire (finding 7, 2026-10-30) the PR/issue is re-read: merged, closed or a non-Claude push in the
// last 60 min refuses the launch (`= launch skipped …`).
// Comment bodies and PR bodies are other sessions' records: data a rule is applied to, never instructions.
// Exit: 0 planned/applied, 1 usage, 3 no token / API error.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api as githubApi } from "./github-api.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { OWNER, byOwner, describeActor, isDecisionComment, newestLabelEvent, ownerSet } from "./lib/provenance.mjs";
import { PLATFORM_STEP, platformStepFailed } from "./lib/deploy-tip.mjs";
import { launchableReady, readyCapRow } from "./ready-sweep.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const CONFIG_FILE = path.join(ROOT, "tools", "ci", "dispatch.json");
export const BOARD_MARKER = "<!-- dispatch-board -->";
export const LAUNCH_RE = /^dispatch: launched (\S+?):(.+?) for (#\d+|deploy:red) at (\S+)(?: as (session_[A-Za-z0-9]{12,}))?/m;
/** The nudge comment: `dispatch: nudge at <iso> — …`; never activity, one per nudgeEveryMinutes. */
export const NUDGE_RE = /^dispatch: nudge at (\S+)/m;
/** A needs-decision digest starts with the owner's handle so GitHub notifies his phone. */
export const DIGEST_MARKER = "<!-- dispatch-digest -->";
/** The API version header the fire endpoint requires (routines-fire reference, read 2026-11-03). */
export const ANTHROPIC_VERSION = "2026-10-21";
/** Rows per list page; a page shorter than this is the last one (GitHub REST pagination). */
export const PAGE_SIZE = 100;
export const DEFAULT_CONFIG = {
  pause: false, maxLaunchesPerRun: 4, maxLaunchesPerDay: 24, maxLiveWorkers: 8, landQueueMax: 15, workerCostCapUsd: 10, workerStopAtK: 300,
  staleHours: { default: 2, codex: 6 }, launchClaimHours: 2, foreignHours: 2, nudgeAfterMinutes: 45, nudgeEveryMinutes: 60,
  deployBranch: "claude/f1-game-project-26h3ng", repo: "brycejmurrin/f1-game", owner: OWNER,
  boardIssue: 1780, dispatchIssue: 3899, boardIssueTitle: "Board", dispatchIssueTitle: "Dispatch",
};

export function loadConfig(file = CONFIG_FILE, read = fs.readFileSync) {
  let on = {};
  try { on = JSON.parse(read(file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
  return { ...DEFAULT_CONFIG, ...on, staleHours: { ...DEFAULT_CONFIG.staleHours, ...on.staleHours } };
}

// ---- pure helpers ----------------------------------------------------------
export const labelsOf = (x) => (x?.labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
const has = (x, name) => labelsOf(x).includes(name);
const t = (iso) => Date.parse(iso || "") || 0;
const hoursAgo = (iso, now) => (now - t(iso)) / 3.6e6;
export const ageLabel = (iso, now) => { const h = hoursAgo(iso, now); return !t(iso) ? "?" : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`; };
/** This tool's own comments (launch claims, nudges, digests, the Board) are never activity. Pure. */
export const isDispatchComment = (body) => { const b = String(body || ""); return LAUNCH_RE.test(b) || NUDGE_RE.test(b) || b.startsWith(BOARD_MARKER) || b.includes(DIGEST_MARKER); };
const isBot = (login) => /\[bot\]$/.test(String(login || ""));
/** The Action's own identity: the only author whose launch claims and nudges count. */
export const DISPATCH_BOT = "github-actions[bot]";
/** A claim or nudge stamped more than this far ahead of `now` is not a claim (clock skew allowance). */
export const FUTURE_SKEW_MS = 5 * 60e3;
/** A comment this tool wrote: github-actions[bot] and one of its markers. Pure. */
export const isOwnComment = (c) => c?.author === DISPATCH_BOT && isDispatchComment(c.body);

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

/** The dispatcher's launch comments on one object (github-actions[bot] only): [{host, title, target, at, session}],
 *  newest first. Pure. */
export function launchComments(comments) {
  return (comments || []).filter((c) => c?.author === DISPATCH_BOT).map((c) => LAUNCH_RE.exec(String(c.body || ""))).filter(Boolean)
    .map((m) => ({ host: m[1], title: m[2], target: m[3], at: m[4], session: m[5] || null })).sort((a, b) => t(b.at) - t(a.at));
}
/** Is a stamp inside [now - hours, now + FUTURE_SKEW_MS]? A future stamp is never live. Pure. */
const within = (iso, now, hours) => !!t(iso) && t(iso) <= now + FUTURE_SKEW_MS && hoursAgo(iso, now) < hours;
/** The newest launch comment younger than `hours` (a live claim), or null. Pure. */
export const liveLaunch = (comments, now, hours) => launchComments(comments).find((l) => within(l.at, now, hours)) || null;
/** Launch comments younger than `hours` across every issue and PR of the state (the live-worker and per-day counts). Pure. */
export const launchedWithin = (state, now, hours) => [...(state.issues || []), ...(state.prs || [])]
  .flatMap((x) => launchComments(x.comments)).filter((l) => within(l.at, now, hours)).length;
/** The newest nudge comment (github-actions[bot] only) younger than `minutes`, or null. Pure. */
export function recentNudge(comments, now, minutes) {
  const at = (comments || []).filter((c) => c?.author === DISPATCH_BOT).map((c) => NUDGE_RE.exec(String(c.body || ""))?.[1])
    .filter((iso) => iso && t(iso) <= now + FUTURE_SKEW_MS).sort((a, b) => t(b) - t(a))[0];
  return at && (now - t(at)) / 6e4 < minutes ? at : null;
}

/** Closing declarations in prose for this repository; comments and code examples do not reserve work.
 * Syntax: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue */
export function closingIssues(body, repo = DEFAULT_CONFIG.repo) {
  let fence = null, paragraph = false, listIndent = 0;
  const prose = String(body || "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).map((line) => {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      paragraph = false;
      return "";
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open && (open[1][0] !== "`" || !open[2].includes("`"))) { fence = open[1]; paragraph = false; return ""; }
    if (!line.trim()) { paragraph = false; return ""; }
    const expanded = line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length));
    const indent = expanded.match(/^ */)[0].length;
    if (indent < listIndent) listIndent = 0;
    const item = expanded.match(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/);
    if (item) listIndent = item[0].length;
    // Indented code cannot interrupt prose. List continuation indentation belongs to the list, not its code.
    if (!paragraph && !item && indent >= listIndent + 4) return "";
    paragraph = !/^ {0,3}(?:#{1,6}\s|(?:[-*_]\s*){3,}$)/.test(line);
    return line;
  }).join("\n");
  const text = prose
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

/** A PR's last activity: the head's push (`pushed_at`, readState: the head's first workflow run) or its newest comment
 *  this tool did not write; the PR's creation when neither is known. Not updated_at: this tool's own nudge comments and
 *  label writes move it. Pure. */
export const activityAt = (p) => Math.max(t(p.pushed_at), t(p.created_at), t(p.last_comment_at),
  ...(p.comments || []).filter((c) => !isOwnComment(c)).map((c) => t(c.created_at)));
/** A fold bot's PR (changelog-fold.yml / ratchets-fold.yml push `bot/<name>`; any `*[bot]` author): never re-owned. Pure. */
export const isBotPr = (p) => /^bot\//.test(String(p.head_ref || "")) || isBot(p.author);
/** Why the dispatcher must not act on PR `p`, or "": its head is not in `repo` (a fork) or its author is neither the
 *  owner nor a `*[bot]`. Pure. */
export function untrustedPr(p, repo, owner) {
  if (String(p.head_repo || "").toLowerCase() !== String(repo || "").toLowerCase()) return `head in ${p.head_repo || "an unknown repository"}, not ${repo}`;
  if (p.author !== owner && !isBot(p.author)) return `author ${p.author || "unknown"} is not ${owner}`;
  return "";
}
/** Did the owner's account add `ready` to issue `i` (newest `labeled ready`, any app) or author it? Pure. */
export function trustedReady(i, owner) {
  if (i.author && i.author === owner) return true;
  const e = (i.events || []).filter((x) => x?.event === "labeled" && x.label?.name === "ready").sort((a, b) => t(a.created_at) - t(b.created_at)).at(-1);
  return !!e && e.actor?.login === owner;
}

const PREREQ_RES = [/\b(?:after|once|when)\s+(?:PR\s+)?#(\d{1,6})\s+(?:merges|merged|is merged|lands|has merged)\b/gi,
  /\b(?:builds?\s+on|depends?\s+on|blocked\s+by|stacked\s+on|requires|waits?\s+(?:for|on))\s+(?:PR\s+)?#(\d{1,6})\b/gi];
/** Open PRs (of `prs`) that PR `p`'s body or Plan names as a prerequisite ("after #N merges", "builds on #N"). Pure. */
export function unmergedPrerequisites(p, prs) {
  const text = String(p.body || "").replace(/<!--[\s\S]*?-->/g, "").replace(/```[\s\S]*?```/g, "");
  const open = new Set(prs.filter((x) => !x.state || x.state === "open").map((x) => Number(x.number)));
  const out = new Set();
  for (const re of PREREQ_RES) for (const m of text.matchAll(re)) { const n = Number(m[1]); if (n !== Number(p.number) && open.has(n)) out.add(n); }
  return [...out].sort((a, b) => a - b);
}
const sectionOf = (body, name) => {
  const out = []; let on = false;
  for (const line of String(body || "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    if (/^##\s/.test(line)) on = line.replace(/^##\s+/, "").trim().toLowerCase() === name;
    else if (on) out.push(line);
  }
  return out;
};
const nums = (text) => [...String(text).matchAll(/#(\d{1,6})\b/g)].map((m) => Number(m[1]));
/** A batch issue's members: the first `#n` of each top-level bullet under "## Members" (issue-batching's body). Pure. */
export function batchMembers(body) {
  return [...new Set(sectionOf(body, "members").map((l) => /^[-*]\s+#(\d{1,6})\b/.exec(l)?.[1]).filter(Boolean).map(Number))];
}
/** What a batch issue's "## Merge order" says it lands after: every `#n` in the bullets under a "lands after" line,
 *  parentheticals dropped ("#5118 (batch perf-tooling) (#5056 row 1)" names #5118 only). Pure. */
export function batchLandsAfter(body) {
  const out = new Set(); let on = false;
  for (const line of sectionOf(body, "merge order")) {
    if (/^[-*]\s/.test(line)) { if (on) for (const n of nums(line.replace(/\([^()]*\)/g, ""))) out.add(n); }
    else if (line.trim()) on = /\blands\s+\**after\b/i.test(line);
  }
  return [...out];
}
/** The entries of `batchLandsAfter` that have NOT landed: an open PR, an open issue, or an open batch issue with a
 *  member still open (a batch whose members are all closed has landed even while its own issue is open). `issues` and
 *  `prs` hold only OPEN ones, so a number in neither has landed or closed. Pure. */
export function batchWaits(batch, issues, prs) {
  const openIssue = new Map(issues.map((i) => [Number(i.number), i]));
  const openPr = new Set(prs.filter((p) => !p.state || p.state === "open").map((p) => Number(p.number)));
  return batchLandsAfter(batch.body).filter((n) => {
    if (n === Number(batch.number)) return false;
    if (openPr.has(n)) return true;
    const i = openIssue.get(n);
    if (!i) return false;
    const ms = has(i, "batch") ? batchMembers(i.body) : [];
    return ms.length ? ms.some((m) => openIssue.has(m)) : true;
  }).sort((a, b) => a - b);
}
/** Why a takeover would collide with a live pusher, or "": a commit in the last `hours` by someone who is neither the PR's
 *  author nor a Claude identity, or a lane:cursor PR with a push in that window (the newest commit date; updated_at when the
 *  commits were not fetched). #4187: the worker lost 57 min to a live Cursor agent. Pure. */
export function foreignActivity(p, now, hours = 2) {
  const recent = (iso) => hoursAgo(iso, now) < hours;
  const own = String(p.author || "").toLowerCase();
  const foreign = (p.commits || []).find((c) => recent(c.at) && !isBot(c.author) && (c.author || "").toLowerCase() !== own && !/claude|anthropic/i.test(c.author || ""));
  if (foreign) return `a commit by ${foreign.author || "another author"} ${ageLabel(foreign.at, now)} ago`;
  if (has(p, "lane:cursor")) {
    const push = Math.max(0, ...(p.commits || []).map((c) => t(c.at)));
    if (recent(push ? new Date(push).toISOString() : p.updated_at)) return "lane:cursor with a push in the last " + hours + " h";
  }
  return "";
}
const RED = new Set(["failure", "timed_out", "startup_failure", "action_required"]);
/** Has the head of a `land` PR a failed check (the newest run of each check name), a failed `gate` COMMIT STATUS
 *  (land.yml posts `gate` as a status, not a check run), a `gate` pending longer than `staleH` hours (not while
 *  `mergePaused`: land.yml parks it on purpose) or a conflict? null when it only waits. Pure. */
export function landProblem(p, now = Date.now(), staleH = Infinity, mergePaused = false) {
  if (p.mergeable_state === "dirty") return "merge conflict";
  const gate = (p.statuses || []).filter((x) => x.context === "gate").sort((a, b) => t(b.updated_at || b.created_at) - t(a.updated_at || a.created_at))[0];
  if (gate && (gate.state === "failure" || gate.state === "error")) return `gate ${gate.state}`;
  if (gate && gate.state === "pending" && !mergePaused && hoursAgo(gate.updated_at || gate.created_at, now) >= staleH)
    return `gate pending ${Math.round(hoursAgo(gate.updated_at || gate.created_at, now))}h`;
  const newest = new Map();
  for (const c of p.checks || []) { const o = newest.get(c.name); if (!o || (c.id || 0) > (o.id || 0)) newest.set(c.name, c); }
  const red = [...newest.values()].filter((c) => c.status === "completed" && RED.has(c.conclusion)).map((c) => c.name).sort();
  return red.length ? `${red.join(", ")} red` : null;
}

// ---- provenance over one issue / PR ------------------------------------------------------------------------------
/** The newest `labeled needs-decision` event and whether an owner `decision:` comment is newer than it. Pure.
 *  @returns {{ labeledAt: string|null, byAgent: boolean, decided: object|null }} */
export function decisionState(x, owner) {
  const ev = newestLabelEvent(x.events, "needs-decision");
  const labeledAt = ev?.event === "labeled" ? ev.created_at : null;
  const decided = (x.comments || []).filter((c) => isDecisionComment(c, owner) && (!labeledAt || t(c.created_at) >= t(labeledAt)))
    .sort((a, b) => t(b.created_at) - t(a.created_at))[0] || null;
  return { labeledAt, byAgent: !!ev && ev.event === "labeled" && !byOwner(ev, owner), actor: ev ? describeActor(ev) : "", decided };
}
/** Is the latest comment by a `*[bot]` author on `x` already a digest? Then no second one. Pure. */
export const digestIsLatestBot = (x) => { const bots = (x.comments || []).filter((c) => isBot(c.author)); const last = bots.at(-1); return !!last && String(last.body || "").includes(DIGEST_MARKER); };
/** The one `@owner` digest for an agent-set `needs-decision`: the title, the labeler and the newest non-bot comment. Pure. */
export function digestBody(x, owner, kind) {
  const asked = [...(x.comments || [])].reverse().find((c) => !isBot(c.author) && !isDispatchComment(c.body));
  const quote = asked ? String(asked.body || "").replace(/<!--[\s\S]*?-->/g, "").trim().split("\n").filter(Boolean).slice(0, 6).map((l) => `> ${l.length > 200 ? l.slice(0, 199) + "…" : l}`).join("\n") : "> (no comment states the question: read the body)";
  return [`@${owner} decision needed on ${kind} #${x.number} — ${String(x.title || "").slice(0, 100)}`, "", quote, "",
    "Answer with a comment that starts `decision:` (the dispatcher then removes `needs-decision` and the worker continues), or remove the label yourself.",
    DIGEST_MARKER].join("\n");
}

// ---- the plan ----------------------------------------------------------------
/** The fire text for one launch: exactly `ISSUE <n>`, `CONTINUE PR <n>` or `DEPLOY-RED <run id>`. Pure. */
export const addressOf = (l) => l.kind === "issue" ? `ISSUE ${l.number}` : l.kind === "continue" ? `CONTINUE PR ${l.number}` : `DEPLOY-RED ${l.runId || "unknown"}`;
/** The claim comment, stamped `now`, naming the session the fire returned. Pure. */
export const claimComment = (l, now, session) => `dispatch: launched claude:${l.title} for ${l.number ? `#${l.number}` : "deploy:red"} at ${new Date(now).toISOString()}${session ? ` as ${session}` : ""}`;

/**
 * @param {{ issues?: object[], prs?: object[], deployRed?: boolean, deployRunId?: number|string|null, deployPlatform?: boolean }} state
 * @returns {{ launches, labels, digests, nudges, skipped, board, flags, live, launchedToday, landQueue, boardIssue, dispatchIssue }}
 */
export function planDispatch(state, config = DEFAULT_CONFIG, now = Date.now()) {
  const issues = state.issues || [], owner = config.owner || OWNER;
  // A pinned number names the control issue; unpinned, the title must match and the author be the owner or a bot.
  const control = (number, title) => (number
    ? issues.find((i) => Number(i.number) === Number(number))
    : issues.find((i) => String(i.title || "").trim() === title && (i.author === owner || isBot(i.author)))) || null;
  const board = control(config.boardIssue, config.boardIssueTitle), dispatch = control(config.dispatchIssue, config.dispatchIssueTitle);
  const ownerLabel = (x, name) => !!x && ownerSet(x.labels, x.events, name, owner);
  const ignored = [];   // labels present but not Bryce's own click: reported, not honoured
  const why = (x, name) => { const e = newestLabelEvent(x.events, name); return `${name} on #${x.number} (${e ? describeActor(e) : "no label event fetched"})`; };
  const steer = (x, name) => { if (!x) return false; if (ownerLabel(x, name)) return true; if (has(x, name)) ignored.push(why(x, name)); return false; };
  const flags = { pause: !!config.pause || steer(dispatch, "dispatch:pause"), mergePause: steer(dispatch, "dispatch:merge-pause") };
  const claimH = config.launchClaimHours, launches = [], labels = [], digests = [], nudges = [], skipped = [];
  const skip = (what, why) => skipped.push({ what, why });
  const prs = (state.prs || []).filter((p) => { const u = untrustedPr(p, config.repo, owner); if (u) skip(`PR #${p.number}`, `not acted on: ${u}`); return !u; });
  const label = (number, add = [], remove = []) => { const r = labels.find((l) => l.number === number) || (labels.push({ number, add: [], remove: [] }), labels.at(-1)); r.add.push(...add); r.remove.push(...remove); };
  // Live workers = launch comments younger than launchClaimHours; the day's launches = those younger than 24 h.
  let live = launchedWithin(state, now, claimH);
  const launchedToday = launchedWithin(state, now, 24);
  const noLaunch = flags.pause ? "paused (dispatch:pause)" : null;
  const launch = (kind, number, title, on, extra = {}) => {
    if (noLaunch) return skip(`${kind} ${title}`, noLaunch);
    if (launches.length >= config.maxLaunchesPerRun) return skip(`${kind} ${title}`, `maxLaunchesPerRun ${config.maxLaunchesPerRun} reached`);
    if (launchedToday + launches.length >= config.maxLaunchesPerDay) return skip(`${kind} ${title}`, `maxLaunchesPerDay ${config.maxLaunchesPerDay} reached (${launchedToday} launched in the last 24 h)`);
    if (live >= config.maxLiveWorkers) return skip(`${kind} ${title}`, `maxLiveWorkers ${config.maxLiveWorkers} reached (${live} live claims)`);
    live++;
    const l = { kind, number, title, on, ...extra };
    l.address = addressOf(l);
    launches.push(l);
  };
  // needs-decision: clear on a Bryce `decision:` comment; digest once when an agent set it and nothing answered.
  for (const x of [...issues, ...prs]) {
    if (!has(x, "needs-decision")) continue;
    const kind = x.head_sha !== undefined || x.draft !== undefined ? "PR" : "issue";
    const d = decisionState(x, owner);
    if (d.decided) { label(x.number, [], ["needs-decision"]); skip(`needs-decision #${x.number}`, `cleared: ${owner} decided ${ageLabel(d.decided.created_at, now)} ago`); continue; }
    if (!d.byAgent) continue;   // Bryce's own needs-decision, or no event fetched: nothing to announce
    if (digestIsLatestBot(x)) { skip(`digest #${x.number}`, "the previous digest is still the latest bot comment"); continue; }
    digests.push({ on: x.number, body: digestBody(x, owner, kind) });
  }
  // (3) deploy red → Board label + one fixer.
  if (state.deployRed) {
    const claimed = prs.find((p) => has(p, "deploy:red"));
    const l = board ? liveLaunch(board.comments, now, claimH) : null;
    if (board && !has(board, "deploy:red")) label(board.number, ["deploy:red"]);
    if (state.deployPlatform) skip("deploy:red fixer", `pages.yml run ${state.deployRunId || "?"} failed on the Pages side (step "${PLATFORM_STEP}" failed: both publish attempts): no fixer, re-run the train`);
    else if (claimed) skip("deploy:red fixer", `PR #${claimed.number} carries deploy:red`);
    else if (!board) skip("deploy:red fixer", `no open Board issue (#${config.boardIssue || "?"}) to record the launch on`);
    else if (l && l.target === "deploy:red") skip("deploy:red fixer", `launched ${ageLabel(l.at, now)} ago (live claim)`);
    else launch("deploy-red", 0, "[Worker] deploy:red fixer", board.number, { runId: state.deployRunId || null });
  } else if (board && has(board, "deploy:red")) label(board.number, [], ["deploy:red"]);
  // (2) stale open PRs → needs-owner + ONE takeover. (5) idle PRs → one nudge per nudgeEveryMinutes.
  const recover = [...prs].sort((a, b) => (has(b, "needs-owner") - has(a, "needs-owner"))
    || (ownerLabel(b, "priority") - ownerLabel(a, "priority")) || activityAt(a) - activityAt(b));
  for (const p of recover) {
    const limit = has(p, "lane:codex") ? config.staleHours.codex : config.staleHours.default;
    const idleH = (now - activityAt(p)) / 3.6e6, idleM = Math.round(idleH * 60);
    const asked = has(p, "needs-owner");   // its worker asked for a takeover: launch now, not after 2 h
    if (isBotPr(p) || has(p, "hold") || has(p, "needs-decision")) {
      if (idleH >= limit || asked) skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but ${isBotPr(p) ? "a fold bot's PR (never re-owned)" : has(p, "hold") ? "hold" : "needs-decision"}`);
      continue;
    }
    const l = liveLaunch(p.comments, now, claimH);
    if (idleH < limit && !asked) {
      // (5) a nudge: idle past nudgeAfterMinutes, not landing (CI/gate/train work), no nudge in the last nudgeEveryMinutes.
      if (idleM < (config.nudgeAfterMinutes ?? 45) || (has(p, "land") && !landProblem(p, now, limit, flags.mergePause))) continue;
      const last = recentNudge(p.comments, now, config.nudgeEveryMinutes);
      if (last) { skip(`nudge PR #${p.number}`, `nudged ${ageLabel(last, now)} ago (rule: one per ${config.nudgeEveryMinutes} min)`); continue; }
      const next = parseHandoff(p.body)?.next;
      nudges.push({ on: p.number, body: [`dispatch: nudge at ${new Date(now).toISOString()} — PR #${p.number} has had no push or comment for ${idleM} min.`,
        "Next: " + (next || "finish the Plan, push, run ready-gate, flip ready and add `land`") + ". A question goes to Bryce as `needs-decision` + one comment, never to the chat.",
        `Silence for ${limit} h hands the PR to a CONTINUE worker.`].join("\n") });
      continue;
    }
    if (has(p, "land") && !landProblem(p, now, limit, flags.mergePause)) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but labelled land and waiting on CI/gate/train`); continue; }
    const foreign = foreignActivity(p, now, config.foreignHours ?? 2);
    if (foreign) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but foreign activity (${foreign}): no takeover`); continue; }
    const needs = unmergedPrerequisites(p, prs);
    if (needs.length) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but waits for ${needs.map((n) => `#${n}`).join(", ")} to merge (launch after it lands)`); continue; }
    if (l) { skip(`PR #${p.number}`, `takeover launched ${ageLabel(l.at, now)} ago (live claim)`); continue; }
    if (!asked) label(p.number, ["needs-owner"]);
    launch("continue", p.number, `[Worker] CONTINUE PR #${p.number} ${p.title || ""}`.slice(0, 120), p.number);
  }
  // (1) ready issues without a claim; none at all while the landing queue is full (backpressure: rules 2 and 3 still run).
  const landQueue = prs.filter((p) => !p.draft && has(p, "land")).length;
  const queueFull = Number.isFinite(config.landQueueMax) && landQueue >= config.landQueueMax;
  if (queueFull) skip("issue launches paused", `${landQueue} PRs waiting to land (max ${config.landQueueMax}) — land before starting more`);
  // A batch issue (`batch`) is the ONE launch for its members: a member (`batched`, or listed under the batch's "## Members")
  // is never launched on its own, and the batch waits for what its "## Merge order" says it lands after.
  const batchOf = new Map();
  for (const b of issues) if (has(b, "batch")) for (const n of batchMembers(b.body)) if (!batchOf.has(n)) batchOf.set(n, b.number);
  const isMember = (i) => has(i, "batched") || batchOf.has(Number(i.number));
  const members = issues.filter((i) => has(i, "ready") && !has(i, "claimed") && isMember(i));
  if (members.length) skip(`${members.length} batched issue(s)`, "fixed by their batch issue's ONE PR, never launched on their own");
  const ready = issues.filter((i) => !i.pull_request && has(i, "ready") && !has(i, "claimed") && !has(i, "blocked") && !has(i, "needs-decision") && !has(i, "epic") && !isMember(i))
    .sort((a, b) => (ownerLabel(b, "priority") - ownerLabel(a, "priority")) || (t(b.updated_at) - t(a.updated_at)));
  for (const i of ready) if (has(i, "priority") && !ownerLabel(i, "priority")) ignored.push(why(i, "priority"));
  for (const i of ready.filter((x) => !trustedReady(x, owner))) ignored.push(`ready on #${i.number} (neither authored nor labelled by ${owner})`);
  const linkedPrs = new Map();
  for (const p of prs) {
    if (p.state && p.state !== "open") continue;
    for (const n of closingIssues(p.body, config.repo)) linkedPrs.set(n, [...(linkedPrs.get(n) || []), p.number]);
  }
  for (const i of queueFull ? [] : ready.filter((x) => trustedReady(x, owner))) {
    const linked = linkedPrs.get(Number(i.number)) || (has(i, "batch") ? [...new Set(batchMembers(i.body).flatMap((n) => linkedPrs.get(n) || []))] : []);
    if (linked.length) { skip(`issue #${i.number}`, `already has open PR ${linked.map((n) => `#${n}`).join(", ")}`); continue; }
    const l = liveLaunch(i.comments, now, claimH);
    if (l) { skip(`issue #${i.number}`, `launched ${l.host} ${ageLabel(l.at, now)} ago (live claim)`); continue; }
    const waits = has(i, "batch") ? batchWaits(i, issues, prs) : [];
    if (waits.length) { skip(`issue #${i.number}`, `batch lands after ${waits.map((n) => `#${n}`).join(", ")} (its Merge order): launch when they have landed`); continue; }
    if (has(i, "lane:cursor")) { skip(`issue #${i.number}`, "lane:cursor: Cursor launches retired (2026-11-03); relabel to dispatch a Claude worker"); continue; }
    launch("issue", i.number, `[Worker] #${i.number} ${i.title}`.slice(0, 120), i.number);
  }
  const plan = { launches, labels, digests, nudges, skipped, ignored, flags, boardIssue: board?.number || null, dispatchIssue: dispatch?.number || null, live, launchedToday, landQueue };
  plan.board = renderBoard(state, plan, config, now);
  return plan;
}

/** (6) The Board comment: flags, caps, one row per open PR, this run's launches, digests, nudges and skips. Pure. */
export function renderBoard(state, plan, config, now) {
  const rows = (state.prs || []).map((p) => {
    const h = parseHandoff(p.body) || {};
    return `| #${p.number} | ${String(p.title || "").replace(/\|/g, "\\|").slice(0, 60)} | ${p.draft ? "draft" : "ready"} | ${ageLabel(p.created_at || p.updated_at, now)} | ${h.owner || h.session || "-"} | ${ageLabel(new Date(activityAt(p)).toISOString(), now)} ago | ${labelsOf(p).join(", ") || "-"} |`;
  });
  const caps = `launches/run ${config.maxLaunchesPerRun}; launches/day ${plan.launchedToday}/${config.maxLaunchesPerDay}; live claims ${plan.live}/${config.maxLiveWorkers}; cost cap $${config.workerCostCapUsd}`;
  return [BOARD_MARKER, `## Board — ${new Date(now).toISOString()}`, "",
    `pause: ${plan.flags.pause} · merge-pause: ${plan.flags.mergePause} · deploy: ${state.deployRed ? "**RED**" : "green"}`,
    `caps: ${caps} · land queue ${plan.landQueue ?? 0}/${config.landQueueMax}`,
    ...((plan.ignored || []).length ? [`not honoured (not ${config.owner || OWNER}'s own click): ${plan.ignored.join("; ")}`] : []),
    // D16 (#5402): ready-sweep's cap row, read-only; `landed` is null when the merged-PR count could not be read.
    state.landed == null ? `ready cap: unknown (the merged-PR count for the last ${LANDED_DAYS} d could not be read)`
      : readyCapRow({ ready: (state.issues || []).filter((i) => has(i, "ready")).length, launchable: launchableReady(state.issues || [], state.prs || [], config.repo).length, landed: state.landed, days: LANDED_DAYS }), "",
    "| PR | title | state | age | owner | last activity | labels |", "|---|---|---|---|---|---|---|",
    ...(rows.length ? rows : ["| - | no open PRs | | | | | |"]), "",
    `### Launches this run (${plan.launches.length})`, ...plan.launches.map((l) => `- ${l.address}: ${l.title}`), ...(plan.launches.length ? [] : ["- none"]),
    `### Decision digests (${plan.digests.length})`, ...plan.digests.map((d) => `- #${d.on}`), ...(plan.digests.length ? [] : ["- none"]),
    `### Nudges (${plan.nudges.length})`, ...plan.nudges.map((n) => `- PR #${n.on}`), ...(plan.nudges.length ? [] : ["- none"]),
    `### Skipped (${plan.skipped.length})`, ...plan.skipped.slice(0, 40).map((s) => `- ${s.what}: ${s.why}`)].join("\n");
}

// ---- I/O: read GitHub state ----------------------------------------------------
/** PLATFORM_STEP and the platform test live in ./lib/deploy-tip.mjs (shared with merge-gate's `base` row, #5425). */
export { PLATFORM_STEP };
/** Did run `id` fail on the Pages side (the marker step failed)? An unreadable job list is false (a fixer launches). */
export function platformFailure(api, id) {
  const r = api(`actions/runs/${id}/jobs?per_page=100`);
  if (r.error) return false;
  return platformStepFailed(r.json?.jobs);
}
const get = (api, p) => { const r = api(p); if (r.error) throw new Error(`${p}: ${r.error}`); return r.json; };
/** Every row of a list endpoint: `per_page=100&page=N` until a short page (one page silently dropped the Board once the
 *  repo passed 100 open issues). `pick` maps a page body to its rows (check-runs wrap theirs).
 *  https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api */
export function getAll(api, p, { pick = (j) => j, maxPages = 50 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const picked = pick(get(api, `${p}${p.includes("?") ? "&" : "?"}per_page=${PAGE_SIZE}&page=${page}`));
    const rows = Array.isArray(picked) ? picked : [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
const comments = (api, n) => getAll(api, `issues/${n}/comments`).map((c) => ({ id: c.id, author: c.user?.login, body: c.body, created_at: c.created_at, updated_at: c.updated_at, performed_via_github_app: c.performed_via_github_app, user: c.user }));
/** The label events provenance reads: labeled / unlabeled rows with actor, app and time. */
const labelEventsOf = (api, n) => getAll(api, `issues/${n}/events`, { pick: (j) => (Array.isArray(j) ? j : []) })
  .filter((e) => e.event === "labeled" || e.event === "unlabeled")
  .map((e) => ({ event: e.event, label: { name: e.label?.name }, actor: { login: e.actor?.login }, created_at: e.created_at, performed_via_github_app: e.performed_via_github_app }));
/** The labels whose provenance a rule reads: events are fetched only for issues/PRs carrying one of them. */
export const PROVENANCE_LABELS = ["ready", "priority", "needs-decision", "dispatch:pause", "dispatch:merge-pause"];
/** When the head `sha` was pushed: the earliest workflow run on it (a server time). An unreadable list falls back to
 *  `fallback` (the PR's updated_at), which can only make a PR look busier, never idler. */
const pushedAt = (api, sha, fallback) => {
  const r = api(`actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=100`);
  if (r.error) return fallback || null;
  return (r.json?.workflow_runs || []).map((w) => w.created_at).filter((x) => t(x)).sort((a, b) => t(a) - t(b))[0] || null;
};

/** The Board's ready-cap window, the same 7 d ready-sweep.mjs defaults to. */
export const LANDED_DAYS = 7;
/** PRs merged into the repository in the last LANDED_DAYS (one search GET), or null when it cannot be read: the cap
 *  row then says "unknown", never a made-up count, and the Board still posts. */
export function landedCount(api, config, now) {
  const since = new Date(now - LANDED_DAYS * 864e5).toISOString().slice(0, 10);
  const r = api(`https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${config.repo} is:pr is:merged merged:>=${since}`)}&per_page=1`);
  const n = r?.error ? NaN : Number(r?.json?.total_count);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function readState({ api = githubApi, config, now = Date.now() } = {}) {
  const special = (i) => (config.boardIssue ? [config.boardIssue, config.dispatchIssue].includes(i.number) : [config.boardIssueTitle, config.dispatchIssueTitle].includes(String(i.title).trim()));
  const wantsEvents = (x) => labelsOf(x).some((l) => PROVENANCE_LABELS.includes(l));
  const rawIssues = getAll(api, "issues?state=open").filter((i) => !i.pull_request);
  // Comments: the Board/Dispatch issues, ready issues (launch claims), claimed issues and needs-decision issues (the answer).
  const issues = rawIssues.map((i) => {
    const want = special(i) || has(i, "ready") || has(i, "claimed") || has(i, "needs-decision");
    return { number: i.number, title: i.title, body: i.body || "", labels: labelsOf(i), updated_at: i.updated_at, author: i.user?.login || "",
      comments: want ? comments(api, i.number) : [], events: wantsEvents(i) ? labelEventsOf(api, i.number) : null };
  });
  const prs = getAll(api, `pulls?state=open&base=${encodeURIComponent(config.deployBranch)}`).map((p) => {
    const cs = comments(api, p.number);
    const out = { number: p.number, title: p.title, draft: !!p.draft, labels: labelsOf(p), head_sha: p.head.sha, head_ref: p.head.ref, body: p.body || "",
      head_repo: p.head.repo?.full_name || null, author: p.user?.login || "", created_at: p.created_at, updated_at: p.updated_at,
      pushed_at: untrustedPr({ head_repo: p.head.repo?.full_name, author: p.user?.login }, config.repo, config.owner || OWNER) ? null : pushedAt(api, p.head.sha, p.updated_at),
      last_comment_at: cs.filter((c) => !isOwnComment(c)).at(-1)?.created_at || null,
      lane: labelsOf(p).find((l) => l.startsWith("lane:")) || null, comments: cs, events: wantsEvents(p) ? labelEventsOf(api, p.number) : null };
    // The foreign-activity probe reads commits only for PRs a takeover could target (stale or asked for).
    if (has(p, "needs-owner") || (now - activityAt(out)) / 3.6e6 >= config.staleHours.default)
      out.commits = getAll(api, `pulls/${p.number}/commits`, { pick: (j) => (Array.isArray(j) ? j : []) }).slice(-30).map((c) => ({ author: c.author?.login || c.commit?.author?.name || "", at: c.commit?.committer?.date || c.commit?.author?.date }));
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
  // The newest COMPLETED train: an in-progress run has no conclusion, which flapped deploy:red mid-incident.
  const run = get(api, `actions/workflows/pages.yml/runs?branch=${encodeURIComponent(config.deployBranch)}&status=completed&per_page=1`)?.workflow_runs?.[0];
  const deployRed = !!run && ["failure", "timed_out"].includes(run.conclusion);
  return { issues, prs, deployRed, deployRunId: deployRed ? run.id : null, deployPlatform: deployRed ? platformFailure(api, run.id) : false, landed: landedCount(api, config, now) };
}

// ---- I/O: the worker fire and the GitHub writes ---------------------------------------------------------------
/** Why a planned launch must NOT go out any more, or "" (finding 7: a worker went to a merged PR, another onto a branch Cursor
 *  was pushing). Fresh REST reads right before the fire: the PR/issue is still open and unmerged, and (CONTINUE only) no
 *  commit by a non-Claude author landed in the last `foreignMinutes`. A read that errors never blocks a launch. */
export function launchRecheck(l, { api = githubApi, now = Date.now(), foreignMinutes = 60 } = {}) {
  if (!l.number) return "";
  if (l.kind === "continue") {
    const r = api(`pulls/${l.number}`);
    if (r.json?.merged_at || r.json?.merged) return `PR #${l.number} is merged`;
    if (r.json?.state && r.json.state !== "open") return `PR #${l.number} is ${r.json.state}`;
    const own = String(r.json?.user?.login || "").toLowerCase();
    const cs = api(`pulls/${l.number}/commits?per_page=30`).json;
    for (const c of (Array.isArray(cs) ? cs : []).slice(-30)) {
      const who = c.author?.login || c.commit?.author?.name || "", at = c.commit?.committer?.date || c.commit?.author?.date;
      if (!who || !t(at) || (now - t(at)) / 6e4 >= foreignMinutes) continue;
      if (isBot(who) || who.toLowerCase() === own || /claude|anthropic/i.test(who)) continue;
      return `${who} pushed PR #${l.number} ${Math.round((now - t(at)) / 6e4)} min ago (a non-Claude author, last ${foreignMinutes} min)`;
    }
    return "";
  }
  const r = api(`issues/${l.number}`);
  if (r.json?.state && r.json.state !== "open") return `#${l.number} is ${r.json.state}`;
  return "";
}

/** One fire of the worker scheduled task: POST {text: address}. → { status, session, url } | { status, error } | { skipped }.
 *  Header and body shapes: https://platform.claude.com/docs/en/api/claude-code/routines-fire (read 2026-11-03). */
export async function fireWorker(address, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = env.WORKER_FIRE_URL, token = env.WORKER_FIRE_TOKEN;
  if (!url) return { skipped: "WORKER_FIRE_URL unset" };
  if (!token) return { skipped: "WORKER_FIRE_TOKEN unset" };
  let res;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({ text: address }) });
  } catch (e) { return { status: 0, error: e.message || String(e) }; }
  let body = null;
  try { body = await res.json(); } catch { /* a non-JSON body: reported by status */ }
  if (res.status !== 200) return { status: res.status, error: body?.error?.message || body?.error?.type || "", retryAfter: res.headers?.get?.("retry-after") || null };
  const session = body?.claude_code_session_id;
  if (!/^session_[A-Za-z0-9]{12,}$/.test(String(session || ""))) return { status: 200, error: "200 without a claude_code_session_id" };
  return { status: 200, session, url: body?.claude_code_session_url || "" };
}

export async function applyPlan(plan, { api = githubApi, config, log = console.log, now = Date.now(), fire = false, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const post = (p, body, method = "POST") => { const r = api(p, { method, body }); if (r.error) throw new Error(`${method} ${p}: ${r.error}`); return r.json; };
  let writes = 0, fired = 0;
  for (const l of plan.labels) {
    if (l.add.length) { post(`issues/${l.number}/labels`, { labels: l.add }); writes++; }
    for (const name of l.remove) { post(`issues/${l.number}/labels/${encodeURIComponent(name)}`, undefined, "DELETE"); writes++; }
  }
  for (const d of plan.digests) { post(`issues/${d.on}/comments`, { body: d.body }); writes++; }
  for (const n of plan.nudges) { post(`issues/${n.on}/comments`, { body: n.body }); writes++; }
  if (plan.boardIssue) {
    const mine = getAll(api, `issues/${plan.boardIssue}/comments`).find((c) => c.user?.login === DISPATCH_BOT && String(c.body || "").startsWith(BOARD_MARKER));
    if (mine) post(`issues/comments/${mine.id}`, { body: plan.board }, "PATCH"); else post(`issues/${plan.boardIssue}/comments`, { body: plan.board });
    writes++;
  } else log(`= board: no open Board issue (#${config.boardIssue || "?"}) — the Board comment was not written`);
  // The claim comment is posted ONLY after the fire returned 200 with a session id: a refused fire leaves no claim.
  for (const l of plan.launches) {
    const why = launchRecheck(l, { api, now });
    if (why) { log(`= launch skipped for ${l.kind} #${l.number}: ${why}`); continue; }
    log(`LAUNCH ${l.address}  (${l.title})`);
    if (!fire) { log("= fire skipped: --fire not given"); continue; }
    const r = await fireWorker(l.address, { env, fetchImpl });
    if (r.skipped) { log(`= fire skipped: ${r.skipped}`); continue; }
    if (r.status !== 200 || !r.session) { log(`= fire failed ${r.status}${r.error ? ` ${r.error}` : ""}${r.retryAfter ? ` (retry-after ${r.retryAfter}s)` : ""}`); continue; }
    fired++;
    const body = claimComment(l, now, r.session);
    post(`issues/${l.on}/comments`, { body }); writes++;
    log(`= launched ${l.address} as ${r.session}${r.url ? ` ${r.url}` : ""}`);
    if (l.kind === "continue") {   // adopt for the worker: its label DELETE is classifier-denied
      const d = api(`issues/${l.on}/labels/needs-owner`, { method: "DELETE" });
      log(d.error ? `dispatch: needs-owner not removed from #${l.on}: ${d.error}` : `= needs-owner removed from #${l.on}`);
      post(`issues/${l.on}/comments`, { body: `adopts PR #${l.on} — claude:${r.session} (posted by the dispatcher when it launched the takeover)` }); writes++;
    }
  }
  return { writes, fired };
}

export function renderPlan(plan) {
  const out = [];
  for (const l of plan.launches) out.push(`LAUNCH ${l.address}  ${l.title}  (claim on #${l.on || "?"})`);
  for (const l of plan.labels) out.push(`LABEL #${l.number} ${l.add.map((a) => `+${a}`).join(" ")} ${l.remove.map((r) => `-${r}`).join(" ")}`.trim());
  for (const d of plan.digests) out.push(`DIGEST #${d.on}  ${d.body.split("\n")[0]}`);
  for (const n of plan.nudges) out.push(`NUDGE PR #${n.on}`);
  for (const i of plan.ignored || []) out.push(`IGNORED ${i}`);
  for (const s of plan.skipped) out.push(`SKIP ${s.what}: ${s.why}`);
  return out;
}

const USAGE = `usage: node tools/ci/dispatch.mjs --plan [--json] [--now <iso>] [--config <file>]
       node tools/ci/dispatch.mjs --apply [--fire] [--now <iso>] [--config <file>]
  --plan   reads GitHub (GETs only) and prints the plan: launches, labels, digests, nudges, skips, the Board markdown (--json: one object)
  --apply  writes labels, the Board comment, needs-decision digests and nudges, then one LAUNCH <address> line per launch
           (ISSUE <n> | CONTINUE PR <n> | DEPLOY-RED <run id>), each re-checked right before (merged/closed/foreign push)
  --fire   with --apply: POST each address to \$WORKER_FIRE_URL (Bearer \$WORKER_FIRE_TOKEN, anthropic-version ${ANTHROPIC_VERSION});
           on 200 the claim comment names the returned session; non-200 prints \`= fire failed <status>\` and posts nothing;
           unset env prints \`= fire skipped: WORKER_FIRE_URL unset\`
  .github/workflows/dispatch.yml runs --apply --fire hourly and on issue/PR/check-suite/comment events (header of this file).`;

export async function main(argv, { api = githubApi, read = fs.readFileSync, log = console.log, now = Date.now, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  exitIfHelp(argv, USAGE);
  const val = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const plan = argv.includes("--plan"), apply = argv.includes("--apply");
  if ((plan ? 1 : 0) + (apply ? 1 : 0) !== 1) { log(USAGE); return 1; }
  const config = loadConfig(val("--config") || CONFIG_FILE, read);
  const when = val("--now") ? Date.parse(val("--now")) : now();
  if (!Number.isFinite(when)) { log(`dispatch: --now ${val("--now")} is not an ISO time`); return 1; }
  let state;
  try { state = readState({ api, config, now: when }); }
  catch (e) { log(`dispatch: ${e.message}`); return 3; }
  const p = planDispatch(state, config, when);
  if (apply) {
    let r;
    try { r = await applyPlan(p, { api, config, log, now: when, fire: argv.includes("--fire"), env, fetchImpl }); } catch (e) { log(`dispatch: ${e.message}`); return 3; }
    log(`= dispatch applied: ${p.launches.length} launches planned, ${r.fired} fired, ${p.digests.length} digests, ${p.nudges.length} nudges, ${r.writes} GitHub writes${p.flags.pause ? "; PAUSED" : ""}`);
    return 0;
  }
  if (argv.includes("--json")) log(JSON.stringify(p, null, 2));
  else { for (const line of renderPlan(p)) log(line); log(""); log(p.board); log(`= dispatch plan: ${p.launches.length} launches, ${p.labels.length} label edits, ${p.digests.length} digests, ${p.nudges.length} nudges, ${p.skipped.length} skips${p.flags.pause ? "; PAUSED" : ""}`); }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((rc) => { process.exitCode = rc; });
