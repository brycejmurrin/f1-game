// dispatch — the hourly dispatcher's pure plan (tools/ci/dispatch.mjs planDispatch) over fixture GitHub state:
// ready-issue launches, priority order, caps, quota, claims, stale PRs → needs-owner + CONTINUE, codex 6 h, hold,
// double-launch guard, deploy red, the archive rule, pause flags, the Board markdown, the launch line formats. No network.
// Every check is an exact equality on the produced string (no regex pins: the assertPins ratchet counts those).
import test from "node:test";
import assert from "node:assert/strict";
import {
  planDispatch, DEFAULT_CONFIG, parseHandoff, liveLaunch, extractSessions, sessionRefs, activityAt, applyPlan, loadConfig,
  issuePrompt, continuePrompt, deployRedPrompt, PROMPT_MAX_LINES, BOARD_MARKER, LAUNCH_RE,
} from "../../tools/ci/dispatch.mjs";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const ISO = "2026-10-27T12:00:00.000Z";
const ago = (h) => new Date(NOW - h * 3.6e6).toISOString();
const cfg = (on = {}) => ({ ...DEFAULT_CONFIG, ...on, maxLiveWorkers: { ...DEFAULT_CONFIG.maxLiveWorkers, ...on.maxLiveWorkers } });
const issue = (number, labels, on = {}) => ({ number, title: `Task ${number}`, body: `Do the thing ${number}.`, labels, updated_at: ago(1), comments: [], ...on });
const pr = (number, on = {}) => ({ number, title: `PR ${number}`, draft: true, labels: [], head_sha: "a".repeat(40), head_ref: `cursor/x-${number}`,
  body: "", created_at: ago(30), updated_at: ago(0.5), last_push_at: ago(0.5), last_comment_at: null, mergeable: true, lane: null, comments: [], ...on });
const board = (on = {}) => issue(1, [], { title: "Board", ...on });
const dispatchIssue = (labels = []) => issue(2, labels, { title: "Dispatch" });
const launched = (n, h) => ({ author: "bot", body: `dispatch: launched claude:[Worker] #${n} Task for #${n} at ${ago(h)}`, created_at: ago(h) });
const state = (on = {}) => ({ issues: [board(), dispatchIssue()], prs: [], deployRed: false, sessions: [], closedPrs: [], quota: "allowed", ...on });
const skips = (p) => p.skipped.map((s) => `${s.what}: ${s.why}`);
const COMMON = (n = "it") => ["Read docs/WORKERS.md and follow it.",
  "Lane label: lane:claude. Model: claude-sonnet-5-5. Base: claude/f1-game-project-26h3ng (branch cursor/<topic>-<hash> from it; draft PR into it at the first commit).",
  "Cost cap: $10 (soft). At the cap, or stuck: leave the Plan and the ```handoff block current, add `needs-owner` on the PR, end.",
  `End at \`land\`: when ready-gate passes flip ready, add \`land\`, refresh the handoff block; GitHub merges ${n}, not you.`];

test("rule 1: a ready, unclaimed issue launches one claude worker with a launch comment on the issue", () => {
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])] }), cfg(), NOW);
  assert.equal(p.launches.length, 1);
  const l = p.launches[0];
  assert.deepEqual([l.kind, l.host, l.number, l.comment.on], ["issue", "claude", 10, 10]);
  assert.equal(l.comment.body, `dispatch: launched claude:[Worker] #10 Task 10 for #10 at ${ISO}`);
  assert.deepEqual(LAUNCH_RE.exec(l.comment.body).slice(1), ["claude", "[Worker] #10 Task 10", "#10", ISO]);
  assert.deepEqual({ ...l.spec, prompt: "" }, { source_url: "https://github.com/brycejmurrin/f1-game", source_revision: DEFAULT_CONFIG.deployBranch,
    permission_mode: "auto", model: "claude-sonnet-5-5", title: "[Worker] #10 Task 10", tags: ["f1-game-dispatch", "issue:10", "lane:claude"], prompt: "" });
  assert.deepEqual(l.spec.prompt.split("\n"), ["Task: #10 — Task 10", "Do the thing 10.",
    'Claim first: comment "claims #10 — claude:<your session id>" on the issue and add `claimed`; stand down if an older claim comment exists. Put `Closes #10` in the PR body.', ...COMMON()]);
});

