# Orchestration review — 48 hours of transcripts, PRs and CI (2026-11-11)

Kind: measurement · Re-measure-by: 2026-12-11

A PROPOSAL plus measurements. Bryce, 2026-11-11 ~03:38Z (Nov 10, 7:38 PM PT): "Can we spawn a fable session to use
opus subagents to deeply review Claude session transcripts over the last 48 hours and git history to look for ways to
improve orchestration prompting tools timing etc". Window: 2026-11-09 03:40Z → 2026-11-11 04:00Z (Nov 8 7:40 PM →
Nov 10 8:00 PM PT). Deploy tip read: `d6986f11`. Nothing under a config path changes in this PR: every gate, hook,
workflow or AGENTS.md change is a patch proposed under §Proposed patches for Bryce to decide.

## One screen

- **You re-approved the same PRs over and over.** 78 `config-ok` clicks on 38 PRs; 40 were re-clicks, 24 of them
  voided by nothing but a sync with the deploy tip. One gate function causes it (rank 1). A click also does not
  re-run the gate, so approved green PRs sat for hours (rank 2).
- **Workers worked 3–14% of the time they were alive.** The rest was waiting, mostly for a CI runner: a browser
  check waits a median 37 minutes to start and runs for 4. The draft tier runs a median 13 browser legs, not the one
  it was designed for, and the ready flip runs most of them again (rank 3).
- **The deploy branch was red for about 15 of the 48 hours** and PRs kept merging (28 during the longest, 8.4 h,
  stretch, which was three different reds end to end). You reported most reds yourself. Nothing owns "the tip is red" while the Dispatch workflow is
  switched off (rank 4).
- **Syncing with the tip is the largest single CI cost**: 268 tip merges into 78 PR branches, 38% of PR CI runs and 49% of its runner time. About
  half conflicted, mostly in generated files that are still committed (rank 5).
- **Four in ten workers were replacements.** Briefs said "stop at 300k context" and a fresh worker starts at about
  102k, so first owners handed off after a median 42 minutes (rank 6).
- **The orchestrator's own spend was about $535**, more than a third of it ($195) on turns that took no outward
  action, mostly relays of a worker's status. A `/goal` you set overnight made it answer "nothing has changed" about 300 times (ranks 7, 8).
- **What worked:** one-tap question prompts with a recommended option (median answer 0.8 min, against 92 min for a
  `needs-decision` label); the first relaunch wave (10 workers, 18 PRs merged in 5 h 20 min); landing once green
  (median 8 min); workers refusing to weaken tests or act on relayed authority.
- **Seven decisions are yours**, each with a recommendation, in §Decisions for Bryce.

## Method and coverage

The lead (this session) built the inventory and the transcript archive, verified the top claims against code and
GitHub, and wrote this note. Sixteen Opus readers each read a slice and returned findings rows with evidence ids;
one further Opus reader was told only to refute the twelve largest numerical claims (§Refuter verdicts). Two small
helpers downloaded transcript pages. Twenty subagents were allowed; nineteen were used.

| source | read | by |
|---|---|---|
| Session transcripts | 114 of 115 sessions in the window (113 workers + orchestrator A; this review's own session excluded), every event, saved as readable markdown under `scratch/orch-review/transcripts/` (gitignored, not in this PR: they contain Bryce's messages) | lead (download and build); 9 readers on about 45 worker sessions in depth; 1 census reader over all 114 by script |
| Orchestrator A (`…JBDp6TYy`) | 2026-11-09 02:01Z → 2026-11-11 03:43Z, 8,669 events | 3 readers by time range + 1 reader on Bryce's side |
| GitHub | all 143 PRs touched in the window (107 merged): timelines, commits, comments, statuses | 1 reader + spot checks |
| Actions | 3,930 runs, jobs for 1,979 of them | 1 reader + spot checks |
| Repo | AGENTS.md, steward / dispatcher / handoff skills, `tools/ci/`, hooks, workflows | lead and readers |

Not seen, and not guessed at:

- Sessions on the other account (ids starting `session_017Y…`, the "audit wave" that opened the `claude/audit-*`
  PRs). They do not appear in any listing this session can make. Their PRs are visible; their transcripts are not.
- Who performed a GitHub write. Every agent write and every click of Bryce's records the same login; only
  `performed_via_github_app` (null for a human click or a token write) separates them, and tools that act with his
  token look like him. Click counts below are "by his account, no app".
- Who cancelled an Actions run or started a re-run (the API does not say).
- Why `subscribe_pr_activity` fails on the audit-wave PRs, and the classifier's reasons (it gives none).
- Three issue-groomer sessions that ran 03:44–04:18Z, after the inventory.

