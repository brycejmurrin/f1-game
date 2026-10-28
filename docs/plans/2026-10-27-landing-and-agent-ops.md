# Landing pipeline and agent operations

Plan, 2026-10-27 (Pacific). Bryce's asks, typed in this session: "I feel like we have so many open prs and drafts and a
lot are out of date we need a way to fix this", then "How can we improve this process so we combine prs or do a better
review process? Search best practices all over the web", then "We can change our rules consider all options", then
"Begin writing plan, also have researchers on how to streamline cleaning up and hooks and which models to use when".
Status: DRAFT. Phase 0 is in flight; §4's three rule changes are decided (2026-10-28); Phase 1 and §5 are proposals.

Evidence: a board snapshot of all open PRs (`node tools/ci/pr-board.mjs --json`) plus each head's `gate` status, git
history of the deploy branch, and three research reports built from eleven web-research fact sheets (sources dated,
TinyFish and web search): [PR landing](../notes/agent-ops-research-2026-10-27/pr-landing.md),
[skill design](../notes/agent-ops-research-2026-10-27/skill-design.md) and
[hooks, models and cleanup](../notes/agent-ops-research-2026-10-27/hooks-models-cleanup.md).

## 1. What is wrong (measured 2026-10-27, ~16:30)

1. **The queue only grows.** 70 open PRs, 42 of them labelled `land`. The deploy branch merged ~3.5 PRs/h (~2 game
   merges/h) between 09:40 and 16:13; PRs arrived at ~7/h (#4003–#4053 in about seven hours). That is about +84 PRs a
   day. By Little's law, holding 70 open at 3.5 merges/h means a ~20 h average wait; holding ~20 means ~6 h.
   A serial queue that tests every PR on the exact tip it lands on tops out at 60/T merges/h, ~1.5/h with a 40 min
   tier, so at 3.5/h most landings are already combinations nobody tested together (item 4 below).
2. **Most of the queue was refused only on distance and never looked at again.** 33 of the 42 `land` PRs had green CI
   and a closed Plan, and a `gate` of failure on `distance` alone (9–20 game merges behind; the limit was 2 until #4046
   made it 6). `land.yml`'s train re-gate skips heads whose `gate` is already failure, so nothing re-synced them.
3. **Nothing landed for ~30 min because the tip itself was broken.** #4020 and #3982 each added a js/ module and
   landed 3.5 min apart. `docs/agent-index.json` stores each module's position as a sequential `order`, so together
   they made the committed file stale on the tip. `gen:check` then failed on every PR's merge result, and a merge-gate
   bug turned that refusal into "merge-gate error, will retry" (an empty tip reached the distance row), so it read as
   a transient. Fixed by #4054.
4. **The gate can pass a PR against a tip that has already moved.** #3982 had auto-merge armed since 23:04Z; its
   `gate` turned success at 23:12:37Z for tip `bfd8f509`, but #4020 had moved the tip to `834754fa` at 23:10:07Z.
   GitHub merged #3982 the moment `gate` went green. `arm` re-reads the tip; `post` does not, and an earlier arm
   persists. This is the "two PRs pass alone but break together" hole.
5. **Smaller frictions.** `trusted-rows` fetches every branch and archive tag (it hung on checkout twice for #4013);
   the dispatcher took batch workers' PRs for orphans (#4051); a stale tree ratchet delta re-reddened three PRs every
   time the tip gained a pin (#4053); Claude Code Review starts at the ready flip, in the same minute as `land`, so its
   findings can arrive after auto-merge is armed; the skill-hint hook routed this very question to `lighting-tuner`.

## 2. Phase 0 — in flight (no rule change)

| PR | Change | State |
|---|---|---|
| #4046 | `MAX_BEHIND` 2 → 6 | merged |
| #4017 | `land.yml` re-gates at once when only the tip moved (`retry`) | merged |
| #4054 | regenerate `docs/agent-index.json` on the tip | merged |
| #4051 | dispatcher: a PR is owned by the live worker its hand-off or closed issue names | `land` |
| #4053 | ratchets: a fragment re-snap drops a stale negative tree delta | `land` |
| #4058 | merge-gate: show the real gen/conflict refusal; no distance row for PRs that touch no game path | draft |
| #4060 | `land.yml`: throttled auto-sync (update-branch, ≤ 3 per run, `priority` first) for distance-only refusals; `post` refuses success when the tip moved since the gate measured it | draft |
| #4057 | dispatcher: no new issue workers while ≥ 15 PRs wait to land (takeovers and deploy-red fixers still run) | draft |

## 3. Phase 1 — next, within today's rules

1. **Batch landing through the existing gate (combine PRs at land time).** `land.yml` builds one throw-away batch
   branch by merging up to N gate-ready `land` PRs onto the tip in a fixed order (`priority` first, then oldest),
   runs the gate rows and CI's full tier on it once, and on green posts `gate` success on each member's head and
   lets each PR's own auto-merge land it in that order: every original still merges with its own merge commit, so
   attribution, `Closes #n` and "live = ancestor of `apex-sha`" are untouched, and the tip after the last member is
   the tree the batch tested (shunt's "release by status" design). On red, split the batch in half and retry
   (bors/Mergify bisection); a PR that fails alone goes back to its owner. Start with N = 4, docs/tools-only first.
   Sizing (a toy model, not data): at a 2–5 % chance p that a PR green alone fails in a batch, two lanes of four land
   6–9 PRs/h at under half a full-tier run per merge; at 10 % or worse no batching keeps up. The account has 40
   concurrent jobs (Pro) and one full tier fans out to ~20, so two batch lanes is the ceiling and per-PR CI should be
   slimmed so the slots go to batches. The repo's own proxy for p: trains went red 13.3 % of the time when a merge
   landed after a PR's green run vs 4.3 % otherwise (`tools/ci/merge-gate.mjs` header). Measure p first.
   A cheaper first step under the same rules: merge-commit rollup PRs of low-risk (docs/tools/tests-only) PRs through
   the normal `gate`, Rust-style; GitHub marks each original merged when the rollup lands.
2. **Only full-tier-green PRs enter a batch.** A batch member must already have the full tier green on its own head
   and no quarantine-worthy flake; this keeps the in-batch failure rate low enough for batching to pay.
3. **Producer caps, not just a queue cap.** Beyond the dispatcher pause: a per-lane cap on open PRs and on new PRs per
   hour (Renovate defaults: 10 open, 2/h; Dependabot: 5 open), so lanes finish before they start.
4. **Review before land, risk-tiered.**
   - Ready-flip earlier and add `land` only after Claude Code Review has posted on that head; add a `review` row to
     the gate that reads the check run's `bughunter-severity` line (fail when `normal` > 0; no line = no verdict).
   - Tiers by path: docs/tools/tests-only → gate rows only; game paths → review row required; renderer, physics and
     netcode paths → review row plus the existing device/census evidence.
   - Keep `REVIEW.md` on the base branch (the reviewer reads the base, so a PR cannot rewrite its own rules).
5. **Generated files that do not churn.** Replace order-dependent fields (agent-index `order`) with a stable key or
   derive position at read time; audit every `npm run gen` output for the same insertion churn.
6. **`land.yml` fetch.** `trusted-rows` and `land-gate` fetch only the deploy branch and the PR head, not every ref.
7. **Duplicate and superseded PRs, not idle ones.** No PR was idle more than 6.4 h on 2026-10-27 (the dispatcher
   re-owns a PR silent for 2 h), so an idle-based stale bot would do nothing. Report two open PRs that close the same
   issue, and lint an agent's `Closes #n` against the issue its lane claimed (it closes real issues here: the default
   branch is the deploy branch).
8. **Skill routing, eval first.** Add should-match-nothing queries and queries taken from real session transcripts
   to the routing set (none of its 341 queries expects "no skill", so false positives are invisible); A/B the hint
   hook's `targeted` / `generic` / `off` modes on that set and keep the winner; make the routing A/B a required check
   for any PR that edits a description or folds a skill. The last description trim (12,586 → 10,213 chars) shipped
   with no eval, and routing then measured 84 % vs 99 % earlier (different samples). Not recommended here:
   `paths:` scoping (measured worse in this repo, 182/216 vs 214/216) and `disable-model-invocation` on `ship`/`check`
   (Bryce triggers them by typing). Detail: [skill-design report](../notes/agent-ops-research-2026-10-27/skill-design.md).

## 4. Phase 2 — options that change a rule (Bryce decides)

| Option | Gains | Costs | Recommendation |
|---|---|---|---|
| A. Generate derived files at build/deploy time instead of committing them (`pages.yml` already publishes an Actions artifact) | Removes gen drift on the tip and most gen-only syncs | A checkout needs `npm run gen` before it runs; served files differ from committed ones, so `version.json` must name the source commit; rule 11 changes | Yes, in stages: served files first, `package.json` test scripts via one runner, changelog at release |
| B. Bot fast-forward landing (bors-style): a bot builds merge(tip, batch), gates it, then fast-forwards the deploy branch to that exact commit | The commit that ships is the commit CI tested | The bot needs a ruleset bypass; "only PRs land" changes | After the rollup (Phase 1.1) if the rollup still leaves tip reds |
| C. Move the repo into a free GitHub organization | GitHub's native merge queue (batches, `merge_group`), team review rules | GitHub does not redirect Pages after a transfer: the site URL, the installed iPhone PWA, the service-worker scope and on-device saves would all reset (`js/career/career-backup.js` exports and imports saves, but each player must do it by hand); a free org has 20 concurrent jobs, half of today's 40, and the native queue runs one full build per PR | No |
| D. Squash merges | One commit per PR | Breaks "live = ancestor of `apex-sha`"; originals close as unmerged; no help with semantic conflicts | No |
| E. Stacked PRs (GitHub stacks, Graphite) | Smaller review units for layered work | No auto-merge on stacks; needs rebase/force-push; does not fit independent agents | No |
| F. A separate GitHub App identity for agents | Makes a required human/CODEOWNERS approval possible (an author can never approve their own PR) | Setup, token rotation | Only if Bryce wants a human review step on high-risk paths |
| G. Mergify (hosted queue, $0 open-source plan, works on a user-owned public repo) | Batching, parallel checks and bisection without writing them | A third-party app with write access; whether the free plan includes batching is disputed (its listing says "all features"); its config would partly replace `land.yml` | Try only if Phase 1.1 stalls; check batching on the free plan first |

**Decided 2026-10-28** (Bryce, answering three questions in this session):
- Generated files: "Build at deploy" — option A. Stop committing the generated files the site serves and build them
  in `pages.yml`; a checkout runs `npm run gen` first (SessionStart already installs); AGENTS.md rule 11 changes.
- Commit hook: "Yes, split it" — `.githooks/pre-commit` becomes the one owner of `test:guards` for every host;
  `bash-guard.sh` keeps only fast fail-closed refusals; hooks, settings and AGENTS.md rule 12 change in one rules PR.
- Review: "Bot review gates, you label" — the gate gains a `review` row: it waits for Claude Code Review on the head
  and refuses when its `bughunter-severity` line reports any Important finding (no line = pending); a PR touching a
  high-risk path (physics, `js/game.js`, `.github/workflows/`, `tools/ci/`, `.claude/hooks/`) also needs a label Bryce
  added, checked by actor in the timeline.
- Not chosen: moving to an organization, squash/rebase merges, stacked PRs (§4 table: No).

## 5. Agent operations

**Hooks** (fact sheet in; vendor docs read 2026-10-27).
- A hook is for a rule with no exceptions; a preference belongs in a skill or nowhere. A pattern ban belongs in
  `permissions.deny`, which cannot crash. Claude Code hooks fail OPEN on a crash, a missing script or a timeout unless
  the handler sets `onFailure: "block"` (v2.1.295) or the script turns its own errors into exit 2.
- `bash-guard.sh` starts on every Bash call and runs `test:guards` (50–110 s) inside the hook before each commit,
  under a 360 s timeout. The same suite already lives in `.githooks/pre-commit` (it skips itself when `CLAUDECODE=1`)
  and shares the verdict file `artifacts/pre-commit-guards.ok`. Make the git hook the one owner for every host and
  shrink `bash-guard.sh` to fast fail-closed refusals (force push, PID kill, run cancel, deploy-branch push,
  `--no-verify`) with a ≤ 30 s timeout. `launch-gate.py` fails open today: make it, and every guard, turn its own
  errors into exit 2, with a fixture test per guard.
- Keep `protect-files`, the refusal half of `bash-guard`, and the merge/MCP guards. Put every other hook to the test
  "name a decision it changed this week": `lsp-hint`, `context-cap` (runs on every tool call), `ui-fixer-uncommitted`,
  `launch-page`, `memory-sync` and the two Stop hooks.
- On Codex the hooks are guardrails, not a boundary (unsupported fields fail open, no `ask`, hosted tools unhooked).

**Models** (fact sheet in; prices and IDs checked against Anthropic's docs 2026-10-27).
- Dispatcher workers already launch on Sonnet 5.5 (`tools/ci/dispatch.json`); hand-launched sessions, the
  orchestrator and `model: inherit` subagents run on Opus 5.5. Benchmarks disagree on which is cheaper per task (an
  independent Terminal-Bench run: Opus $13.20 vs Sonnet $16.51, Sonnet spending about twice the tokens), so A/B the
  two on cost per merged PR, after checking each session's served model, before changing policy.
- Effort, not model, is the main dial: implement at `medium`, verify and review at `high`; avoid `max` (it drifts out
  of scope). A global `CLAUDE_CODE_EFFORT_LEVEL` overrides every subagent's `effort:`, so do not set one fleet-wide.
- Exploration currently bills at the parent's model: Claude Code's built-in Explore subagent inherits it. Define a
  project `Explore` (and other read-only search agents) with `model: haiku` (Haiku 5.5: $0.10/$0.50 per MTok under
  100K tokens). Measure before widening: delegation saved money in Anthropic's study only for routine long-tail work.
- Cost per merged PR tracks PR size more than model: keep agent PRs small (> 1,000-line PRs were flagged in review
  36 points more often than < 300-line ones).

**Cleanup** (fact sheet in). Cleanup as code, the Kubernetes triage-robot shape: scheduled jobs, each a query plus
an idle threshold, at most ~10 items per run, dry-run unless `--confirm`, and an opt-out label.
- Branches: "automatically delete head branches" is on but only covers merged PRs. Add a nightly cron to
  `prune-branches.yml` that applies only its zero-loss verdicts (merged, absorbed) and reports the rest, and archive +
  delete a branch when its agent PR closes unmerged. A ruleset over `cursor/*` would silently block both ("Restrict
  deletions" is ticked by default).
- PRs: no idle-based stale bot (see Phase 1.7); REPORT, do not auto-close, two open PRs that close the same issue
  (no tool closes duplicates safely); lint agent PR bodies for closing keywords that name the wrong issue.
- Branches today: 358 on the remote, 282 with no open PR, 71 `archive/*` tags; `prune-branches.yml` runs only by
  hand. Protect `archive/*` tags with a ruleset.
- Sessions: the platform does not archive cloud sessions on its own, so the dispatcher's archive pass stays; finished
  children are archived by their parent at hand-back.
- Worktrees: Claude Code's sweep removes only clean, pushed subagent worktrees older than 30 days; add a per-container
  reaper that removes a worktree whose branch is merged or closed (saving a patch first when it is dirty).
- Actions: delete a PR's caches when it closes (GitHub's documented workflow). Since 2026-10-01 run retention also
  expires checks and statuses, so tools reading old runs must expect gaps. Sessions cannot reach the Actions API
  (403), so this cleanup runs inside Actions.

## 6. How we will know it worked

Tracked on the Board issue each dispatcher cycle: open PRs and `land` queue depth (target ≤ 20), merges per hour,
median open→merge time for a `land` PR, `gate` refusals by row, minutes the tip fails `gen:check` or Pages, and CI
minutes per merged PR (rollups should lower it).

## 7. Status and hand-off (live; updated 2026-10-28 ~04:40 UTC)

Owner: Claude Code session `session_01Ap97PUkoACNwXY4fpfa4ya`. Bryce ended every other agent session on 2026-10-28,
but Cursor agents kept pushing (#4033 #4037 #4041 #4048 #4073 #4074 #4075, new #4066): a PR whose Hand-off names a
`cursor:` owner or that a Cursor agent pushed within the hour is theirs; this session stays off it. Both dispatcher
scheduled wake-ups stay paused.

Merged from this plan: #4046, #4017, #4054, #4053, #4058, #4057, #4051, #4060 (stale-tip guard + throttled AUTO-SYNC),
#4061, #4064 (the red-tip fix). Pages trains are green again from 4294 (first train with #4064) on.

Decided by Bryce on 2026-10-28 (in this session):
- `priority` is a queue jump, not a speed-up: at most ~3 PRs at once, added only after the current ones merge (the
  tie-break is oldest-first, so a new `priority` on an older PR jumps the fixes in flight).
- Tree ratchet raises: stale negative tree deltas were re-based on eight branches (granted "Raise size ceiling");
  genuine `assertPinsAll` growth is raised per PR by its exact size, quoting the grant ("Raise per PR, you grant").
- The 12 refactor drafts (#4038–#4056, #4055, #4056) wait until the land queue drains, then go one at a time,
  oldest first, each synced onto a fresh tip.
- Push guard: `land.yml`'s AUTO-SYNC merge commits as Bryce (LAND_TOKEN), so `foreign_push.py` flags every
  auto-synced branch; Bryce approved `APEX_FOREIGN_PUSH_OK=1` for #3993 and #3964 only. Open: teach the hook that an
  AUTO-SYNC merge of the deploy branch is not foreign (a hook edit; needs Bryce's yes).

Measured: AUTO-SYNC works (land run 40628425236 listed every distance-only refusal) but syncs at most SYNC_MAX=3
while others wait on CI, so ~15 `land` PRs refused on `distance` drain a few per train. Gate rows that read `plan=FAIL`
were stale Plan items (`now:` lines for finished work); tick them with evidence and the next re-gate clears.

Queue (2026-10-28 04:40): 54 open. Merged this round: #3963 #3989 #3969 #3992 #4047 #4003 #3967 #3950. Re-synced or
fixed and waiting on CI/gate: #3962 #3964 #3970 #3981 #3985 #3987 #3988 #3993 #3998 #4010 #4011 #4027; `land` added
to #4028 #4035 #4036 (real-GPU Metal job green or no render files). Needs GPU evidence before `land`: #4030 #4032
(js/render, no Metal job ran). #4045 waits on #3998/#4042; #4050 confirm the plugin keys.

Process drafts of this session: #4063 commit-hook split and #4062 deploy-time generation (both partial; their wip
patches and Plans say what remains; #4062 needs Bryce's yes on `package.json` `prepare` and `session-start.sh`).
Review gate row: not begun.

Next, in order: keep the land queue moving (tick stale Plan items, sync conflicts, per-PR raises); #4030/#4032 GPU
evidence; the foreign-push hook fix if Bryce says yes; then the refactor drafts one at a time; then the review gate
row and Phase 1 batch landing. Research reports: [docs/notes/agent-ops-research-2026-10-27/](../notes/agent-ops-research-2026-10-27/pr-landing.md).