test("rule 1: priority first, then the newest updated; the per-run cap and the live-worker cap bound it", () => {
  const issues = [board(), issue(10, ["ready"], { updated_at: ago(5) }), issue(11, ["ready"], { updated_at: ago(1) }), issue(12, ["ready", "priority"], { updated_at: ago(9) }), issue(13, ["ready"], { updated_at: ago(3) })];
  const p = planDispatch(state({ issues }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => l.number), [12, 11, 13, 10]);
  const capped = planDispatch(state({ issues }), cfg({ maxLaunchesPerRun: 2 }), NOW);
  assert.deepEqual(capped.launches.map((l) => l.number), [12, 11]);
  assert.deepEqual(skips(capped), ["issue [Worker] #13 Task 13: maxLaunchesPerRun 2 reached", "issue [Worker] #10 Task 10: maxLaunchesPerRun 2 reached"]);
  const sessions = [{ id: "session_A", title: "w", status: "SESSION_STATUS_IDLE" }, { id: "session_B", title: "w", status: "SESSION_STATUS_RUNNING" }];
  const live = planDispatch(state({ issues, sessions }), cfg({ maxLiveWorkers: { claude: 3 } }), NOW);
  assert.equal(live.launches.length, 1, "3 - 2 live = one slot");
  assert.equal(skips(live)[0], "issue [Worker] #11 Task 11: maxLiveWorkers.claude 3 reached (3 live)");
});

test("rule 1: a quota that is not `allowed` launches nothing and says why; claimed/blocked/needs-decision issues are skipped", () => {
  for (const quota of ["allowed_warning", "rejected", "unknown"]) {
    const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], quota }), cfg(), NOW);
    assert.deepEqual([p.launches.length, skips(p)[0]], [0, `issue [Worker] #10 Task 10: quota ${quota}: launch nothing`], quota);
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
  const on = planDispatch(state({ issues }), cfg({ hosts: { cursor: { enabled: true, model: "composer-2.5" } } }), NOW);
  const spec = on.launches[0].spec;
  assert.equal(on.launches[0].host, "cursor");
  assert.deepEqual({ ...spec, prompt: spec.prompt.text.split("\n")[0] }, { prompt: "Task: #10 — Task 10", model: { id: "composer-2.5" }, name: "[Worker] #10 Task 10",
    env: { type: "cloud" }, repos: [{ url: "https://github.com/brycejmurrin/f1-game", startingRef: DEFAULT_CONFIG.deployBranch }], autoCreatePR: false, workOnCurrentBranch: false });
});

test("rule 2: a PR silent 2 h gets needs-owner and ONE CONTINUE takeover carrying the handoff block", () => {
  const body = "## Goal\nx\n```handoff\nbranch: cursor/x-20\nhead: abc1234\nverified: tooling-fast = run passed\nnot run: group tlx\nnext: fix the red spec\nowner: claude:session_01OLDOLDOLDOLDOLD\n```\n";
  const p = planDispatch(state({ prs: [pr(20, { last_push_at: ago(3), body })] }), cfg(), NOW);
  assert.deepEqual(p.labels, [{ number: 20, add: ["needs-owner"], remove: [] }]);
  assert.equal(p.launches.length, 1);
  const l = p.launches[0];
  assert.deepEqual([l.kind, l.comment.on, l.spec.tags], ["continue", 20, ["f1-game-dispatch", "pr:20", "lane:claude"]]);
  assert.deepEqual(l.spec.prompt.split("\n"), ["CONTINUE PR #20 — PR 20", "Hand-off block from the PR body:", "  branch: cursor/x-20", "  head: abc1234",
    "  verified: tooling-fast = run passed", "  notRun: group tlx", "  next: fix the red spec", "  owner: claude:session_01OLDOLDOLDOLDOLD",
    'Adopt: comment "adopts PR #20 — claude:<your session id>" on the PR and remove `needs-owner`; stand down if a newer adoption comment exists.',
    "Check out its branch (cursor/x-20); fix the red or the conflict (merge origin via sync-pr.mjs, never rebase); push; `land` when ready-gate passes.", ...COMMON("#20")]);
  assert.deepEqual(parseHandoff(body), { branch: "cursor/x-20", head: "abc1234", verified: "tooling-fast = run passed", notRun: "group tlx", next: "fix the red spec", owner: "claude:session_01OLDOLDOLDOLDOLD" });
  assert.equal(parseHandoff("no block"), null);
  const fresh = planDispatch(state({ prs: [pr(21, { last_push_at: ago(3), last_comment_at: ago(1) })] }), cfg(), NOW);
  assert.equal(fresh.launches.length, 0, "a comment 1 h ago is activity");
});

