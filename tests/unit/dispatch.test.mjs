// dispatch — the hourly dispatcher's pure plan (tools/ci/dispatch.mjs planDispatch) over fixture GitHub state:
// ready-issue launches, priority order, caps, quota, claims, stale PRs → needs-owner + CONTINUE, codex 6 h, hold,
// double-launch guard, deploy red, the archive rule, pause flags, the Board markdown, the launch line formats, and the
// 2026-10-27 review fixes: live = working role:worker sessions (H1), archive guards + closed-issue claims (H2), pagination
// (H3), RECORD_LAUNCH after the launch (M4), land/bot PRs never stale (M5), STOP AT (M8), #12 ≠ #123, completed trains,
// and the land-queue backpressure on rule 1 (landQueueMax). No network.
// Every check is an exact equality on the produced string (no regex pins: the assertPins ratchet counts those).
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  planDispatch, DEFAULT_CONFIG, parseHandoff, liveLaunch, extractSessions, sessionRefs, activityAt, applyPlan, loadConfig,
  issuePrompt, continuePrompt, deployRedPrompt, waitingWhy, PROMPT_MAX_LINES, BOARD_MARKER, LAUNCH_RE,
  titleNames, readSessionPages, childSessionIds, sessionsPage, readState, getAll, landProblem, distanceOnlyRefusal, recordToken, recordComment, main, claimedSessionIds,
  renderPlan, PITFALL_LINES, launchRecheck, fetchAll, childrenMain,
} from "../../tools/ci/dispatch.mjs";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const ISO = "2026-10-27T12:00:00.000Z";
const ago = (h) => new Date(NOW - h * 3.6e6).toISOString();
const cfg = (on = {}) => ({ ...DEFAULT_CONFIG, ...on, maxLiveWorkers: { ...DEFAULT_CONFIG.maxLiveWorkers, ...on.maxLiveWorkers } });
const issue = (number, labels, on = {}) => ({ number, title: `Task ${number}`, body: `Do the thing ${number}.`, labels, updated_at: ago(1), comments: [], ...on });
const pr = (number, on = {}) => ({ number, title: `PR ${number}`, draft: true, labels: [], head_sha: "a".repeat(40), head_ref: `cursor/x-${number}`,
  body: "", created_at: ago(30), updated_at: ago(0.5), last_comment_at: null, mergeable: true, lane: null, comments: [], ...on });
const board = (on = {}) => issue(1, [], { title: "Board", ...on });
const dispatchIssue = (labels = []) => issue(2, labels, { title: "Dispatch" });
const launched = (n, h) => ({ author: "bot", body: `dispatch: launched claude:[Worker] #${n} Task for #${n} at ${ago(h)}`, created_at: ago(h) });
const state = (on = {}) => ({ issues: [board(), dispatchIssue()], prs: [], deployRed: false, sessions: [], closedPrs: [], quota: "allowed", ...on });
const skips = (p) => p.skipped.map((s) => `${s.what}: ${s.why}`);
const COMMON = (n = "it") => ["Read docs/WORKERS.md and follow it.",
  "Nobody reads this chat. Never end a turn with a question or a request to the user/Bryce: decide and record it in the PR body, or add `needs-decision` (gh api POST labels) with one comment and keep going, or send_message session_id `@parent`.",
  "Do not use AskUserQuestion; send questions to the dispatcher with send_message session_id @parent.",
  "Before ending a turn while CI runs on your head, call subscribe_pr_activity on your PR; if it fails, keep one background `node tools/ci/ci-watch.mjs --sha <head> --timeout 30` and tell the dispatcher.",
  "Labels: add with `gh api -X POST repos/brycejmurrin/f1-game/issues/<n>/labels -f 'labels[]=<name>'`, remove with `gh api -X DELETE repos/brycejmurrin/f1-game/issues/<n>/labels/<name>`; never MCP issue_write `labels` (it REPLACES the whole list).",
  "Known container-only red: agent-config.test.mjs #38 (`claude plugin validate`) fails in every cloud container, on the untouched tip too; it is not yours.",
  "`gh pr view` and `gh pr list` return HTTP 403 (no GraphQL): read a PR with `gh api repos/brycejmurrin/f1-game/pulls/<n>`.",
  ...PITFALL_LINES,
  "Lane label: lane:claude. Model: claude-sonnet-5-5. Base: claude/f1-game-project-26h3ng (branch cursor/<topic>-<hash> from it; draft PR into it at the first commit).",
  "STOP AT: 300k",
  "At the STOP AT cap, the cost cap ($10 soft) or stuck: push, refresh the PR Plan and ```handoff block, add `needs-owner`, send_message `@parent` one line naming the PR, end.",
  `End at \`land\`: when \`node tools/ci/ready-gate.mjs --pr <n>\` passes flip ready with the MCP update_pull_request draft:false (not the gh api ccr route, which prompts), add \`land\`, refresh the handoff block; GitHub merges ${n}, not you.`];

test("rule 1: a ready, unclaimed issue launches one claude worker with a launch comment on the issue", () => {
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])] }), cfg(), NOW);
  assert.equal(p.launches.length, 1);
  const l = p.launches[0];
  assert.deepEqual([l.kind, l.host, l.number, l.comment.on], ["issue", "claude", 10, 10]);
  assert.equal(l.comment.body, `dispatch: launched claude:[Worker] #10 Task 10 for #10 at ${ISO}`);
  assert.deepEqual(LAUNCH_RE.exec(l.comment.body).slice(1), ["claude", "[Worker] #10 Task 10", "#10", ISO, undefined]);
  assert.deepEqual({ ...l.spec, prompt: "" }, { source_url: "https://github.com/brycejmurrin/f1-game", source_revision: DEFAULT_CONFIG.deployBranch,
    permission_mode: "auto", model: "claude-sonnet-5-5", title: "[Worker] #10 Task 10", tags: ["f1-game-dispatch", "role:worker", "issue:10", "lane:claude"], prompt: "" });
  assert.deepEqual(l.spec.prompt.split("\n"), ["Task: #10 — Task 10", "Do the thing 10.",
    'Claim first: comment "claims #10 — claude:<your session id>" on the issue; stand down if an older claim comment exists. Put `Closes #10` in the PR body.',
    "Add `claimed` ONLY with `gh api -X POST repos/brycejmurrin/f1-game/issues/10/labels -f 'labels[]=claimed'` — never MCP issue_write `labels` (it REPLACES the whole list).",
    "Already fixed on the tip: comment the evidence (commit sha + repro) on #10 and close it as completed; no PR.", ...COMMON()]);
});

test("rule 1: priority first, then the newest updated; the per-run cap and the live-worker cap bound it", () => {
  const issues = [board(), issue(10, ["ready"], { updated_at: ago(5) }), issue(11, ["ready"], { updated_at: ago(1) }), issue(12, ["ready", "priority"], { updated_at: ago(9) }), issue(13, ["ready"], { updated_at: ago(3) })];
  const p = planDispatch(state({ issues }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => l.number), [12, 11, 13, 10]);
  const capped = planDispatch(state({ issues }), cfg({ maxLaunchesPerRun: 2 }), NOW);
  assert.deepEqual(capped.launches.map((l) => l.number), [12, 11]);
  assert.deepEqual(skips(capped), ["issue [Worker] #13 Task 13: maxLaunchesPerRun 2 reached", "issue [Worker] #10 Task 10: maxLaunchesPerRun 2 reached"]);
  // H1: only role:worker sessions RUNNING (or status_bucket WORKING) are live; idle/finished workers, Bryce's own
  // running session and the dispatcher never count (the live page had 8 idle + 1 Bryce = 9 ≥ cap 8: nothing launched).
  const w = (id, status, bucket, tags = ["role:worker"]) => ({ id, title: "w", status, bucket, tags });
  const sessions = [w("session_A", "SESSION_STATUS_IDLE", "SESSION_STATUS_BUCKET_COMPLETED"), w("session_B", "SESSION_STATUS_RUNNING", ""),
    w("session_C", "SESSION_STATUS_RUNNING", "SESSION_STATUS_BUCKET_WORKING", []), w("session_D", "SESSION_STATUS_IDLE", "SESSION_STATUS_BUCKET_WORKING"),
    w("session_E", "SESSION_STATUS_RUNNING", "SESSION_STATUS_BUCKET_WORKING", ["no-archive", "role:dispatcher"]),
    w("session_F", "SESSION_STATUS_IDLE", "SESSION_STATUS_BUCKET_BLOCKED")];
  const live = planDispatch(state({ issues, sessions }), cfg({ maxLiveWorkers: { claude: 3 } }), NOW);
  assert.equal(live.live.claude, 3, "B running + D working, plus the one launch");
  assert.equal(live.launches.length, 1, "3 - 2 live = one slot");
  assert.equal(skips(live)[0], "issue [Worker] #11 Task 11: maxLiveWorkers.claude 3 reached (3 live)");
  const idle = Array.from({ length: 9 }, (_, i) => w(`session_I${i}`, "SESSION_STATUS_IDLE", "SESSION_STATUS_BUCKET_COMPLETED"));
  assert.equal(planDispatch(state({ issues, sessions: idle }), cfg(), NOW).launches.length, 4, "nine idle workers block nothing");
});

test("H1/L2: a recent launch comment counts as live unless a listed session names its target as a whole token (#12 is not #123)", () => {
  const issues = [board(), issue(12, ["ready", "claimed"], { comments: [launched(12, 1)] }), issue(20, ["ready"])];
  const s123 = [{ id: "session_X", title: "[Worker] #123 other", status: "SESSION_STATUS_IDLE", tags: ["role:worker"] }];
  assert.equal(planDispatch(state({ issues, sessions: s123 }), cfg(), NOW).live.claude, 2, "#123 does not match the #12 launch: it stays live");
  const s12 = [{ id: "session_Y", title: "[Worker] #12 Task", status: "SESSION_STATUS_IDLE", tags: ["role:worker"] }];
  assert.equal(planDispatch(state({ issues, sessions: s12 }), cfg(), NOW).live.claude, 1, "the idle #12 session matched: the launch is done, not live");
  assert.deepEqual([titleNames("[Worker] #123 x", "#12"), titleNames("[Worker] #12 x", "#12"), titleNames("x #12", "#12"), titleNames("[Worker] deploy:red fixer", "deploy:red")], [false, true, true, true]);
});

