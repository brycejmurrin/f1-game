# Process review: merge train, labels, a review step and a consolidation step (2026-11-24)

Kind: research + proposal · Re-measure-by: 2026-12-08

Ask (Bryce, 2026-11-24 ~21:32Z, relayed in the orchestrator's brief): "let's use a session to do a bunch of web
research, look at our git processes merge train labels etc and consider adding a review step and maybe a
consolidation step". This note maps the process, measures one afternoon, collects outside practice and proposes
options. It changes nothing. Bryce answers on the PR with one `decision:` line (§5).

## 1. One screen

- **The landing path is healthy today.** From 17:40Z to 21:32Z, 28 PRs merged: 23 alone and 5 in two trains. The
  median time from `land` to merge was 0.5 h. The five newest claude-lane PRs took 0.4–0.8 h from creation to merge.
  No train closed red. 3 of 60 `CI` runs failed (5%).
- **Every red today was one CI already catches.** None was a wrong-behaviour bug that shipped. The costs were the
  owner-less hours on #6307 (red with `land` set for about 7 h after its lease lapsed) and one ready-tier spec red on
  #6368 that the draft tier cannot see. An independent reviewer would plausibly have caught the #6368 spec red, and
  would not have caught #6307 or #6351 (§4a).
- **Review:** add an advisory reviewer subagent before the ready flip, for code diffs only. Record it as a Plan line
  and add no new label or gate row. Measure it for two weeks, then decide whether it blocks. **Consolidation:** group
  small same-area issues at launch (at most 3, using the existing `batch` labels). Do not fold green PRs into carriers:
  the train already batches after CI, and carriers measured badly on 2026-11-11.
- **Simplify:** `Land` ran 322 times for 28 merges, and 115 of those were skipped. That noise is worth a follow-up
  that only Bryce can approve, because `land.yml` is PROTECTED. The dispatch-only labels sit idle while
  `dispatch.yml` is disabled.

## 2. The process as it stands (map)

| piece | where | what it does |
|---|---|---|
| Labels | `.github/labels.json:1-38`; `.claude/skills/steward/references/labels.md:18-39` | 37 labels. Issue backlog: `ready` / `claimed` / `blocked` / `epic` / `batch` / `batched`. PR state: `land`, `train`, `hold`, `needs-owner`, `needs-decision`, `lane:*`. Bryce's grants: `config-ok`, `ratchet-raise`, `priority`. Switches: `dispatch:pause`, `dispatch:merge-pause`, `deploy:red`. Plus `area:*`. Labels are written one name per MCP call (`labels.md:6-16`). |
| Lane, claim, lease | `.claude/skills/steward/SKILL.md:16-50` | A worker claims an issue with a comment (the oldest claim wins) and opens a draft PR at its first commit. Ownership is a lease of at most 4 h, written in the Hand-off block. The newest `adopts PR #n` comment wins. A PR waiting on Bryce or on another PR is parked (up to 24 h past its lease). |
| CI tiers | `.github/workflows/ci.yml:155-197`; `tools/ci/pick-tests.mjs` (`RULES`); `docs/VERIFICATION.md:13-37` | A draft push runs the FAST tier: guards, lints, the selection plan and the parts census, with no browser groups. `ready_for_review` runs the full tier on the same head and reuses the draft's green tooling (`ci.yml:357-389`). Selected browser legs share 28 lanes (D-038). |
| Ready gate | `tools/ci/ready-gate.mjs`; `tools/ci/ship-pr.mjs` | Before the flip it checks the Plan (no open item but `land:`), the shard reports and memory edits. |
| Merge gate | `tools/ci/merge-gate.mjs:149` | The ten rows are `open, hold, plan, ci, base, config, raise, gen, ratchets, retest`. The trusted rows run no PR code. `gen`, `ratchets` and `retest` run on the throw-away merge (`:151-153`). It is the one required check, `gate` (D-031). |
| land.yml | `.github/workflows/land.yml:228` (resolve), `:440` (trusted-rows), `:502` (land-gate), `:555` (post), `:856` (arm), `:1098` (retry), `:1145` (sweep), `:1296` (train-screen), `:1342` (train) | Triggered by `pull_request_target`, label and draft flips, `workflow_run` and a schedule. It posts `gate`, then arms auto-merge with `--merge --match-head-commit`. |
| Merge train | `tools/ci/merge-train.mjs:42-47` (`train/`, `TRAIN_MAX = 10`); `docs/notes/MERGE-TRAIN-2026-11-18.md` | Up to 10 green `land` PRs are folded onto the tip as one `train/*` PR (merge commits) and land through the same gate. The screen job leaves out any car that turns the fold red. A red train halves its size (bisection); a stale one is rebuilt. D-035. |
| Issue batching | `tools/ci/dispatch.mjs:46-47, 241-260` | A `batch` issue is the one launch for its `batched` members, in its "Merge order". Last used on 2026-11-11 (§3.5). |
| Dispatch | `.github/workflows/dispatch.yml:1-25` | Hourly, plus events: labels, the Board comment, worker launches. State today: `disabled_manually` (read 2026-11-24), and `dispatch:pause` is set on #3899. The orchestrator does this job by hand (steward §After land). |
| Orchestrator rules | `.claude/skills/dispatcher/references/orchestrator-brief.md:11-29, 49-69`; `docs/notes/ORCHESTRATION-REVIEW-2026-11-11.md:59-84` | Check capacity before a launch wave. One PR per worker. Combine only PRs that conflict with each other, at most 3 (rank 13). The orchestrator adds `config-ok` on ROUTINE paths and `ratchet-raise` (D-042). |
| Decisions this rests on | `docs/DECISIONS.md` | D-031 (the one required check is `gate`), D-033 (shared paths are not a blocker; the PR that merges second syncs), D-035 (merge train), D-038 (28 lanes), D-040 (retest at merge), D-045 (CI credit across a clean sync), D-046 (one push per fix round; flip only after the draft run finishes). |

Gaps already on record and still open: the 2026-10-28 research proposed a "fresh-context review step before `land`"
(`docs/notes/AGENT-RESEARCH-2026-10-28-ORCHESTRATION.md:239, 266-271`, proposal 2). It was never built, and no agent
card, Plan line or gate row reviews a diff today. `finding-verifier` and `surface-reviewer` check findings and agent
config, not PR code.

## 3. Measurements (2026-11-24 17:40Z – 21:32Z, 09:40–13:32 PT)

Everything was read with `gh api` GETs. Run counts include runs still in progress at 21:32Z. Job minutes are wall-clock
job durations, not billed minutes.

### 3.1 Throughput

| measure | median | max | n |
|---|---|---|---|
| created → merged | 9.1 h | 13.8 h | 28 |
| ready → merged | 0.7 h | 11.5 h | 25 (3 Dependabot PRs were never drafts) |
| first `land` → merged | 0.5 h | 11.5 h (#6307) | 28 |

- **How they merged:** 23 PRs merged alone and 5 as cars in a train. Train #6356 carried #6315 and #6326. Train #6361
  carried #6319, #6336 and #6355.
- **Created → merged overstates the wait.** Many PRs were opened before the window, and the backlog got its `land`
  labels at 17:47–17:50Z, when the orchestrator adopted it.
- **Syncs:** 5 of 28 merged PRs had a sync merge commit (#6307 had two; #6247, #6318, #6336 and #6319 had one each).
- **PRs per issue:** 33 distinct issues were linked from 36 PRs, and none of them had two PRs. Six PRs closed two
  issues each. Ten PRs link no issue.
- **Open at 21:32Z:** 10 PRs, 9 of them with `land`. None carried `needs-owner`, `needs-decision`, `hold` or
  `blocked`.

### 3.2 Merge trains

| train | cars | outcome |
|---|---|---|
| #6353 | #6319 #6326 #6336 | closed stale (a car moved) |
| #6356 | #6315 #6326 | merged 19:45Z |
| #6361 | #6319 #6336 #6355 | merged 20:26Z |
| #6373 | #6328 #6369 | merged 21:35Z (just after the window) |

- **Today's trains:** 4 were opened in the window, with 2.5 cars each on average. One closed stale and none closed red.
- **Earlier in the day:** #6340 (2 cars) and #6347 (1 car) merged, #6346 closed, and #6348 merged.
- **The cap never binds.** `TRAIN_MAX` (10) was never reached: there are rarely more than 3 green `land` PRs at once.

### 3.3 CI cost per merged PR

| workflow | runs | outcome |
|---|---|---|
| CI | 60 | 53 success, 3 failure, 1 cancelled, 3 running. 1,979 jobs, about 5,208 job-min |
| Land | 283, plus 39 `Land retry` dispatches | 125 success, 115 skipped, 38 cancelled, 5 running. The retries: 36 success, 3 cancelled |
| Deploy to GitHub Pages | 24 | 10 success, 14 cancelled (a newer merge replaced the run) |
| Cancel CI of a closed PR | 33 | all success |
| Phone shots | 114 | all skipped |
| Spec timings | 24 | 10 success, 14 skipped |

- **Per merged PR:** about 1.3 `CI` runs, 45 jobs and 122 job-min (37 runs on merged heads came to 1,258 jobs and
  about 3,423 min). Add about 11.5 `Land` runs and 0.9 Pages runs.
- **No re-runs:** no run had `run_attempt > 1`.

### 3.4 Reds

| PR | run | what | caught by | would a reviewer have caught it? |
|---|---|---|---|---|
| #6307 (codex lane) | before the window, 10:31Z | `vm-a1` plus selected specs. The fix commit `7ecb7bd7` reads "Fix #6307 reds: lazy-group list and telemetry arrange prepare step": the author had not updated a registry test and a spec prepare step | CI | Possibly the stale list, but CI had already found it. The real cost was about 7 h with `land` set and no owner: lease until 13:30Z, adopted at 17:45Z. A reviewer does not fix ownership |
| #6351 (Dependabot) | 45437081417, 16:26Z | A `@capacitor/share` bump broke a pinned `androidLine` string in `shipped-notices.test.mjs`. #6359 cured it by deriving the version from `mobile/package.json` | CI | No. The pin lives in a test, not in the diff. The cure was a test-design fix |
| #6368 | 45480555321 on `c3a4ef4b` | `gen-arch-table` guard: a header-comment edit left the generated `docs/ARCHITECTURE.md` stale. According to the measuring agent, the local floor did not catch it (not re-run here) | CI, fast tier | Unlikely. This is a floor gap (§4c, C3) |
| #6368 | 45483650426 on `fb52d1b5` | The `oversize-gamepad-1of2` spec (14 tests) failed on the ready tier; the draft tier on the same head was green, because drafts run no browser groups | CI, ready tier | Plausibly. The diff changes what holding CAM does on a controller, and a reviewer told to list the specs whose assertions the diff touches would name the gamepad specs before the flip. Not verified: it is in the calibration set (§4a) |
| #6318 | 45462045095 | `actions/checkout` fetch error (curl 92, HTTP/2 CANCEL) | infra | No (not a code fault) |

- **Red rate:** about 5% per PR CI run (3 of 60).
- **What the batching model says at that rate** (§3.6, source 2): a batch of 10 costs about 0.28 CI runs per landed
  PR and a batch of 5 about 0.31. Raising or lowering `TRAIN_MAX` changes little; the supply of green PRs sets the
  train size.

### 3.5 Labels in use

One GET per label read the newest issue or PR that still carries it, and the open count. A label that was added and
then removed does not show, so `hold` reads as none.

| label | newest carrier | open | note |
|---|---|---|---|
| `memory-change` | #3928, 2026-10-27 | 0 | ready-gate also accepts a `memory-change:` body line (`labels.json:37`), so there are two ways to say one thing |
| `batch` / `batched` | #5419 2026-11-11, #5321 2026-11-10 | 0 / 0 | the machinery exists and is idle; today's grouping pilot can reuse it |
| `fleet-board` | #3900 | 0 | the Board is #1780 per `labels.md:42`; that issue no longer carries the label (worth a check) |
| `ready` | #6032, 2026-11-20 | 0 | there is no `ready` backlog while dispatch is disabled |
| `needs-owner` | #5960, 2026-11-20 | 0 | the orchestrator adopts by comment instead (26 `adopts PR #` comments in the window) |
| `lane:cursor` | #6175, 2026-11-22 | 0 | |
| `dispatch:merge-pause`, `hold` | none carrying | 0 | still worth keeping: these are the vetoes |

### 3.6 Sources (all read 2026-11-24)

The fetched pages were summarised by a smaller model, so the quotes below are close paraphrase. "Unverified" means a
secondary or vendor source, or a primary page that failed to load.

1. **GitHub merge queue.**
   [Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue):
   it needs the `merge_group` event, build concurrency is 1–100, and min/max group size is 1–100. A failing or
   conflicting PR is removed and the rest are rebuilt without it. It is available only in organization-owned public
   repos or Enterprise Cloud private repos, so not here (as MERGE-TRAIN-2026-11-18 already found).
   [How GitHub uses it](https://github.blog/engineering/how-github-uses-merge-queue-to-ship-hundreds-of-changes-every-day/):
   2,500 PRs a month and 33% less waiting; the old trains of more than 15 changes "frequently derailed".
2. **Batch-and-bisect queues and theory.**
   - [bors-ng](https://github.com/bors-ng/bors-ng): batch, test on `staging`, bisect on failure. Archived 2024-04-04.
   - [Mergify batches](https://docs.mergify.com/merge-queue/batches/): `batch_size` 1–128 (default 1),
     `batch_max_wait_time` 30 s, speculative and bisecting.
   - Aviator [parallel mode](https://docs.aviator.co/mergequeue/concepts/parallel-mode) and
     [batching](https://docs.aviator.co/mergequeue/concepts/batching): optimistic runs; a failed batch is re-queued in
     bisected halves.
   - [Graphite merge queue](https://graphite.com/docs/graphite-merge-queue): stack-aware.
   - Uber SubmitQueue, [arXiv 2501.03440](https://arxiv.org/abs/2501.03440): speculation, 53% less CI, and 40–65% of
     builds aborted.
   - Batching studies, unverified (search summaries of [arXiv 2308.13129](https://arxiv.org/abs/2308.13129)): batch
     plus bisect pays below about 40% failing builds. "BatchStop4" means stopping the bisection at 4 and testing each
     PR alone.
   - A batch of n independent PRs passes with probability (1−p)^n. Our own halving-bisection model gives expected CI
     runs per landed PR, against 1.0 unbatched:

     | p | n=4 | n=5 | n=8 | n=10 |
     |---|---|---|---|---|
     | 2% | 0.29 | 0.25 | 0.19 | 0.17 |
     | 5% | 0.35 | 0.31 | 0.29 | 0.28 |
     | 10% | 0.43 | 0.41 | 0.42 | 0.42 |
     | 20% | 0.59 | 0.58 | 0.64 | 0.64 |

3. **Automated review.**
   - [Claude Code Code Review](https://code.claude.com/docs/en/code-review): managed review is for Team/Enterprise
     plans. Its check run "doesn't conclude as a failure", and "by itself, a review doesn't approve or block the pull
     request". `REVIEW.md` is read from the base branch, never from the PR. The vendor blog (unverified) gives about
     20 min and $15–25 a review, and under 1% of findings marked incorrect, which is developer feedback, not audited
     precision.
   - [claude-code-action](https://code.claude.com/docs/en/github-actions): the self-hosted route with the
     `code-review` plugin; it skips drafts, and a bot actor needs `allowed_bots`.
   - [Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review): "By default, Copilot's
     reviews do not count toward required approvals."
   - [Cursor Bugbot](https://cursor.com/docs/bugbot): findings default to `neutral`, so requiring the check does not
     block a merge.
   - [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches):
     approvals come from people with write access or a code owner.
   - Self-preference of an LLM judge (abstracts only:
     [arXiv 2410.21819](https://arxiv.org/abs/2410.21819), [2601.22548](https://arxiv.org/abs/2601.22548)): a
     same-model reviewer shares the author's blind spots. The mitigations are a different model family, and grounding
     the review in tests and static checks.
   - [Faros 2025](https://www.faros.ai/blog/ai-productivity-paradox-report-2025) (unverified): with heavy AI use,
     merged PRs rose 98%, review time 91% and PR size 154%.
   - Vendor catch rates (Greptile, Graphite, CodeRabbit) have no common benchmark. They were not used.
4. **PR size and consolidation.**
   - [Google small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html): "roughly 100 lines
     is often reasonable, and 1,000 lines is usually too large"; small changes make "easier merging and rollbacks".
   - [SmartBear/Cisco](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/): 200–400 LOC per
     review sitting. A vendor study.
   - [Dependabot groups](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference#groups):
     grouped update PRs; the first matching group wins.
   - Stacked PRs (search summaries, unverified): frequent rebases, cascading conflicts and more CI.

## 4. Proposals

### 4a. A review step

What the research and today's data say together:
- **What CI already covers.** Today's reds were all mechanical, and CI caught each one. A reviewer pays only for
  what CI cannot see:
  - the diff misses the issue's Done-when;
  - behaviour changes with no spec that pins it;
  - scope creep;
  - a physics-contract breach (`docs/PHYSICS.md` §Curvature channels);
  - a browser spec the draft tier will not run (the #6368 case).
- **Advisory first, everywhere.** Every vendor starts review as advisory (Claude Code, Bugbot) and none counts a bot
  as an approval.
- **A GitHub approval cannot be the record here.** On a solo account an "approval" would be the author approving
  itself.
- **The reviewer needs independence.** That means fresh context and the base-branch rules, and ideally another model
  family.

| option | where | who | blocks? | recorded as | cost per PR |
|---|---|---|---|---|---|
| **A1 (pick)** | after the draft CI run finishes, before `ship-pr` / the ready flip; code diffs only (`js/`, `css/`, `index.html`, `sw.js`; not docs-only, Dependabot or tooling-only) | the worker spawns a new read-only `pr-reviewer` subagent (sonnet; Read/Grep/Glob plus apex-lsp; no browser, rule 10). Its input is the three-dot diff, the issue's Done-when and `apex_select_specs {files}`, so it can list the routed specs whose assertions the diff touches | no: advisory | a ticked Plan line `- [x] review: <n> findings, <k> accepted (<sha>)`, with each finding accepted or rejected in the PR. ready-gate already refuses an open Plan item, so a worker cannot flip with the line still open, and nothing new is enforced | one subagent, about 5–10 min. The dollar cost is not measured: measure it in the pilot |
| A2 | as A1 | as A1 | yes: a new ready-gate row needs the `review:` line, and high-severity findings must be resolved | Plan line plus the ready-gate row (PROTECTED: ready-gate is in the gate's import closure, so Bryce's own `config-ok`) | as A1, plus the PR waits on the fix |
| A3 | at `land`, on the train PR or on each car | a separate reviewer session, or `claude-code-action` with the `code-review` plugin, as a status that `gate` reads | yes, as a new gate row | a `reviewed` status | managed review ($15–25, about 20 min each, vendor figures) is plan-gated. The Action route needs an API secret and a workflow edit (PROTECTED) |
| A4 | before the flip | Copilot review through MCP `request_copilot_review` (a different model family) | no | a PR review comment | depends on Bryce's Copilot plan (unverified) |
| A0 | none | | | | 0 |

**Pick A1 for two weeks.**
- Calibrate it first: replay today's reds (#6307, #6351, both #6368 heads) and the 2026-11-11 crossings (#5229,
  #5298, #5346, from ORCHESTRATION-REVIEW rank 4) through the reviewer. Record its catches and false positives in a
  `docs/notes/` follow-up.
- At Re-measure-by, decide A2 (blocking) if the reviewer catches what CI did not at an acceptance rate of 50% or more.
  Otherwise drop it to A0.
- A1 needs only a new agent card and a steward §Land line, both ROUTINE paths. A2 and A3 touch PROTECTED paths.

### 4b. A consolidation step

| option | what | helps when | hurts when | pick |
|---|---|---|---|---|
| **B1 (pick)** | group at launch: the orchestrator folds at most 3 small `ready` issues that share an area or files into one `batch` issue (`dispatch.mjs:241` already parses "## Members" and "## Merge order") → one worker, one PR, about 400 changed lines at most | the issues share files, so it saves the sync that D-033 would force on the second PR (today 5 of 28 merged PRs synced). It also cuts the fixed cost of about 45 CI jobs, about 11.5 `Land` runs and one Pages run per PR | the members are unrelated, so one red holds all of them; past the size cap, review and revert get coarse (Google: 1,000 lines "usually too large") | yes. It matches the pilot the orchestrator is running and the rank-13 rule (at most 3) |
| B2 | a carrier PR folding green small PRs before CI | — | always here: the train already folds after CI with each PR's merge commit kept. The 2026-11-11 carriers (#5296, #5268, #5351, #5348) took 49 syncs and 43 pushes and landed none (rank 13) | no |
| B3 | change the train: a dynamic `TRAIN_MAX`, or BatchStop4 | the red rate rises above about 10% | not today: trains average 2.5 cars, so the cap never binds | no change. Re-measure the red rate weekly |
| B4 | stacked PRs | dependent changes in sequence | independent small fixes, which are our usual case: rebases and cascading conflicts, against D-046's one push per round | no |

Revert and blame granularity: B1 keeps one merge commit per PR. Its members share that one commit, which is why the
cap is 3 and the grouping is by area. Grouping leaves D-033 unchanged (shared paths are still no blocker) and also
leaves D-046's push rules unchanged.

### 4c. Simplifications

| option | finding | proposal | pick |
|---|---|---|---|
| **C1 (pick)** | `Land` ran 322 times for 28 merges (115 skipped, 38 cancelled); Phone shots ran 114 times, all skipped | a measurement issue: which triggers produce the skipped and cancelled `Land` runs, and can `resolve`'s `if:` drop them before a runner starts? `land.yml` is PROTECTED, so any change is Bryce's click on its own PR | yes, as an issue only |
| C2 | `memory-change` label (last used 2026-10-27) duplicates the body line | retire the label and keep the body line. This touches ready-gate (PROTECTED) | no: low value |
| C3 | #6368's stale `docs/ARCHITECTURE.md` reached CI. According to the measuring agent the local floor missed it | an issue to check whether `tooling-fast --changed` runs the `gen-arch-table` guard for a `js/` header-comment edit | yes, as an issue |
| C4 | `ready`, `needs-owner` and `fleet-board` are idle while `dispatch.yml` is disabled | keep them until Bryce decides whether dispatch returns, rather than relabelling twice | no change |

## 5. The decision line

One line answers all three, for example `decision: A1 B1 C1+C3`. The options and picks are in §4, and the PR's
`needs-decision` comment repeats them.
