// dispatch — the Actions dispatcher's pure plan (tools/ci/dispatch.mjs planDispatch) over fixture GitHub state:
// ready-issue launches and their one-line addresses, provenance-gated priority / pause, the per-run, per-day and live
// caps, claims, stale PRs → needs-owner + CONTINUE, codex 6 h, hold, deploy red, nudges as PR comments, needs-decision
// digests and clearing, the Board markdown, and the fire path with a stubbed fetch (claim only after a 200). No network.
// Every check is an exact equality on the produced string (no regex pins: the assertPins ratchet counts those).
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  planDispatch, batchMembers, batchLandsAfter, DEFAULT_CONFIG, parseHandoff, liveLaunch, activityAt, applyPlan, loadConfig, BOARD_MARKER, LAUNCH_RE, NUDGE_RE,
  DIGEST_MARKER, ANTHROPIC_VERSION, readState, getAll, landProblem, main, renderPlan, launchRecheck, fireWorker, claimComment,
  addressOf, closingIssues, isDispatchComment, PROVENANCE_LABELS, PLATFORM_STEP, platformFailure,
} from "../../tools/ci/dispatch.mjs";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const ISO = "2026-11-03T12:00:00.000Z";
const ago = (h) => new Date(NOW - h * 3.6e6).toISOString();
const cfg = (on = {}) => ({ ...DEFAULT_CONFIG, boardIssue: 1, dispatchIssue: 2, ...on });
const APP = { id: 1236329, slug: "claude" };
/** A label event: Bryce's own click unless `app` names the app that performed it. */
const ev = (name, h, { app = null, event = "labeled", actor = "brycejmurrin" } = {}) => ({ event, label: { name }, actor: { login: actor }, created_at: ago(h), performed_via_github_app: app });
const issue = (number, labels, on = {}) => ({ number, title: `Task ${number}`, body: `Do the thing ${number}.`, labels, updated_at: ago(1), author: "brycejmurrin", comments: [], events: null, ...on });
/** An open PR of this repo by the owner; `updated_at` stands in for the head's push time unless `pushed_at` is given. */
const pr = (number, on = {}) => ({ number, title: `PR ${number}`, draft: true, labels: [], head_sha: "a".repeat(40), head_ref: `cursor/x-${number}`,
  head_repo: "brycejmurrin/f1-game", author: "brycejmurrin", body: "", created_at: ago(30), updated_at: ago(0.5), last_comment_at: null, lane: null, comments: [], events: null,
  ...on, pushed_at: on.pushed_at ?? on.updated_at ?? ago(0.5) });
const board = (on = {}) => issue(1, [], { title: "Board", ...on });
const dispatchIssue = (labels = [], events = null) => issue(2, labels, { title: "Dispatch", events });
const launched = (n, h, sid = "") => ({ author: "github-actions[bot]", body: `dispatch: launched claude:[Worker] #${n} Task for #${n} at ${ago(h)}${sid ? ` as ${sid}` : ""}`, created_at: ago(h) });
const state = (on = {}) => ({ issues: [board(), dispatchIssue()], prs: [], deployRed: false, deployRunId: null, ...on });
const skips = (p) => p.skipped.map((s) => `${s.what}: ${s.why}`);
const SID = "session_01HJKLMNOPQRSTUVWXYZ";

test("rule 1: a ready, unclaimed issue plans one worker addressed ISSUE <n>, claimed on the issue after the fire", () => {
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])] }), cfg(), NOW);
  assert.equal(p.launches.length, 1);
  const l = p.launches[0];
  assert.deepEqual([l.kind, l.number, l.on, l.address, l.title], ["issue", 10, 10, "ISSUE 10", "[Worker] #10 Task 10"]);
  assert.equal(claimComment(l, NOW, SID), `dispatch: launched claude:[Worker] #10 Task 10 for #10 at ${ISO} as ${SID}`);
  assert.deepEqual(LAUNCH_RE.exec(claimComment(l, NOW, SID)).slice(1), ["claude", "[Worker] #10 Task 10", "#10", ISO, SID]);
  assert.deepEqual([addressOf({ kind: "continue", number: 20 }), addressOf({ kind: "deploy-red", number: 0, runId: 4242 }), addressOf({ kind: "deploy-red", number: 0 })],
    ["CONTINUE PR 20", "DEPLOY-RED 4242", "DEPLOY-RED unknown"]);
  assert.equal(p.live, 1);
});

test("rule 1: Bryce's own `priority` goes first, an agent's `priority` is ignored and reported; newest next; the per-run cap", () => {
  const issues = [board(), issue(10, ["ready"], { updated_at: ago(5) }), issue(11, ["ready"], { updated_at: ago(1) }),
    issue(12, ["ready", "priority"], { updated_at: ago(9), events: [ev("priority", 2)] }),
    issue(13, ["ready", "priority"], { updated_at: ago(3), events: [ev("priority", 2, { app: APP })] }),
    issue(14, ["ready", "priority"], { updated_at: ago(7) })];
  const p = planDispatch(state({ issues }), cfg({ maxLaunchesPerRun: 9 }), NOW);
  assert.deepEqual(p.launches.map((l) => l.number), [12, 11, 13, 10, 14], "only #12's priority is Bryce's click; the rest sort by updated_at");
  assert.deepEqual(p.ignored, ["priority on #13 (brycejmurrin via app claude)", "priority on #14 (no label event fetched)"]);
  assert.equal(p.board.split("\n")[5], "not honoured (not brycejmurrin's own click): priority on #13 (brycejmurrin via app claude); priority on #14 (no label event fetched)");
  const capped = planDispatch(state({ issues }), cfg({ maxLaunchesPerRun: 2 }), NOW);
  assert.deepEqual(capped.launches.map((l) => l.number), [12, 11]);
  assert.deepEqual(skips(capped).slice(0, 2), ["issue [Worker] #13 Task 13: maxLaunchesPerRun 2 reached", "issue [Worker] #10 Task 10: maxLaunchesPerRun 2 reached"]);
});

test("caps: live claims (launch comments < launchClaimHours) bound maxLiveWorkers; launch comments in 24 h bound maxLaunchesPerDay", () => {
  const issues = [board(), issue(10, ["ready"]), issue(11, ["ready"]), issue(20, ["ready", "claimed"], { comments: [launched(20, 1)] }), issue(21, ["ready", "claimed"], { comments: [launched(21, 1.5)] })];
  const live = planDispatch(state({ issues }), cfg({ maxLiveWorkers: 3 }), NOW);
  assert.deepEqual([live.live, live.launches.map((l) => l.number), skips(live)], [3, [10], ["issue [Worker] #11 Task 11: maxLiveWorkers 3 reached (3 live claims)"]]);
  const old = [board(), issue(10, ["ready"]), issue(11, ["ready"]), issue(30, ["claimed"], { comments: [launched(30, 5), launched(30, 23)] }), issue(31, ["claimed"], { comments: [launched(31, 25)] })];
  const day = planDispatch(state({ issues: old }), cfg({ maxLaunchesPerDay: 3 }), NOW);
  assert.deepEqual([day.launchedToday, day.live, day.launches.map((l) => l.number)], [2, 1, [10]], "the 25 h old launch is outside the day; the 5 h and 23 h ones are not live");
  assert.deepEqual(skips(day), ["issue [Worker] #11 Task 11: maxLaunchesPerDay 3 reached (2 launched in the last 24 h)"]);
  assert.equal(day.board.split("\n")[4], "caps: launches/run 4; launches/day 2/3; live claims 1/8; cost cap $10 · land queue 0/15");
});