test("has_more: a last list_sessions page with has_more launches nothing; pages merge by id", () => {
  const page = (data, more) => JSON.stringify({ ccr: { data, has_more: more } });
  const a = { id: "session_01A", title: "a", session_status: "SESSION_STATUS_RUNNING", status_bucket: "SESSION_STATUS_BUCKET_WORKING", tags: ["role:worker"] };
  const b = { id: "session_01B", title: "b", session_status: "SESSION_STATUS_IDLE", tags: [] };
  const r = readSessionPages([page([a], true), page([a, b], false)]);
  assert.deepEqual([r.sessions.map((s) => s.id), r.complete, r.sessions[0].bucket], [["session_01A", "session_01B"], true, "SESSION_STATUS_BUCKET_WORKING"]);
  assert.equal(readSessionPages([page([a], true)]).complete, false);
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], sessionsComplete: false }), cfg(), NOW);
  assert.deepEqual([p.launches.length, skips(p)[0]], [0, "issue [Worker] #10 Task 10: the last list_sessions page says has_more: pass every page (--sessions per page) so live workers are counted"]);
});

test("rule 1: a quota that is not `allowed` launches nothing and says why; claimed/blocked/needs-decision issues are skipped", () => {
  for (const quota of ["allowed_warning", "rejected", "unknown"]) {
    const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], quota }), cfg(), NOW);
    const why = quota === "rejected" ? "quota rejected: launch nothing; disable the hourly dispatcher trigger until the limit resets" : `quota ${quota}: launch nothing`;
    assert.deepEqual([p.launches.length, skips(p)[0]], [0, `issue [Worker] #10 Task 10: ${why}`], quota);
    assert.equal(p.board.split("\n")[3], `quota: **${quota}** · pause: false · merge-pause: false · deploy: green`);
  }
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready", "claimed"]), issue(11, ["ready", "blocked"]), issue(12, ["ready", "needs-decision"])] }), cfg(), NOW);
  assert.equal(p.launches.length, 0);
});

test("rule 1: a launch comment younger than launchClaimHours is a live claim (no double launch); an older one is not", () => {
  const young = planDispatch(state({ issues: [board(), issue(10, ["ready"], { comments: [launched(10, 1)] })] }), cfg(), NOW);
  assert.deepEqual([young.launches.length, skips(young)], [0, ["issue #10: launched claude 1h ago (live claim)"]]);
  const old = planDispatch(state({ issues: [board(), issue(10, ["ready"], { comments: [launched(10, 3)] })] }), cfg(), NOW);
  assert.equal(old.launches.length, 1);
  assert.equal(liveLaunch([launched(10, 1)], NOW, 2).host, "claude");
  assert.equal(liveLaunch([launched(10, 3)], NOW, 2), null);
});

test("rule 1: lane:cursor launches a CURSOR body only when hosts.cursor.enabled", () => {
  const issues = [board(), issue(10, ["ready", "lane:cursor"])];
  const off = planDispatch(state({ issues }), cfg(), NOW);
  assert.deepEqual([off.launches.length, skips(off)], [0, ["issue #10: lane:cursor but hosts.cursor.enabled is false"]]);
  const cursorCfg = cfg({ hosts: { cursor: { enabled: true, model: "composer-2.5" } } });
  const on = planDispatch(state({ issues }), cursorCfg, NOW);
  const spec = on.launches[0].spec;
  assert.equal(on.launches[0].host, "cursor");
  assert.deepEqual({ ...spec, prompt: spec.prompt.text.split("\n")[0] }, { prompt: "Task: #10 — Task 10", model: { id: "composer-2.5" }, name: "[Worker] #10 Task 10",
    env: { type: "cloud" }, repos: [{ url: "https://github.com/brycejmurrin/f1-game", startingRef: DEFAULT_CONFIG.deployBranch }], autoCreatePR: false, workOnCurrentBranch: false });
  assert.equal(spec.prompt.text, issuePrompt(issues[1], cursorCfg, "cursor"));
});

const CURSOR_TAIL = [
  "Read docs/WORKERS.md §Per vendor (Cursor). Do not add labels, claim, post issue comments, or open issues.",
  "Symbols: get_mcp_tools once for apex-lsp, then lsp_outline, lsp_definition (read the body), lsp_callers. Grep only comments, docs, and CSS. lsp_diagnostics once after the edit, before tests.",
  "Do not spawn task_v2 scouts. Grep the defect ledger yourself (≤30 KNOWN rows).",
  "Gate, in this order, once: edit; npm run gen; the one spec pick-tests names; tooling-fast --changed --jobs=3; commit; push. Repeat the gate only when GitHub says CONFLICTING.",
  "Write the ```handoff fence yourself (branch, head, verified, not-run, next). Put run-ci, lane:cursor, and land in next:; do not apply them.",
  "Do not call subscribe_pr_activity or subscribe_github_*. A CI notification is not a new task. Stop when the draft PR is pushed and the fence is current. Do not add land.",
  "Lane: lane:cursor. Model: composer-2.5. Base: claude/f1-game-project-26h3ng (branch cursor/<topic>-<hash>; draft PR at the first commit).",
  "STOP AT: 300k",
  "At the STOP AT cap, the cost cap ($10 soft) or stuck: push, refresh the PR Plan and ```handoff block, name the blocker in next:, end.",
];

test("rule 1: a cursor prompt is at most 25 lines, ends with the cursor tail, and does not tell the agent to label, subscribe, or end at land", () => {
  const c = cfg({ hosts: { cursor: { enabled: true, model: "composer-2.5" } } });
  const long = issue(10, ["ready", "lane:cursor"], { body: Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(200)}`).join("\n") });
  const hand = "```handoff\n" + Array.from({ length: 20 }, (_, i) => `k${i}: v`).join("\n") + "\n```";
  const text = issuePrompt(long, c, "cursor");
  const lines = text.split("\n");
  assert.ok(lines.length <= PROMPT_MAX_LINES, `${lines.length} lines`);
  assert.deepEqual(lines.slice(-CURSOR_TAIL.length), CURSOR_TAIL);
  assert.equal(lines.filter((l) => l === "STOP AT: 300k").length, 1);
  for (const banned of ["call subscribe_pr_activity on your PR", "gh api", "End at `land`", "Claim first", "issue_write", "needs-owner"]) {
    const hit = text.includes(banned);
    assert.equal(hit, false, banned);
  }
  const cont = continuePrompt(pr(20, { body: hand }), c, "cursor");
  const contLines = cont.split("\n");
  assert.ok(contLines.length <= PROMPT_MAX_LINES, `${contLines.length} continue lines`);
  assert.deepEqual(contLines.slice(-CURSOR_TAIL.length), CURSOR_TAIL);
  const contAdopt = cont.includes("adopts PR");
  const contLand = cont.includes("`land` when ready-gate");
  assert.equal(contAdopt, false);
  assert.equal(contLand, false);
  const red = deployRedPrompt(c, "cursor");
  const redLines = red.split("\n");
  assert.ok(redLines.length <= PROMPT_MAX_LINES, `${redLines.length} deploy-red lines`);
  assert.deepEqual(redLines.slice(-CURSOR_TAIL.length), CURSOR_TAIL);
  const redClaim = red.includes("Claim first");
  const redLabel = red.includes("labelled");
  assert.equal(redClaim, false);
  assert.equal(redLabel, false);
});

test("rule 2: a PR silent 2 h gets needs-owner and ONE CONTINUE takeover carrying the handoff block", () => {
  const body = "## Goal\nx\n```handoff\nbranch: cursor/x-20\nhead: abc1234\nverified: tooling-fast = run passed\nnot run: group tlx\nnext: fix the red spec\nowner: claude:session_01OLDOLDOLDOLDOLD\n```\n";
  const p = planDispatch(state({ prs: [pr(20, { updated_at: ago(3), body })] }), cfg(), NOW);
  assert.deepEqual(p.labels, [{ number: 20, add: ["needs-owner"], remove: [] }]);
  assert.equal(p.launches.length, 1);
  const l = p.launches[0];
  assert.deepEqual([l.kind, l.comment.on, l.spec.tags], ["continue", 20, ["f1-game-dispatch", "role:worker", "pr:20", "lane:claude"]]);
  assert.deepEqual(l.spec.prompt.split("\n"), ["CONTINUE PR #20 — PR 20", "Hand-off block from the PR body:", "  branch: cursor/x-20", "  head: abc1234",
    "  verified: tooling-fast = run passed", "  notRun: group tlx", "  next: fix the red spec", "  owner: claude:session_01OLDOLDOLDOLDOLD",
    'Adopted for you: the dispatcher posts "adopts PR #20 — claude:<your session id>" and removes `needs-owner` when it records your launch; do neither. Set `owner:` in the handoff block; stand down if a newer adoption comment exists.',
    "Check out its branch (cursor/x-20); fix the red or the conflict (merge origin via sync-pr.mjs, never rebase); push; `land` when ready-gate passes.", ...COMMON("#20")]);
  assert.deepEqual(parseHandoff(body), { branch: "cursor/x-20", head: "abc1234", verified: "tooling-fast = run passed", notRun: "group tlx", next: "fix the red spec", owner: "claude:session_01OLDOLDOLDOLDOLD" });
  assert.equal(parseHandoff("no block"), null);
  const fresh = planDispatch(state({ prs: [pr(21, { updated_at: ago(3), last_comment_at: ago(1) })] }), cfg(), NOW);
  assert.equal(fresh.launches.length, 0, "a comment 1 h ago is activity");
});

test("rule 2: lane:codex waits 6 h; hold or needs-decision blocks the takeover; a takeover launched < 2 h ago is not repeated", () => {
  const codex = (h, on = {}) => pr(30, { labels: ["lane:codex"], updated_at: ago(h), ...on });
  assert.equal(planDispatch(state({ prs: [codex(5)] }), cfg(), NOW).launches.length, 0);
  assert.equal(planDispatch(state({ prs: [codex(7)] }), cfg(), NOW).launches.length, 1);
  for (const blocker of ["hold", "needs-decision"]) {
    const p = planDispatch(state({ prs: [pr(31, { labels: [blocker], updated_at: ago(9) })] }), cfg(), NOW);
    assert.deepEqual([p.launches.length, p.labels.length, skips(p)], [0, 0, [`PR #31: stale 9h but ${blocker}`]], blocker);
  }
  const taken = { author: "bot", body: `dispatch: launched claude:[Worker] CONTINUE PR #32 for #32 at ${ago(1)}`, created_at: ago(1) };
  const p = planDispatch(state({ prs: [pr(32, { labels: ["needs-owner"], updated_at: ago(9), comments: [taken] })] }), cfg(), NOW);
  assert.deepEqual([p.launches.length, p.labels.length, skips(p)], [0, 0, ["PR #32: takeover launched 1h ago (live claim)"]]);
  assert.equal(activityAt(pr(32, { updated_at: ago(9), comments: [taken] })), NOW - 9 * 3.6e6, "a dispatcher launch comment is not activity");
  assert.equal(activityAt(pr(32, { updated_at: ago(9), comments: [{ body: "fixed it", created_at: ago(4) }] })), NOW - 4 * 3.6e6);
});

