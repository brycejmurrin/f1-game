---
name: steward
description: "Use when you own, pick up or are handed a PR, or a PR or the deploy branch is red, cancelled or conflicting: keep the Plan live, fix the failure, sync, push once per green cycle. Not for: status only → check; opening or landing → ship; picking tests → check-changes."
---

# Driving a PR to green in Apex 26

**This file is the OVERRIDES, not the protocol.** Generic PR-stewardship rules
are right about most things and wrong about the specifics below, each of
which has cost a session before. Everything not listed here: `AGENTS.md`.

Routes: the worker contract (claim, draft PR, land) → `docs/WORKERS.md`. Failed-CI triage → agent `ci-red-triage`. Pre-push validation → `check-changes`. Live `version.json` or
anything on github.io → agent `deploy-research` (the only thing here that reaches it).
Review, hunt or survey findings on the PR → agent `finding-verifier` before you fix any of them.

## Drive to green — the loop

1. Check out the PR's branch. Claims are for issues (docs/WORKERS.md §1); a PR is yours because you opened it or
   were launched on a `needs-owner` PR with `CONTINUE PR #<n>`: start from its Plan and Hand-off block, set `owner:`.
2. Read CI on the current tip: `node tools/ci/ci-watch.mjs --sha <head> --once` (§1 for `cancelled`, §8 for the
   other verdicts), THEN `node tools/ci/needs-sync.mjs <branch>` (two calls). On `stale-red` (the tip moved after the
   run started) sync FIRST (§2) and fix only what is still red: the tip may already carry the fix.
3. Triage a red: agent `ci-red-triage` names the job, test and assertion; its `base:` line says whose it is
   (`already-red-on-base` → §3, not yours to fix).
4. Fix on the branch.
5. Verify at the pre-push floor (AGENTS.md rule 3 → docs/WORKERS.md §3; §6).
6. ONE push per verified batch; refresh the PR body's Plan and Hand-off block.
7. Watch (§7–§9) while CI runs on your head.
8. Gate → ready → `land`: skill `ship` steps 5–6 (§12 lists the overrides). After `land`, docs/WORKERS.md §5 and
   AGENTS.md rule 13 say how long the session stays subscribed and who owns a later red.

## 1. `cancelled`: read the jobs, not the conclusion

Which `cancelled` is benign (the draft/ready dedupe on one `head_sha`) and which
is a timeout is AGENTS.md rule 8. Deploy-branch pushes queue in pages.yml's
`pages-train-*` group (`ci-watch.mjs --sha` says `superseded`). A job at its
`timeout-minutes` cap with zero failures is a real red. List the run's jobs
before deciding; `ci-red-triage` does that and returns the status line.

A PR that ends `cancelled` twice with zero failures:

1. `node tools/ci/ci-watch.mjs --sha <head sha> --once` (exit 2 / `= ci cancelled` =
   newest run per workflow, no failed job, no live sibling).
2. Same head SHA both times → the dedupe or a push over a live run: wait for
   the newest run, do not re-run.
3. The newest run itself `cancelled` → `ci-red-triage` for a job at its cap (a
   real red); check `/proc/loadavg`.