test("rule 2: lane:codex waits 6 h; hold or needs-decision blocks the takeover; a takeover launched < 2 h ago is not repeated", () => {
  const codex = (h, on = {}) => pr(30, { labels: ["lane:codex"], last_push_at: ago(h), ...on });
  assert.equal(planDispatch(state({ prs: [codex(5)] }), cfg(), NOW).launches.length, 0);
  assert.equal(planDispatch(state({ prs: [codex(7)] }), cfg(), NOW).launches.length, 1);
  for (const blocker of ["hold", "needs-decision"]) {
    const p = planDispatch(state({ prs: [pr(31, { labels: [blocker], last_push_at: ago(9) })] }), cfg(), NOW);
    assert.deepEqual([p.launches.length, p.labels.length, skips(p)], [0, 0, [`PR #31: stale 9h but ${blocker}`]], blocker);
  }
  const taken = { author: "bot", body: `dispatch: launched claude:[Worker] CONTINUE PR #32 for #32 at ${ago(1)}`, created_at: ago(1) };
  const p = planDispatch(state({ prs: [pr(32, { labels: ["needs-owner"], last_push_at: ago(9), comments: [taken] })] }), cfg(), NOW);
  assert.deepEqual([p.launches.length, p.labels.length, skips(p)], [0, 0, ["PR #32: takeover launched 1h ago (live claim)"]]);
  assert.equal(activityAt(pr(32, { last_push_at: ago(9), comments: [taken] })), NOW - 9 * 3.6e6, "a dispatcher launch comment is not activity");
  assert.equal(activityAt(pr(32, { last_push_at: ago(9), comments: [{ body: "fixed it", created_at: ago(4) }] })), NOW - 4 * 3.6e6);
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
  const sessions = [
    { id: "session_01DONE000000", title: "[Worker] CONTINUE PR #60 x", status: "SESSION_STATUS_IDLE" },
    { id: "session_01ISSUE000000", title: "[Worker] #50 Task 50", status: "SESSION_STATUS_IDLE", tags: ["issue:50"] },
    { id: "session_01NOCLAIM0000", title: "[Worker] #61", status: "SESSION_STATUS_IDLE", tags: ["pr:61"] },
    { id: "session_01RUNNING0000", title: "[Worker] #62", status: "SESSION_STATUS_RUNNING", pr: 62 },
    { id: "session_01OPEN00000000", title: "[Worker] #63", status: "SESSION_STATUS_IDLE", pr: 63 },
    { id: "session_01YOUNG0000000", title: "[Worker] #64", status: "SESSION_STATUS_IDLE", pr: 64 },
    { id: "session_01OPENISSUE000", title: "[Worker] #10 Task 10", status: "SESSION_STATUS_IDLE" },
    { id: "session_01NOPR00000000", title: "[Worker] no pr", status: "SESSION_STATUS_IDLE" },
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
    "quota: **allowed** · pause: false · merge-pause: false · deploy: green", "caps: launches/run 4; live workers claude 1/8, cursor 0/4; cost cap $10", "",
    "| PR | title | state | age | owner | last activity | labels |", "|---|---|---|---|---|---|---|",
    "| #70 | PR 70 | ready | 30h | claude:session_01ABCDEFGHIJKLMNOP | 30m ago | run-ci, lane:claude |", "| #71 | PR 71 | draft | 30h | - | 30m ago | - |", "",
    "### Launches this run (1)", "- claude: [Worker] #10 Task 10"]);
  assert.equal(p.boardIssue, 1);
});