test("rule 1: a launch comment younger than launchClaimHours is a live claim (no double launch); claimed/blocked/needs-decision/epic/lane:cursor issues are skipped", () => {
  const young = planDispatch(state({ issues: [board(), issue(10, ["ready"], { comments: [launched(10, 1)] })] }), cfg(), NOW);
  assert.deepEqual([young.launches.length, skips(young)], [0, ["issue #10: launched claude 1h ago (live claim)"]]);
  assert.equal(planDispatch(state({ issues: [board(), issue(10, ["ready"], { comments: [launched(10, 3)] })] }), cfg(), NOW).launches.length, 1);
  assert.equal(liveLaunch([launched(10, 1)], NOW, 2).host, "claude");
  assert.equal(liveLaunch([launched(10, 3)], NOW, 2), null);
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready", "claimed"]), issue(11, ["ready", "blocked"]), issue(12, ["ready", "needs-decision"]), issue(13, ["ready", "epic"]),
    issue(14, ["ready", "lane:cursor"]), issue(15, ["ready"], { body: "Sub-issue of #13" })] }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => l.number), [15]);
  assert.deepEqual(skips(p), ["issue #14: lane:cursor: Cursor launches retired (2026-11-03); relabel to dispatch a Claude worker"]);
});

test("rule 1: a batch and its members yield ONE launch; a member is never launched alone; a batch honours its Merge order", () => {
  const body = (members, after = "No open PR and no other batch edits these files: this batch can start now.") =>
    ["One PR fixes every member.", "", "## Members", ...members.flatMap((n) => [`- #${n} — a bug`, "  - tools/ci/dispatch.mjs:1 see #999"]), "", "## Shared files", "- `tools/ci/dispatch.mjs`", "",
      "## Merge order", after, "", "sync once after each PR named above.", "", "## Notes", "#998 also edits this and lands after."].join("\n");
  const after = (...lines) => ["This batch lands **after**:", ...lines].join("\n");
  const batch = (n, members, on = {}) => issue(n, ["ready", "batch"], { body: body(members, on.after), ...on });
  // 11 is a member by label and by listing; 12 lost its `batched` label but is listed; 13 is `batched` with no batch in sight.
  const members = [issue(11, ["ready", "batched"]), issue(12, ["ready"]), issue(13, ["ready", "batched"])];
  const one = planDispatch(state({ issues: [board(), batch(10, [11, 12]), ...members] }), cfg(), NOW);
  assert.deepEqual(one.launches.map((l) => l.address), ["ISSUE 10"], "the batch, not its members");
  assert.deepEqual(skips(one), ["3 batched issue(s): fixed by their batch issue's ONE PR, never launched on their own"]);
  assert.deepEqual([batchMembers(body([11, 12])), batchLandsAfter(body([11]))], [[11, 12], []], "sub-bullets and Notes name no member and no prerequisite");
  assert.deepEqual(batchLandsAfter(body([11], after("- PR #50 (game.js), PR #51 and PR #52 (tlx.js)", "- #20 (batch other) (#21 row 1: the stub)"))), [50, 51, 52, 20]);
  // An open PR that closes a member is the batch's PR: no second launch.
  const linked = planDispatch(state({ issues: [board(), batch(10, [11, 12]), ...members], prs: [pr(40, { body: "Closes #11 #12", updated_at: ago(0.1) })] }), cfg(), NOW);
  assert.deepEqual([linked.launches.length, skips(linked).at(-1)], [0, "issue #10: already has open PR #40"]);
  // Merge order: waits for an open PR and for an open batch with an open member; a closed PR, a closed issue and a
  // batch whose members are all closed have landed.
  const waits = (prs, issues) => planDispatch(state({ issues: [board(), batch(10, [11], { after: after("- PR #50 (game.js)", "- #20 (batch other) (game.js)") }), issue(11, ["ready", "batched"]), ...issues], prs }), cfg(), NOW);
  const held = waits([pr(50, { updated_at: ago(0.1) })], [batch(20, [21], { labels: ["ready", "batch", "claimed"] }), issue(21, ["ready", "batched"])]);
  assert.deepEqual([held.launches.length, skips(held).at(-1)], [0, "issue #10: batch lands after #20, #50 (its Merge order): launch when they have landed"]);
  assert.deepEqual(waits([], [batch(20, [21], { labels: ["batch", "claimed"] })]).launches.map((l) => l.address), ["ISSUE 10"], "#50 merged, #20's members all closed");
  assert.deepEqual(waits([], []).launches.map((l) => l.address), ["ISSUE 10"], "everything it names has landed");
});

test("rule 2: a PR silent 2 h gets needs-owner and ONE CONTINUE PR <n> takeover; a comment is activity; this tool's own comments are not", () => {
  const body = "## Goal\nx\n```handoff\nbranch: cursor/x-20\nhead: abc1234\nnext: fix the red spec\n```\n";
  const p = planDispatch(state({ prs: [pr(20, { updated_at: ago(3), body })] }), cfg(), NOW);
  assert.deepEqual(p.labels, [{ number: 20, add: ["needs-owner"], remove: [] }]);
  assert.deepEqual(p.launches.map((l) => [l.kind, l.on, l.address, l.title]), [["continue", 20, "CONTINUE PR 20", "[Worker] CONTINUE PR #20 PR 20"]]);
  assert.deepEqual(parseHandoff(body), { branch: "cursor/x-20", head: "abc1234", next: "fix the red spec" });
  assert.equal(parseHandoff("no block"), null);
  assert.equal(planDispatch(state({ prs: [pr(21, { updated_at: ago(3), last_comment_at: ago(1) })] }), cfg(), NOW).launches.length, 0, "a comment 1 h ago is activity");
  const nudge = { author: "github-actions[bot]", body: `dispatch: nudge at ${ago(1)} — PR #22 idle`, created_at: ago(1) };
  assert.equal(activityAt(pr(22, { updated_at: ago(9), comments: [launched(22, 1), nudge, { author: "github-actions[bot]", body: `${BOARD_MARKER}\nx`, created_at: ago(0.5) }] })), NOW - 9 * 3.6e6, "launch, nudge and Board comments are not activity");
  assert.equal(activityAt(pr(22, { updated_at: ago(9), comments: [{ body: "fixed it", created_at: ago(4) }] })), NOW - 4 * 3.6e6);
  assert.deepEqual([isDispatchComment(nudge.body), isDispatchComment(`x ${DIGEST_MARKER}`), isDispatchComment("fixed it")], [true, true, false]);
});