## Ranked findings

Ranked by cost, with Bryce's clicks and CI rounds weighted most. "Readers" is how many independent readers reported
it. "Verified": `code` = the lead re-read the cited code; `R` = survived the refuter (§Verification); `data` = the
lead re-derived the number from the reader's raw data or from GitHub.

| # | finding | cost (measured) | evidence | proposed change | readers | verified |
|---|---|---|---|---|---|---|
| 1 | **A sync with the deploy tip voids `config-ok`.** `configPushState` diffs head-at-label-time against the new head, so a tip merge that brings in other PRs' `tools/ci/**`, `.claude/**` or `package.json` reads as a config push by this PR. | 78 `config-ok` adds on 38 PRs; 40 re-clicks; 24 voided by a sync merge that left the PR's own config diff unchanged (4 more by a sync whose conflict resolution did change it, 3 by the PR's own config commit); #5278 ten clicks, #5304 six, #5276 and #5297 five each. 58 `config=FAIL` gate refusals, the commonest refusal row. PRs waited 769 min in total from the voiding push to the re-click. | `tools/ci/merge-gate.mjs:143-167`; issue events of #5278, #5304, #5276, #5297, #5260 | Patch P1: compare the PR's own config-path diff at label time with now; a tip merge alone keeps the label. | 9 | code, R (28 → 24) |
| 2 | **A `config-ok` click does not re-run the gate.** `land.yml` drops every label event except `land` / `hold`, so the stale `config=FAIL` stays until something else moves. On a phone, removing and re-adding the label in one visit to the menu does not register either. | #5282: 216 min before the next gate run, which then showed `gen` and `ratchets` failing: the stale `config=FAIL` had hidden the real blocker for 3.6 h. #5265: about 97 min with every row passable. 4 extra question rounds to Bryce ("GitHub shows no new click"). | `.github/workflows/land.yml` (NOISE section, `resolve` job `if:`); statuses on #5282 `73271e0`; orchestrator 20:33, 21:26, 22:48, 01:21Z | Patch P2: re-gate on `config-ok` labeled. Until then, the agent that pushed removes the stale label so Bryce taps once (skill text, this PR). | 4 | code, R (85 → 97 min; #5282 was not landable anyway) |
| 3 | **Runner queueing is the critical path, and the draft tier is not the one-shard tier it was designed as.** Selected-spec browser legs wait a median 36.7 min (p90 122) and run 4.4. Green draft runs carried a median 13 legs (p90 40). The ready flip then re-runs the same legs. The Linux pool plateaus at about 40 jobs. | Green draft wall time median 61.7 min (p90 179); full tier 49.4 (p90 172). 108 of 117 ready flips had a green draft on the same sha a median 12 min earlier; 684 of 1,000 legs repeated (10,275 runner-min). Long workers were active 3–14% of their wall clock. | `ci_runs.json` (616 ci.yml PR runs), `ready_flips.json`; runs 42817782356, 42795342824, 42558841102; `ci.yml` L2268-2278 | Decision D2 (three options). Patch P3: on `ready_for_review`, reuse the same-sha draft verdict and run only the full-only jobs. | 7 | data, R |
| 4 | **Nothing owns a red deploy tip, and the gate keeps merging into it.** About 900 min red in 6 periods; the longest ran 8.4 h with 17 failed trains and 28 merges, and was three reds end to end: #5346's select-screen images (merged 13:02Z, first seen on the 13:55Z train, fixed 15:57Z), further spec reds, a Pages publish failure with CI green (18:57Z), then #5229 (19:41Z). The train runs only change-selected specs, so the first train to fail is not the merge that broke it. Causes were of three kinds: a spec the PR's CI never selected (#5229 time-trial, #5298 feed mocks, #5346 select images), two green PRs crossing (#5300 × #5392, #5384 × #5282), and a shared budget (#5257). | 5 duplicate fix PRs closed unmerged (#5285, #5371, #5378, #5381, #5395). 41 of 67 failed PR runs arrived while the base was red. #5229 was reverted and re-landed: 7 h 53 min and 3 PRs. 15 of Bryce's 101 messages reported a red deploy. Site frozen about 9 h. | pages runs 42828961258 … 42914032648; #5382, #5384, #5396, #5409; issue #5407 | Patch P4: a `base` row that holds merges while the tip's newest completed Pages run failed on code (not on publish), and a train that runs the specs selected for every merge since the last green train. Decision D1 (who owns the red). Skill text on duplicate fixes (this PR). | 8 | R (17 trains; three phases; cause #5346) |
| 5 | **Sync churn from committed generated files.** 268 merges of the tip into 78 PR branches (185 of them headed a CI run); most PRs synced more than once. Conflicts were mostly in `package.json` (generated test lists), `docs/agent-output/catalog.json`, `docs/TESTING-COVERAGE.md`, `docs/NOTES-INDEX.md`, `tools/shot/scenery-locations.json`, `tests/data/impact-map.json`. Local sync verification took 27–71 min each time. | 38% of PR CI runs and 49% of PR CI runner-minutes went to sync-merge heads; about half the syncs conflicted. #5290: 784 min from `land` to merge, 11 pushes, 5 cancelled runs. Each sync of a config PR also cost a click (rank 1). | merge-commit `Conflicts:` blocks; #5349 and #5389 (the two files already cured: 18 PRs unblocked) | Decision D3: finish the cure for the remaining four files. Skill text: one shared cure, then one sync (this PR). | 8 | R (295 → 268; 30–47% → 38% / 49%) |
| 6 | **The 300k stop rule against a 102k start made hand-offs the norm.** Every brief carried "STOP AT 300k"; a fresh worker starts at about 102k (the repo's own instructions are about 9k of that; connectors are the rest). | 27 of 68 sessions created 11-09 19:44Z → 11-10 04:29Z were replacements; in the 01:12–01:42Z wave 15 of 24 workers stopped at the cap, a median 42 min after launch (9 finished or stopped for other reasons). #5229 had four owners in 100 minutes. Each replacement: a new container, a 3.3k-char brief, a first turn of $2–4 and about 15 min. | orchestrator results 01:35–04:29Z; `.claude/hooks/context-cap.py:79-90`; `sessions.json` titles | Decision D4: cap as a budget above the start, and a worker environment without unused connectors. | 5 | code, R (n and median corrected) |
| 7 | **The `/goal` loop.** A goal that can only be met by Bryce, CI and other sessions kept re-entering the orchestrator's turn. | 375 Stop-hook fires while the goal was set, 367 of them 12:00–15:28Z (4:00–7:28 AM PT), about 300 near-identical "nothing has changed" replies, about $42–67. The deploy went red inside the loop and Bryce found it. | orchestrator transcript, `Stop hook feedback` ×380; `/goal clear` 15:26Z | Skill text (this PR): a goal the session cannot finish alone is answered once with the blocker list. Memory-note proposal for Bryce: do not use `/goal` to drain a queue. | 4 | data, R |
| 8 | **Orchestrator turns that only relay.** After "ALWAYS message me at every state change" went to 16 sessions and 13 briefs (01:32Z), turns rose from 4–13 an hour to 62–77. | Of 802 orchestrator turns in the window, 452 took no outward action (no message, launch, GitHub write, question or push): $195 of $535. Bryce received 1,045 messages in 24 h (median 250 chars against his 23), 39% of them relays; he asked five times for one list of what needs him. | `turn end` lines; orchestrator 01:32Z; Bryce 05:42, 08:50, 09:45, 15:22, 15:23Z | Brief template (this PR): workers message only on blocked, refused, needs-Bryce, merged, hand-off. Orchestrator keeps one "Needs Bryce" list. | 4 | R (350 / $125 → 452 / $195) |
| 9 | **Sessions idle past the prompt cache, and do not end at `land`.** A wake after an hour of idle costs dollars; a wake inside the hour costs cents. Workers armed 320 `send_later` check-ins (many at 60 min) although AGENTS.md rule 13 says no standby wakes; 9 sessions refused to arm any, citing the same rule. | Wake after ≥ 60 min idle: median $2.64 (p90 $6.30). After < 55 min: median $0.36. The step is at 60 min ($0.42 at 55–60, $2.81 at 60–65) and is not explained by work done (1,644 turn pairs, 109 transcripts). 171 re-arm-only turns, about $116. `hdvLVN5C` spent $30 after its PR merged. Three phone-UI sessions: 11 cold wakes = $70 of $206. | `turn end` cost deltas in `oeeUrTyK`, `UhZd5BPN`, `fq4i7cuk`, `hdvLVN5C`, `NQZb7yaQ` | Decision D5 (one reading of rule 13). Skill text (this PR): check-in ≤ 50 min, only when subscription failed; end at `land`. | 6 | R ($3–10 → median $2.64) |
| 10 | **Authority that cannot be relayed costs Bryce extra rounds each time.** Workers correctly refuse a grant relayed by the orchestrator; the classifier refuses some GitHub writes whatever a GitHub comment says. | 23 classifier refusals in 17 sessions became at least 11 actions by Bryce. #5227: 104 min and 6 messages for one decision. An adopter waited 35 min for his "Yes". He tried six times to delegate ("You decide"). `needs-decision` median 92 min; a paste-ready `decision:` line 2 min. | `CrPLPssx` 10:26Z; `4LWtjoEA` 09:36–10:11Z; orchestrator 02:20–04:04Z; #1780 comments 10:08, 10:10Z | Decision D6 (standing class grants). Skill text (this PR): every ask carries the link and the exact `decision:` line. | 7 | data |
| 11 | **Adopting PRs whose owners were alive.** The orchestrator cannot see or message the other account's sessions and judged them dead by commit age. `subscribe_pr_activity` failed on every `claude/audit-*` PR (45 calls, 25 PRs) and on no other PR. | Two writers on #5303, #5263, #5348, #5300, #5254 (2 h 21 min with two live owners; 16.5 owner-hours on that one PR). An original owner was blocked about 4 h by its own pre-push hook after an adopter's merges. Adopters fell back to 55+ polling check-ins. | #5303 commit trailers; `XWksrCYn` 08:41Z; `JEqPEVZP`, `4LWtjoEA` | Skill text (this PR): the adoption test and stand-down rule; subscription failure on those PRs is not transient. | 7 | data |
| 12 | **Waves launched without a capacity check.** 25 sessions in 29 minutes, 40 in an hour, one PR each. | Open PRs 12 → 45 in 78 min; no game merge for 111 min; "52 Linux jobs in flight against a soft limit of 40, 33 more queued". The push hold that followed arrived after some of the pushes it was meant to stop (message lag p90 7.5 min, max 78). | orchestrator 01:12–03:21Z; `iLzSjmij` 03:28, 03:44Z | Brief template (this PR): wave size from the queue; a hold is sent with priority "now" and workers read notifications before a push. | 4 | data |
| 13 | **Combine waves helped only when small.** The one carrier that merged (#5370 + #5376) was two small PRs. The four large carriers were still open a day later. Combining created its own reds (member against member, a ratchet over its ceiling only when summed). | #5296, #5268, #5351, #5348: 49 sync merges and 43 pushes, none landed in the window; `Gdwi1VEX` $34 against a $10 cap. | PR timelines; `EvEjhMKv`, `6Q6ruuQ2`, `Gdwi1VEX`, `zhZsnRDA` | Brief template (this PR): combine only PRs that conflict with each other, at most three, and run the full floor plus ratchets on the combined tree before the first push. | 3 | data |
| 14 | **Two label-write paths, each with a trap.** Steward says labels only through `gh api` (the MCP `labels` field replaces the list); the classifier refused some `gh api` write loops, so from 02:15Z briefs said "MCP for writes, `gh` is search only". | The orchestrator's MCP write on #5357 removed Bryce's `config-ok`: one more click and 4 h 50 min. 147 replace-writes in 23 sessions. Refusal rates: `gh api` writes 8 of 323, MCP writes 0 of 979. | `issues/5357/events` 10:17, 10:33Z; steward `SKILL.md` §Lane 1; briefs from 02:15Z | Patch P5: a guard that refuses an MCP label write that would drop `config-ok`, `hold`, `land` or `needs-decision`. Brief template (this PR) stops contradicting steward. | 5 | data |
| 15 | **Gate rows that refuse on wording.** The Plan's required `**now:**` item is an open checkbox, so "now: landing…" fails the plan row. Steward allowed one re-run of an infra red while the gate refuses any green that needed a re-run. | 26 `plan=FAIL` statuses on 11 PRs, median 63 min to clear; 69 ready-gate `plan-open` refusals in 47 sessions. #5232: 196 min and one extra full tier after a re-run the skill allowed. | `tools/ci/ready-gate.mjs:254`; `merge-gate.mjs` `ciRetryVerdict`; steward `SKILL.md:73` against `references/land.md:7` | Patch P6: exempt `now:` + `land:`. Skill text (this PR): no re-run on a PR that must land; push fresh. | 6 | code |
| 16 | **Briefs stated a stale phone profile as fact.** | About 7 h of fixes measured against an October export; #5297 kept a wrong default for about 17 h and most of $50 of work was cut. | 22 briefs 19:44–02:55Z; `UhZd5BPN` 21:06Z | Brief template (this PR): name the newest `tests/data/settings-live-export-*.json` and its date. | 2 | data |
| 17 | **The orchestrator recommended cancelling runs, and did worker work.** Bryce cancelled runs from its lists (three listed wrongly); cancelled PRs then needed `--force-clean-behind`, which needed his `decision:` per PR. It also adopted 6 PRs and opened 4, at 796k context against its own 300k cap. | 23 runs cancelled in one burst (750 runner-min); 4 per-PR decisions and one blanket grant; a mistaken ready flip of #5340; its own Plan line failed the gate on the fix ten sessions were waiting for. | orchestrator 05:34–08:43Z, 02:18–04:18Z; #1780 | Decision D7. Patch P7: `needs-sync` treats a cancelled or base-red last run as a sync reason, so no force flag and no human. | 5 | data |
| 18 | **The container's Stop hook ("commit and push") is not a repo rule but is obeyed like one.** | 326 nags in 75 sessions; 16 pushes followed one, at least 4 before the local floor had finished; one push cancelled a 2 h 06 min run. | `WiHo2eLA` 08:47Z; `UhZd5BPN` 07:22Z; run 42761098933 | Skill text (this PR): answer once, do not push. The hook is outside the repo. | 6 | data |

Anecdotes (one instance, kept for the record, not ranked): interim conclusions from a root-cause session reached Bryce
as findings and one "Fix those" rested on a claim later refuted (`yiyReTpV` 01:14–02:08Z); the orchestrator named a
revert commit as the one to carry and a peer worker caught it in two minutes; a red on #5229's revert PR was bundled
with an unrelated `pages.yml` change and so needed `config-ok` (#5382); one investigation used 196 runner jobs on
scratch branches while the queue was saturated.

## Verification

The refuter's verdicts on the twelve largest numerical claims are in §Refuter verdicts at the end of this note.
Checks the lead made itself:

- `configPushState` (rank 1): read; the compare is `from...head` where `from` is the head of the newest CI run before
  the label, so every file the tip gained is in the diff.
- `land.yml` (rank 2): the workflow's own NOISE comment says a label other than `land` / `hold` exits at once.
- `dispatch.yml`: `state: disabled_manually`, `updated_at: 2026-11-05T03:11:02Z` (API read 2026-11-11).
- Re-run rule (rank 15): steward `SKILL.md:73` said "re-run a job at most once for timeout/infra";
  `references/land.md:7` and `ciRetryVerdict` refuse such a green.
- `LAND_ITEM` (rank 15): `/^(\*\*)?(land:|READY to\b)/i`, so `**now:** land: …` is an open item.
- `/goal` loop (rank 7): 380 `Stop hook feedback` events in the orchestrator transcript.
- 102k start (rank 6): relayed by the orchestrator at 01:35Z and 02:13Z; directly, the first request of worker
  `hJRye3Em` carried 101,668 input tokens (its `result` event), before it had read anything.
- CI durations (rank 3): re-derived from the Actions reader's `ci_runs.json` (draft median 61.5, full 49.4 min;
  323 success, 209 cancelled, 67 failure of 616).

Two corrections to the leads this review started from. The 8.4-hour red period was attributed to #5213; its first
failing check was the select-screen image baseline that #5346 (merged 13:02Z, 53 minutes earlier) had changed:
#5346's own deploy run was cancelled, the next train did not select that spec, and #5213's train only exposed it. And
#5229 did not merge into a red tip: at 19:41Z the tip was green by CI and the one failed train before it had failed
only in the Pages publish step.

## What worked: keep it

- **Question prompts with a recommended option.** 45 prompts, median answer 0.8 min, max 10.9; he took the
  recommended option 12 times of 12 where there was one. `needs-decision` labels: median 92 min (some were posted
  while he slept).
- **The first relaunch wave** (11-09 19:44Z): 10 workers, briefs of about 3.0k chars with one structure (his words,
  read list, task, claim, path ownership, stop rule), 18 PRs merged in 5 h 20 min, three replacements, orchestrator
  load 1–13 turns an hour.
- **Landing once green.** Last green CI to merged: median 8.1 min. The ruleset does not require an up-to-date branch,
  so a clean-behind PR lands without a sync.
- **Base-red hold and release broadcasts**, and "one shared cure, then one sync": after #5389 landed each held PR
  synced once and went green.
- **`ci-red-triage`** told a base red from an own red in under a minute, every time it was used.
- **Workers checked authority at the source** (comment author, `performed_via_github_app`, not edited) and refused
  relayed grants; nobody widened a tolerance or raised a budget to get green; 39 pre-commit refusals were all true.
- **The PR body as hand-off**: an adopter posted its adoption comment 12 s after its first event and was probing
  89 s later.
- **Real-device evidence in five minutes**: the phone bridge and a fresh settings export overturned an emulation
  inference that 22 briefs had carried.
- **Small, single-unit sessions**: three control sessions (one PR, a tooling or docs diff, a precedent PR named in
  the brief, an explicit stop condition) cost $2–7 and worked 40% of their wall clock, against 9% for the long ones.

## Measured timing

| metric | n | median | p90 | max | source |
|---|---|---|---|---|---|
| CI run queue (created → first job started), min | 610 | 0.5 | 2.4 | 8.5 | runs + jobs API |
| Selected-spec leg queue (job created → started), min | 7,578 | 36.7 | 121.7 | 190.3 | jobs API |
| Guards / node-suites job queue, min | 3,089 / 1,038 | 1.4 / 3.1 | 6.2 / 9.1 | 19.1 / 23.4 | jobs API |
| Draft tier, green, wall, min | 180 | 61.7 | 178.7 | 306.7 | `ci_runs.json` |
| Full tier, green, wall, min | 143 | 49.4 | 171.9 | 208.7 | `ci_runs.json` |
| Pages (deploy), green, wall, min | 30 | 20.7 | 48.2 | 73.4 | runs API |
| Last green CI → merged, min | 103 | 8.1 | 70.5 | 457 | statuses + `merged_at` |
| First `land` → merged, min | 105 | 98 | 592 | 1,202 | timeline |
| First commit → merged, min | 107 | 291 | 1,068 | 7,489 | commits + `merged_at` |
| CI runs per merged PR | 112 | 3 | 8 | 14 | runs → PR map |
| Pushes per merged PR (distinct CI heads) | 107 | 2 | 7 | 13 | runs |
| Sync merges per merged PR | 107 | 1 | 5 | 12 | 2-parent commits |
| `config-ok` clicks per PR that needed it | 38 | 2 | 5 | 10 | issue events |
| Voiding push → Bryce's re-click, min | 35 | 6 | 45 | 219 | runs + events |
| Question prompt → answer, min | 45 | 0.8 | 3.4 | 10.9 | orchestrator transcript |
| `needs-decision` → answer, min | 15 | 92 | 176 | 339 | events + comments |
| Orchestrator → worker message lag, min | 400 | 0.3 | 7.5 | 78 | transcripts |

Totals: 3,930 Actions runs; 68,623 runner-minutes (ci 54,551, pages 10,791, land 1,922). 616 ci.yml PR runs: 323
success, 209 cancelled (181 replaced by a newer push), 67 failure. `land.yml` is 64% of runs and under 3% of runner
time. Orchestrator spend in the window: about $535 (802 turns).

## Proposed patches (config paths: not applied here)

Each needs Bryce's `config-ok` and its own PR with tests. Line numbers are at `d6986f11`.

- **P1 `tools/ci/merge-gate.mjs` `configPushState`** (rank 1). Replace the `compare/<from>...<head>` test with a
  comparison of the PR's own config-path changes: list the CONFIG_PATH files in `compare/<base>...<from>` and in
  `compare/<base>...<head>` (three-dot, so only the PR's side), and return `covered` when the two lists carry the
  same files with the same blob shas; `after` otherwise (so a conflict resolution that changes the PR's own config
  files still voids the label, as four did in this window). Keep `unknown` for an unreadable compare, and change the
  `files.length >= 300 → "after"` branch to `unknown` (a large tip merge should not read as a push).
- **P2 `.github/workflows/land.yml`** (rank 2). Let a `config-ok` labeled or unlabeled event on a PR that carries
  `land` reach `resolve` (today only `land` / `hold` do), in the PR's own concurrency group.
- **P3 `.github/workflows/ci.yml`** (rank 3). On `ready_for_review`, when a draft-tier run on the same `head_sha`
  succeeded, reuse its selected-spec verdict (the pattern `tools/ci/pages-reuse-verdict.sh` uses for the train) and
  run only the full-only jobs. Separately, cap oversize and spill legs on a draft and list the rest as not run (the
  follow-up the comment at L2268-2278 already names).
- **P4 `tools/ci/merge-gate.mjs`, a `base` row** (rank 4). Pending while the newest completed `pages.yml` run on the
  deploy tip failed on code (platform failures excluded, as `dispatch.mjs` already does); passes for a PR labelled
  `deploy:red` or `priority`, so the fix can land. Paired with `needs-sync.mjs` reporting `tip-red`.
- **P5 `.claude/hooks/github-mcp-guard.sh`** (rank 14). On `issue_write` with a `labels` field: read the current
  labels; refuse when `config-ok`, `hold`, `land` or `needs-decision` would disappear, with "issue_write labels
  REPLACES the list and would remove <x>; add or remove one label with gh api".
- **P6 `tools/ci/ready-gate.mjs:254`** (rank 15). `LAND_ITEM = /^(\*\*now:\*\*\s*)?(\*\*)?(land:|READY to\b)/i`, and
  treat a `needs-device` item as Bryce's (never closed by an agent, exempt like `land:`).
- **P7 `tools/ci/needs-sync.mjs` `decideSync`** (rank 17). Count as a sync reason: a last run that is `cancelled`
  with a failed job on a tip that has since moved, and a green that needed a re-run. Then `--force-clean-behind`
  and the decisions it cost are not needed.
- **P8 `AGENTS.md`** (ranks 9, 18). Rule 13: say which of "no standby wakes" and "one check-in when subscription
  fails" holds. Rule 12: the container's Stop-hook nag is not a rule; while a floor, a sync or a hold runs, answer
  once and end the turn.
- **P9 `tools/ci/worker-prompt.md`** (ranks 6, 8). The cap as a budget above the measured start; message only on
  blocked, refused, needs-Bryce, merged, hand-off.

## Decisions for Bryce

Written so each can be asked with one tap. The first option is the recommendation.

1. **Who owns a red deploy tip?** (rank 4)
   - (a) Recommended: the gate holds merges while the tip is red (P4) and the orchestrator launches exactly one
     fixer, labelled `deploy:red`, within five minutes of a failed Pages run.
   - (b) Re-enable the Dispatch workflow and let it launch the fixer (issue #5420 lists what it needs first).
   - (c) Leave as is: workers notice, the orchestrator broadcasts.
2. **Cut CI wall time how?** (rank 3)
   - (a) Recommended: the ready flip reuses the green draft verdict on the same commit and runs only the full-only
     jobs (P3). Nothing is skipped; about 10,000 runner-minutes and a median 49 minutes per PR saved in this window.
   - (b) Also cap a draft at one browser leg and list the rest as "not run until ready".
   - (c) Limit how many browser-selected PRs are in CI at once (an orchestrator rule; no code).
3. **Stop generated files conflicting?** (rank 5)
   - (a) Recommended: build them instead of committing them, as #5349 and #5389 did: the generated test lists in
     `package.json`, `docs/agent-output/catalog.json`, `tools/shot/scenery-locations.json`,
     `tests/data/impact-map.json`.
   - (b) Keep them committed and make the gate ignore them (smaller change, conflicts stay).
   - (c) Leave as is.
4. **Worker context cap?** (rank 6)
   - (a) Recommended: a worker environment without the connectors a worker never uses (it starts near 10k, not
     102k), and the cap stated as a budget above the start.
   - (b) Raise the number in the briefs only (for example 600k).
   - (c) Leave as is.
5. **Check-ins while waiting?** (rank 9)
   - (a) Recommended: no timers when the PR subscription works; one check-in of at most 50 minutes when it was
     refused; a session ends at `land` and is relaunched if its PR goes red.
   - (b) No timers ever (the current wording of rule 13); the orchestrator's sweep is the only backstop.
   - (c) Leave both readings in place.
6. **Standing grants for a class of action?** (rank 10)
   - (a) Recommended: one `decision:` comment on the Board per day can cover a named class (as your 10:08Z comment
     did for `--force-clean-behind`), and every single ask carries the link and the exact line to paste.
   - (b) Per-PR decisions only, as now.
7. **May the orchestrator hold pushes, launch fewer workers and close stale issues without asking?** (ranks 12, 17)
   - (a) Recommended: yes for reversible actions (push hold, wave size, closing an issue with evidence), reported
     afterwards; never a recommendation to cancel a run; never its own PRs.
   - (b) Ask first, as now.

## Decisions recorded so far

Relayed by orchestrator A (message of 2026-11-11 05:16Z): Bryce answered the first four through its question prompt
at about 05:00Z (Nov 10, 9:00 PM PT). These are a record of intent, not a `decision:` comment on GitHub: nothing here
grants a change, and each patch below still needs its own PR and his `config-ok` click on that PR. This review did
not read the answers at the source.

| decision | his answer, as relayed | patches it unlocks | where the work goes |
|---|---|---|---|
| 1. Red deploy tip | "Gate holds merges, one fixer" | P4 (the `base` row in `merge-gate.mjs`, `tip-red` in `needs-sync.mjs`, the train running the specs of every merge since the last green train). The "one fixer" half is orchestrator behaviour, already in the brief template. | A new issue for the `base` row; #5407 (two green PRs crossing on a stale merge ref) is its sibling and should land with it, since a held gate does not stop a crossing. #5420 if the Dispatch workflow is to launch the fixer later. |
| 2. Ready flip | "Ready flip reuses the draft verdict" | P3 (`ci.yml`, first half: reuse the same-sha draft verdict and run only the full-only jobs). The draft leg cap, P3's second half, was option (b) and is not unlocked. | A new issue; #5403 (the full-tier verdict does not require `selected-verdict`) touches the same job and should be read first, so that a reused verdict is one the full tier actually requires. |
| 3. Generated files | "Build them, stop committing" | No numbered patch: move the generated `test:*` lists in `package.json`, `docs/agent-output/catalog.json`, `tools/shot/scenery-locations.json` and `tests/data/impact-map.json` to `BUILT_PATHS` in `tools/lib/generated-paths.mjs` (a config path), one file per PR, the way #5349 and #5389 did. It also removes most of what P1 exists to tolerate, but P1 is still needed for real `tools/ci/**` changes arriving through a sync. | A new issue per file, `scenery-locations.json` first (step 1 landed as #5255; it is D1 of the 2026-11-09 review). `package.json` is the hardest: the script lines are read by `npm run`, so the build step must run before any `npm run test:*`. |
| 4. Session start | "Leaner environment + budget above start" | P9 (`tools/ci/worker-prompt.md`: the cap as a budget above the measured start) and the `STOP AT` line of the brief template, which already says so. The leaner environment is not a repo patch: it is the worker's cloud environment and connector list, which Bryce configures. | #5212 (orchestration redesign; "strip worker connectors" is its D2). A worker environment needs a setup that still has the GitHub and apex tools and drops the web-search, Drive, docs, three.js and BrowserStack connectors, which is about 90k of the 102k start. |

Not answered yet: 5 (check-ins), 6 (standing grants), 7 (orchestrator autonomy), and where the saved transcripts
go (they stay in this session's `scratch/orch-review/transcripts/` until he says).

## Already recommended on 2026-11-09 and still open

`docs/notes/ORCHESTRATION-REVIEW-2026-11-09.md` §D listed these before this window's largest waves; they recur above:
finish the generated-file cure for `scenery-locations.json` (D1, rank 5); strip worker connectors (D2, rank 6);
compaction or a real hand-off at the cap (D3, rank 6); `dispatch.yml` disabled with `maxLiveWorkers` 8 (D7, ranks 4
and 12); the path-ownership sentence (D13); the $10 soft cap that six of ten sampled sessions passed without
stopping (D15). That note's claim B3, "the Nov 9 wave had no cap hand-offs", was wrong: four of eight relaunch lanes
had capped by then. What was done and helped: the same cure on `NOTES-INDEX.md` (#5349) and `TESTING-COVERAGE.md`
(#5389).

## Changed in this PR

Prose only, one commit per group, each citing the ranks it rests on: steward skill wording (re-run rule, adoption
test, duplicate tip fixes, the `config-ok` re-tap, check-ins and Stop-hook nags, ending at `land`); a reusable
orchestrator brief template under the dispatcher skill; this note.

## Refuter verdicts

A fresh reader was given the twelve largest numerical claims and told only to break them from GitHub, the code and
the raw transcripts. None was refuted; five survived unchanged and seven had a number corrected. The table above carries the corrected numbers.

| claim | verdict | correction |
|---|---|---|
| Sync voids `config-ok` (rank 1) | corrected | 24 of 40 re-clicks, not 28; the binding exists since `2c37fa43` (11-10 02:43Z); a compare of 300+ files voids on its own |
| Click does not re-gate (rank 2) | corrected | #5265 about 97 min, not 85; #5282's wait hid a real `gen` / `ratchets` failure |
| Leg queueing, 13 draft legs, ~40-job plateau (rank 3) | survives | live sample of 48 runs: leg queue median 44 min, 14 legs; 274 of 396 five-minute samples had 36+ jobs running |
| Ready flip repeats a green draft (rank 3) | survives | 9 of 10 sampled flips; leg overlap 8/13, 15/21, 10/13, 41/61 |
| Red periods (rank 4) | corrected | 17 trains; cause of the first red is #5346; three phases, one of them a publish failure |
| #5229 was a selection miss; two later reds were crossings (rank 4) | survives | #5300: green CI 00:55Z, #5392 merged 01:44Z, #5300 merged 02:48Z. #5384: 01:36Z, 01:53Z, 03:35Z |
| Sync counts and share (rank 5) | corrected | 268 unique tip syncs on 78 PRs; 38% of runs, 49% of runner-minutes |
| Cap and replacements (rank 6) | corrected | 15 of 24 stopped at the cap, median 42 min; 27 of 68 replacements holds |
| `/goal` loop (rank 7) | survives | 375 fires; 275 replies say "nothing has changed", about 300 near-identical |
| Cold-wake cost (rank 9) | corrected | median $2.64 at ≥ 60 min idle, $0.36 under 55 min |
| Dispatch disabled, docs still describe it (rank 4) | survives | last run 11-05 03:10Z |
| Orchestrator passive turns (rank 8) | corrected | 452 of 802 turns, $195 of $535 |
