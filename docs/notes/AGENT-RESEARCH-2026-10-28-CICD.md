<!-- Research subagent report (2026-10-28), copied verbatim from scratch/research/cicd-dispatch.md. Spot-checked claims are listed in docs/notes/SKILL-REVIEW-2026-10-28.md; everything else is unverified. -->
# CI/CD landing + dispatch research — 2026-10-28

Read-only research (no repo edits but this file). Deploy tip at writing: `0e604b0d` (2026-10-28 00:20 PDT).
Live GitHub numbers below were read with `gh api` REST at ~07:20Z (00:20 PDT) on 2026-10-28.

## 1. The pipeline as built, and where it jams

```
issue (ready) ─dispatch.mjs (hourly)─▶ worker session ─▶ draft PR (+run-ci: fast tier)
   ─▶ ready-gate ─▶ ready + `land` ─▶ ci.yml full tier (`CI`) ─▶ land.yml: trusted-rows + land-gate(gen,ratchets on
   merge result) ─▶ post `gate` status ─▶ arm (gh pr merge --auto) ─▶ merge commit on deploy branch
   ─▶ pages.yml train (single-flight: 1 running + 1 pending) gates the tip once ─▶ publish
```

Measured inputs (repo docs + today's REST reads):

| quantity | value | source |
|---|---|---|
| merges onto deploy, last 24 h | 114 first-parent merges, **54 game merges** (≈4.75/h, ≈2.25 game/h) | `git log --first-parent --merges` since 10-27 07:20Z |
| PR arrivals | ~7 PRs/h opened vs ~3.5/h merged (10-27) | land.yml header AUTO-SYNC; dispatch.mjs header |
| open PRs now | 55 open, 41 ready, **39 carry `land`** | REST `pulls?state=open` |
| `gate` on those 39 heads | **28 refused on distance alone** (all other rows ok), 1 distance+plan, 3 gen/ratchets FAIL, 2 plan FAIL, 3 "re-gating"/tip-moved, 3 ci WAIT, 1 none | REST `commits/<sha>/statuses` |
| oldest distance-only refusals | #4007, #4012, #4018 (gated 10-27 ~20:00Z, 11 h ago) | same |
| MAX_BEHIND | 6 game merges (default; plan started at 2) → ~2.7 h of tip motion at 2.25 game merges/h | merge-gate.mjs:67 |
| SYNC_MAX / RETRY_MAX | 3 / 3 | land.yml env |
| ready `CI` verdict | p50 13.6 min, p90 29.7 (911 runs, 7.7 d) | docs/notes/system-audit-4/ci-7d.md |
| train push→publish | p50 17.0, p90 28.5 min; 13 % red on attempt 1 | ci-7d.md |
| Linux job queue wait | p50 0.05, p90 4.8, p99 20.9 min (47,957 jobs) | ci-7d.md |
| red train odds vs staleness | **4.3 % when 0 merges intervened, 13.3 % when ≥1, 14.6 % (6/41) when ≥20** | ci-7d.md "Stale green" |
| red-train causes (44) | 23 merge-composition (tree-wide counters), 12 spec, 3 flake | ci-7d.md |
| composition reds after merge-gate re-ran count tests on the merge result (#3785, 10-26 09:28Z) | **0 of 2** reds since | ci-7d.md "Clean" |

### Bottleneck diagnosis

1. **The distance row turns a queue into a livelock.** Little's law: 39 waiting / ~4.75 merges/h ≈ 8 h in
   queue, while a game PR's merge-base expires after ~6 / 2.25 ≈ 2.7 h. Any game PR that waits longer than one
   "window" fails distance, and every merge ahead of it widens the gap. Nothing in the data says 6 is safer than
   20: red odds jump at "≥1 merge intervened" and are flat after that (13.3 % vs 14.6 % at ≥20). The thing the row
   was guarding against (composition reds, half of all red trains) is now caught directly by gen:check + the
   ratchet/count tests on the real merge result (0 of 2 reds since). So the row costs throughput and buys ~nothing
   the `gen`/`ratchets` rows and the train do not already buy.
2. **AUTO-SYNC almost never fires.** Of ~100 land.yml runs since 03:00Z: `sync=success` 1 time, `skipped` 36, and
   that one run (40649101366, 07:17Z) listed **27 candidates** and synced **0**: "AUTO-SYNC: 3 `land` PR(s) already
   wait on a ci.yml run; this run may sync 0 (SYNC_MAX=3)". The budget counts *every* `land` head with CI running
   (fresh pushes, takeovers), not syncs it started, and it only runs on a train completion or a manual dispatch.
   With 39 `land` PRs there are nearly always ≥3 CI runs in flight, so the budget is permanently 0.
3. **Arming is train-paced.** A train re-gate arms at most one PR; the `retry` path arms only the PR it is about.
   Throughput from trains ≤ 1 per train (~3/h at p50 17 min). Fresh green PRs arm on their own CI event, which is
   why non-game PRs (no distance row) still flow and game PRs starve.
4. **The dispatcher spends sessions on syncs.** `landProblem` (dispatch.mjs:262) treats any `gate` failure as a
   problem, so a distance-only `land` PR becomes "stale" after 2 h and gets a `CONTINUE PR` takeover session whose
   job is "fix the red or the conflict (sync-pr.mjs)". That is a whole Sonnet session per sync, racing AUTO-SYNC.
5. Capacity is less scarce than the THROTTLE comment assumes. SYNC_MAX's rationale cites the 10-15 clog survey
   (a third of PR runs were update-branch merges); the 7.7-day audit since shows Linux queue p50 0.05 / p90 4.8 min.
   The real scarce resource is the selected browser legs (p90 14.7 min lane wait), which a sync re-runs only when
   the merge pulls game paths.

## 2. Research findings (primary sources, verbatim)

**GitHub merge queue is still unavailable to this repo (user-owned).**
- "Pull request merge queues are available in any public repository owned by an organization, or in private
  repositories owned by organizations using GitHub Enterprise Cloud." — https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue (read 2026-10-28)
- What it would give: "The merge queue provides the same benefits as the **Require branches to be up to date
  before merging** branch protection, but does not require a pull request author to update their pull request
  branch and wait for status checks to finish before trying to merge." / "the changes in the pull request are
  grouped into a `merge_group` with the latest version of the `base_branch` as well as changes from pull requests
  ahead of it in the queue." / "You **must** use the `merge_group` event to trigger your GitHub Actions workflow"
  / "Merge limits do not combine `merge_group` **builds**." (same page)
- Moving to an org is costly here: "If the transferred repository contains a GitHub Pages site, then links to the
  Git repository on the Web and through Git activity are redirected. However, we don't redirect GitHub Pages
  associated with the repository." — https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository
  (Bryce plays the installed PWA on an iPhone; a new origin also strands localStorage career saves — inference.)

**Batches can land through one PR.** "A pull request can be marked as merged if its head branch commits become
reachable from the base branch outside that pull request. ... Pull requests merged indirectly are marked as
`merged` even if branch protection rules on that pull request were not satisfied." — https://docs.github.com/en/pull-requests/reference/pull-request-merges
(So a rollup PR that passes `gate` marks its constituents merged; constituent `Closes #n` lines need checking.)

**Auto-merge semantics.** "Auto-merge merges a pull request automatically after all required reviews and status
checks pass." / "The option to enable auto-merge is shown only on pull requests that cannot be merged immediately."
— https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request
(matches land.yml's note that `gh pr merge --auto` on a CLEAN PR merges at once).

**Concurrency.** "By default, only one job or workflow run can be `pending` in a concurrency group at a time." /
"`max`: Up to 100 jobs or workflow runs can be `pending` in the concurrency group." / "`queue: max` cannot be
combined with `cancel-in-progress: true`" — https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
(`queue: max` on a land-arm group would serialize arms without dropping any.)

**Not Rocket Science / bors / TAP.** Graydon Hoare, quoted: "**The Not Rocket Science Rule Of Software
Engineering**: automatically maintain a repository of code that always passes all the tests". Google: "Google's
systems treat the gap between these two pointers as an optimistic-but-unverified queue. Their TAP system batches
the commits in this queue into related groups ... If a batch succeed, the lagging pointer moves up. If a batch
fails, TAP automatically begins rolling bac[k]" — https://graphite.com/blog/bors-google-tap-merge-queue
(Apex already has the TAP shape: the deploy branch is the optimistic pointer, the live Pages `apex-sha` is the
lagging green pointer; the train is the batch verifier.) bors-ng: "This repository was archived by the owner on
Apr 4, 2024." — https://github.com/bors-ng/bors-ng

**Rust rollups (batch by hand-marked risk).** "The Rust project has a policy that every pull request must be tested
after merge before it can be pushed to the default branch. As PR volume increases this can scale poorly,
especially given the long (~3hr) current CI duration for Rust. Enter rollups! Changes that are small, not
performance sensitive, or not platform dependent are marked with the `rollup` command ... 'Performing a Rollup'
then means collecting these changes into one PR and merging them all at once." — https://forge.rust-lang.org/release/rollups.html

**Uber SubmitQueue (EuroSys'19).** "with a thousand changes per day, where each change takes 30 minutes to pass all
build steps, the turnaround time of the last enqueued change will be over 20 days." / "At 'only' 16 concurrent
and potentially conflicting changes, there's a 40% chance of a problem." / pre-SubmitQueue "The mainline was green
only 52% of the time." / "two changes conflict if they both affect a common set of build targets." / "With n
changes per hour, and n worker nodes available, SubmitQueue can achieve a turnaround time with 1.2x of the Oracle."
— https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/ (summary of the paper)

**Third-party queues (user-owned public repos).** Mergify: "Mergify is free for open source projects and for
private teams of up to 5 active contributors." — https://mergify.com/pricing (search snippet); per an independent
2026-10-21 comparison "the Free plan for small private teams includes batching, scopes, priorities, and two-step
CI, and the Open Source plan doesn't. It gets parallel checks, stacked PRs, and scheduled merges." Trunk: "Free
covers up to five committers". Aviator: "the free tier doesn't include MergeQueue". Graphite: Team plan "$40 per
user a month". — https://pyor.review/blog/github-merge-queue-alternatives (not a vendor; verify on vendor pages
before acting). Batch arithmetic under agent load: "At a 20% queue-failure rate, a batch of ten passes 10.7% of
the time" and bisection "costs roughly 2·log₂(b) extra runs" — https://menuagentic.com/blogs/github-merge-queue-vs-trunk-vs-mergify-vs-aviator/
Mergify on its own batches: "Small batches keep latency low and make failures cheap to isolate, but spend more CI.
Large batches conserve CI and clear a backlog faster" — https://docs.mergify.com/merge-queue/batches/

**Agent roles in published practice.**
- Anthropic: "In the orchestrator-workers workflow, a central LLM dynamically breaks down tasks, delegates them to
  worker LLMs, and synthesizes their results." / "In the evaluator-optimizer workflow, one LLM call generates a
  response while another provides evaluation and feedback in a loop." — https://www.anthropic.com/engineering/building-effective-agents
- Claude Code GitHub Actions: "Mention `@claude` in a pull request or issue comment to have Claude analyze code,
  implement changes, and push commits. You can also give the Claude Code GitHub Action a prompt to run
  automatically on any GitHub event." — https://code.claude.com/docs/en/github-actions
- Copilot cloud agent (the clearest published role contract): "Copilot can only work on one branch at a time and
  can open one pull request per task." / "Each Copilot cloud agent session has a maximum execution time of 59
  minutes." — https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent ; "Copilot cloud
  agent cannot mark its pull requests as 'Ready for review' and cannot approve or merge a pull request." /
  "Prevents the user who asked Copilot cloud agent to create a pull request from approving it." / "you choose
  exactly which tools an automation can use, so it can only take the actions the task requires." —
  https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations
- Not verified: Cursor Bugbot (docs.cursor.com/bugbot redirected to the docs home) and OpenAI Codex cloud pages.

## 3. Proposals (ranked by throughput gained per unit of risk/effort)

### P1 — Re-gate the queue head on every deploy-branch push; sync just-in-time (fix the mechanism)
Today arming and syncing wait for a Pages train to *finish* (p50 17 min) and arm one PR. Add a `push:
branches: [deploy]` trigger to land.yml (a push runs the pushed commit's file = the deploy branch's own copy, so
the trust model holds) that: (a) re-gates the next `priority`→oldest landable PR immediately; (b) runs AUTO-SYNC
on the **head of the queue only** (the next K = SYNC_MAX distance-only PRs in landing order), not on every
candidate. Fix the budget to count only syncs AUTO-SYNC itself started (mark them, e.g. a `synced-by-land` label
or the update-branch head sha recorded in the step summary) — today any `land` CI run consumes it (07:17Z run:
27 candidates, budget 0). Put the arm step in a `land-arm` concurrency group with `queue: max` so arms serialize
without dropping. Expected: arm latency per merge falls from ~train length to ~gate length (minutes); syncs stop
being starved. Risk: low (no new authority, same jobs). Owner: a CI lane, land.yml + tests/unit/merge-gate.test.mjs.

### P2 — Replace the distance COUNT with "tested on the tip it merges onto" (relax, then retire)
Evidence: red odds are flat in N once N ≥ 1 (13.3 % ≥1, 14.6 % ≥20), composition reds are now caught by the
`gen`/`ratchets` rows on the merge result (0 of 2 since 10-26), and the train already gates every tip before
publish (TAP's lagging pointer). Step 1 (config only): raise MAX_BEHIND to ~25 for 3 days and watch train red
rate per day vs the 13 % baseline (the dispatcher's `deploy:red` fixer is the backstop). Step 2: retire the row,
or keep it only for diffs touching a short high-risk list (e.g. `js/game.js`, `index.html`, `sw.js` — the shared
shell) and widen land-gate's merge-result check to the cheap node half (`tooling-fast --changed` + the node suite
slices the diff selects) so "green on the merge result" means more than gen + ratchets. Don't widen tolerances;
this moves the test to the right tree. Expected: the 28 blocked PRs become landable at once; no session or sync
spent. Risk: medium (spec reds on interacting game changes; measured 12 of 44 red trains were spec reds, cause
mix unknown) — mitigated by P5's metric and the train.

### P3 — Stop the dispatcher launching takeovers for distance-only refusals
`landProblem` should return null for a `gate` refusal whose description names every row ok but distance
(the same predicate land.yml's resolve uses), so AUTO-SYNC owns it. Today a 2-h-old distance refusal launches
a `CONTINUE PR` session (≤$10 soft cap each) to run one `sync-pr.mjs`. Risk: none; dispatch.mjs + its unit test.

### P4 — Rollup landing for low-risk PRs (Rust-style batches through one PR)
When the queue is deeper than ~6, a `land-rollup` job (no PR code with write tokens; same split as land-gate)
merges up to K gated, mutually non-conflicting `land` PRs onto the tip in a `rollup/<ts>` branch, opens ONE PR
(`land`, body listing members), and runs the full tier once. On green, the ruleset merges it with a merge
commit and GitHub marks the members merged indirectly (quote above). On red, split in halves (bisection,
2·log₂K extra runs) and drop the culprit back to its owner. Size K from measured p: ready-tier red is 11.5 %
(ci-7d) → K = 4 passes ~61 % unbisected; K = 8 only ~38 %. Start with non-game PRs + game PRs labelled
`rollup` by their worker (Rust's "small, not performance sensitive" rule). Expected: CI cost per merge /K and a
deep queue drains in a few cycles. Risk: medium (indirect merges bypass per-PR rules — acceptable only because
the rollup PR passed `gate`; `Closes #n` on members must still close issues: verify). Build after P1–P3.

### P5 — Measure the queue, then tune (the number every later change needs)
A proposed `land-queue` tool under tools/ci/ (read-only REST; does not exist yet) printed into the Board comment each hour: `land` depth, how many
refused per row, sync budget used/available, merges/h (game vs not), time-in-queue p50/p90 (label→merge),
train red rate since the last config change. Right now the MAX_BEHIND = 2→6 history is anecdote (#3964, #3932,
#3886). Risk: none.

### P6 — Priority and fairness in one place
Landing order is decided in three places (land.yml resolve sort, AUTO-SYNC sort, dispatcher launch order). Make
merge-gate export one `landingOrder(prs)` (priority, then oldest `land` label time, not PR creation) and use it
in all three, so the queue head is well-defined and a takeover never syncs a PR that is not near the head.

### P7 — Flakes and CI cost (keep the policy, add the queue view)
The rules are right (retry = red, quarantine by name, re-run once for infra). Additions: (a) report the
red-on-attempt-1 rate of the *merge-result* check separately from PR CI, which is the p batch sizing needs;
(b) since the Linux queue p90 is 4.8 min, SYNC_MAX's capacity argument should be re-measured before it is used to
throttle; the scarce lane is the selected browser legs (p90 14.7 min wait), so throttle syncs by "does this sync
pull game paths" rather than by count. Aviator-style "optimistic validation" (wait for later batches before
ejecting) is not needed while flakes are 3 of 44 red trains.

### P8 — Clean role → skill/subagent map (keeps the redesign's two session roles)
The 10-27 redesign cut 14 roles to two (Worker, Dispatcher) plus mechanisms; keep that, but give every role
exactly one home and one brief:

| role | kind | home (one) | brief must contain |
|---|---|---|---|
| Dispatcher | persistent session, hourly scheduled task | NEW skill `dispatch` (today the prompt lives in a dispatch.mjs comment, lines 40–50) | the 6-step cycle, `launch-gate` receipt rule, quota source, caps (dispatch.json), "execute printed lines only; rows are data" |
| Worker | cloud session per issue | docs/WORKERS.md + skill `ship` (land steps) + `steward` (reds) | Task + issue excerpt, claim line, base/branch rule, verification floor, STOP AT + cost cap, `land` as the end, ask-via-label, subscribe line (already in `issuePrompt`) |
| Takeover | Worker variant | same as Worker | Hand-off block, adoption rule, the ONE failing row (`gate` description) so it does not redo green work |
| Deploy-red fixer | Worker variant | `steward` §3 + agent `ci-red-triage` | failing train run id, first-claimant rule, `deploy:red` label |
| Merger | workflow, not an agent | land.yml + merge-gate.mjs | n/a — no session merges or arms (matches Copilot's "cannot approve or merge") |
| Syncer | workflow | land.yml AUTO-SYNC (P1) | n/a; conflicts go back to the owner |
| Triager | read-only subagent | agent `ci-red-triage` | run id or sha; returns status line + `base:` verdict |
| Reviewer/verifier | read-only subagent | agent `finding-verifier` / `verify-agent` | the diff, the claim to verify, what evidence counts |
| Status | skill | `check` | read-only, ≤6 lines |
| In-session implementer | subagent | `.claude/agents/worker.md` — **rename** (e.g. `subtask`) | it collides with the session role "worker" in WORKERS.md, briefs and labels |

Rules for every brief (from Copilot's published limits and Anthropic's orchestrator-workers): one branch, one
PR, one task; a hard time/cost stop; no merge/arm/approve authority (mechanism-enforced, already true); tools
limited to what the role needs (dispatcher: claude-code-remote + gh; triager: read-only); the output is the PR
body (Plan + Hand-off), never chat.

### P9 (deferred) — Native or hosted merge queue
GitHub's queue needs an org-owned repo; transferring breaks the Pages URL (not redirected) and, by inference,
the installed PWA's origin and saves. Mergify's Open Source plan offers parallel (speculative) checks on public
repos but per the comparison not batching, and adds a third-party app with write access. Revisit only if P1–P4
fail to keep the queue under ~6 for a week.

## 4. Not verified / open
- Whether every refused PR's distance count is near 6 or far past it (descriptions omit the count; the run step
  summary has it). Would size P2's interim N.
- Whether the takeovers launched since 10-27 were mostly distance-only syncs (dispatcher launch comments).
- `Closes #n` behaviour on indirectly merged PRs (P4).
- Cursor Bugbot / Codex cloud role docs (pages not fetched).