test("rule 2: lane:codex waits 6 h; hold, needs-decision and fold-bot PRs block the takeover; a takeover launched < 2 h ago is not repeated; needs-owner launches at once", () => {
  const codex = (h) => pr(30, { labels: ["lane:codex"], updated_at: ago(h) });
  assert.equal(planDispatch(state({ prs: [codex(5)] }), cfg(), NOW).launches.length, 0);
  assert.equal(planDispatch(state({ prs: [codex(7)] }), cfg(), NOW).launches.length, 1);
  for (const blocker of ["hold", "needs-decision"]) {
    const p = planDispatch(state({ prs: [pr(31, { labels: [blocker], updated_at: ago(9) })] }), cfg(), NOW);
    assert.deepEqual([p.launches.length, p.labels.length, skips(p)], [0, 0, [`PR #31: stale 9h but ${blocker}`]], blocker);
  }
  for (const bot of [{ head_ref: "bot/changelog-fold" }, { author: "github-actions[bot]" }]) {
    const p = planDispatch(state({ prs: [pr(33, { updated_at: ago(9), ...bot })] }), cfg(), NOW);
    assert.deepEqual([p.launches.length, p.nudges.length, skips(p)], [0, 0, ["PR #33: stale 9h but a fold bot's PR (never re-owned)"]]);
  }
  const taken = { author: "github-actions[bot]", body: `dispatch: launched claude:[Worker] CONTINUE PR #32 for #32 at ${ago(1)}`, created_at: ago(1) };
  const p = planDispatch(state({ prs: [pr(32, { labels: ["needs-owner"], updated_at: ago(9), comments: [taken] })] }), cfg(), NOW);
  assert.deepEqual([p.launches.length, p.labels.length, skips(p)], [0, 0, ["PR #32: takeover launched 1h ago (live claim)"]]);
  const asked = planDispatch(state({ prs: [pr(60, { labels: ["needs-owner"], updated_at: ago(0.1) })] }), cfg(), NOW);
  assert.deepEqual([asked.launches.map((l) => l.address), asked.labels], [["CONTINUE PR 60"], []]);
});

test("rule 2: a `land` PR waiting on CI/gate is not stale; a red, failed-gate or conflicting one is; merge-pause (Bryce's) parks a pending gate", () => {
  const land = (on) => pr(80, { labels: ["land"], updated_at: ago(5), ...on });
  const waiting = planDispatch(state({ prs: [land({ checks: [{ id: 1, name: "CI", status: "in_progress", conclusion: null }] })] }), cfg(), NOW);
  assert.deepEqual([waiting.launches.length, waiting.nudges.length, skips(waiting)], [0, 0, ["PR #80: stale 5h but labelled land and waiting on CI/gate/train"]]);
  assert.equal(landProblem(land({ checks: [{ id: 1, name: "CI", status: "completed", conclusion: "failure" }, { id: 3, name: "CI", status: "completed", conclusion: "success" }] })), null, "the newest run of a check name decides");
  assert.equal(planDispatch(state({ prs: [land({ checks: [{ id: 1, name: "CI", status: "completed", conclusion: "failure" }] })] }), cfg(), NOW).launches[0].kind, "continue");
  assert.equal(landProblem(land({ mergeable_state: "dirty" })), "merge conflict");
  const gate = (statuses) => land({ checks: [{ id: 1, name: "CI", status: "completed", conclusion: "success" }], statuses });
  assert.equal(landProblem(gate([{ context: "gate", state: "failure", updated_at: ago(4) }]), NOW, 2), "gate failure");
  assert.equal(landProblem(gate([{ context: "gate", state: "pending", updated_at: ago(3) }]), NOW, 2), "gate pending 3h");
  assert.equal(landProblem(gate([{ context: "gate", state: "pending", updated_at: ago(1) }]), NOW, 2), null, "a young pending gate only waits");
  assert.equal(landProblem(gate([{ context: "gate", state: "pending", updated_at: ago(3) }]), NOW, 2, true), null, "merge-pause holds gate pending on purpose");
  assert.equal(landProblem(gate([{ context: "gate", state: "failure", updated_at: ago(4) }, { context: "gate", state: "success", updated_at: ago(3) }]), NOW, 2), null, "the newest gate status decides");
  const paused = planDispatch(state({ issues: [board(), dispatchIssue(["dispatch:merge-pause"], [ev("dispatch:merge-pause", 1)])], prs: [gate([{ context: "gate", state: "pending", updated_at: ago(3) }])] }), cfg(), NOW);
  assert.deepEqual([paused.flags.mergePause, skips(paused)], [true, ["PR #80: stale 5h but labelled land and waiting on CI/gate/train"]]);
});

test("rule 3: deploy red labels the Board and launches one fixer addressed DEPLOY-RED <run id>, unless a PR carries deploy:red or one was launched < 2 h ago; green removes the label", () => {
  const red = planDispatch(state({ deployRed: true, deployRunId: 40987 }), cfg(), NOW);
  assert.deepEqual(red.labels, [{ number: 1, add: ["deploy:red"], remove: [] }]);
  assert.deepEqual(red.launches.map((l) => [l.kind, l.on, l.address]), [["deploy-red", 1, "DEPLOY-RED 40987"]], "the claim goes on the Board issue");
  assert.equal(claimComment(red.launches[0], NOW, SID), `dispatch: launched claude:[Worker] deploy:red fixer for deploy:red at ${ISO} as ${SID}`);
  const claimed = planDispatch(state({ deployRed: true, prs: [pr(40, { labels: ["deploy:red"] })] }), cfg(), NOW);
  assert.deepEqual([claimed.launches.length, skips(claimed)], [0, ["deploy:red fixer: PR #40 carries deploy:red"]]);
  const fixer = { author: "github-actions[bot]", body: `dispatch: launched claude:[Worker] deploy:red fixer for deploy:red at ${ago(1)}`, created_at: ago(1) };
  const again = planDispatch(state({ deployRed: true, issues: [board({ labels: ["deploy:red"], comments: [fixer] })] }), cfg(), NOW);
  assert.deepEqual([again.launches.length, again.labels.length, skips(again)], [0, 0, ["deploy:red fixer: launched 1h ago (live claim)"]]);
  assert.deepEqual(planDispatch(state({ issues: [board({ labels: ["deploy:red"] })] }), cfg(), NOW).labels, [{ number: 1, add: [], remove: ["deploy:red"] }]);
  const input = state({ issues: [board(), issue(10, ["ready"], { events: [ev("priority", 1)], labels: ["ready", "priority"] }), issue(11, ["ready"])], deployRed: true, prs: [pr(20, { updated_at: ago(4) }), pr(30, { labels: ["needs-owner"] })] });
  assert.deepEqual(planDispatch(input, cfg({ maxLaunchesPerRun: 2 }), NOW).launches.map((l) => l.address), ["DEPLOY-RED unknown", "CONTINUE PR 30"], "recovery and asked takeovers take scarce slots first");
  assert.deepEqual(planDispatch(input, cfg(), NOW).launches.map((l) => l.address), ["DEPLOY-RED unknown", "CONTINUE PR 30", "CONTINUE PR 20", "ISSUE 10"]);
});