test("rule 3: deploy red labels the Board and launches one fixer, unless a PR carries deploy:red or one was launched < 2 h ago; green removes the label", () => {
  const red = planDispatch(state({ deployRed: true }), cfg(), NOW);
  assert.deepEqual(red.labels, [{ number: 1, add: ["deploy:red"], remove: [] }]);
  assert.equal(red.launches.length, 1);
  assert.deepEqual([red.launches[0].kind, red.launches[0].comment.on], ["deploy-red", 1], "the launch comment goes on the Board issue");
  assert.equal(red.launches[0].comment.body, `dispatch: launched claude:[Worker] deploy:red fixer for deploy:red at ${ISO}`);
  const claimed = planDispatch(state({ deployRed: true, prs: [pr(40, { labels: ["deploy:red"] })] }), cfg(), NOW);
  assert.deepEqual([claimed.launches.length, skips(claimed)], [0, ["deploy:red fixer: PR #40 carries deploy:red"]]);
  const fixer = { author: "bot", body: `dispatch: launched claude:[Worker] deploy:red fixer for deploy:red at ${ago(1)}`, created_at: ago(1) };
  const again = planDispatch(state({ deployRed: true, issues: [board({ labels: ["deploy:red"], comments: [fixer] })] }), cfg(), NOW);
  assert.deepEqual([again.launches.length, again.labels.length, skips(again)], [0, 0, ["deploy:red fixer: launched 1h ago (live claim)"]]);
  const green = planDispatch(state({ issues: [board({ labels: ["deploy:red"] })] }), cfg(), NOW);
  assert.deepEqual(green.labels, [{ number: 1, add: [], remove: ["deploy:red"] }]);
});

test("rule 4: archive only a claimed session whose every PR and issue is done > archiveAfterMinutes; never unclaimed, running or open", () => {
  const claim = (id) => ({ author: "w", body: `claims #50 — claude:${id}`, created_at: ago(5) });
  const W = ["role:worker"];
  const sessions = [
    { id: "session_01DONE000000", title: "[Worker] CONTINUE PR #60 x", status: "SESSION_STATUS_IDLE", tags: W },
    { id: "session_01ISSUE000000", title: "[Worker] #50 Task 50", status: "SESSION_STATUS_IDLE", tags: ["issue:50", ...W] },
    { id: "session_01NOCLAIM0000", title: "[Worker] #61", status: "SESSION_STATUS_IDLE", tags: ["pr:61", ...W] },
    { id: "session_01RUNNING0000", title: "[Worker] #62", status: "SESSION_STATUS_RUNNING", pr: 62, tags: W },
    { id: "session_01OPEN00000000", title: "[Worker] #63", status: "SESSION_STATUS_IDLE", pr: 63, tags: W },
    { id: "session_01YOUNG0000000", title: "[Worker] #64", status: "SESSION_STATUS_IDLE", pr: 64, tags: W },
    { id: "session_01OPENISSUE000", title: "[Worker] #10 Task 10", status: "SESSION_STATUS_IDLE", tags: W },
    { id: "session_01NOPR00000000", title: "[Worker] no pr", status: "SESSION_STATUS_IDLE", tags: W },
  ];
  const issues = [board(), issue(10, ["claimed"], { comments: sessions.filter((s) => !/NOCLAIM/.test(s.id)).map((s) => claim(s.id)) })];
  const closedPrs = [{ number: 60, merged: true, merged_at: ago(3), closed_at: ago(3) }, { number: 61, merged: false, closed_at: ago(3) },
    { number: 62, merged: true, closed_at: ago(3) }, { number: 64, merged: true, closed_at: ago(0.5) }];
  const p = planDispatch(state({ issues, prs: [pr(63)], sessions, closedPrs, closedIssues: [{ number: 50, closed_at: ago(2) }] }), cfg(), NOW);
  assert.deepEqual(p.archives, [{ id: "session_01DONE000000", why: "PR #60 merged 180 min ago" }, { id: "session_01ISSUE000000", why: "#50 closed 120 min ago" }]);
  assert.deepEqual(skips(p), ["session session_01NOCLAIM0000: keep: no claim comment names it", "session session_01RUNNING0000: keep: still running",
    "session session_01OPEN00000000: keep: PR #63 still open", "session session_01YOUNG0000000: keep: closed 30 min ago (rule: ≥ 60)",
    "session session_01OPENISSUE000: keep: #10 still open", "session session_01NOPR00000000: keep: names no PR or issue"]);
  assert.deepEqual(sessionRefs({ pr: 5, tags: ["pr:6", "issue:8"], title: "[Worker] CONTINUE PR #7 and #9" }), { prs: [5, 6, 7], issues: [8, 9] });
});

test("rule 4 (H2): claims on CLOSED issues count; the Board comment is never a claim; no-archive, role:dispatcher, untagged and BLOCKED sessions are kept", () => {
  const closedIssue = (n, id) => ({ number: n, closed_at: ago(3), comments: [{ body: `claims #${n} — claude:${id}`, created_at: ago(5) }] });
  const s = (id, n, tags, extra = {}) => ({ id, title: `[Worker] #${n} x`, status: "SESSION_STATUS_IDLE", bucket: "SESSION_STATUS_BUCKET_COMPLETED", tags: [`issue:${n}`, ...tags], ...extra });
  const sessions = [s("session_01CLOSEDCLAIM", 90, ["role:worker"]), s("session_01BRYCEIOS000", 91, ["no-archive"]), s("session_01DISPATCHER0", 92, ["role:dispatcher"]),
    s("session_01UNTAGGED0000", 93, []), s("session_01BLOCKED00000", 94, ["role:worker"], { bucket: "SESSION_STATUS_BUCKET_BLOCKED" }),
    s("session_01BOARDONLY000", 95, ["role:worker"])];
  // The Board comment lists sessions in its skip list: that must never make them "claimed" (review H2 bypass).
  const boardComment = { body: `${BOARD_MARKER}\n- session session_01BOARDONLY000: keep: no claim comment names it (claims #95 — claude:session_01BOARDONLY000)`, created_at: ago(1) };
  const closedIssues = [closedIssue(90, "session_01CLOSEDCLAIM"), ...[91, 92, 93, 94].map((n) => closedIssue(n, sessions[n - 90].id)), { number: 95, closed_at: ago(3), comments: [] }];
  const p = planDispatch(state({ issues: [board({ comments: [boardComment] })], sessions, closedIssues }), cfg(), NOW);
  assert.deepEqual(p.archives, [{ id: "session_01CLOSEDCLAIM", why: "#90 closed 180 min ago" }]);
  assert.deepEqual(skips(p), ["session session_01BRYCEIOS000: keep: tagged no-archive", "session session_01DISPATCHER0: keep: role:dispatcher",
    "session session_01UNTAGGED0000: keep: no role:worker tag (not a dispatched worker)", "session session_01BLOCKED00000: keep: blocked (waiting on a human)",
    "session session_01BOARDONLY000: keep: no claim comment names it"]);
  assert.deepEqual([...claimedSessionIds({ prs: [pr(1, { body: "```handoff\nowner: claude:session_01OWNER0000000\n```\nsee session_01MENTION000000" })] })], ["session_01OWNER0000000"]);
});

test("pause: the config file or a dispatch:pause label on the Dispatch issue launches nothing; merge-pause is reported", () => {
  const issues = [board(), dispatchIssue(["dispatch:pause"]), issue(10, ["ready"])];
  const byLabel = planDispatch(state({ issues }), cfg(), NOW);
  assert.deepEqual([byLabel.launches.length, byLabel.flags.pause, skips(byLabel)], [0, true, ["issue [Worker] #10 Task 10: paused (dispatch:pause)"]]);
  const byFile = planDispatch(state({ issues: [board(), dispatchIssue(), issue(10, ["ready"])] }), cfg({ pause: true }), NOW);
  assert.equal(byFile.launches.length, 0);
  const mp = planDispatch(state({ issues: [board(), dispatchIssue(["dispatch:merge-pause"])] }), cfg(), NOW);
  assert.equal(mp.flags.mergePause, true);
  assert.equal(mp.board.split("\n")[3], "quota: **allowed** · pause: false · merge-pause: true · deploy: green");
  assert.equal(planDispatch(state(), cfg(), NOW).flags.pause, false);
});

test("board: the markdown carries the marker, one row per open PR (owner from the handoff block), launches, caps", () => {
  const body = "```handoff\nowner: claude:session_01ABCDEFGHIJKLMNOP\n```";
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [pr(70, { labels: ["run-ci", "lane:claude"], body, draft: false }), pr(71)] }), cfg(), NOW);
  assert.deepEqual(p.board.split("\n").slice(0, 13), [BOARD_MARKER, `## Board — ${ISO}`, "",
    "quota: **allowed** · pause: false · merge-pause: false · deploy: green", "caps: launches/run 4; live workers claude 1/8, cursor 0/4; cost cap $10 · land queue 0/15", "",
    "| PR | title | state | age | owner | last activity | labels |", "|---|---|---|---|---|---|---|",
    "| #70 | PR 70 | ready | 30h | claude:session_01ABCDEFGHIJKLMNOP | 30m ago | run-ci, lane:claude |", "| #71 | PR 71 | draft | 30h | - | 30m ago | - |", "",
    "### Launches this run (1)", "- claude: [Worker] #10 Task 10"]);
  assert.equal(p.boardIssue, 1);
});

