# Landing pipeline and agent operations

Plan, 2026-10-27 (Pacific). Bryce's asks, typed in this session: "I feel like we have so many open prs and drafts and a
lot are out of date we need a way to fix this", then "How can we improve this process so we combine prs or do a better
review process? Search best practices all over the web", then "We can change our rules consider all options", then
"Begin writing plan, also have researchers on how to streamline cleaning up and hooks and which models to use when".
Status: DRAFT. Phase 0 is in flight; Phases 1–2 are proposals; §5's cleanup part waits on one research report.

Evidence: a board snapshot of all open PRs (`node tools/ci/pr-board.mjs --json`) plus each head's `gate` status, git
history of the deploy branch, and four web-research fact sheets (merge trains, stacked/combined PRs, freshness and
semantic conflicts, review at scale), each citing its sources with dates. The fact sheets and the final report get
committed under `docs/notes/` when the last one lands.

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
| worker | `land.yml`: throttled auto-sync (update-branch, ≤ 3 per run, `priority` first) for distance-only refusals; `post` refuses success when the tip moved since the gate measured it | draft |
| #4057 | dispatcher: no new issue workers while ≥ 15 PRs wait to land (takeovers and deploy-red fixers still run) | draft |

## 3. Phase 1 — next, within today's rules

1. **Batch landing through the existing gate (combine PRs at land time).** `land.yml` builds one throw-away batch
   branch by merging up to N gate-ready `land` PRs onto the tip in a fixed order (`priority` first, then oldest),
   runs the gate rows and CI's full tier on it once, and on green posts `gate` success on each member's head and
   lets each PR's own auto-merge land it in that order: every original still merges with its own merge commit, so
   attribution, `Closes #n` and "live = ancestor of `apex-sha`" are untouched, and the tip after the last member is
   the tree the batch tested (shunt's "release by status" design). On red, split the batch in half and retry
   (bors/Mergify bisection); a PR that fails alone goes back to its owner. Start with N = 4, docs/tools-only first.
   Sizing (a model, not data): at a 2–5 % chance that a PR green alone fails in a batch, 2–3 parallel batches of 3–6
   land 7–15 PRs/h at 0.3–0.5 full CI runs per merge, inside the free plan's 20 concurrent jobs; at 10 % or worse no
   batching keeps up, so step 2 (full tier green before `land`, flakes quarantined) matters more than N.
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
7. **Stale and duplicate PRs.** Close a draft with no push or comment for 48 h and no live owner (branch archived as a
   tag, the existing prune pattern); when two open PRs close the same issue, keep the newer and close the older as
   superseded with a `superseded-by #n` comment the dispatcher follows.
8. **Skill routing.** Turn the keyword hint hook into the generic "check the skill list, or pick none" form (or off),
   chosen by an A/B of its existing modes on real prompts with false positives counted; mark operator workflows
   (`ship`, `check`, `handoff`) `disable-model-invocation`; scope subsystem skills with `paths:`; gate skill changes
   on a trigger eval (`claude plugin eval`). Detail: the skill-design report.

## 4. Phase 2 — options that change a rule (Bryce decides)

| Option | Gains | Costs | Recommendation |
|---|---|---|---|
| A. Generate derived files at build/deploy time instead of committing them (Pages from an Actions artifact) | Removes gen drift on the tip and most gen-only syncs | A checkout needs `npm run gen` before it runs; served files differ from committed ones, so `version.json` must name the source commit; rule 11 changes | Yes, in stages: served files first, `package.json` test scripts via one runner, changelog at release |
| B. Bot fast-forward landing (bors-style): a bot builds merge(tip, batch), gates it, then fast-forwards the deploy branch to that exact commit | The commit that ships is the commit CI tested | The bot needs a ruleset bypass; "only PRs land" changes | After the rollup (Phase 1.1) if the rollup still leaves tip reds |
| C. Move the repo into a free GitHub organization | GitHub's native merge queue (batches, `merge_group`), team review rules | GitHub does not redirect Pages after a transfer: the site URL, the installed iPhone PWA, the service-worker scope and on-device saves would all reset; CI must also run on `merge_group` | Not now. If ever, put Pages on a custom domain first |
| D. Squash merges | One commit per PR | Breaks "live = ancestor of `apex-sha`"; originals close as unmerged; no help with semantic conflicts | No |
| E. Stacked PRs (GitHub stacks, Graphite) | Smaller review units for layered work | No auto-merge on stacks; needs rebase/force-push; does not fit independent agents | No |
| F. A separate GitHub App identity for agents | Makes a required human/CODEOWNERS approval possible (an author can never approve their own PR) | Setup, token rotation | Only if Bryce wants a human review step on high-risk paths |
| G. Mergify (hosted queue, $0 open-source plan, works on a user-owned public repo) | Batching, parallel checks and bisection without writing them | A third-party app with write access; whether the free plan includes batching is disputed (its listing says "all features"); its config would partly replace `land.yml` | Try only if Phase 1.1 stalls; check batching on the free plan first |

## 5. Agent operations

**Hooks** (fact sheet in; vendor docs read 2026-10-27).
- A hook is for a rule with no exceptions; a preference belongs in a skill or nowhere. A pattern ban belongs in
  `permissions.deny`, which cannot crash. Claude Code hooks fail OPEN on a crash, a missing script or a timeout unless
  the handler sets `onFailure: "block"` (v2.1.295) or the script turns its own errors into exit 2.
- `bash-guard.sh` starts on every Bash call and runs the ~50 s guards inside the hook before each commit. Split it: a
  fast fail-closed refusal guard (force push, PID kill, run cancel, deploy-branch push) gated by the handler `if`
  filter, and the guards as a marker file the test script writes ("block at submit") or git's own pre-commit hook.
- Keep `protect-files`, the refusal half of `bash-guard`, and the merge/MCP guards. Put every other hook to the test
  "name a decision it changed this week": `lsp-hint`, `context-cap` (runs on every tool call), `ui-fixer-uncommitted`,
  `launch-page`, `memory-sync` and the two Stop hooks.
- On Codex the hooks are guardrails, not a boundary (unsupported fields fail open, no `ask`, hosted tools unhooked).

**Models** (fact sheet in; prices and IDs checked against Anthropic's docs 2026-10-27).
- Keep Opus 5.5 as the default for workers and the orchestrator: on an independent Terminal-Bench run it cost less
  per task than Sonnet 5.5 ($13.20 vs $16.51; Sonnet spent about twice the tokens), and Anthropic's own guidance is
  to tune effort before switching models.
- Effort, not model, is the main dial: implement at `medium`, verify and review at `high`; avoid `max` (it drifts out
  of scope). A global `CLAUDE_CODE_EFFORT_LEVEL` overrides every subagent's `effort:`, so do not set one fleet-wide.
- Exploration currently bills at the parent's model: Claude Code's built-in Explore subagent inherits it. Define a
  project `Explore` (and other read-only search agents) with `model: haiku` (Haiku 5.5: $0.10/$0.50 per MTok under
  100K tokens). Measure before widening: delegation saved money in Anthropic's study only for routine long-tail work.
- Cost per merged PR tracks PR size more than model: keep agent PRs small (> 1,000-line PRs were flagged in review
  36 points more often than < 300-line ones).

**Cleanup** (fact sheet running; filled in when it lands): sessions, worktrees, branches, PRs, labels and artifacts
cleaned by scheduled, dry-run-first automation instead of manual sweeps.

## 6. How we will know it worked

Tracked on the Board issue each dispatcher cycle: open PRs and `land` queue depth (target ≤ 20), merges per hour,
median open→merge time for a `land` PR, `gate` refusals by row, minutes the tip fails `gen:check` or Pages, and CI
minutes per merged PR (rollups should lower it).