test("pause: Bryce's own dispatch:pause (or the config file) launches nothing; an agent's dispatch:pause is ignored and reported; rules 2 and 3 still label", () => {
  const issues = (events) => [board(), dispatchIssue(["dispatch:pause"], events), issue(10, ["ready"])];
  const byBryce = planDispatch(state({ issues: issues([ev("dispatch:pause", 1)]), prs: [pr(20, { updated_at: ago(3) })], deployRed: true }), cfg(), NOW);
  assert.deepEqual([byBryce.launches.length, byBryce.flags.pause, skips(byBryce)], [0, true, ["deploy-red [Worker] deploy:red fixer: paused (dispatch:pause)", "continue [Worker] CONTINUE PR #20 PR 20: paused (dispatch:pause)", "issue [Worker] #10 Task 10: paused (dispatch:pause)"]]);
  assert.deepEqual(byBryce.labels, [{ number: 1, add: ["deploy:red"], remove: [] }, { number: 20, add: ["needs-owner"], remove: [] }], "labels still move while paused");
  const byAgent = planDispatch(state({ issues: issues([ev("dispatch:pause", 1, { app: APP })]) }), cfg(), NOW);
  assert.deepEqual([byAgent.launches.length, byAgent.flags.pause, byAgent.ignored], [1, false, ["dispatch:pause on #2 (brycejmurrin via app claude)"]]);
  const relabelled = planDispatch(state({ issues: issues([ev("dispatch:pause", 3), ev("dispatch:pause", 2, { event: "unlabeled" }), ev("dispatch:pause", 1, { app: APP })]) }), cfg(), NOW);
  assert.equal(relabelled.flags.pause, false, "Bryce's old click does not cover an agent's re-add");
  assert.equal(planDispatch(state({ issues: issues(null) }), cfg(), NOW).flags.pause, false, "no events fetched: not honoured");
  assert.equal(planDispatch(state({ issues: [board(), dispatchIssue(), issue(10, ["ready"])] }), cfg({ pause: true }), NOW).launches.length, 0);
  assert.equal(planDispatch(state(), cfg(), NOW).board.split("\n")[3], "pause: false · merge-pause: false · deploy: green");
});

test("nudges: an open PR idle past nudgeAfterMinutes gets ONE `dispatch: nudge` comment naming the handoff's next:, once per nudgeEveryMinutes; landing, held and bot PRs are left alone", () => {
  const body = "```handoff\nnext: fix tlx spec, then ready-gate\n```";
  const p = planDispatch(state({ prs: [pr(70, { updated_at: ago(1), body }), pr(71, { updated_at: ago(0.5) }), pr(72, { labels: ["land"], updated_at: ago(1.5), checks: [] }),
    pr(73, { labels: ["hold"], updated_at: ago(1.5) }), pr(74, { updated_at: ago(1.5), head_ref: "bot/ratchets-fold" }), pr(75, { updated_at: ago(1.5) })] }), cfg(), NOW);
  assert.deepEqual(p.nudges.map((n) => n.on), [75, 70], "oldest activity first");
  assert.deepEqual(p.nudges[1].body.split("\n"), [`dispatch: nudge at ${ISO} — PR #70 has had no push or comment for 60 min.`,
    "Next: fix tlx spec, then ready-gate. A question goes to Bryce as `needs-decision` + one comment, never to the chat.", "Silence for 2 h hands the PR to a CONTINUE worker."]);
  assert.equal(p.nudges[0].body.split("\n")[1], "Next: finish the Plan, push, run ready-gate, flip ready and add `land`. A question goes to Bryce as `needs-decision` + one comment, never to the chat.");
  assert.equal(NUDGE_RE.exec(p.nudges[1].body)[1], ISO);
  assert.deepEqual([p.launches.length, p.labels.length], [0, 0], "a nudge is not a takeover");
  const nudged = { author: "github-actions[bot]", body: p.nudges[1].body, created_at: ISO };
  const later = planDispatch(state({ prs: [pr(70, { updated_at: ago(1), body, comments: [nudged] })] }), cfg(), NOW + 30 * 6e4);
  assert.deepEqual([later.nudges.length, skips(later)], [0, ["nudge PR #70: nudged 30m ago (rule: one per 60 min)"]]);
  assert.equal(planDispatch(state({ prs: [pr(70, { updated_at: ago(0.5), body, comments: [nudged] })] }), cfg(), NOW + 61 * 6e4).nudges.length, 1, "after an hour (PR idle 91 min, still short of staleHours) it nudges again");
  const stale = planDispatch(state({ prs: [pr(70, { updated_at: ago(3), body, comments: [nudged] })] }), cfg(), NOW + 61 * 6e4);
  assert.deepEqual([stale.nudges.length, stale.launches.map((l) => l.address)], [0, ["CONTINUE PR 70"]], "past staleHours the takeover replaces the nudge; the nudge comment was not activity");
  const codex = planDispatch(state({ prs: [pr(76, { labels: ["lane:codex"], updated_at: ago(3) })] }), cfg(), NOW);
  assert.equal(codex.nudges[0].body.split("\n")[2], "Silence for 6 h hands the PR to a CONTINUE worker.");
});

test("needs-decision: a Bryce `decision:` comment newer than the label clears it; an agent-set label gets ONE @brycejmurrin digest; a paraphrase, an older decision or Bryce's own label do nothing", () => {
  const decision = (h, app = null) => ({ author: "brycejmurrin", user: { login: "brycejmurrin" }, body: "decision: ship it without the row", created_at: ago(h), performed_via_github_app: app });
  const asked = { author: "brycejmurrin", user: { login: "brycejmurrin" }, body: "Question for Bryce: keep the distance row?\n\nOptions: a) keep b) drop", created_at: ago(2.5), performed_via_github_app: APP };
  const nd = (n, events, comments, on = {}) => pr(n, { labels: ["needs-decision"], updated_at: ago(0.1), events, comments, ...on });
  const cleared = planDispatch(state({ prs: [nd(90, [ev("needs-decision", 2, { app: APP })], [asked, decision(1)])] }), cfg(), NOW);
  assert.deepEqual([cleared.labels, cleared.digests.length, skips(cleared)], [[{ number: 90, add: [], remove: ["needs-decision"] }], 0, ["needs-decision #90: cleared: brycejmurrin decided 1h ago"]]);
  const digest = planDispatch(state({ prs: [nd(91, [ev("needs-decision", 2, { app: APP })], [asked])] }), cfg(), NOW);
  assert.deepEqual([digest.labels.length, digest.digests.map((d) => d.on)], [0, [91]]);
  assert.deepEqual(digest.digests[0].body.split("\n"), ["@brycejmurrin decision needed on PR #91 — PR 91", "", "> Question for Bryce: keep the distance row?", "> Options: a) keep b) drop", "",
    "Answer with a comment that starts `decision:` (the dispatcher then removes `needs-decision` and the worker continues), or remove the label yourself.", DIGEST_MARKER]);
  const posted = { author: "github-actions[bot]", body: digest.digests[0].body, created_at: ago(0.5) };
  const again = planDispatch(state({ prs: [nd(91, [ev("needs-decision", 2, { app: APP })], [asked, posted])] }), cfg(), NOW);
  assert.deepEqual([again.digests.length, skips(again)], [0, ["digest #91: the previous digest is still the latest bot comment"]]);
  const afterNoise = planDispatch(state({ prs: [nd(91, [ev("needs-decision", 2, { app: APP })], [asked, posted, { author: "github-actions[bot]", body: "CI: something else", created_at: ago(0.2) }])] }), cfg(), NOW);
  assert.equal(afterNoise.digests.length, 1, "another bot comment after the digest: the digest is no longer the latest bot comment");
  const paraphrase = planDispatch(state({ prs: [nd(92, [ev("needs-decision", 2, { app: APP })], [asked, decision(1, APP)])] }), cfg(), NOW);
  assert.deepEqual([paraphrase.labels.length, paraphrase.digests.length], [0, 1], "an app-written decision: comment is not Bryce's");
  const older = planDispatch(state({ prs: [nd(93, [ev("needs-decision", 1, { app: APP })], [decision(2), asked])] }), cfg(), NOW);
  assert.deepEqual([older.labels.length, older.digests.length], [0, 1], "a decision older than the label answered something else");
  const own = planDispatch(state({ issues: [board(), dispatchIssue(), issue(94, ["needs-decision"], { events: [ev("needs-decision", 2)], comments: [asked] })] }), cfg(), NOW);
  assert.deepEqual([own.labels.length, own.digests.length], [0, 0], "Bryce set it himself: no digest");
  const issueDigest = planDispatch(state({ issues: [board(), dispatchIssue(), issue(95, ["needs-decision"], { events: [ev("needs-decision", 2, { app: APP })], comments: [] })] }), cfg(), NOW);
  assert.equal(issueDigest.digests[0].body.split("\n").slice(0, 3).join("|"), "@brycejmurrin decision needed on issue #95 — Task 95||> (no comment states the question: read the body)");
  assert.deepEqual(renderPlan(issueDigest)[0], "DIGEST #95  @brycejmurrin decision needed on issue #95 — Task 95");
});