test("prompts: every launch prompt is at most 25 lines and ends with the common lines (WORKERS.md, nobody reads chat, subscribe, labels, lane, base, STOP AT, cap, land)", () => {
  const c = cfg();
  const long = issue(10, ["ready"], { body: Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(200)}`).join("\n") });
  const hand = "```handoff\n" + Array.from({ length: 20 }, (_, i) => `k${i}: v`).join("\n") + "\n```";
  for (const [text, n] of [[issuePrompt(long, c, "claude"), "it"], [continuePrompt(pr(20, { body: hand }), c, "claude"), "#20"], [continuePrompt(pr(21), c, "claude"), "#21"], [deployRedPrompt(c, "claude"), "it"]]) {
    const lines = text.split("\n");
    assert.ok(lines.length <= PROMPT_MAX_LINES, `${lines.length} lines`);
    assert.deepEqual(lines.slice(-COMMON().length), COMMON(n));
    assert.equal(lines.filter((l) => l === "STOP AT: 300k").length, 1, "M8: context-cap.py reads the brief's one STOP AT line");
  }
  assert.equal(issuePrompt(long, c, "claude").split("\n")[1].length, 160, "a body line is cut at 160 chars");
});

test("apply (M4): labels and the Board edit go through the client; NO launch comment before the launch — a RECORD_LAUNCH line follows each launch", () => {
  const calls = [], out = [];
  const api = (p, o = {}) => {
    calls.push(`${o.method || "GET"} ${p}`);
    if (p === "issues/1/comments?per_page=100&page=1") return { json: [{ id: 9, body: `${BOARD_MARKER}\nold` }] };
    return { json: {} };
  };
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [pr(20, { updated_at: ago(3) })] }), cfg(), NOW);
  p.archives.push({ id: "session_01DONE000000", why: "test" });   // exercise the print path directly
  const writes = applyPlan(p, { api, config: cfg(), log: (s) => out.push(s) });
  // the re-check (finding 7) reads the PR, its commits and the issue right before each CREATE_SESSION line
  assert.deepEqual(calls, ["POST issues/20/labels", "GET issues/1/comments?per_page=100&page=1", "PATCH issues/comments/9",
    "GET pulls/20", "GET pulls/20/commits?per_page=30", "GET issues/10"]);
  assert.equal(writes, 2);
  const line = (s, tag) => [s.slice(0, tag.length), JSON.parse(s.slice(tag.length))];
  assert.deepEqual(line(out[0], "CREATE_SESSION ")[1].source_url, "https://github.com/brycejmurrin/f1-game");
  assert.equal(line(out[0], "CREATE_SESSION ")[1].title, "[Worker] CONTINUE PR #20 PR 20");
  assert.equal(out[1], `RECORD_LAUNCH node tools/ci/dispatch.mjs --record-launch ${recordToken(p.launches[0])} --session {SESSION_ID}`);
  assert.equal(line(out[2], "CREATE_SESSION ")[1].title, "[Worker] #10 Task 10");
  assert.equal(out[3].slice(0, 14), "RECORD_LAUNCH ");
  assert.equal(out[4], "ARCHIVE_SESSION session_01DONE000000");
  // --record-launch posts the launch comment, stamped when it runs, on the planned issue.
  const later = NOW + 60e3, posted = [], log = [];
  const issueLaunch = p.launches.find((l) => l.kind === "issue");
  const rc = main(["--record-launch", recordToken(issueLaunch)], { api: (path, o) => (posted.push([path, o.method, o.body.body]), { json: {} }), log: (s) => log.push(s), now: () => later });
  assert.equal(rc, 0);
  assert.deepEqual(posted, [["issues/10/comments", "POST", "dispatch: launched claude:[Worker] #10 Task 10 for #10 at 2026-10-27T12:01:00.000Z"]]);
  assert.equal(liveLaunch([{ body: posted[0][2] }], later, 2).target, "#10");
  assert.equal(recordComment(recordToken({ host: "claude", title: "[Worker] #7 fix for #5 crash", number: 7, comment: { on: 7 } }), NOW).body,
    `dispatch: launched claude:[Worker] #7 fix / #5 crash for #7 at ${ISO}`, "a title saying 'for #5' is reworded so the target parses");
  assert.equal(main(["--record-launch", "bm90IGpzb24"], { api: () => assert.fail("no POST"), log: () => {} }), 1);
});

test("H3: readState paginates issues, PRs and comments, so the Board and Dispatch issues are found past page 1; L1: deployRed reads the newest COMPLETED train", () => {
  const calls = [];
  const iss = (n, title = `Issue ${n}`, labels = []) => ({ number: n, title, labels: labels.map((name) => ({ name })), body: "", updated_at: ago(1) });
  const page1 = Array.from({ length: 100 }, (_, i) => iss(500 - i));
  const page2 = [iss(5, "Board"), iss(6, "Dispatch", ["dispatch:pause"]), iss(7, "Old ready", ["ready"])];
  const comments = Array.from({ length: 100 }, (_, i) => ({ id: i, body: `c${i}`, created_at: ago(5) }));
  const api = (p) => {
    calls.push(p);
    if (p === "issues?state=open&per_page=100&page=1") return { json: page1 };
    if (p === "issues?state=open&per_page=100&page=2") return { json: page2 };
    if (p.startsWith("pulls?state=open")) return { json: p.endsWith("page=1") ? [{ number: 9, title: "p", head: { sha: "b".repeat(40), ref: "bot/changelog-fold" }, user: { login: "github-actions[bot]" }, labels: [], updated_at: ago(9) }] : [] };
    if (p === "issues/9/comments?per_page=100&page=1") return { json: comments };
    if (p === "issues/9/comments?per_page=100&page=2") return { json: [{ id: 100, body: "newest", created_at: ago(0.2) }] };
    if (p.includes("/comments")) return { json: [] };
    if (p.startsWith("actions/workflows/pages.yml/runs")) return { json: { workflow_runs: [{ conclusion: "failure" }] } };
    return { json: {} };
  };
  const s = readState({ api, config: DEFAULT_CONFIG, quota: "allowed" });
  assert.deepEqual(s.issues.slice(-3).map((i) => i.title), ["Board", "Dispatch", "Old ready"]);
  assert.equal(s.prs[0].comments.length, 101, "the newest comment sits on page 2");
  assert.equal(s.prs[0].last_comment_at, ago(0.2));
  assert.equal(s.deployRed, true);
  assert.equal(calls.find((c) => c.startsWith("actions/")), `actions/workflows/pages.yml/runs?branch=${encodeURIComponent(DEFAULT_CONFIG.deployBranch)}&status=completed&per_page=1`);
  const p = planDispatch(s, DEFAULT_CONFIG, NOW);
  assert.deepEqual([p.boardIssue, p.dispatchIssue, p.flags.pause], [5, 6, true]);
  assert.equal(skips(p).includes("issue [Worker] #7 Old ready: paused (dispatch:pause)"), true, "a ready issue on page 2 is planned");
  assert.deepEqual(getAll(() => ({ json: { check_runs: [{ id: 1 }] } }), "commits/x/check-runs", { pick: (j) => j.check_runs }), [{ id: 1 }]);
});

test("M5: a `land` PR waiting on CI/gate is not stale; a red or conflicting one is; fold-bot PRs are never re-owned; updated_at is the activity clock", () => {
  const land = (on) => pr(80, { labels: ["land"], updated_at: ago(5), ...on });
  const waiting = planDispatch(state({ prs: [land({ checks: [{ id: 1, name: "CI", status: "in_progress", conclusion: null }, { id: 2, name: "gate", status: "in_progress", conclusion: null }] })] }), cfg(), NOW);
  assert.deepEqual([waiting.launches.length, skips(waiting)], [0, ["PR #80: stale 5h but labelled land and waiting on CI/gate/train"]]);
  const rerun = land({ checks: [{ id: 1, name: "CI", status: "completed", conclusion: "failure" }, { id: 3, name: "CI", status: "completed", conclusion: "success" }] });
  assert.equal(landProblem(rerun), null, "the newest run of a check name decides");
  const red = land({ checks: [{ id: 1, name: "CI", status: "completed", conclusion: "failure" }] });
  assert.equal(planDispatch(state({ prs: [red] }), cfg(), NOW).launches[0].kind, "continue");
  assert.equal(landProblem(land({ mergeable_state: "dirty" })), "merge conflict");
  for (const bot of [{ head_ref: "bot/changelog-fold" }, { head_ref: "bot/ratchets-fold-40877449797" }, { author: "github-actions[bot]" }]) {
    const p = planDispatch(state({ prs: [pr(81, { updated_at: ago(9), ...bot })] }), cfg(), NOW);
    assert.deepEqual([p.launches.length, p.labels.length, skips(p)], [0, 0, ["PR #81: stale 9h but a fold bot's PR (never re-owned)"]]);
  }
  assert.equal(activityAt(pr(82, { updated_at: ago(1), comments: [{ body: "x", created_at: ago(4) }] })), NOW - 3.6e6, "a push or label bumps updated_at");
});

test("extractSessions reads an MCP page with its envelope; loadConfig merges the file over the defaults", () => {
  const page = '<other-session>\nrecord\n{"ccr": {"data": [{"id": "session_01X", "title": "[Worker] #5", "session_status": "SESSION_STATUS_IDLE", "tags": ["pr:5"]}], "has_more": false}}\n</other-session>';
  assert.deepEqual(extractSessions(page).map((s) => [s.id, s.status, sessionRefs(s).prs]), [["session_01X", "SESSION_STATUS_IDLE", [5]]]);
  const c = loadConfig("x.json", () => JSON.stringify({ maxLaunchesPerRun: 1, staleHours: { codex: 9 } }));
  assert.deepEqual([c.maxLaunchesPerRun, c.staleHours, c.model], [1, { default: 2, codex: 9 }, "claude-sonnet-5-5"]);
  assert.equal(loadConfig("missing.json", () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); }).maxLaunchesPerRun, 4);
});

test("children, not history: launch comments name the session; --children lists only the sessions GitHub names", () => {
  const tok = recordToken({ comment: { on: 10 }, host: "claude", title: "[Worker] #10 Task 10", number: 10 });
  const sid = "session_017Yzwxw8VfSo9sSSFypx4SF";
  const c = recordComment(tok, NOW, sid);
  assert.equal(c.body, `dispatch: launched claude:[Worker] #10 Task 10 for #10 at ${ISO} as ${sid}`);
  assert.equal(LAUNCH_RE.exec(c.body)[5], sid);
  assert.throws(() => recordComment(tok, NOW, "not-a-session"), /--session is not a session id/);
  const claim = "session_01AbCdEfGhIjKlMn", owner = "session_01ZyXwVuTsRqPoNm";
  const st = { issues: [{ number: 10, comments: [{ body: c.body }] }], prs: [{ number: 20, body: "```handoff\nowner: claude:" + owner + "\n```", comments: [] }],
    closedIssues: [{ number: 30, comments: [{ body: `claims #30 — claude:${claim}` }] }], closedPrs: [] };
  assert.deepEqual(childSessionIds(st), [owner, claim, sid].sort());
  const one = JSON.stringify({ ccr: { id: sid, title: "[Worker] #10", session_status: "SESSION_STATUS_RUNNING", status_bucket: "SESSION_STATUS_BUCKET_WORKING", tags: ["role:worker"] } });
  const pg = sessionsPage(one);
  assert.deepEqual([pg.hasMore, pg.sessions.length, pg.sessions[0].id, pg.sessions[0].bucket], [false, 1, sid, "SESSION_STATUS_BUCKET_WORKING"]);
  assert.equal(readSessionPages([one]).complete, true, "get_session results are a complete set");
});

