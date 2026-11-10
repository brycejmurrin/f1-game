# Orchestration review — 2026-11-09

Kind: design · Re-measure-by: 2026-12-15

A PROPOSAL. Nothing here is a rule; no skill, hook, workflow or setting changes in this PR. Bryce, relayed by the
orchestrator session: "deeply read our skills, mcps, tools, agents Md, and really consider how we should re design
our orchestration system or improve". Deploy tip read: `e808230`. Method: the lead read AGENTS.md, the steward /
dispatcher / handoff skills and references, settings, `context-cap.py`, `dispatch.yml`, `dispatch.mjs`, `land.yml`,
`pages.yml`, `merge-gate.mjs`, `path-overlap.mjs`, the decisions ledger and the earlier redesign plans, and ran
`dispatch.mjs --plan` live. Three read-only subagents did breadth: one probed every "hook X refuses Y" claim by piping
payloads into the hooks, one read GitHub (PRs #5152–#5204, issues, Actions runs), one read the current platform docs.
Every number below says where it came from. Section E lists what was not verified.

## A. The system as it behaves

| question | documented | observed |
|---|---|---|
| Who launches a worker? | `dispatch.yml`, hourly and on label events, fires the "Apex worker" scheduled task | `dispatch.yml` is `disabled_manually` since 2026-11-05 03:11Z (last run 41959900415, cancelled). An orchestrator session launches and relaunches by hand and polls. Every other workflow is active. |
| Would the dispatcher work if enabled? | yes | `node tools/ci/dispatch.mjs --plan` runs clean (exit 0) and would launch 4 workers now. But it does not know the `batched` label: it lists a batch issue and that batch's member issues as separate launches, so enabling it today double-assigns work. `batched` and `needs-device` exist on GitHub and are absent from `.github/labels.json`. |
| Who owns a PR? | one session from launch to `land`; a successor adopts at the 300k cap | Small PRs: one session, median 116 min open to merge, 2 commits (35 merged PRs). Large PRs: #5158 had 6 adopters in 5 h 33 min, #5155 had 5, #5152 and #5156 had 4. |
| What stops a session at its cap? | `context-cap.py` | It refuses only new subagent spawns past soft + 50k. A main session is never stopped; the soft cap is one advisory line. The $10 cost cap has no code at all. |
| Who lands? | `land.yml` posts `gate`, arms auto-merge | Works. 112 PR merges in the week. The exception is a PR that fixes the gate itself: #5159 could not pass the gate it repaired and Bryce merged it by hand (D-029 repeated). |
| Who deploys? | `pages.yml`, one train running and one pending | Works as designed. 41 runs since Nov 7: 29 success, 9 cancelled, 3 failure. The cancelled ones are pending trains replaced by a newer push, not lost deploys. |
| Where does state live? | labels, comments, the PR body | Also in the orchestrator's chat (land order, who is relaunched) and in its timed check-ins. The Board issue #1780 is documented as one bot-edited comment; it holds 170 comments, all written by sessions, none since Nov 7. |
| Where is Bryce required? | `hold`, `config-ok`, `decision:` | Also: enabling a workflow, the gate bootstrap, every device check, every rollback, and `priority` (see below). |

Documented mechanisms that do not exist or are not enforced (each was probed, not read):

1. **The ready-flip receipt hook.** Steward §Land 3 and `references/land.md` say `github-mcp-guard.sh` allows the
   draft→ready flip only within 10 minutes of a ready-gate receipt. A `draft:false` payload piped into the guard
   returns 0 with no output. There is no receipt check; `merge_policy.py`, which `ready-gate.mjs` names, is gone.
2. **`claimed` never expires.** No code removes the label. `dispatch.mjs` excludes a `claimed` issue for ever; only
   its own launch comment ages out (2 h). 19 open issues carry it; 9 date from Nov 4 and 3 of those have no open PR
   (#4448, #4529, #4745).
3. **"An older claim comment wins."** No code reads `claims #n` comments.
4. **Path ownership.** "A path in an open PR's diff belongs to that PR" is prose. `path-overlap.mjs` is advisory,
   file-level, and called by no workflow or gate.
5. **The Hand-off block.** No gate checks `head:`, `owner:` or `next:`. Only the dispatcher's nudge reads `next:`,
   and the dispatcher is off.
6. **Rules 2, 3, 4, 7, 8, 9, 13 and "a denial is final".** Prose only. Nothing checks that the local floor ran.
7. **`dispatch --apply` is "never a session's".** No hook or deny entry; the command passes `bash-guard.sh`.
8. **Bryce's `priority` label.** The dispatcher honours it only when applied outside any app. `--plan` prints
   `IGNORED priority on #5058 (brycejmurrin via app claude)`. A label Bryce sets by asking a session is discarded.
9. **Device sign-off.** No label in `labels.json`, no template section, no gate row.
10. **Three doc contradictions:** a manual `ci.yml` dispatch is "ask" in `ci-tools.md` and denied by the hook;
    `config-ok` covers hooks and settings in two files and also workflows and `.githooks` in two others;
    `lane:cursor` says "the dispatcher sets `land`", which `dispatch.mjs` never does.

What holds: the merge, arm, cancel, force-push and deploy-branch bans (settings deny list plus two hooks); the
subagent browser ban; generated-file protection; the pre-commit guards; `merge-gate`'s seven rows; the skills mirror.

## B. Bottlenecks, ranked

**1. Acceptance happens after landing.** On Nov 6 the whole tree was rolled back three times (#5147, #5149, #5151)
after reverts #5142–#5144; #5155 landed green through every gate and was reverted by #5169 two days later. At least
five later commits are titled "re-land … the Nov 6 rollback removed". Every one of those PRs passed CI, the gate and
the deploy gate. The pipeline's throughput (112 merges in a week) is not the constraint; Bryce's phone is the only
test that decides, and it runs last. Orchestrator item 9: held, and it is the largest cost in the week.

**2. Nothing launches workers.** Item 1: held. I could not find why the workflow was disabled (its last run was
cancelled seconds earlier). The stand-in is a session whose context the orchestrator reports at ~800k (item 3, not
verifiable from here).

**3. A third of the context cap is spent before the first tool call.** This session's first turn measured 102.1k
tokens (`session-transcript.mjs --ctx` on its own transcript); the 2026-10-27 baseline note measured about 75k. The
300k cap therefore leaves about 200k of work. The project's own always-loaded text is small: AGENTS.md, CLAUDE.md,
the memory index and the 39 skill and 11 agent descriptions total 26.5k characters, roughly 6.6k tokens. The rest is
harness, connectors and tool lists. Item 2: held and understated (#5158 had six adopters, not five), but confined to
3 of 35 merged PRs, all large, all Nov 6–7. The Nov 9 wave had no cap hand-offs. The cause is task size, not the
hand-off text.

**4. One committed digest makes unrelated PRs conflict.** `tools/shot/scenery-locations.json` is committed and
carries a `sourceDigest` over the scenery sources, so any two PRs touching scenery code conflict in it whichever
lands second. Five PRs (#5178, #5182, #5190, #5192, #5197) needed 8 sync merges between Nov 9 22:17Z and Nov 10
00:26Z, and all 8 conflicted in that file. Item 4: held; the count is five PRs, not three. Across the week the deploy
branch shows 51 `sync-pr` merge commits against 112 PR merges.

**5. Sessions cannot reliably write coordination state.** "classifier" appears in 23 PRs and 4 issues since Oct 31:
`needs-owner` removal denied (#5197, #5184), claim comments on 7 issues refused (#5183), `land` denied (#5130),
coordination comments refused (#5173, #5160, #5033). Item 7: held for comments and labels. A `ship-pr` refusal and
"a steward reported red as green" were not found. The protocol asks every worker for 4–6 such writes per PR.

**6. Backlog state is wrong at the source.** 150 open issues, 115 `ready`, 24 of them real unclaimed work once
`batched`, `blocked` and `epic` are removed. Item 10: held. Median `ready` age is 5.1 days. Item 8: partly held (19
`claimed` now, one "weekly limit" comment found, the wave of 30 could not be reconstructed).

**7. Deploy lag is mostly one flaky step.** Longest push-to-live gap in the last three days: 74 min. The multi-hour
case was Nov 5 (05:34Z to 16:53Z). Two of three failed trains were real test reds. `actions/deploy-pages` failed
with CI green on run 42702638229 and on attempts 1 and 2 of run 42732961304; attempt 3 passed. Item 6: partly held.
"Each merge cancels the previous deploy" is not what happens: a running train always finishes.

**8. The land pipeline cannot land its own fix.** Item 5: partly held. The outage was 3 h 38 min (Nov 6 19:40Z to
23:18Z), not a day. The bootstrap problem is real and has now happened twice (D-029, #5159).

**9. Path ownership.** Item 11: partly held. #5160 deferred work for 3 h 46 min behind #5155; #5075 waited about an
hour on #4973. No hours-long hold on `js/game.js` or `css/carsetup.css` was found in comments.

**10. Status reaches the orchestrator by polling** (item 12, reported by the orchestrator, not verified). Worker
prompts asked for a message only at `land` or when blocked.

**11. Redesign churn.** This is the sixth orchestration document in three weeks (10-19, 10-27, 10-29, 10-30, 11-03,
now this). The 11-03 plan recorded that the 10-27 principles had already regressed. Several broken claims in section
A are leftovers of a mechanism one redesign removed and the next still cites.

## C. Options

**Option 1 — keep and repair.** Re-enable `dispatch.yml`; teach it `batched`; add a sweep that removes stale
`claimed`; fix the ten items in section A in place. Deletes nothing. Adds a sweeper and a real receipt hook. Risk:
the session-side protocol (claim, adopt, labels, hand-off) stays, and with it every classifier refusal and the
hand-off cost. Lowest effort, leaves bottlenecks 1, 3 and 5 alone.

**Option 2 — platform-native.** GitHub merge queue replaces `land.yml`'s arm, retry and sweep jobs; native
scheduled-task GitHub triggers (`issue labeled ready`, `pull_request labeled needs-owner`) replace `dispatch.yml`'s
fire. Deletes most of `land.yml` (819 lines) and the fire half of `dispatch.mjs`. Risk: merge queue availability on
a personal-account repository could not be confirmed and is probably organisation-only; a native trigger fires on
every matching label with no work-in-progress limit, and there are 115 `ready` issues. Not recommended unless the
repository moves to an organisation.

**Option 3 — Actions own all state; a session only pushes and edits its PR body.** Keep the two things that work
(`dispatch.mjs` as planner, `land.yml` as lander). Delete the session-side protocol:

- Deletes: the `claimed` label; claim and `adopts` comments; "older claim wins" and "newest adoption wins"; every
  `gh api …/labels` call a worker makes; the path-ownership rule; the unattended half of skill `handoff`; the
  receipt-hook sentences; the Board as a place sessions write.
- Adds: a `state:` line in the Hand-off fence (`working | land | needs-owner | needs-decision`) that one Action
  projects into labels with its own token (the Cursor lane already works this way); in-session compaction at the cap
  instead of a new session; a `device` gate row; a work-in-progress limit sized to what Bryce can check.
- Ownership becomes a derived fact: an issue is taken when an open PR says `Closes #n` or a launch comment is under
  2 h old. Nothing to expire.
- Risk: a compacted session can lose detail a fresh reader would have re-read; the projection Action is new code on
  the trusted side; the `device` row puts a click of Bryce's on every UI PR.

**Pick: Option 3**, landed as the small steps in section D, with no further redesign document until they are
measured. Reasons: it removes the writes the classifier refuses instead of asking for permission to make them; it
removes state that goes stale instead of adding a sweeper; and it is the only option that moves Bryce's phone check
ahead of the merge, which is where the week's largest loss was.

Instruction tokens, before and after. Always loaded today: about 6.6k tokens of project text inside a 102k baseline.
Option 3 removes about 150 words from AGENTS.md (§Coordination, the path sentence) and about 3k tokens from the
on-demand worker chain (steward §Lane 1 and 3, `labels.md` rows, handoff's unattended branch), which is 11.2k tokens
today. That saving is real but small. The lever that matters is the other 95k of baseline (D2).

## D. Changes, in order

Each is one PR. "Bryce" marks what only he can do.

| # | change | files | enforced by | Bryce |
|---|---|---|---|---|
| D1 | `sourceDigest` leaves the committed file: move `scenery-locations.json` to `BUILT_PATHS` (D-022 precedent), or keep the file and compute the digest in the test | `tools/lib/generated-paths.mjs`, `tools/shot/gen-scenery-locations.cjs`, `.gitignore` | `tests/unit/deploy-staging.test.mjs`, `track-shot-survey.test.mjs` | none |
| D2 | Measure the 102k baseline with `/context` in a worker; strip connectors the worker never uses from the "Apex worker" task (two TinyFish servers, Drive, Docs, three.js, BrowserStack) | none in repo | re-run `session-transcript.mjs --ctx`; target under 70k | edits the scheduled task's connectors |
| D3 | Compaction at the cap: set the auto-compact window to 300k for workers, keep `# Compact instructions`; the hand-off to a new session remains only for a dead session | `.claude/settings.json` `env`, skill `handoff` | a PreCompact hook that refuses to compact with unpushed commits | `config-ok` |
| D4 | Dispatcher knows `batched` and `needs-device`; add both to `labels.json` | `tools/ci/dispatch.mjs`, `.github/labels.json` | a `planDispatch` unit test: a batch and its members yield one launch | none |
| D5 | Delete `claimed`: `dispatch.mjs` treats an issue as taken when an open PR closes it or a launch comment is under `launchClaimHours` old | `dispatch.mjs`, steward §Lane, `labels.md` | `planDispatch` test with a stale claim | removes the label from 19 issues, or approves a one-off script |
| D6 | State projection: the Action reads `state:` from the Hand-off fence and sets `land`, `needs-owner`, `needs-decision`; workers stop calling the labels API | `dispatch.mjs` or a small new workflow, PR template, steward | `ready-gate` refuses a body with no `state:`; unit test on the parser | `config-ok`; decide whether body text may request `land` (the gate still judges) |
| D7 | Re-enable `dispatch.yml` with `maxLiveWorkers` 3 and plan-only for 24 h first (the 11-03 soak) | `tools/ci/dispatch.json` | the Board comment | clicks Enable workflow; confirms the two fire secrets |
| D8 | `device` gate row: a diff touching `css/**`, `index.html` or the HUD and menu modules needs `device-ok`, last added by Bryce in person, exactly like `config-ok` | `tools/ci/merge-gate.mjs`, `labels.json` | `tests/unit/merge-gate.test.mjs` | creates the label; clicks it per UI PR |
| D9 | Give that click something to look at: CI posts the 844×390 before and after captures on the PR, and a preview of the PR head Bryce can open on the phone | `capture-gallery.yml`, a preview workflow | the `device` row links the artefacts | chooses the preview host (a second Pages repository is the simplest) |
| D10 | Screenshot to worker: test once whether a session can fetch an issue's `user-attachments` image; if not, an Action copies issue images into the evidence archive and comments the path | `archive-evidence.yml` | the worker `Read`s the file | none, unless a token scope is needed |
| D11 | Retry `actions/deploy-pages` once in-job when the gate was green | `pages.yml` | the run summary names the retry | `config-ok` |
| D12 | Gate bootstrap: `land.yml` falls back to the previous deploy-branch copy of `merge-gate.mjs` when the current one errors on its own PR, or D-029 becomes a documented one-click path | `land.yml` | a unit test on the fallback | `config-ok`; the decision between the two |
| D13 | Delete the path-ownership sentence (AGENTS.md, steward §Red 3). Git reports real conflicts; D1 removes the false ones | AGENTS.md, steward | `rulebook-guards.test.mjs` one-home map | none |
| D14 | Delete or build the receipt hook; fix the three contradictions in section A item 10 | steward, `land.md`, `ci-tools.md`, `labels.json` | `surface-reviewer` retest of `scratch/surface-orch-review.md`'s rows | `config-ok` if built |
| D15 | Cost: `--max-turns` or a turn budget in the worker task; `maxLaunchesPerDay` tied to the weekly limit; drop the $10 cap sentence that nothing measures | `dispatch.json`, steward §Lane 5 | the dispatcher's daily count | sets the daily number |
| D16 | Backlog: a weekly dispatcher pass closes `ready` issues whose cited `file:line` no longer matches (agent `finding-verifier`), and caps `ready` at what a week can land | `dispatch.mjs`, skill `dispatcher` | Board row "ready over cap" | none |
| D17 | Reporting (item 12): the Board comment the Action already renders is the report; an orchestrator, if kept, subscribes to it instead of being messaged. Until D7, add one line to the launch template | `worker-prompt.md` | none needed after D7 | none |
| D18 | Honour `priority` set through a session: accept it when a `decision:` comment by Bryce names the issue, or drop the provenance test for `priority` only | `tools/ci/lib/provenance.mjs` | its unit test | the decision |

Order rationale: D1 and D4 are free and stop today's waste. D2 and D3 remove most cap hand-offs. D5 and D6 remove
the writes that get refused, and must land before D7 turns launching back on. D8 and D9 are the acceptance fix and
are the largest change in how Bryce works, so they come once the fleet is quiet.

## E. Not verified

- Why `dispatch.yml` was disabled, and by whom.
- The orchestrator's ~800k context and its refused spawns (item 3); item 12.
- That #5159 was merged by a ruleset bypass: inferred from a `gate` that never went green and an agent's 405; the
  rule-suites API returned 403.
- The `actions/deploy-pages` step logs for the three publish failures.
- Whether merge queue is available to a personal-account repository (official pages read did not say).
- Whether the auto-compact window setting takes effect in a cloud session, and what a compacted worker loses (D3
  needs a trial on one PR before it is adopted).
- Whether a cloud session can download a private repository's issue image attachments (D10's first step).
- Whether an allow entry per GitHub MCP tool would stop the classifier refusals; the platform docs do not say.
- "~30 min of local verify per re-sync", "a steward reported red as green", and the wave of 30 stale claims.
- The second-browser branch of `mcp-browser-guard.sh` and `land.yml`'s "at most 3 retries" were read, not run.
- Token figures are characters ÷ 4 except the two measured context readings (102.1k and the 10-27 table).