test("board: the markdown carries the marker, one row per open PR (owner from the handoff block), launches by address, caps and the land queue", () => {
  const body = "```handoff\nowner: claude:session_01ABCDEFGHIJKLMNOP\n```";
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [pr(70, { labels: ["area:tooling", "lane:claude"], body, draft: false }), pr(71)] }), cfg(), NOW);
  assert.deepEqual(p.board.split("\n").slice(0, 13), [BOARD_MARKER, `## Board — ${ISO}`, "",
    "pause: false · merge-pause: false · deploy: green", "caps: launches/run 4; launches/day 0/24; live claims 1/8; cost cap $10 · land queue 0/15", "",
    "| PR | title | state | age | owner | last activity | labels |", "|---|---|---|---|---|---|---|",
    "| #70 | PR 70 | ready | 30h | claude:session_01ABCDEFGHIJKLMNOP | 30m ago | area:tooling, lane:claude |", "| #71 | PR 71 | draft | 30h | - | 30m ago | - |", "",
    "### Launches this run (1)", "- ISSUE 10: [Worker] #10 Task 10"]);
  assert.equal(p.boardIssue, 1);
  const landing = (n) => Array.from({ length: n }, (_, k) => pr(200 + k, { labels: ["land"], draft: false }));
  const full = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: landing(15) }), cfg(), NOW);
  assert.deepEqual([full.launches.length, full.landQueue, skips(full)], [0, 15, ["issue launches paused: 15 PRs waiting to land (max 15) — land before starting more"]]);
  assert.equal(planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: landing(14) }), cfg(), NOW).launches.length, 1);
  assert.equal(planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: landing(42) }), cfg({ landQueueMax: null }), NOW).launches.length, 1, "landQueueMax null switches it off");
});

test("ready issues with an open PR closing them, or an open prerequisite, do not launch duplicate workers; foreign activity blocks a takeover", () => {
  for (const [body, linked] of [["Closes #10", true], ["Fixes brycejmurrin/f1-game#10", true], ["Closes https://github.com/another/repository/issues/10", false], ["Refs #10", false],
    ["```\nCloses #10\n```", false], ["Example: `Closes #10`", false], ["Closes #100", false]]) {
    const p = planDispatch(state({ issues: [board(), issue(10, ["ready"]), issue(12, ["ready"])], prs: [pr(50, { body })] }), cfg(), NOW);
    assert.deepEqual(p.launches.map((l) => l.number), linked ? [12] : [10, 12], body);
  }
  assert.deepEqual(closingIssues("Closes #11, resolves #10"), [11, 10]);
  const stale = (n, on = {}) => pr(n, { updated_at: ago(3), author: "brycejmurrin", ...on });
  for (const line of ["builds on #4108", "starts after #4108 merges", "depends on PR #4108", "blocked by #4108"]) {
    const p = planDispatch(state({ prs: [stale(4096, { body: `## Plan\n- [ ] now: ${line}\n` }), stale(4108, { updated_at: ago(0.1) })] }), cfg(), NOW);
    assert.deepEqual([line, p.launches.length, p.labels.length, skips(p)], [line, 0, 0, ["PR #4096: stale 3h but waits for #4108 to merge (launch after it lands)"]]);
  }
  const c = (author, h) => ({ author, at: ago(h) });
  for (const [name, p, n] of [["foreign", stale(40, { labels: ["needs-owner"], commits: [c("Cursor Agent", 1)] }), 0], ["old foreign", stale(41, { labels: ["needs-owner"], commits: [c("Cursor Agent", 5)] }), 1],
    ["own", stale(42, { labels: ["needs-owner"], commits: [c("brycejmurrin", 1)] }), 1], ["claude", stale(43, { labels: ["needs-owner"], commits: [c("Claude", 0.5)] }), 1],
    ["cursor lane", stale(45, { labels: ["needs-owner", "lane:cursor"], commits: [c("brycejmurrin", 1)] }), 0]]) {
    assert.equal(planDispatch(state({ prs: [p] }), cfg(), NOW).launches.length, n, name);
  }
  assert.deepEqual(skips(planDispatch(state({ prs: [stale(40, { labels: ["needs-owner"], commits: [c("Cursor Agent", 1)] })] }), cfg(), NOW)), ["PR #40: stale 3h but foreign activity (a commit by Cursor Agent 1h ago): no takeover"]);
});

test("apply: labels, digests, nudges and the Board go through the client; without --fire every launch prints LAUNCH <address> and `= fire skipped: --fire not given`", async () => {
  const calls = [], out = [];
  const api = (p, o = {}) => {
    calls.push(`${o.method || "GET"} ${p}`);
    if (p === "issues/1/comments?per_page=100&page=1") return { json: [{ id: 8, user: { login: "someone" }, body: `${BOARD_MARKER}\nforged` }, { id: 9, user: { login: "github-actions[bot]" }, body: `${BOARD_MARKER}\nold` }] };
    return { json: {} };
  };
  const asked = { author: "brycejmurrin", body: "which?", created_at: ago(1), performed_via_github_app: APP };
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [pr(20, { updated_at: ago(3) }), pr(21, { updated_at: ago(1) }),
    pr(22, { labels: ["needs-decision"], events: [ev("needs-decision", 1, { app: APP })], comments: [asked] })] }), cfg(), NOW);
  const r = await applyPlan(p, { api, config: cfg(), log: (s) => out.push(s), now: NOW });
  assert.deepEqual(calls, ["POST issues/20/labels", "POST issues/22/comments", "POST issues/21/comments", "GET issues/1/comments?per_page=100&page=1", "PATCH issues/comments/9",
    "GET pulls/20", "GET pulls/20/commits?per_page=30", "GET issues/10"], "the re-check reads the PR, its commits and the issue right before each LAUNCH line");
  assert.deepEqual(r, { writes: 4, fired: 0 });
  assert.deepEqual(out, ["LAUNCH CONTINUE PR 20  ([Worker] CONTINUE PR #20 PR 20)", "= fire skipped: --fire not given", "LAUNCH ISSUE 10  ([Worker] #10 Task 10)", "= fire skipped: --fire not given"]);
});