test("WP-L7 F5: a `land` PR whose `gate` commit STATUS failed (or sat pending past staleHours) is re-owned; merge-pause parks it on purpose", () => {
  const land = (statuses) => pr(90, { labels: ["land"], updated_at: ago(5), checks: [{ id: 1, name: "CI", status: "completed", conclusion: "success" }], statuses });
  const failed = land([{ context: "gate", state: "failure", updated_at: ago(4) }, { context: "other", state: "success", updated_at: ago(4) }]);
  assert.equal(landProblem(failed, NOW, 2), "gate failure");
  const p = planDispatch(state({ prs: [failed] }), cfg(), NOW);
  assert.deepEqual([p.labels, p.launches.map((l) => l.kind)], [[{ number: 90, add: ["needs-owner"], remove: [] }], ["continue"]]);
  const oldPending = land([{ context: "gate", state: "pending", updated_at: ago(3) }]);
  assert.equal(landProblem(oldPending, NOW, 2), "gate pending 3h");
  assert.equal(planDispatch(state({ prs: [oldPending] }), cfg(), NOW).launches.length, 1);
  assert.equal(landProblem(land([{ context: "gate", state: "pending", updated_at: ago(1) }]), NOW, 2), null, "a young pending gate only waits");
  assert.equal(landProblem(oldPending, NOW, 2, true), null, "dispatch:merge-pause holds gate pending on purpose");
  const paused = planDispatch(state({ issues: [board(), dispatchIssue(["dispatch:merge-pause"])], prs: [oldPending] }), cfg(), NOW);
  assert.deepEqual(skips(paused), ["PR #90: stale 5h but labelled land and waiting on CI/gate/train"]);
  const newerGreen = land([{ context: "gate", state: "failure", updated_at: ago(4) }, { context: "gate", state: "success", updated_at: ago(3) }]);
  assert.equal(landProblem(newerGreen, NOW, 2), null, "the newest gate status decides");
});

test("a distance-only gate refusal waits for land.yml AUTO-SYNC; any other refusal is still re-owned", () => {
  const refused = (description) => ({ context: "gate", state: "failure", updated_at: ago(4), description });
  const land = (gate) => pr(92, { labels: ["land"], updated_at: ago(5), checks: [{ id: 1, name: "CI", status: "completed", conclusion: "success" }], statuses: [gate] });
  const only = "= merge-gate refused — open=ok hold=ok plan=ok ci=ok distance=FAIL pr=#92 sha=5897ccfd tip=265cf15";
  assert.equal(distanceOnlyRefusal(only), true);
  assert.equal(landProblem(land(refused(only)), NOW, 2), null, "a distance-only refusal only waits");
  assert.equal(planDispatch(state({ prs: [land(refused(only))] }), cfg(), NOW).launches.length, 0, "no takeover worker just to sync");
  assert.equal(distanceOnlyRefusal("= merge-gate refused — open=ok hold=ok plan=ok ci=WAIT distance=FAIL pr=#92"), true, "CI still running only waits too");
  for (const d of ["= merge-gate refused — open=ok hold=ok plan=ok ci=ok gen=FAIL distance=FAIL pr=#92", "= merge-gate refused — open=ok hold=FAIL plan=ok ci=ok distance=FAIL pr=#92",
    "= merge-gate refused — open=ok hold=ok plan=ok ci=FAIL distance=FAIL pr=#92", "= merge-gate refused — open=ok hold=ok plan=ok ci=ok distance=ok pr=#92", "x", "", undefined]) {
    assert.equal(distanceOnlyRefusal(d), false, String(d));
  }
  assert.equal(landProblem(land(refused("= merge-gate refused — open=ok hold=ok plan=ok ci=FAIL distance=FAIL pr=#92")), NOW, 2), "gate failure", "a failed ci row is still a problem");
  assert.equal(landProblem(land({ context: "gate", state: "error", updated_at: ago(4), description: only }), NOW, 2), null, "an error state with a distance-only description waits as well");
});

test("WP-L7 F5: readState reads the `gate` commit status of a land PR", () => {
  const sha = "c".repeat(40);
  const api = (p) => {
    if (p.startsWith("issues?state=open")) return { json: [] };
    if (p.startsWith("pulls?state=open")) return { json: p.endsWith("page=1") ? [{ number: 91, title: "p", head: { sha, ref: "cursor/x" }, user: { login: "u" }, labels: [{ name: "land" }], updated_at: ago(5) }] : [] };
    if (p === "pulls/91") return { json: { mergeable_state: "clean" } };
    if (p.startsWith(`commits/${sha}/check-runs`)) return { json: { check_runs: [] } };
    if (p === `commits/${sha}/status`) return { json: { state: "failure", statuses: [{ context: "gate", state: "failure", created_at: ago(4), updated_at: ago(4), description: "x" }] } };
    if (p.startsWith("actions/")) return { json: { workflow_runs: [] } };
    return { json: [] };
  };
  const s = readState({ api, config: DEFAULT_CONFIG, quota: "allowed" });
  assert.deepEqual(s.prs[0].statuses, [{ context: "gate", state: "failure", description: "x", created_at: ago(4), updated_at: ago(4) }]);
  assert.equal(landProblem(s.prs[0], NOW, 2), "gate failure");
});

test("WP-L7 F6: a stale PR a live role:worker session names is not re-owned; an idle one does not protect it", () => {
  const sess = (on) => ({ id: "session_01LiveLiveLive", title: "[Worker] something", status: "SESSION_STATUS_RUNNING", bucket: "", tags: ["role:worker", "pr:95"], ...on });
  const live = planDispatch(state({ prs: [pr(95, { updated_at: ago(3) })], sessions: [sess()] }), cfg(), NOW);
  assert.deepEqual([live.launches.length, live.labels.length, skips(live)[0]], [0, 0, "PR #95: stale 3h but live worker session_01LiveLiveLive names it"]);
  const byTitle = planDispatch(state({ prs: [pr(95, { updated_at: ago(3) })], sessions: [sess({ tags: ["role:worker"], title: "[Worker] CONTINUE PR #95 x", status: "", bucket: "SESSION_STATUS_BUCKET_WORKING" })] }), cfg(), NOW);
  assert.equal(byTitle.launches.length, 0);
  const idle = planDispatch(state({ prs: [pr(95, { updated_at: ago(3) })], sessions: [sess({ status: "SESSION_STATUS_IDLE" })] }), cfg(), NOW);
  assert.equal(idle.launches.length, 1);
  const notWorker = planDispatch(state({ prs: [pr(95, { updated_at: ago(3) })], sessions: [sess({ tags: ["pr:95"] })] }), cfg(), NOW);
  assert.equal(notWorker.launches.length, 1, "only a role:worker session protects a PR");
});

test("a stale PR is owned by a live worker its hand-off `owner:` names, or one tagged with the issue it closes", () => {
  const sid = "session_01BatchBatchBatch";
  const sess = (tags) => ({ id: sid, title: "[Worker] batch", status: "SESSION_STATUS_RUNNING", bucket: "", tags: ["role:worker", ...tags] });
  const plan = (body, tags) => planDispatch(state({ prs: [pr(96, { updated_at: ago(3), body })], sessions: [sess(tags)] }), cfg(), NOW);
  const byHandoff = plan(`\`\`\`handoff\nowner: claude:${sid}\n\`\`\``, []);
  assert.deepEqual([byHandoff.launches.length, byHandoff.labels.length], [0, 0]);
  assert.equal(plan("Closes #3104", ["issue:3104"]).launches.length, 0);
  assert.equal(plan("Closes #3105", ["issue:3104"]).launches.length, 1, "another issue's worker does not own it");
  assert.equal(plan("no hand-off", []).launches.length, 1);
});

test("WP-L7 F6: --apply with no --sessions while GitHub names children launches nothing; with no children it may launch", () => {
  const sid = "session_01ChildChildChild";
  const api = (named) => (p, o) => {
    if (o?.method) return { json: { id: 1 } };
    if (p.startsWith("issues?state=open")) return { json: p.endsWith("page=1") ? [{ number: 1, title: "Board", labels: [], body: "" },
      { number: 10, title: "Task", labels: [{ name: "ready" }], body: "x", updated_at: ago(1) },
      { number: 11, title: "Claimed", labels: [{ name: "claimed" }], body: "", updated_at: ago(1) }] : [] };
    if (p.startsWith("issues/11/comments")) return { json: p.endsWith("page=1") && named ? [{ id: 5, body: `claims #11 — claude:${sid}`, created_at: ago(1) }] : [] };
    if (p.startsWith("actions/")) return { json: { workflow_runs: [] } };
    return { json: [] };
  };
  const run = (named) => { const log = []; const rc = main(["--apply", "--quota", "allowed"], { api: api(named), log: (x) => log.push(x), read: () => "{}", now: () => NOW }); return [rc, log]; };
  const [rc, log] = run(true);
  assert.equal(rc, 0);
  assert.equal(log.some((x) => x.startsWith("CREATE_SESSION")), false, "children named, no --sessions: no launch");
  assert.equal(log.at(-1), "= dispatch applied: 0 launches, 0 nudges, 0 archives, 1 GitHub writes; quota allowed");
  const s = readState({ api: api(true), config: DEFAULT_CONFIG, quota: "allowed" });
  assert.deepEqual([s.sessionsComplete, s.sessionsWhy], [false, "no --sessions given but GitHub names 1 child session(s): run --children, get_session each, pass every result"]);
  assert.equal(planDispatch(s, DEFAULT_CONFIG, NOW).skipped[0].why, s.sessionsWhy);
  const [, log2] = run(false);
  assert.equal(log2.filter((x) => x.startsWith("CREATE_SESSION")).length, 1, "no children: nothing to count, the cycle launches");
});

test("WP-L7: mergePause / baseBehindMax are not config keys (land.yml reads the label; merge-gate owns base-behind)", () => {
  assert.deepEqual(["mergePause" in DEFAULT_CONFIG, "baseBehindMax" in DEFAULT_CONFIG], [false, false]);
  const file = JSON.parse(fs.readFileSync(new URL("../../tools/ci/dispatch.json", import.meta.url), "utf8"));
  assert.deepEqual(["mergePause" in file, "baseBehindMax" in file], [false, false]);
});