4. Neither → re-run once via `node tools/ci/ci-rerun.mjs <run_id>` (a `ci.yml` `group:` dispatch runs a
   browser group, not the PR's tier); never sync to "refresh" it (§2).

## 2. A base merge is `sync-pr.mjs`, never a hand merge, and only when you must

When to sync is AGENTS.md §Git branch & deploy; `node tools/ci/needs-sync.mjs <branch>`
answers it (`= sync needed: conflict | stale-red | no`) and `sync-pr` refuses `no` (exit 4). The third reason,
which needs-sync cannot see, is the `gate` status's `distance` row (the merge-base is too many game merges behind
the tip; `tools/ci/merge-gate.mjs` holds the limit; `needs-sync` still prints `no` there): on a `distance`
failure run `node tools/ci/sync-pr.mjs <branch> --force-clean-behind --push`, unless the PR is a ready `land` PR:
`land.yml`'s AUTO-SYNC update-branches those on the next train (at most `SYNC_MAX` waiting on CI), so fetch first
and sync by hand only when it has not. Run it as ONE background Bash task with `timeout: 7200000`: its stage
ceilings (`STAGE_TIMEOUT_MS`) add up past the 30-min default, and a killed run resumes with `--resume --from=<stage>`.

    node tools/ci/sync-pr.mjs <branch> --plan   # cached refs only; no conflict proof
    node tools/ci/sync-pr.mjs <branch>          # real merge, pushes nothing, leaves you ON sync-pr-<branch>
    node tools/ci/sync-pr.mjs <branch> --push   # fresh verified sync, when publication is intended

- **Red AND conflicting:** a `stale-red` syncs first; any other red is fixed on the branch first; then sync once
  and ONE push.
- Verify by diff size: a clean merge where gen rewrote nothing and the PR diff is
  prose or generated files only → `--verify=none --push` (CI re-gates the head);
  else the default `--verify=fast` plus `tooling-fast --changed` (a full ladder
  measured 723 s vs 110 s).
- Generated-file conflicts `sync-pr` cures; hand-written ones it aborts and
  hands back. The temp-branch trap and the hand-resolve recipe:
  `check-changes` [`references/sync-pr.md`](../check-changes/references/sync-pr.md).
  After a cure: `npm run gen` (check-changes references/triage.md §Stale generated indexes) then `gen:check`. Record the files
  and resolution as a ticked Plan item with the merge sha.

## 3. A red you did not cause → find out who is on it FIRST

    node tools/ci/pr-board.mjs --json      # open PRs: heads, state, failing jobs, owner

Search open PR titles, branches and the Board issue for the failing test name, and the `deploy:red` label on
the Board issue (docs/WORKERS.md): the first claimant fixes, the rest wait. This **overrides "port the fix now
and push"** (three sessions fixed one bug on 2026-09-18 and the result was a revert).

## 4. Never push to the deploy branch

`claude/f1-game-project-26h3ng` is the only branch that ships, and work lands
there by PR. A deploy is a MERGE of other sessions' work: re-measure on the
merged tree, never force-push. A worker's change lands through the `land` label (§12).

## 5. Do not re-run a browser group to chase a flake

A retry-pass is a red and is quarantined by name, never skipped or widened (AGENTS.md rule 9); a timeout on a busy box measures the machine (rule 8).

## 6. Validate a fix push at the floor; the PR runs the tiers

The local verification floor is docs/WORKERS.md §3 (its one home); the fast tier (`run-ci` on the draft), the full
tier (ready) and the `gate` status prove the rest. Green below never means green above (AGENTS.md rule 3):
`ready-gate.mjs` needs Structural guards green on the tip, so a draft needs `run-ci` (its local
`tooling-fast-ready.sha` stamp has no writer in the repo). Push once per VERIFIED batch: a push over
a live run cancels it, and a killed job runs no `if: always()` step, so its
failures are lost. Ratchets: `.claude/rules/game-code.md`.

## 7. "Live" is an ancestry test, not a build number

- A green PR does not prove Pages. Watch by `head_sha`, one `Monitor` per push (AGENTS.md rule 13 is the home):
  `node tools/ci/ci-watch.mjs --sha <pushed sha> --timeout 30 --failures-only` (`--pages` after a deploy-branch
  push) while CI runs on your head. `pages.yml` gates the tip once and publishes exactly that commit.
- **Live means your commit is an ANCESTOR of the live `apex-sha`** — ask `deploy-research` for it; never
  curl github.io from the main context. PR CI and Pages (`pages.yml`) are separate verdicts;
  the deploy push starts Pages' reusable CI gate, not a separate ship-push CI run.
