#!/usr/bin/env node
// dispatch.mjs — the hourly dispatcher's whole brain: a pure plan over GitHub state (issues, PRs, deploy, sessions, quota), then thin I/O.
// @doc Hourly dispatcher: plans launches, needs-owner takeovers, deploy:red fixers, archives and the Board from GitHub state.
// @section runner
// @skill steward
//
// Design: docs/plans/2026-10-27-orchestration-redesign.md §4.4 (GitHub is the only state store; no coordinator session).
// `planDispatch(state, config, now)` is PURE and tested; `readState` fetches the state with github-api.mjs (GETs only)
// and `applyPlan` performs ONLY the GitHub-side writes (labels, launch comments, the Board comment). A node script
// cannot call create_session, so every session-side action is printed as one line for the running agent:
//
//   CREATE_SESSION <json>   the claude-code-remote `create_session` arguments (launch-lane.mjs's shape: source_url,
//                           source_revision, permission_mode "auto", model, title, tags, prompt)
//   CURSOR_LAUNCH <json>    cursor-agents.mjs buildLaunchBody's shape (prompt.text, model.id, name, repos[0].startingRef);
//                           run `node tools/ci/cursor-agents.mjs launch --prompt-file <f> --ref <startingRef> --name <name>`
//   ARCHIVE_SESSION <id>    the claude-code-remote `archive_session` argument
//
//   node tools/ci/dispatch.mjs --plan [--json] [--sessions <saved list_sessions page>] [--quota allowed|allowed_warning|rejected] [--now <iso>]
//   node tools/ci/dispatch.mjs --apply [...same flags]      # writes labels, launch comments and the Board, then prints the lines above
//
// THE SCHEDULED TASK'S PROMPT (hourly, create_new_session_on_fire, Sonnet, depth 0), verbatim:
//   Run `node tools/ci/dispatch.mjs --apply --quota <your rate_limit_info.status> --sessions <saved list_sessions page>`;
//   execute each CREATE_SESSION / ARCHIVE_SESSION line with the claude-code-remote tools; end.
//
// Issue conventions: the pinned issue titled `Board` (config boardIssueTitle) holds ONE comment this tool edits each run
// (marker `<!-- dispatch-board -->`, so both Claude accounts edit the same one) and carries `deploy:red` while the latest
// pages.yml run on the deploy branch is red. The pinned issue titled `Dispatch` is Bryce's switch: its `dispatch:pause`
// label launches nothing, `dispatch:merge-pause` arms nothing; both override the config file (tools/ci/dispatch.json).
// Rules, in order (plan §4.4): (1) `ready` issues without `claimed` → one worker each, `priority` first, newest next,
// within maxLaunchesPerRun and maxLiveWorkers, none when the quota is not `allowed`; (2) an open PR with no push and no
// comment for staleHours (6 for lane:codex), no `hold`/`needs-decision` → `needs-owner` + ONE `CONTINUE PR #n` worker
// carrying the body's ```handoff block; (3) deploy red and no open PR labelled `deploy:red` → label the Board, launch one
// fixer; (4) a session whose every PR merged/closed > archiveAfterMinutes ago → archive, never one without a claim comment
// and never one still running; (5) the Board markdown. Idempotent: every launch is recorded as the comment
// `dispatch: launched <host>:<title> for #<n> at <iso>` on the issue/PR (deploy:red fixers on the Board issue) and a launch
// comment younger than launchClaimHours is a live claim, so a second run inside the hour launches nothing twice.
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
export const LAUNCH_RE = /^dispatch: launched (\S+?):(.+?) for (#\d+|deploy:red) at (\S+)/m;
const SESSION_RE = /\bsession_[A-Za-z0-9]{12,}\b/g;
export const PROMPT_MAX_LINES = 25;
export const DEFAULT_CONFIG = {
  pause: false, mergePause: false, maxLaunchesPerRun: 4, maxLiveWorkers: { claude: 8, cursor: 4 }, workerCostCapUsd: 10,
  staleHours: { default: 2, codex: 6 }, launchClaimHours: 2, archiveAfterMinutes: 60, baseBehindMax: 2,
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
    .map((m) => ({ host: m[1], title: m[2], target: m[3], at: m[4] })).sort((a, b) => t(b.at) - t(a.at));
}
/** The newest launch comment younger than `hours` (a live claim), or null. Pure. */
export const liveLaunch = (comments, now, hours) => launchComments(comments).find((l) => hoursAgo(l.at, now) < hours) || null;

/** Every session id named in any claim/adoption comment or PR body (the worker's own "claims #n — host:session_…"). Pure. */
export function claimedSessionIds(state) {
  const ids = new Set();
  const scan = (s) => { for (const m of String(s || "").matchAll(SESSION_RE)) ids.add(m[0]); };
  for (const i of state.issues || []) for (const c of i.comments || []) scan(c.body);
  for (const p of state.prs || []) { scan(p.body); for (const c of p.comments || []) scan(c.body); }
  return ids;
}

/** The `{ccr:{data:[…]}}` list_sessions page (MCP text with its envelope, or raw JSON) → normalised sessions. Pure.
 *  (fleet-archive.mjs's extractSessions, kept here because that tool is retired with the fleet.) */
export function extractSessions(text) {
  const s = String(text);
  const start = s.indexOf('{"ccr"') >= 0 ? s.indexOf('{"ccr"') : s.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the page");
  let obj = JSON.parse(s.slice(start, s.lastIndexOf("}") + 1));
  if (obj.ccr) obj = obj.ccr;
  if (!Array.isArray(obj.data)) throw new Error("page has no data[] array");
  return obj.data.map((x) => ({ id: x.id, title: x.title || "", status: x.status || x.session_status || "", created_at: x.created_at,
    updated_at: x.updated_at, tags: x.tags || [], pr: x.pr }));
}
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
/** A PR's last activity: the newest push or comment, the dispatcher's own launch comments excluded. Pure. */
export const activityAt = (p) => Math.max(t(p.last_push_at), t(p.last_comment_at),
  ...(p.comments || []).filter((c) => !LAUNCH_RE.test(String(c.body || ""))).map((c) => t(c.created_at))) || t(p.updated_at);

// ---- launch specs ------------------------------------------------------------
const excerpt = (body, lines = 6, width = 160) => String(body || "").replace(/<!--[\s\S]*?-->/g, "").split("\n")
  .map((l) => l.trim()).filter(Boolean).slice(0, lines).map((l) => (l.length > width ? l.slice(0, width - 1) + "…" : l));
const commonLines = (config, host, n) => [
  "Read docs/WORKERS.md and follow it.",
  `Lane label: lane:${host}. Model: ${host === "claude" ? config.model : config.hosts.cursor.model}. Base: ${config.deployBranch} (branch cursor/<topic>-<hash> from it; draft PR into it at the first commit).`,
  `Cost cap: $${config.workerCostCapUsd} (soft). At the cap, or stuck: leave the Plan and the \`\`\`handoff block current, add \`needs-owner\` on the PR, end.`,
  `End at \`land\`: when ready-gate passes flip ready, add \`land\`, refresh the handoff block; GitHub merges ${n ? `#${n}` : "it"}, not you.`,
];
export function issuePrompt(issue, config, host) {
  return [`Task: #${issue.number} — ${issue.title}`, ...excerpt(issue.body),
    `Claim first: comment "claims #${issue.number} — ${host}:<your session id>" on the issue and add \`claimed\`; stand down if an older claim comment exists. Put \`Closes #${issue.number}\` in the PR body.`,
    ...commonLines(config, host)].join("\n");
}
export function continuePrompt(pr, config, host) {
  const h = parseHandoff(pr.body);
  const hand = h ? ["Hand-off block from the PR body:", ...Object.entries(h).slice(0, 8).map(([k, v]) => `  ${k}: ${v}`)]
    : ["No handoff block in the body: read its Plan, Status and Verified sections first."];
  return [`CONTINUE PR #${pr.number} — ${pr.title || ""}`, ...hand,
    `Adopt: comment "adopts PR #${pr.number} — ${host}:<your session id>" on the PR and remove \`needs-owner\`; stand down if a newer adoption comment exists.`,
    `Check out its branch (${pr.head_ref || "the PR head"}); fix the red or the conflict (merge origin via sync-pr.mjs, never rebase); push; \`land\` when ready-gate passes.`,
    ...commonLines(config, host, pr.number)].join("\n");
}
export function deployRedPrompt(config, host) {
  return [`Deploy red: the latest pages.yml run on ${config.deployBranch} failed.`,
    "Read the failing job (Actions logs via the GitHub MCP), fix it on a branch, draft PR labelled `deploy:red` and `run-ci`; the gate's base-behind row holds other merges meanwhile.",
    "Claim first: comment \"claims deploy:red — " + host + ":<your session id>\" on the Board issue; stand down if an older claim comment exists.",
    ...commonLines(config, host)].join("\n");
}
/** The create_session arguments (launch-lane.mjs's shape plus source_url and the prompt). Pure. */
export function launchSpec({ title, prompt, tags, config }) {
  return { source_url: `https://github.com/${config.repo}`, source_revision: config.deployBranch, permission_mode: "auto",
    model: config.model, title, tags: ["f1-game-dispatch", ...tags], prompt };
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
  const flags = { pause: !!config.pause || has(dispatch, "dispatch:pause"), mergePause: !!config.mergePause || has(dispatch, "dispatch:merge-pause"),
    quota: state.quota || "unknown" };
  const claimH = config.launchClaimHours, launches = [], labels = [], archives = [], skipped = [];
  const skip = (what, why) => skipped.push({ what, why });
  const label = (number, add = [], remove = []) => { const r = labels.find((l) => l.number === number) || (labels.push({ number, add: [], remove: [] }), labels.at(-1)); r.add.push(...add); r.remove.push(...remove); };
  // Live workers per host: listed sessions not archived/completed, plus recent launch comments no listed session matches.
  const sessions = state.sessions || [];
  const live = { claude: sessions.filter((s) => !/ARCHIVED|COMPLETED/i.test(s.status || "")).length, cursor: 0 };
  const all = [...issues, ...prs];
  for (const x of all) for (const l of launchComments(x.comments)) {
    if (hoursAgo(l.at, now) >= claimH) continue;
    const matched = sessions.some((s) => String(s.title || "").includes(l.target) || String(s.title || "") === l.title);
    if (!matched) live[l.host] = (live[l.host] || 0) + 1;
  }
  const noLaunch = flags.pause ? "paused (dispatch:pause)" : flags.quota !== "allowed" ? `quota ${flags.quota}: launch nothing` : null;
  const room = (host) => live[host] < (config.maxLiveWorkers[host] ?? 0);
  const launch = (kind, host, number, title, prompt, on, tags) => {
    if (noLaunch) return skip(`${kind} ${title}`, noLaunch);
    if (launches.length >= config.maxLaunchesPerRun) return skip(`${kind} ${title}`, `maxLaunchesPerRun ${config.maxLaunchesPerRun} reached`);
    if (!room(host)) return skip(`${kind} ${title}`, `maxLiveWorkers.${host} ${config.maxLiveWorkers[host]} reached (${live[host]} live)`);
    const spec = host === "cursor" ? cursorSpec({ title, prompt, config }) : launchSpec({ title, prompt, tags, config });
    live[host]++;
    launches.push({ kind, host, number, title, spec, comment: { on, body: `dispatch: launched ${host}:${title} for ${number ? `#${number}` : "deploy:red"} at ${new Date(now).toISOString()}` } });
  };
  // (1) ready issues without a claim.
  const ready = issues.filter((i) => !i.pull_request && has(i, "ready") && !has(i, "claimed") && !has(i, "blocked") && !has(i, "needs-decision"))
    .sort((a, b) => (has(b, "priority") - has(a, "priority")) || (t(b.updated_at) - t(a.updated_at)));
  for (const i of ready) {
    const l = liveLaunch(i.comments, now, claimH);
    if (l) { skip(`issue #${i.number}`, `launched ${l.host} ${ageLabel(l.at, now)} ago (live claim)`); continue; }
    const cursor = has(i, "lane:cursor");
    if (cursor && !config.hosts.cursor.enabled) { skip(`issue #${i.number}`, "lane:cursor but hosts.cursor.enabled is false"); continue; }
    const host = cursor ? "cursor" : "claude";
    launch("issue", host, i.number, `[Worker] #${i.number} ${i.title}`.slice(0, 120), issuePrompt(i, config, host), i.number, [`issue:${i.number}`, `lane:${host}`]);
  }
  // (2) stale open PRs → needs-owner + ONE takeover.
  for (const p of prs) {
    const codex = has(p, "lane:codex");
    const limit = codex ? config.staleHours.codex : config.staleHours.default;
    const idleH = (now - activityAt(p)) / 3.6e6;
    if (idleH < limit) continue;
    if (has(p, "hold") || has(p, "needs-decision")) { skip(`PR #${p.number}`, `stale ${Math.round(idleH)}h but ${has(p, "hold") ? "hold" : "needs-decision"}`); continue; }
    const l = liveLaunch(p.comments, now, claimH);
    if (l) { skip(`PR #${p.number}`, `takeover launched ${ageLabel(l.at, now)} ago (live claim)`); continue; }
    if (!has(p, "needs-owner")) label(p.number, ["needs-owner"]);
    launch("continue", "claude", p.number, `[Worker] CONTINUE PR #${p.number} ${p.title || ""}`.slice(0, 120), continuePrompt(p, config, "claude"), p.number, [`pr:${p.number}`, "lane:claude"]);
  }
  // (3) deploy red → Board label + one fixer.
  if (state.deployRed) {
    const claimed = prs.find((p) => has(p, "deploy:red"));
    const l = board ? liveLaunch(board.comments, now, claimH) : null;
    if (board && !has(board, "deploy:red")) label(board.number, ["deploy:red"]);
    if (claimed) skip("deploy:red fixer", `PR #${claimed.number} carries deploy:red`);
    else if (!board) skip("deploy:red fixer", `no open issue titled "${config.boardIssueTitle}" to record the launch on`);
    else if (l && l.target === "deploy:red") skip("deploy:red fixer", `launched ${ageLabel(l.at, now)} ago (live claim)`);
    else launch("deploy-red", "claude", 0, "[Worker] deploy:red fixer", deployRedPrompt(config, "claude"), board?.number, ["deploy:red", "lane:claude"]);
  } else if (board && has(board, "deploy:red")) label(board.number, [], ["deploy:red"]);
  // (4) archive a session whose every PR and issue is done for archiveAfterMinutes; never one without a claim comment, never mid-turn.
  const claimedIds = claimedSessionIds(state);
  const closedPr = new Map((state.closedPrs || []).map((p) => [Number(p.number), p]));
  const closedIssue = new Map((state.closedIssues || []).map((i) => [Number(i.number), i]));
  const openPr = new Set(prs.map((p) => Number(p.number))), openIssue = new Set(issues.map((i) => Number(i.number)));
  for (const s of sessions) {
    if (/ARCHIVED/i.test(s.status || "")) continue;
    const refs = sessionRefs(s);
    const keep = (why) => skip(`session ${s.id}`, `keep: ${why}`);
    if (/RUNNING/i.test(s.status || "")) { keep("still running"); continue; }
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
  const plan = { launches, labels, archives, skipped, flags, boardIssue: board?.number || null, dispatchIssue: dispatch?.number || null, live };
  plan.board = renderBoard(state, plan, config, now);
  return plan;
}

/** (5) The Board comment: open PRs, this run's launches and archives, quota, caps, pause flags. Pure. */
export function renderBoard(state, plan, config, now) {
  const rows = (state.prs || []).map((p) => {
    const h = parseHandoff(p.body) || {};
    return `| #${p.number} | ${String(p.title || "").replace(/\|/g, "\\|").slice(0, 60)} | ${p.draft ? "draft" : "ready"} | ${ageLabel(p.created_at || p.updated_at, now)} | ${h.owner || h.session || "-"} | ${ageLabel(new Date(activityAt(p)).toISOString(), now)} ago | ${labelsOf(p).join(", ") || "-"} |`;
  });
  const caps = `launches/run ${config.maxLaunchesPerRun}; live workers claude ${plan.live.claude}/${config.maxLiveWorkers.claude}, cursor ${plan.live.cursor}/${config.maxLiveWorkers.cursor}; cost cap $${config.workerCostCapUsd}`;
  return [BOARD_MARKER, `## Board — ${new Date(now).toISOString()}`, "",
    `quota: **${plan.flags.quota}** · pause: ${plan.flags.pause} · merge-pause: ${plan.flags.mergePause} · deploy: ${state.deployRed ? "**RED**" : "green"}`,
    `caps: ${caps}`, "", "| PR | title | state | age | owner | last activity | labels |", "|---|---|---|---|---|---|---|",
    ...(rows.length ? rows : ["| - | no open PRs | | | | | |"]), "",
    `### Launches this run (${plan.launches.length})`, ...(plan.launches.map((l) => `- ${l.host}: ${l.title}`) || []),
    ...(plan.launches.length ? [] : ["- none"]),
    `### Archives (${plan.archives.length})`, ...plan.archives.map((a) => `- ${a.id}: ${a.why}`), ...(plan.archives.length ? [] : ["- none"]),
    `### Skipped (${plan.skipped.length})`, ...plan.skipped.slice(0, 40).map((s) => `- ${s.what}: ${s.why}`)].join("\n");
}

// ---- I/O: read GitHub state ----------------------------------------------------
const get = (api, p) => { const r = api(p); if (r.error) throw new Error(`${p}: ${r.error}`); return r.json; };
const comments = (api, n) => get(api, `issues/${n}/comments?per_page=100`).map((c) => ({ author: c.user?.login, body: c.body, created_at: c.created_at }));
export function readState({ api = githubApi, config, sessionsText = null, quota = "unknown" } = {}) {
  const rawIssues = get(api, "issues?state=open&per_page=100").filter((i) => !i.pull_request);
  const special = [config.boardIssueTitle, config.dispatchIssueTitle];
  const issues = rawIssues.map((i) => {
    const want = special.includes(String(i.title).trim()) || (has(i, "ready") && !has(i, "claimed"));
    return { number: i.number, title: i.title, body: i.body || "", labels: labelsOf(i), updated_at: i.updated_at, comments: want ? comments(api, i.number) : [] };
  });
  const prs = get(api, `pulls?state=open&base=${encodeURIComponent(config.deployBranch)}&per_page=100`).map((p) => {
    const commit = get(api, `commits/${p.head.sha}`);
    const cs = comments(api, p.number);
    return { number: p.number, title: p.title, draft: !!p.draft, labels: labelsOf(p), head_sha: p.head.sha, head_ref: p.head.ref, body: p.body || "",
      created_at: p.created_at, updated_at: p.updated_at, last_push_at: commit?.commit?.committer?.date || null,
      last_comment_at: cs.filter((c) => !LAUNCH_RE.test(c.body || "")).at(-1)?.created_at || null, mergeable: p.mergeable ?? null,
      lane: labelsOf(p).find((l) => l.startsWith("lane:")) || null, comments: cs };
  });
  const run = get(api, `actions/workflows/pages.yml/runs?branch=${encodeURIComponent(config.deployBranch)}&per_page=1`)?.workflow_runs?.[0];
  const deployRed = !!run && ["failure", "timed_out"].includes(run.conclusion);
  const sessions = sessionsText ? extractSessions(sessionsText) : [];
  const openPrs = new Set(prs.map((p) => p.number)), openIssues = new Set(issues.map((i) => i.number)), closedPrs = [], closedIssues = [];
  const refs = sessions.map(sessionRefs);
  for (const n of new Set(refs.flatMap((r) => r.prs))) {
    if (openPrs.has(n)) continue;
    const r = api(`pulls/${n}`);
    if (r.json) closedPrs.push({ number: n, merged: !!r.json.merged_at, merged_at: r.json.merged_at, closed_at: r.json.closed_at });
  }
  for (const n of new Set(refs.flatMap((r) => r.issues))) {
    if (openIssues.has(n)) continue;
    const r = api(`issues/${n}`);
    if (r.json?.state === "closed") closedIssues.push({ number: n, closed_at: r.json.closed_at });
  }
  return { issues, prs, deployRed, sessions, closedPrs, closedIssues, quota };
}

// ---- I/O: apply the GitHub-side writes, print the session-side lines --------------
export function applyPlan(plan, { api = githubApi, config, log = console.log } = {}) {
  const post = (p, body, method = "POST") => { const r = api(p, { method, body }); if (r.error) throw new Error(`${method} ${p}: ${r.error}`); return r.json; };
  let writes = 0;
  for (const l of plan.labels) {
    if (l.add.length) { post(`issues/${l.number}/labels`, { labels: l.add }); writes++; }
    for (const name of l.remove) { post(`issues/${l.number}/labels/${encodeURIComponent(name)}`, undefined, "DELETE"); writes++; }
  }
  for (const l of plan.launches) if (l.comment.on) { post(`issues/${l.comment.on}/comments`, { body: l.comment.body }); writes++; }
  if (plan.boardIssue) {
    const mine = get(api, `issues/${plan.boardIssue}/comments?per_page=100`).find((c) => String(c.body || "").startsWith(BOARD_MARKER));
    if (mine) post(`issues/comments/${mine.id}`, { body: plan.board }, "PATCH"); else post(`issues/${plan.boardIssue}/comments`, { body: plan.board });
    writes++;
  } else log(`= board: no open issue titled "${config.boardIssueTitle}" — the Board comment was not written`);
  for (const l of plan.launches) log(`${l.host === "cursor" ? "CURSOR_LAUNCH" : "CREATE_SESSION"} ${JSON.stringify(l.spec)}`);
  for (const a of plan.archives) log(`ARCHIVE_SESSION ${a.id}`);
  return writes;
}

export function renderPlan(plan) {
  const out = [];
  for (const l of plan.launches) out.push(`LAUNCH ${l.host} ${l.title}  (comment on #${l.comment.on || "?"})`);
  for (const l of plan.labels) out.push(`LABEL #${l.number} ${l.add.map((a) => `+${a}`).join(" ")} ${l.remove.map((r) => `-${r}`).join(" ")}`.trim());
  for (const a of plan.archives) out.push(`ARCHIVE ${a.id}  ${a.why}`);
  for (const s of plan.skipped) out.push(`SKIP ${s.what}: ${s.why}`);
  return out;
}

const USAGE = `usage: node tools/ci/dispatch.mjs (--plan | --apply) [--json] [--sessions <saved list_sessions page>]
                                  [--quota allowed|allowed_warning|rejected] [--now <iso>] [--config <file>]
  --plan   reads GitHub (GETs only) and prints the plan: launches, labels, archives, skips, and the Board markdown (--json: one object)
  --apply  performs the GitHub-side writes (labels, launch comments, the Board comment), then prints one line per
           session-side action: CREATE_SESSION <json> | CURSOR_LAUNCH <json> | ARCHIVE_SESSION <id>
  The scheduled task runs --apply and executes those lines with the claude-code-remote tools (header of this file).`;

export function main(argv, { api = githubApi, read = fs.readFileSync, log = console.log, now = Date.now } = {}) {
  exitIfHelp(argv, USAGE);
  const val = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const plan = argv.includes("--plan"), apply = argv.includes("--apply");
  if (plan === apply) { log(USAGE); return 1; }
  const config = loadConfig(val("--config") || CONFIG_FILE, read);
  const quota = val("--quota") || "unknown";
  const when = val("--now") ? Date.parse(val("--now")) : now();
  if (!Number.isFinite(when)) { log(`dispatch: --now ${val("--now")} is not an ISO time`); return 1; }
  let state;
  try { state = readState({ api, config, sessionsText: val("--sessions") ? read(val("--sessions"), "utf8") : null, quota }); }
  catch (e) { log(`dispatch: ${e.message}`); return 3; }
  const p = planDispatch(state, config, when);
  if (apply) {
    let writes;
    try { writes = applyPlan(p, { api, config, log }); } catch (e) { log(`dispatch: ${e.message}`); return 3; }
    log(`= dispatch applied: ${p.launches.length} launches, ${p.archives.length} archives, ${writes} GitHub writes; quota ${p.flags.quota}${p.flags.pause ? "; PAUSED" : ""}`);
    return 0;
  }
  if (argv.includes("--json")) log(JSON.stringify(p, null, 2));
  else { for (const line of renderPlan(p)) log(line); log(""); log(p.board); log(`= dispatch plan: ${p.launches.length} launches, ${p.labels.length} label edits, ${p.archives.length} archives, ${p.skipped.length} skips; quota ${p.flags.quota}${p.flags.pause ? "; PAUSED" : ""}`); }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