test("stalls (2026-10-27): a PR its own worker labelled needs-owner is taken over at once, not after 2 h of silence", () => {
  const p = planDispatch(state({ prs: [pr(60, { labels: ["needs-owner"], updated_at: ago(0.1) })] }), cfg(), NOW);
  assert.deepEqual([p.launches.map((l) => l.title), p.labels], [["[Worker] CONTINUE PR #60 PR 60"], []]);
  const held = planDispatch(state({ prs: [pr(61, { labels: ["needs-owner", "needs-decision"], updated_at: ago(0.1) })] }), cfg(), NOW);
  assert.deepEqual(skips(held), ["PR #61: stale 0h but needs-decision"]);
  const relaunch = planDispatch(state({ prs: [pr(62, { labels: ["needs-owner"], updated_at: ago(0.1), comments: [launched(62, 0.5)] })] }), cfg(), NOW);
  assert.equal(relaunch.launches.length, 0, "a takeover launched < 2 h ago is not repeated");
});

test("stalls (2026-10-27): a BLOCKED / REVIEW_READY / idle child on open, non-landing work gets ONE NUDGE_SESSION per hour; the Board lists the waiting", () => {
  const w = (id, on) => ({ id, title: "[Worker] x", status: "SESSION_STATUS_IDLE", bucket: "", tags: ["role:worker"], updated_at: ago(0.1), ...on });
  const sessions = [
    w("session_01BlockedBlocked", { bucket: "SESSION_STATUS_BUCKET_BLOCKED", tags: ["role:worker", "pr:70"] }),
    w("session_01ReviewReadyRR", { bucket: "SESSION_STATUS_BUCKET_REVIEW_READY", tags: ["role:worker", "issue:12"] }),
    w("session_01IdleIdleIdle1", { updated_at: ago(0.5), tags: ["role:worker", "pr:71"] }),
    w("session_01FreshIdleIdle", { updated_at: ago(0.1), tags: ["role:worker", "pr:71"] }),
    w("session_01RunningRunnin", { status: "SESSION_STATUS_RUNNING", bucket: "SESSION_STATUS_BUCKET_BLOCKED", tags: ["role:worker", "pr:70"] }),
    w("session_01LandingLandin", { bucket: "SESSION_STATUS_BUCKET_REVIEW_READY", tags: ["role:worker", "pr:72"] }),
    w("session_01ClosedClosedC", { bucket: "SESSION_STATUS_BUCKET_BLOCKED", tags: ["role:worker", "pr:99"] }),
    w("session_01NotAWorkerNot", { bucket: "SESSION_STATUS_BUCKET_BLOCKED", tags: ["pr:70"] }),
  ];
  const st = state({ issues: [board(), dispatchIssue(), issue(12, ["claimed"])], prs: [pr(70), pr(71), pr(72, { labels: ["land"] })], sessions });
  const p = planDispatch(st, cfg(), NOW);
  const msg = (x) => `Continue ${x}: subscribe to the PR, finish the Plan; questions go to @parent or \`needs-decision\`, never the user.`;
  assert.deepEqual(p.nudges, [{ id: "session_01BlockedBlocked", target: "PR #70", message: msg("PR #70") },
    { id: "session_01ReviewReadyRR", target: "#12", message: msg("#12") }, { id: "session_01IdleIdleIdle1", target: "PR #71", message: msg("PR #71") }]);
  const b = p.board.split("\n");
  const at = b.indexOf("### Waiting children (3)");
  assert.deepEqual(b.slice(at, at + 8), ["### Waiting children (3)", "- session_01BlockedBlocked · BLOCKED · PR #70", "- session_01ReviewReadyRR · REVIEW_READY · #12",
    "- session_01IdleIdleIdle1 · idle 30m · PR #71", "### Nudges (3 this run)", `- nudged session_01BlockedBlocked at ${ISO} · PR #70`,
    `- nudged session_01ReviewReadyRR at ${ISO} · #12`, `- nudged session_01IdleIdleIdle1 at ${ISO} · PR #71`]);
  const log = [];
  applyPlan(p, { api: () => ({ json: [] }), config: cfg(), log: (x) => log.push(x) });
  assert.deepEqual(log.filter((x) => x.startsWith("NUDGE_SESSION")), p.nudges.map((n) => `NUDGE_SESSION ${n.id} ${n.message}`));
  // Next cycle 30 min later: the Board records the nudges, so none repeats; they stay listed until an hour has passed.
  const later = NOW + 30 * 6e4;
  const st2 = { ...st, issues: [board({ comments: [{ body: p.board, created_at: ISO }] }), dispatchIssue(), issue(12, ["claimed"])] };
  const p2 = planDispatch(st2, cfg(), later);
  assert.deepEqual([p2.nudges.map((n) => n.id), p2.waiting.length, skips(p2).filter((x) => x.startsWith("nudge "))[0]],
    [["session_01FreshIdleIdle"], 4, "nudge session_01BlockedBlocked: nudged 30m ago (rule: one per 60 min)"], "only the newly idle child (36 min) is nudged");
  assert.equal(p2.board.split("\n").includes(`- nudged session_01BlockedBlocked at ${ISO}`), true, "the record carries forward");
  assert.equal(planDispatch(st2, cfg(), NOW + 61 * 6e4).nudges.length, 4, "after an hour it nudges again");
  assert.equal(waitingWhy(w("session_01FailedFailedF", { bucket: "SESSION_STATUS_BUCKET_FAILED", updated_at: ago(5) }), NOW), "", "an ended child is never nudged");
  assert.equal(waitingWhy(w("session_01NoArchiveNoArc", { bucket: "SESSION_STATUS_BUCKET_BLOCKED", tags: ["role:worker", "no-archive"] }), NOW), "");
});

test("dispatcher report (2026-10-27): a launch comment whose recorded child is ARCHIVED / COMPLETED / FAILED is no live claim; no record keeps the age rule", () => {
  const sid = "session_017YzwxvgTEyxRAC9XcmTFyJ";
  const comment = { author: "bot", body: `dispatch: launched claude:[Worker] #3265 Task for #3265 at ${ago(0.5)} as ${sid}`, created_at: ago(0.5) };
  const st = (sessions) => state({ issues: [board(), issue(3265, ["ready"], { comments: [comment] })], sessions });
  const dead = (on) => ({ id: sid, title: "[Worker] #3265 Task", status: "SESSION_STATUS_IDLE", bucket: "", tags: ["role:worker", "issue:3265"], ...on });
  for (const s of [dead({ status: "SESSION_STATUS_ARCHIVED" }), dead({ bucket: "SESSION_STATUS_BUCKET_FAILED" }), dead({ bucket: "SESSION_STATUS_BUCKET_COMPLETED" })]) {
    const p = planDispatch(st([s]), cfg(), NOW);
    assert.deepEqual([p.launches.length, p.live.claude], [1, 1], `${s.status} ${s.bucket}`);
  }
  const unknown = planDispatch(st([]), cfg(), NOW);
  assert.deepEqual([unknown.launches.length, skips(unknown)[0]], [0, "issue #3265: launched claude 30m ago (live claim)"]);
  const alive = planDispatch(st([dead({ status: "SESSION_STATUS_RUNNING", bucket: "SESSION_STATUS_BUCKET_WORKING" })]), cfg(), NOW);
  assert.equal(alive.launches.length, 0);
});

test("dispatcher report (2026-10-27): RECORD_LAUNCH prints a {SESSION_ID} placeholder and a literal one is refused clearly; sessionsPage takes every saved shape", () => {
  const tok = recordToken({ comment: { on: 10 }, host: "claude", title: "[Worker] #10 Task 10", number: 10 });
  assert.throws(() => recordComment(tok, NOW, "{SESSION_ID}"), { message: "--record-launch: replace {SESSION_ID} with the id create_session returned" });
  const log = [];
  assert.equal(main(["--record-launch", tok, "--session", "{SESSION_ID}"], { api: () => assert.fail("no POST"), log: (x) => log.push(x) }), 1);
  assert.deepEqual(log, ["dispatch: --record-launch: replace {SESSION_ID} with the id create_session returned"]);
  const entry = { id: "session_01EntryEntryEn", title: "[Worker] #5", session_status: "SESSION_STATUS_IDLE", status_bucket: "SESSION_STATUS_BUCKET_BLOCKED", tags: ["role:worker"] };
  for (const text of [JSON.stringify({ ccr: entry }), JSON.stringify(entry), JSON.stringify({ ccr: { data: [entry], has_more: false } }), JSON.stringify([entry]), `saved:\n${JSON.stringify([{ ccr: entry }])}`]) {
    const pg = sessionsPage(text);
    assert.deepEqual([pg.hasMore, pg.sessions.map((x) => [x.id, x.bucket])], [false, [["session_01EntryEntryEn", "SESSION_STATUS_BUCKET_BLOCKED"]]], text.slice(0, 40));
  }
});

test("land-queue backpressure (2026-10-27): at landQueueMax open non-draft `land` PRs rule 1 launches no issue worker and says so once; below it launches as before", () => {
  const landing = (n, on = {}) => Array.from({ length: n }, (_, k) => pr(200 + k, { labels: ["land"], draft: false, ...on }));
  const issues = [board(), issue(10, ["ready"]), issue(11, ["ready"])];
  const PAUSED = (n) => `issue launches paused: ${n} PRs waiting to land (max 15) — land before starting more`;
  const full = planDispatch(state({ issues, prs: landing(15) }), cfg(), NOW);
  assert.deepEqual([full.launches.length, full.landQueue, skips(full)], [0, 15, [PAUSED(15)]]);
  assert.equal(renderPlan(full).includes(`SKIP ${PAUSED(15)}`), true);
  const over = planDispatch(state({ issues, prs: landing(42) }), cfg(), NOW);
  assert.deepEqual([over.launches.length, skips(over)], [0, [PAUSED(42)]]);
  const below = planDispatch(state({ issues, prs: landing(14) }), cfg(), NOW);
  assert.deepEqual([below.launches.map((l) => [l.kind, l.number]), below.landQueue, skips(below)], [[["issue", 10], ["issue", 11]], 14, []]);
  const drafts = planDispatch(state({ issues, prs: [...landing(15, { draft: true }), ...landing(15, { labels: ["run-ci"] })] }), cfg(), NOW);
  assert.deepEqual([drafts.launches.length, drafts.landQueue], [2, 0], "a draft `land` PR or a ready PR without `land` is not in the queue");
  assert.equal(planDispatch(state({ issues, prs: landing(42) }), cfg({ landQueueMax: null }), NOW).launches.length, 2, "landQueueMax null switches it off");
  assert.deepEqual([DEFAULT_CONFIG.landQueueMax, loadConfig().landQueueMax], [15, 15]);
});