test("fire: the POST carries the bearer token, anthropic-version and {text: address}; a 200 posts the claim naming the session (and adopts a CONTINUE); non-200 posts nothing; unset env is skipped", async () => {
  const env = { WORKER_FIRE_URL: "https://api.anthropic.com/v1/claude_code/routines/trig_abc/fire", WORKER_FIRE_TOKEN: "sk-ant-oat01-test" };
  const requests = [];
  const respond = (status, body, headers = {}) => async (url, init) => { requests.push({ url, init }); return { status, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] || null } }; };
  const ok = respond(200, { type: "routine_fire", claude_code_session_id: SID, claude_code_session_url: `https://claude.ai/code/${SID}` });
  assert.deepEqual(await fireWorker("ISSUE 10", { env, fetchImpl: ok }), { status: 200, session: SID, url: `https://claude.ai/code/${SID}` });
  assert.equal(requests[0].url, env.WORKER_FIRE_URL);
  assert.deepEqual(requests[0].init, { method: "POST", headers: { Authorization: "Bearer sk-ant-oat01-test", "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" }, body: '{"text":"ISSUE 10"}' });
  assert.deepEqual(await fireWorker("ISSUE 10", { env: {}, fetchImpl: ok }), { skipped: "WORKER_FIRE_URL unset" });
  assert.deepEqual(await fireWorker("ISSUE 10", { env: { WORKER_FIRE_URL: env.WORKER_FIRE_URL }, fetchImpl: ok }), { skipped: "WORKER_FIRE_TOKEN unset" });
  assert.deepEqual(await fireWorker("ISSUE 10", { env, fetchImpl: respond(429, { type: "error", error: { type: "rate_limit_error", message: "hourly fire limit" } }, { "retry-after": "120" }) }),
    { status: 429, error: "hourly fire limit", retryAfter: "120" });
  assert.deepEqual(await fireWorker("ISSUE 10", { env, fetchImpl: respond(200, { type: "routine_fire" }) }), { status: 200, error: "200 without a claude_code_session_id" });
  assert.deepEqual(await fireWorker("ISSUE 10", { env, fetchImpl: async () => { throw new Error("ECONNRESET"); } }), { status: 0, error: "ECONNRESET" });
  // applyPlan: the claim comment only after a 200; a CONTINUE also drops needs-owner and posts the adoption.
  const writes = [], out = [];
  const api = (p, o) => { if (o?.method) writes.push(`${o.method} ${p}${o.body?.body ? " " + o.body.body : ""}`); return { json: {} }; };
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [pr(20, { labels: ["needs-owner"], updated_at: ago(0.1) })] }), cfg(), NOW);
  let n = 0;
  const flaky = async (url, init) => (n++ === 0 ? ok(url, init) : respond(503, { type: "error", error: { type: "overloaded_error", message: "overloaded" } })(url, init));
  const r = await applyPlan(p, { api, config: cfg(), log: (s) => out.push(s), now: NOW, fire: true, env, fetchImpl: flaky });
  assert.deepEqual(r, { writes: 3, fired: 1 }, "the Board, the claim and the adoption");
  assert.deepEqual(writes.filter((w) => !w.startsWith("PATCH") && !w.includes("issues/1/comments")),
    [`POST issues/20/comments dispatch: launched claude:[Worker] CONTINUE PR #20 PR 20 for #20 at ${ISO} as ${SID}`, "DELETE issues/20/labels/needs-owner",
      `POST issues/20/comments adopts PR #20 — claude:${SID} (posted by the dispatcher when it launched the takeover)`], "no claim for the refused ISSUE 10 fire");
  assert.deepEqual(out.filter((l) => l.startsWith("=") && !l.startsWith("= board")),
    [`= launched CONTINUE PR 20 as ${SID} https://claude.ai/code/${SID}`, "= needs-owner removed from #20", "= fire failed 503 overloaded"]);
  const skipped = [];
  await applyPlan(p, { api: () => ({ json: {} }), config: cfg(), log: (s) => skipped.push(s), now: NOW, fire: true, env: {}, fetchImpl: ok });
  assert.deepEqual(skipped.filter((l) => l.startsWith("= fire")), ["= fire skipped: WORKER_FIRE_URL unset", "= fire skipped: WORKER_FIRE_URL unset"]);
});

test("finding 7: a merged or closed PR, a closed issue, or a non-Claude push inside 60 min is refused right before the fire, and applyPlan says why", async () => {
  const recheckApi = (pull, commits = [], issueState = "open") => (p) => p.startsWith("pulls/20/commits") ? { json: commits } : p.startsWith("pulls/") ? { json: pull } : { json: { state: issueState } };
  const cont = { kind: "continue", number: 20 }, iss = { kind: "issue", number: 10 };
  const commitBy = (author, h) => ({ author: { login: author }, commit: { committer: { date: ago(h) } } });
  assert.equal(launchRecheck(cont, { api: recheckApi({ state: "closed", merged_at: ISO }), now: NOW }), "PR #20 is merged");
  assert.equal(launchRecheck(cont, { api: recheckApi({ state: "closed" }), now: NOW }), "PR #20 is closed");
  assert.equal(launchRecheck(iss, { api: recheckApi({}, [], "closed"), now: NOW }), "#10 is closed");
  assert.equal(launchRecheck({ kind: "deploy-red", number: 0 }, { api: () => assert.fail("no read"), now: NOW }), "");
  assert.equal(launchRecheck(cont, { api: () => ({ error: "boom" }), now: NOW }), "", "an unreadable PR never blocks a launch");
  const open = { state: "open", user: { login: "brycejmurrin" } };
  assert.equal(launchRecheck(cont, { api: recheckApi(open, [commitBy("cursoragent", 0.5)]), now: NOW }), "cursoragent pushed PR #20 30 min ago (a non-Claude author, last 60 min)");
  for (const [who, h] of [["cursoragent", 2], ["claude", 0.1], ["brycejmurrin", 0.1], ["dependabot[bot]", 0.1]]) assert.equal(launchRecheck(cont, { api: recheckApi(open, [commitBy(who, h)]), now: NOW }), "", who);
  const p = planDispatch(state({ prs: [pr(20, { updated_at: ago(3) })] }), cfg(), NOW);
  const out = [];
  await applyPlan(p, { api: (path, o) => (o ? { json: {} } : path.startsWith("pulls/20") ? { json: { state: "closed", merged_at: ISO } } : { json: [] }), config: cfg(), log: (x) => out.push(x), now: NOW, fire: true, env: { WORKER_FIRE_URL: "x", WORKER_FIRE_TOKEN: "y" }, fetchImpl: () => assert.fail("no fire") });
  assert.deepEqual(out.filter((x) => !x.startsWith("= board")), ["= launch skipped for continue #20: PR #20 is merged"]);
});