- After every push list all check runs on the head (ready-state jobs included) and read every failed log;
  on red name the exact test, assertion and lane. `deploy.mjs --train` prints the last ci/pages conclusions
  and the nightly rota BY JOB (a `cancelled` run can hide a FAILED one; the rota covers the specs `select-specs` never picks).

## 8. CI wake: `running` with 0 failed is not green

On every CI `system_notification` or native "N checks failing" banner, re-read
the **current** tip — not the notification commit (two commands):

    gh pr view <N> --json headRefOid -q .headRefOid   # no gh: pr-board.mjs --pr <N>, or MCP pull_request_read
    node tools/ci/ci-watch.mjs --sha <that sha> --once

- `= ci failed` → triage → fix → push → re-subscribe (never "stale" because the
  notif SHA ≠ tip).
- `= ci running` → do **not** claim stale or fixed; stay subscribed (no timer,
  AGENTS.md rule 13). **"0 failed" while running is not green.**
- `= ci hollow` → only the draft skip skeleton ran, not verification; report
  it and use the authorized draft CI route when actual CI is needed.
- `= ci none` / `unknown` → no run observed / API evidence unavailable,
  respectively; neither proves a pass. `superseded` → follow the named current
  head or replacement run before concluding anything about that tree.
- `= ci blocked` → the PR conflicts, so GitHub starts no run: `sync-pr.mjs <branch>`, then push.
- `= ci none-yet` → no run 10 min after the push: on a draft, add `run-ci`; else read its `mergeable_state`.
- `= ci cancelled-external` → someone cancelled it (not a timeout): re-run once (§1 step 4) or re-push.
- `= ci timeout` → the WATCH gave up, not CI: re-read with `--once`.
- `gate` is a COMMIT STATUS posted by `land.yml`, not a workflow run, so ci-watch never shows it: read it with
  `gh api repos/<owner>/<repo>/commits/<sha>/statuses` (the newest `context: gate`; its description and the linked
  run's summary name the failing merge-gate row).
- Only "stale / no action" when `= ci passed` on that same `headRefOid`, or a
  proven draft→ready cancel with a live sibling still 0-failed on the same SHA.

Ending the turn on mid-run `0 failed` is how tip reds sit until a human clicks
Fix with Agent.

## 9. Host-neutral watch

Ownership is host-neutral: an issue's claim comment plus `claimed`, a PR's Hand-off `owner:` line (docs/WORKERS.md).
Watch per host (docs/WORKERS.md §4 and §Per vendor): Claude Code `subscribe_pr_activity` while CI runs on your
head; a Cursor run ends at ready and the dispatcher owns reds after it. Without a subscription:
`references/host-watch.md`. Record missing capabilities as unverified.

## 10. Sweeping many PRs is not a session's job

The dispatcher re-owns silent PRs (`needs-owner`, one takeover) and `land.yml` arms auto-merge (docs/WORKERS.md
§The dispatcher). A session reads `node tools/ci/pr-board.mjs --json` (read-only; exit 3 = no token) to find who
owns a red (§3); it does not sweep, disarm or take over another lane's PR.

## 11. Browser runs, if a fix needs one

Via `node tools/ci/test-bg.mjs <group>` only; AGENTS.md rules 5, 6 and 10 (one run, `--stop`, never in a subagent).

## 12. Draft → ready → `land`: the overrides (the steps live in skill `ship`)

These broke on 2026-10-26:

1. **Push** with `git push -u origin <branch>` alone (a piped push went to the permission classifier and was
   denied; the same push bare passed). Commit first in two calls (AGENTS.md rule 12).
2. **Mergeable first**: a conflicting head gets no CI on the flip (AGENTS.md rule 13); `needs-sync.mjs`, then
   `sync-pr.mjs`, then flip.
3. **The receipt**: the hooks demand `ready-gate.mjs --pr <n>`'s receipt before the flip, and it refuses a PR that
   is already ready. A veto is the `hold` label, never body wording.