test("land-queue backpressure (2026-10-27): rule 2 takeovers and the rule 3 deploy:red fixer still launch while issue launches pause; the Board caps line shows the queue", () => {
  const landing = Array.from({ length: 15 }, (_, k) => pr(200 + k, { labels: ["land"], draft: false }));
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [...landing, pr(20, { updated_at: ago(3) })], deployRed: true }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => [l.kind, l.number]), [["deploy-red", 0], ["continue", 20]]);
  assert.deepEqual(p.labels, [{ number: 1, add: ["deploy:red"], remove: [] }, { number: 20, add: ["needs-owner"], remove: [] }]);
  assert.deepEqual(skips(p), ["issue launches paused: 15 PRs waiting to land (max 15) — land before starting more"]);
  const b = p.board.split("\n");
  assert.equal(b[4], "caps: launches/run 4; live workers claude 2/8, cursor 0/4; cost cap $10 · land queue 15/15");
  assert.equal(b.at(-1), "- issue launches paused: 15 PRs waiting to land (max 15) — land before starting more");
});

test("ready issues with an open PR closing them do not launch duplicate workers", () => {
  const bodies = [
    ["Closes #10", true], ["FIXES: #10", true], ["Resolved #10", true],
    ["Closes brycejmurrin/f1-game#10", true], ["Fixes BRYCEJMURRIN/F1-GAME#10", true],
    ["Closes https://github.com/brycejmurrin/f1-game/issues/10", true],
    ["Closes https://github.com/another/repository/issues/10", false],
    ["Closes #11, resolves #10", true], ["Closes #100", false],
    ["Closes another/repository#10", false], ["Refs #10", false],
    ["<!-- Example: Closes #10 -->", false], ["```\nCloses #10\n```", false],
    ["Example: `Closes #10`", false], ["Example: ``Closes #10``", false],
    ["`Example `` Closes #10`", false], ["``Example ` Closes #10``", false],
    ["Example: ``Closes #99``. Closes #10", true],
    ["Example:\n\n    Closes #10", false], ["Example:\n\n\tCloses #10", false],
    ["````markdown\n```\nCloses #10\n```\n````", false],
    ["```markdown\nCloses #10", false], ["~~~markdown\nCloses #10", false],
    ["````\n```\nCloses #99\n```\n````\nCloses #10", true],
    ["~~~\nCloses #99\n~~~~\nCloses #10", true],
    ["Example:\n\n    Closes #99\n\nCloses #10", true],
    ["Implementation complete.\n    Closes #10", true],
    ["- Implementation complete.\n\n    Closes #10", true],
    ["- Example:\n\n      Closes #10", false],
  ];
  for (const [body, linked] of bodies) {
    const p = planDispatch(state({ issues: [board(), issue(10, ["ready"]), issue(12, ["ready"])],
      prs: [pr(50, { body })] }), cfg(), NOW);
    assert.deepEqual(p.launches.map((l) => l.number), linked ? [12] : [10, 12], body);
    assert.equal(p.skipped.some((s) => s.what === "issue #10" && s.why.includes("#50")), linked, body);
  }
  const closed = planDispatch(state({ issues: [board(), issue(10, ["ready"])],
    prs: [pr(50, { state: "closed", body: "Closes #10" })] }), cfg(), NOW);
  assert.deepEqual(closed.launches.map((l) => l.number), [10], "closed PRs do not reserve work");
});

test("ready epics are never launched as tasks; their ready sub-issues remain eligible", () => {
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready", "epic", "priority"]),
    issue(11, ["ready"], { body: "Sub-issue of #10" })] }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => l.number), [11]);
});

test("deploy recovery and requested takeovers get scarce launch slots before stale PRs and new issues", () => {
  const input = state({ issues: [board(), issue(10, ["ready", "priority"]), issue(11, ["ready"]),
    issue(12, ["ready"]), issue(13, ["ready"])], deployRed: true,
    prs: [pr(20, { updated_at: ago(4) }), pr(30, { labels: ["needs-owner"] })] });
  const kinds = (p) => p.launches.map((l) => [l.kind, l.number]);
  assert.deepEqual(kinds(planDispatch(input, cfg({ maxLaunchesPerRun: 2 }), NOW)),
    [["deploy-red", 0], ["continue", 30]]);
  assert.deepEqual(kinds(planDispatch(input, cfg(), NOW)),
    [["deploy-red", 0], ["continue", 30], ["continue", 20], ["issue", 10]]);
  for (const on of [{ quota: "allowed_warning" }, { issues: [board(), dispatchIssue(["dispatch:pause"])] },
    { sessions: Array.from({ length: 8 }, (_, i) => ({ id: `live-${i}`, tags: ["role:worker"], status: "RUNNING" })) }]) {
    assert.equal(planDispatch({ ...input, ...on }, cfg(), NOW).launches.length, 0,
      "recovery keeps the existing quota, pause and live-worker limits");
  }
});

// ---- review 2026-10-29 fix 3: lock, quota notice, foreign probe, prerequisites, adoption -------------------------------------
const ME = "session_01ME0ME0ME0ME0ME", OTHER = "session_01OTHEROTHEROTHER";
const lockBoard = (who, h) => board({ comments: [{ id: 9, body: `${BOARD_MARKER}\n## Board\nlock: ${who} at ${ago(h)}\n`, created_at: ago(h) }] });
const stale = (n, on = {}) => pr(n, { updated_at: ago(3), author: "brycejmurrin", ...on });

test("lock: another session's fresh lock refuses the whole cycle; a stale lock or --take-lock hands over; own lock refreshes", () => {
  const work = [issue(10, ["ready"]), stale(20)];
  const held = planDispatch(state({ self: ME, issues: [lockBoard(OTHER, 1), ...work.slice(0, 1)], prs: [work[1]] }), cfg(), NOW);
  assert.deepEqual([held.launches.length, held.labels.length, held.nudges.length, held.archives.length], [0, 0, 0, 0]);
  assert.equal(held.refused, `= dispatch refused: ${OTHER} holds the dispatcher lock (since ${ago(1)}); this cycle wrote and launched nothing. Pass --take-lock only for a clean handover.`);
  assert.equal(held.notice, held.refused);
  assert.equal(held.lock.session, OTHER, "the Board keeps the holder");
  for (const [name, st] of [["stale", { issues: [lockBoard(OTHER, 4), issue(10, ["ready"])] }], ["take", { issues: [lockBoard(OTHER, 1), issue(10, ["ready"])], takeLock: true }],
    ["own", { issues: [lockBoard(ME, 1), issue(10, ["ready"])] }], ["none", { issues: [board(), issue(10, ["ready"])] }]]) {
    const p = planDispatch(state({ self: ME, ...st }), cfg(), NOW);
    assert.deepEqual([name, p.refused, p.launches.length, p.lock], [name, null, 1, { session: ME, at: ISO }]);
    assert.equal(p.board.split("\n")[5], `lock: ${ME} at ${ISO}`);
  }
  const blind = planDispatch(state({ issues: [lockBoard(OTHER, 1), issue(10, ["ready"])] }), cfg(), NOW);
  assert.deepEqual([blind.refused, blind.launches.length, blind.lock.session], [null, 1, OTHER], "no --self: unchecked, old owner line kept");
});

test("lock: main --apply reads --self, writes nothing when refused, and the first line is the verdict", () => {
  const writes = [];
  const api = (p, o) => {
    if (o?.method) { writes.push(`${o.method} ${p}`); return { json: { id: 1 } }; }
    if (p.startsWith("issues?state=open")) return { json: p.endsWith("page=1") ? [{ number: 1, title: "Board", labels: [], body: "" }, { number: 10, title: "T", labels: [{ name: "ready" }], body: "x", updated_at: ago(1) }] : [] };
    if (p.startsWith("issues/1/comments")) return { json: p.endsWith("page=1") ? [{ id: 5, body: `${BOARD_MARKER}\nlock: ${OTHER} at ${ago(1)}`, created_at: ago(1) }] : [] };
    if (p.startsWith("actions/")) return { json: { workflow_runs: [] } };
    return { json: [] };
  };
  const run = (extra) => { const log = []; const rc = main(["--apply", "--quota", "allowed", "--self", ME, ...extra], { api, log: (x) => log.push(x), read: () => "{}", now: () => NOW }); return [rc, log]; };
  const [rc, log] = run([]);
  assert.deepEqual([rc, writes, log.length, log[0].startsWith(`= dispatch refused: ${OTHER}`)], [0, [], 2, true]);
  assert.equal(log[1], "= dispatch applied: refused, 0 GitHub writes");
  const [, log2] = run(["--take-lock"]);
  assert.deepEqual([writes, log2.some((x) => x.startsWith("CREATE_SESSION"))], [["PATCH issues/comments/5"], true]);
});

test("quota: rejected says to disable the trigger on the first line; allowed_warning says the cycle is skipped", () => {
  const rej = planDispatch(state({ quota: "rejected" }), cfg(), NOW);
  assert.equal(renderPlan(rej)[0], "= quota rejected: launched nothing. Disable the hourly dispatcher trigger (update_trigger enabled=false) until the limit resets.");
  const warn = planDispatch(state({ quota: "allowed_warning" }), cfg(), NOW);
  assert.equal(renderPlan(warn)[0], "= quota allowed_warning: launch cycle skipped (no launches, no takeovers).");
  assert.equal(planDispatch(state(), cfg(), NOW).notice, null);
  const log = [];
  main(["--plan", "--quota", "rejected"], { api: () => ({ json: [] }), log: (x) => log.push(x), read: () => "{}", now: () => NOW });
  assert.equal(log[0], rej.notice);
});

test("takeover probe: a recent commit by another author, or a lane:cursor push in 2 h, blocks the takeover; Claude and own commits do not", () => {
  const c = (author, h) => ({ author, at: ago(h) });
  const cases = [
    ["foreign", stale(40, { labels: ["needs-owner"], commits: [c("Cursor Agent", 1)] }), 0],
    ["old foreign", stale(41, { labels: ["needs-owner"], commits: [c("Cursor Agent", 5)] }), 1],
    ["own", stale(42, { labels: ["needs-owner"], commits: [c("brycejmurrin", 1)] }), 1],
    ["claude", stale(43, { labels: ["needs-owner"], commits: [c("Claude", 0.5)] }), 1],
    ["bot", stale(44, { labels: ["needs-owner"], commits: [c("github-actions[bot]", 0.5)] }), 1],
    ["cursor lane", stale(45, { labels: ["needs-owner", "lane:cursor"], commits: [c("brycejmurrin", 1)] }), 0],
    ["cursor lane idle", stale(46, { labels: ["needs-owner", "lane:cursor"], commits: [c("brycejmurrin", 3)] }), 1],
  ];
  for (const [name, p, n] of cases) assert.equal(planDispatch(state({ prs: [p] }), cfg(), NOW).launches.length, n, name);
  const p = planDispatch(state({ prs: [cases[0][1]] }), cfg(), NOW);
  assert.deepEqual([p.labels.length, skips(p)], [0, ["PR #40: stale 3h but foreign activity (a commit by Cursor Agent 1h ago): no takeover"]]);
});