test("readState paginates issues, PRs and comments; fetches label events only for provenance labels; reads the newest COMPLETED train and its run id", () => {
  const calls = [];
  const iss = (n, title = `Issue ${n}`, labels = []) => ({ number: n, title, labels: labels.map((name) => ({ name })), body: "", updated_at: ago(1), user: { login: "brycejmurrin" } });
  const page1 = Array.from({ length: 100 }, (_, i) => iss(500 - i));
  const page2 = [iss(5, "Board"), iss(6, "Dispatch", ["dispatch:pause"]), iss(7, "Old ready", ["ready", "priority"])];
  const comments = Array.from({ length: 100 }, (_, i) => ({ id: i, body: `c${i}`, created_at: ago(5), user: { login: "u" } }));
  const api = (p) => {
    calls.push(p);
    if (p === "issues?state=open&per_page=100&page=1") return { json: page1 };
    if (p === "issues?state=open&per_page=100&page=2") return { json: page2 };
    if (p.startsWith("pulls?state=open")) return { json: p.endsWith("page=1") ? [{ number: 9, title: "p", head: { sha: "b".repeat(40), ref: "bot/changelog-fold", repo: { full_name: "brycejmurrin/f1-game" } }, user: { login: "github-actions[bot]" }, labels: [{ name: "land" }], updated_at: ago(9) }] : [] };
    if (p === "issues/9/comments?per_page=100&page=1") return { json: comments };
    if (p === "issues/9/comments?per_page=100&page=2") return { json: [{ id: 100, body: "newest", created_at: ago(0.2), user: { login: "u" } }] };
    if (p === "issues/6/events?per_page=100&page=1") return { json: [{ event: "labeled", label: { name: "dispatch:pause" }, actor: { login: "brycejmurrin" }, created_at: ago(2), performed_via_github_app: null }, { event: "closed", actor: { login: "x" } }] };
    if (p === "issues/7/events?per_page=100&page=1") return { json: [{ event: "labeled", label: { name: "priority" }, actor: { login: "brycejmurrin" }, created_at: ago(2), performed_via_github_app: { slug: "claude" } }] };
    if (p.includes("/comments")) return { json: [] };
    if (p === "pulls/9") return { json: { mergeable_state: "clean" } };
    if (p.startsWith("commits/")) return { json: p.includes("check-runs") ? { check_runs: [] } : { statuses: [{ context: "gate", state: "failure", created_at: ago(4), updated_at: ago(4), description: "x" }] } };
    if (p.startsWith("actions/workflows/pages.yml/runs")) return { json: { workflow_runs: [{ id: 40987, conclusion: "failure" }] } };
    return { json: {} };
  };
  const conf = { ...DEFAULT_CONFIG, boardIssue: 5, dispatchIssue: 6 };
  const s = readState({ api, config: conf, now: NOW });
  assert.deepEqual(s.issues.slice(-3).map((i) => i.title), ["Board", "Dispatch", "Old ready"]);
  assert.deepEqual(s.issues.at(-2).events, [{ event: "labeled", label: { name: "dispatch:pause" }, actor: { login: "brycejmurrin" }, created_at: ago(2), performed_via_github_app: null }], "only label events, trimmed");
  assert.equal(s.issues[0].events, null, "no provenance label: no events read");
  assert.equal(calls.filter((c) => c.includes("/events")).length, 2);
  assert.deepEqual(PROVENANCE_LABELS, ["ready", "priority", "needs-decision", "dispatch:pause", "dispatch:merge-pause"]);
  assert.equal(s.prs[0].comments.length, 101, "the newest comment sits on page 2");
  assert.equal(s.prs[0].last_comment_at, ago(0.2));
  assert.deepEqual(s.prs[0].statuses, [{ context: "gate", state: "failure", description: "x", created_at: ago(4), updated_at: ago(4) }]);
  assert.deepEqual([s.deployRed, s.deployRunId], [true, 40987]);
  assert.equal(calls.find((c) => c.startsWith("actions/runs")), `actions/runs?head_sha=${"b".repeat(40)}&per_page=100`, "the head's push time is its first workflow run");
  assert.equal(calls.find((c) => c.startsWith("actions/workflows")), `actions/workflows/pages.yml/runs?branch=${encodeURIComponent(DEFAULT_CONFIG.deployBranch)}&status=completed&per_page=1`);
  const p = planDispatch(s, conf, NOW);
  assert.deepEqual([p.boardIssue, p.dispatchIssue, p.flags.pause, p.ignored], [5, 6, true, ["priority on #7 (brycejmurrin via app claude)"]]);
  assert.equal(skips(p).includes("issue [Worker] #7 Old ready: paused (dispatch:pause)"), true, "a ready issue on page 2 is planned");
  assert.deepEqual(getAll(() => ({ json: { check_runs: [{ id: 1 }] } }), "commits/x/check-runs", { pick: (j) => j.check_runs }), [{ id: 1 }]);
});

test("main: --plan prints the plan lines, the Board and a summary; --apply --fire reads WORKER_FIRE_* from env; usage errors exit 1; an API error exits 3", async () => {
  const api = (p, o) => {
    if (o?.method) return { json: { id: 1 } };
    if (p.startsWith("issues?state=open")) return { json: p.endsWith("page=1") ? [{ number: 1780, title: "Board", labels: [], body: "" }, { number: 10, title: "T", labels: [{ name: "ready" }], body: "x", updated_at: ago(1), user: { login: "brycejmurrin" } }] : [] };
    if (p.startsWith("actions/")) return { json: { workflow_runs: [] } };
    return { json: [] };
  };
  const log = [];
  assert.equal(await main(["--plan"], { api, log: (x) => log.push(x), read: () => "{}", now: () => NOW }), 0);
  assert.equal(log[0], "LAUNCH ISSUE 10  [Worker] #10 T  (claim on #10)");
  assert.equal(log.at(-1), "= dispatch plan: 1 launches, 0 label edits, 0 digests, 0 nudges, 0 skips");
  const json = [];
  await main(["--plan", "--json"], { api, log: (x) => json.push(x), read: () => "{}", now: () => NOW });
  assert.equal(JSON.parse(json[0]).launches[0].address, "ISSUE 10");
  const fired = [];
  const fetchImpl = async () => ({ status: 200, json: async () => ({ claude_code_session_id: SID }), headers: { get: () => null } });
  assert.equal(await main(["--apply", "--fire"], { api, log: (x) => fired.push(x), read: () => "{}", now: () => NOW, env: { WORKER_FIRE_URL: "u", WORKER_FIRE_TOKEN: "t" }, fetchImpl }), 0);
  assert.equal(fired.at(-1), "= dispatch applied: 1 launches planned, 1 fired, 0 digests, 0 nudges, 2 GitHub writes");
  assert.equal(await main(["--plan", "--apply"], { api, log: () => {}, read: () => "{}" }), 1);
  assert.equal(await main(["--plan", "--now", "yesterday"], { api, log: () => {}, read: () => "{}" }), 1);
  assert.equal(await main(["--plan"], { api: () => ({ error: "HTTP 500" }), log: () => {}, read: () => "{}" }), 3);
});

test("config: loadConfig merges the file over the defaults; dispatch.json carries the Action-era keys and none of the retired ones", () => {
  const c = loadConfig("x.json", () => JSON.stringify({ maxLaunchesPerRun: 1, staleHours: { codex: 9 } }));
  assert.deepEqual([c.maxLaunchesPerRun, c.staleHours, c.owner, c.maxLaunchesPerDay], [1, { default: 2, codex: 9 }, "brycejmurrin", 24]);
  assert.equal(loadConfig("missing.json", () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); }).maxLaunchesPerRun, 4);
  const file = JSON.parse(fs.readFileSync(new URL("../../tools/ci/dispatch.json", import.meta.url), "utf8"));
  assert.deepEqual([file.owner, file.maxLaunchesPerDay, file.maxLiveWorkers], ["brycejmurrin", 24, 8]);
  for (const gone of ["lockHours", "archiveAfterMinutes", "hosts", "recentClosedHours", "nudgeIdleMinutes", "model", "mergePause", "baseBehindMax", "triggerId"]) {
    assert.equal(gone in file, false, gone);
    assert.equal(gone in DEFAULT_CONFIG, false, gone);
  }
});