test("prompts: every launch prompt is at most 25 lines and ends with the four common lines (WORKERS.md, lane, base, cost cap, land)", () => {
  const c = cfg();
  const long = issue(10, ["ready"], { body: Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(200)}`).join("\n") });
  const hand = "```handoff\n" + Array.from({ length: 20 }, (_, i) => `k${i}: v`).join("\n") + "\n```";
  for (const [text, n] of [[issuePrompt(long, c, "claude"), "it"], [continuePrompt(pr(20, { body: hand }), c, "claude"), "#20"], [continuePrompt(pr(21), c, "claude"), "#21"], [deployRedPrompt(c, "claude"), "it"]]) {
    const lines = text.split("\n");
    assert.ok(lines.length <= PROMPT_MAX_LINES, `${lines.length} lines`);
    assert.deepEqual(lines.slice(-4), COMMON(n));
  }
  assert.equal(issuePrompt(long, c, "claude").split("\n")[1].length, 160, "a body line is cut at 160 chars");
});

test("apply: labels, launch comments and the Board edit go through the client; the session-side lines are printed in the documented shapes", () => {
  const calls = [], out = [];
  const api = (p, o = {}) => {
    calls.push(`${o.method || "GET"} ${p}`);
    if (p === "issues/1/comments?per_page=100") return { json: [{ id: 9, body: `${BOARD_MARKER}\nold` }] };
    return { json: {} };
  };
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [pr(20, { last_push_at: ago(3) })] }), cfg(), NOW);
  p.archives.push({ id: "session_01DONE000000", why: "test" });   // exercise the print path directly
  const writes = applyPlan(p, { api, config: cfg(), log: (s) => out.push(s) });
  assert.deepEqual(calls, ["POST issues/20/labels", "POST issues/10/comments", "POST issues/20/comments", "GET issues/1/comments?per_page=100", "PATCH issues/comments/9"]);
  assert.equal(writes, 4);
  const line = (s, tag) => [s.slice(0, tag.length), JSON.parse(s.slice(tag.length))];
  assert.deepEqual(line(out[0], "CREATE_SESSION ")[0], "CREATE_SESSION ");
  assert.deepEqual(line(out[0], "CREATE_SESSION ")[1].source_url, "https://github.com/brycejmurrin/f1-game");
  assert.equal(line(out[1], "CREATE_SESSION ")[1].title, "[Worker] CONTINUE PR #20 PR 20");
  assert.equal(out[2], "ARCHIVE_SESSION session_01DONE000000");
});

test("extractSessions reads an MCP page with its envelope; loadConfig merges the file over the defaults", () => {
  const page = '<other-session>\nrecord\n{"ccr": {"data": [{"id": "session_01X", "title": "[Worker] #5", "session_status": "SESSION_STATUS_IDLE", "tags": ["pr:5"]}], "has_more": false}}\n</other-session>';
  assert.deepEqual(extractSessions(page).map((s) => [s.id, s.status, sessionRefs(s).prs]), [["session_01X", "SESSION_STATUS_IDLE", [5]]]);
  const c = loadConfig("x.json", () => JSON.stringify({ maxLaunchesPerRun: 1, staleHours: { codex: 9 } }));
  assert.deepEqual([c.maxLaunchesPerRun, c.staleHours, c.model], [1, { default: 2, codex: 9 }, "claude-sonnet-5-5"]);
  assert.equal(loadConfig("missing.json", () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); }).maxLaunchesPerRun, 4);
});