test("dependencies: a CONTINUE worker waits for an open prerequisite PR named in the body or Plan", () => {
  const body = (line) => `## Plan\n- [ ] now: ${line}\n`;
  for (const line of ["builds on #4108", "starts after #4108 merges", "depends on PR #4108", "blocked by #4108"]) {
    const p = planDispatch(state({ prs: [stale(4096, { body: body(line) }), stale(4108, { updated_at: ago(0.1) })] }), cfg(), NOW);
    assert.deepEqual([line, p.launches.length, p.labels.length, skips(p)], [line, 0, 0, ["PR #4096: stale 3h but waits for #4108 to merge (launch after it lands)"]]);
  }
  const merged = planDispatch(state({ prs: [stale(4096, { body: body("builds on #4108") })] }), cfg(), NOW);
  assert.equal(merged.launches.length, 1, "#4108 is not open: it merged, launch");
  const prose = planDispatch(state({ prs: [stale(4097, { body: body("after #4108 the CI is slow") }), stale(4108, { updated_at: ago(0.1) })] }), cfg(), NOW);
  assert.equal(prose.launches.length, 1, "'after #N' without merges is not a dependency");
});

test("adoption: the CONTINUE RECORD_LAUNCH token adopts for the worker; issue launches do not", () => {
  const p = planDispatch(state({ prs: [stale(20, { labels: ["needs-owner"] })], issues: [board(), issue(10, ["ready"])] }), cfg(), NOW);
  const [cont, iss] = [p.launches.find((l) => l.kind === "continue"), p.launches.find((l) => l.kind === "issue")];
  assert.equal(recordComment(recordToken(cont), NOW, ME).adopt, ME);
  assert.equal(recordComment(recordToken(iss), NOW, ME).adopt, false);
  const calls = [], log = [];
  const api = (path, o) => { calls.push(`${o?.method} ${path}${o?.body?.body ? " " + o.body.body : ""}`); return { json: {} }; };
  assert.equal(main(["--record-launch", recordToken(cont), "--session", ME], { api, log: (x) => log.push(x), now: () => NOW }), 0);
  assert.deepEqual(calls, [`POST issues/20/comments ${recordComment(recordToken(cont), NOW, ME).body}`, "DELETE issues/20/labels/needs-owner",
    `POST issues/20/comments adopts PR #20 — claude:${ME} (posted by the dispatcher when it launched the takeover)`]);
  assert.equal(claimedSessionIds({ prs: [{ comments: [{ body: calls[2].replace("POST issues/20/comments ", "") }] }] }).has(ME), true, "the adoption comment names the child");
});

test("prompts: claude workers get the AskUserQuestion line naming the dispatcher when its id is known", () => {
  const text = issuePrompt(issue(10, ["ready"]), { ...cfg(), dispatcherId: ME }, "claude");
  assert.equal(text.split("\n").includes(`Do not use AskUserQuestion; send questions to the dispatcher with send_message session_id ${ME}.`), true);
  const p = planDispatch(state({ self: ME, issues: [board(), issue(10, ["ready"])] }), cfg(), NOW);
  assert.equal(p.launches[0].spec.prompt.includes(`session_id ${ME}.`), true);
});

// ---- efficiency review 2026-10-30: findings 2, 7, 8, 9 ----------------------------------------------------------
const recheckApi = (pull, commits = [], issueState = "open") => (p) =>
  p.startsWith("pulls/20/commits") ? { json: commits } : p.startsWith("pulls/") ? { json: pull } : { json: { state: issueState } };
const cont = { kind: "continue", number: 20 }, iss = { kind: "issue", number: 10 };
const commitBy = (author, h) => ({ author: { login: author }, commit: { committer: { date: ago(h) } } });

test("finding 7: a merged or closed PR, or a closed issue, is refused right before the launch line", () => {
  const t0 = { now: NOW };
  assert.equal(launchRecheck(cont, { api: recheckApi({ state: "closed", merged_at: ISO }), ...t0 }), "PR #20 is merged");
  assert.equal(launchRecheck(cont, { api: recheckApi({ state: "closed" }), ...t0 }), "PR #20 is closed");
  assert.equal(launchRecheck(iss, { api: recheckApi({}, [], "closed"), ...t0 }), "#10 is closed");
  assert.equal(launchRecheck(cont, { api: recheckApi({ state: "open", user: { login: "brycejmurrin" } }), ...t0 }), "");
  assert.equal(launchRecheck({ kind: "deploy-red", number: 0 }, { api: () => assert.fail("no read"), ...t0 }), "");
  assert.equal(launchRecheck(cont, { api: () => ({ error: "boom" }), ...t0 }), "", "an unreadable PR never blocks a launch");
});

test("finding 7: a non-Claude author's push inside 60 min refuses a CONTINUE; Claude, the PR author, bots and older pushes do not", () => {
  const open = { state: "open", user: { login: "brycejmurrin" } };
  assert.equal(launchRecheck(cont, { api: recheckApi(open, [commitBy("cursoragent", 0.5)]), now: NOW }),
    "cursoragent pushed PR #20 30 min ago (a non-Claude author, last 60 min)");
  for (const [who, h] of [["cursoragent", 2], ["claude", 0.1], ["brycejmurrin", 0.1], ["dependabot[bot]", 0.1]])
    assert.equal(launchRecheck(cont, { api: recheckApi(open, [commitBy(who, h)]), now: NOW }), "", who);
});

test("finding 7: applyPlan prints no CREATE_SESSION or RECORD_LAUNCH for a refused launch, and says why", () => {
  const p = planDispatch(state({ prs: [pr(20, { updated_at: ago(3) })] }), cfg(), NOW);
  const out = [];
  applyPlan(p, { api: (path, o) => (o ? { json: {} } : path.startsWith("pulls/20") ? { json: { state: "closed", merged_at: ISO } } : { json: [] }), config: cfg(), log: (x) => out.push(x), now: NOW });
  assert.equal(out.some((x) => x.startsWith("CREATE_SESSION") || x.startsWith("RECORD_LAUNCH")), false);
  const skipLine = out.includes("= launch skipped for continue #20: PR #20 is merged");
  assert.equal(skipLine, true);
});

test("finding 2: only holds, needs-decision and a land PR waiting on CI make the plan idle, and apply prints PAUSE_TRIGGER + RESUME", () => {
  const waitingOnly = state({ prs: [pr(30, { labels: ["hold"], updated_at: ago(9) }), pr(31, { labels: ["needs-decision"], updated_at: ago(9) })] });
  const p = planDispatch(waitingOnly, cfg(), NOW);
  assert.equal(p.idle, true);
  const out = [];
  applyPlan(p, { api: () => ({ json: [] }), config: cfg({ triggerId: "trig_abc" }), log: (x) => out.push(x), now: NOW });
  const pauseLine = out.includes("PAUSE_TRIGGER trig_abc");
  assert.equal(pauseLine, true);
  assert.equal(out.some((x) => x.startsWith("RESUME: ")), true);
  const bare = [];
  applyPlan(p, { api: () => ({ json: [] }), config: cfg(), log: (x) => bare.push(x), now: NOW });
  const barePause = bare.includes("PAUSE_TRIGGER <trigger_id>");
  assert.equal(barePause, true);
});

test("finding 2: anything a later wake could act on keeps the dispatcher awake", () => {
  const idle = (on) => planDispatch(state(on), cfg(), NOW).idle;
  assert.equal(idle({ prs: [pr(30)] }), false, "an ordinary open PR may go stale");
  assert.equal(idle({ issues: [board(), dispatchIssue(), issue(10, ["ready"])] }), false, "a ready issue");
  assert.equal(idle({ deployRed: true }), false);
  assert.equal(idle({ quota: "allowed_warning" }), false);
  assert.equal(idle({ sessionsComplete: false }), false);
  assert.equal(idle({ issues: [board(), dispatchIssue(["dispatch:pause"])] }), false, "no wake would follow a Bryce pause");
  assert.equal(idle({}), true, "an empty board is idle");
  const redLand = pr(30, { labels: ["land"], mergeable_state: "dirty", checks: [], statuses: [] });
  assert.equal(idle({ prs: [redLand] }), false, "a conflicting land PR may need a takeover");
});

test("finding 8: not-found get_session results are dropped and counted; other bad pages still throw", () => {
  const good = JSON.stringify({ ccr: { id: "session_01AAAAAAAAAA", status: "idle", tags: [] } });
  const r = readSessionPages([good, '{"error":"Session not found"}', "404 Not Found"]);
  assert.equal(r.notFound, 2);
  assert.deepEqual(r.sessions.map((x) => x.id), ["session_01AAAAAAAAAA"]);
  assert.throws(() => readSessionPages(["garbage"]), (e) => e.message === "no JSON object in the page");
});

test("finding 8: fetchAll runs at most `cap` reads at once and skips a rejected one", async () => {
  let live = 0, peak = 0;
  const got = await fetchAll([1, 2, 3, 4, 5, 6, 3], async (n) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live--;
    if (n === 4) throw new Error("x");
    return [`c${n}`];
  }, 3);
  assert.equal(peak, 3);
  assert.deepEqual([...got.keys()].sort(), [1, 2, 3, 5, 6]);
});

test("finding 8: --children --recent skips old work and reads the rest through the cache", async () => {
  const calls = [];
  const claim = { id: 1, user: { login: "x" }, body: "claims #7 — claude:session_01RECENT00001", created_at: ISO };
  const api = (p) => {
    calls.push(p);
    if (p.startsWith("issues?state=open")) return { json: [{ number: 7, title: "t", labels: [{ name: "claimed" }], updated_at: ago(1) }, { number: 8, title: "old", labels: [{ name: "claimed" }], updated_at: ago(80) }] };
    if (p.startsWith("issues/7/comments")) return { json: [claim] };
    return { json: [] };
  };
  const log = [];
  const fetched = [];
  const rc = await childrenMain(["--children", "--recent", "24"], { api, log: (x) => log.push(x), read: () => "{}", now: () => NOW,
    fetchOne: async (n) => (fetched.push(n), [claim]) });
  assert.equal(rc, 0);
  assert.deepEqual(fetched, [7], "the old issue is never read");
  assert.equal(log[0], "GET_SESSION session_01RECENT00001");
  assert.equal(log[1].includes("last 24 h"), true);
  assert.equal(calls.some((c) => c.includes("pages.yml") || c.includes("/commits") || c.includes("check-runs")), false, "light mode reads no CI state");
  assert.equal(main(["--children", "--recent", "0"], { api, log: () => {}, read: () => "{}", now: () => NOW }), 1);
});