test("trust: `ready` launches only when the owner's account authored the issue or added the label", () => {
  const stranger = (n, on = {}) => issue(n, ["ready"], { author: "stranger", events: [ev("ready", 1, { actor: "stranger" })], ...on });
  const p = planDispatch(state({ issues: [board(), stranger(10), stranger(11, { events: [ev("ready", 3, { actor: "stranger" }), ev("ready", 1, { app: APP })] }), stranger(12, { events: null })] }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => l.number), [11], "#11's ready was added by the owner's account (through an agent)");
  assert.deepEqual(p.ignored, ["ready on #10 (neither authored nor labelled by brycejmurrin)", "ready on #12 (neither authored nor labelled by brycejmurrin)"]);
  const yaml = (f) => fs.readFileSync(new URL(`../../.github/ISSUE_TEMPLATE/${f}`, import.meta.url), "utf8");
  for (const f of ["task.yml", "bug.yml"]) assert.equal(/^labels:.*\bready\b/m.test(yaml(f)), false, `${f} must not apply ready itself`);
});

test("trust: a fork PR or a PR by another author is never re-owned or nudged; its body links no issue", () => {
  const fork = pr(20, { updated_at: ago(9), head_repo: "stranger/f1-game", body: "Closes #10" });
  const other = pr(21, { updated_at: ago(9), author: "stranger" });
  const p = planDispatch(state({ issues: [board(), issue(10, ["ready"])], prs: [fork, other, pr(22, { updated_at: ago(1) })] }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => l.address), ["ISSUE 10"]);
  assert.deepEqual([p.labels, p.nudges.map((n) => n.on)], [[], [22]]);
  assert.deepEqual(skips(p).slice(0, 2), ["PR #20: not acted on: head in stranger/f1-game, not brycejmurrin/f1-game", "PR #21: not acted on: author stranger is not brycejmurrin"]);
});

test("trust: launch claims and nudges count only from github-actions[bot] and never with a future stamp", () => {
  const forged = (n, h, author) => ({ ...launched(n, h), author });
  const issues = [board(), issue(10, ["ready"]), ...Array.from({ length: 8 }, (_, i) => issue(30 + i, ["claimed"], { comments: [forged(30 + i, -24 * 365 * 70, "github-actions[bot]")] })),
    issue(40, ["claimed"], { comments: [forged(40, 0.5, "stranger")] })];
  const p = planDispatch(state({ issues }), cfg(), NOW);
  assert.deepEqual([p.live, p.launchedToday, p.launches.map((l) => l.number)], [1, 0, [10]], "eight claims dated 2096 and a stranger's claim are not live");
  assert.equal(liveLaunch([forged(10, 0.5, "stranger")], NOW, 2), null);
  const fakeNudge = { author: "stranger", body: `dispatch: nudge at ${ago(0.1)} — x`, created_at: ago(0.1) };
  const n = planDispatch(state({ prs: [pr(50, { updated_at: ago(1), comments: [] })] }), cfg(), NOW);
  assert.equal(n.nudges.length, 1);
  const m = planDispatch(state({ prs: [pr(50, { updated_at: ago(1), comments: [fakeNudge] })] }), cfg(), NOW);
  assert.deepEqual(m.nudges.map((x) => x.on), [], "a stranger's comment is activity, not a nudge: the PR is not idle");
  assert.equal(activityAt(pr(51, { pushed_at: ago(9), comments: [{ ...fakeNudge, created_at: ago(2) }] })), NOW - 2 * 3.6e6);
});

test("trust: the Board and Dispatch issues are the pinned numbers; a look-alike title does not shadow them", () => {
  const fake = issue(3, ["dispatch:pause"], { title: "Dispatch", author: "stranger", events: [ev("dispatch:pause", 1)] });
  const p = planDispatch(state({ issues: [issue(4, [], { title: "Board", author: "stranger" }), board(), fake, dispatchIssue(), issue(10, ["ready"])] }), cfg(), NOW);
  assert.deepEqual([p.boardIssue, p.dispatchIssue, p.flags.pause, p.launches.length], [1, 2, false, 1]);
  const unpinned = planDispatch(state({ issues: [issue(4, [], { title: "Board", author: "stranger" }), board({ number: 9, author: "github-actions[bot]" })] }), cfg({ boardIssue: 0, dispatchIssue: 0 }), NOW);
  assert.equal(unpinned.boardIssue, 9, "unpinned: the title must be the owner's or the bot's");
  const file = JSON.parse(fs.readFileSync(new URL("../../tools/ci/dispatch.json", import.meta.url), "utf8"));
  assert.deepEqual([file.boardIssue, file.dispatchIssue], [1780, 3899]);
});

test("rule 2: the dispatcher's own nudges move updated_at but not idleness: a PR nudged hourly is still taken over", () => {
  const nudges = [3, 2, 1].map((h) => ({ author: "github-actions[bot]", body: `dispatch: nudge at ${ago(h)} — PR #70 idle`, created_at: ago(h) }));
  const p = planDispatch(state({ prs: [pr(70, { pushed_at: ago(4), updated_at: ago(1), comments: nudges })] }), cfg(), NOW);
  assert.deepEqual(p.launches.map((l) => l.address), ["CONTINUE PR 70"]);
  assert.equal(activityAt(pr(70, { pushed_at: ago(4), updated_at: ago(1), comments: nudges })), NOW - 4 * 3.6e6);
});

test("rule 3: a Pages-side publish failure (pages.yml's marker step failed) launches no fixer and says why on the Board", () => {
  const p = planDispatch(state({ deployRed: true, deployRunId: 777, deployPlatform: true }), cfg(), NOW);
  assert.deepEqual([p.launches.length, p.labels], [0, [{ number: 1, add: ["deploy:red"], remove: [] }]]);
  assert.deepEqual(skips(p), [`deploy:red fixer: pages.yml run 777 failed on the Pages side (step "${PLATFORM_STEP}" failed: both publish attempts): no fixer, re-run the train`]);
  assert.equal(p.board.includes("failed on the Pages side"), true);
  const jobs = (steps, name = "deploy") => () => ({ json: { jobs: [{ name: "gate", steps: [] }, { name, steps }] } });
  assert.equal(platformFailure(jobs([{ name: "Publish to Pages", conclusion: "success" }, { name: PLATFORM_STEP, conclusion: "failure" }]), 777), true);
  assert.equal(platformFailure(jobs([{ name: PLATFORM_STEP, conclusion: "skipped" }, { name: "Confirm this commit may still be published (under the Pages lock)", conclusion: "failure" }]), 777), false, "a refusal is a fixer's job");
  assert.equal(platformFailure(jobs([{ name: PLATFORM_STEP, conclusion: "failure" }], "stage"), 777), false, "only the deploy job's marker");
  assert.equal(platformFailure(() => ({ error: "HTTP 502" }), 777), false, "unreadable: launch as before");
  assert.equal(planDispatch(state({ deployRed: true, deployRunId: 777, deployPlatform: false }), cfg(), NOW).launches[0].address, "DEPLOY-RED 777");
  const pages = fs.readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.equal(pages.includes(`- name: ${PLATFORM_STEP}\n`), true, "the marker step pages.yml writes");
});
