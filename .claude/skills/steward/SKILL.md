---
name: steward
description: "Use when you own, pick up or are handed a PR, or a PR or the deploy branch is red, cancelled, conflicting or its CI watch expired: Plan, failing test, sync-pr, push once per green cycle."
---

# Driving a PR to green in Apex 26

**This file is the OVERRIDES, not the protocol.** Generic PR-stewardship rules
are right about most things and wrong about the specifics below, each of
which has cost a session before. Everything not listed here: `AGENTS.md`.

Routes: owning PRs (claim → ready → report, spawn prompt) → [`references/ownership.md`](references/ownership.md). A red `ci.yml` / `pages.yml` run → agent `ci-red-triage` (read-only, returns
the status line). Pre-push validation → `check-changes`. Live `version.json` or
anything on github.io → agent `deploy-research` (the only thing here that reaches it).
Review, hunt or survey findings on the PR → agent `finding-verifier` before you fix any of them.

## Drive to green — the loop

1. Check out the PR's branch, then claim it: `node tools/ci/who-is-on-it.mjs`, then `--claim "<PR#> <text>"` (§3: someone already on it → stand down).
2. Read CI on the current tip: `node tools/ci/ci-watch.mjs --sha <head> --once` (§1 for `cancelled`, §8 for `running`).
3. Triage a red: agent `ci-red-triage` names the job, test and assertion.
4. Fix on the branch; sync only when §2 says you must.
5. Gate: `node tools/ci/deploy.mjs --gate-only` (§6).
6. ONE push per verified batch; refresh the PR body's Plan and Status.
7. Draft → ready only when `node tools/ci/ready-gate.mjs --pr <n>` exits 0 (no ready cap).
8. Watch (§7, §9) until `= ci passed`; then `who-is-on-it.mjs --release`.

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
4. Neither → re-dispatch `ci.yml` once (`group: <name>`); never sync to
   "refresh" it (§2). Re-run only via `tools/ci/ci-rerun.mjs <run_id>`.

## 2. A base merge is `sync-pr.mjs`, never a hand merge, and only when you must

When to sync is AGENTS.md §Git branch & deploy; `node tools/ci/needs-sync.mjs <branch>`
answers it (`= sync needed: conflict | stale-red | no`) and `sync-pr` refuses `no`.

    node tools/ci/sync-pr.mjs <branch> --plan   # cached refs only; no conflict proof
    node tools/ci/sync-pr.mjs <branch>          # real merge, pushes nothing, leaves you ON sync-pr-<branch>
    node tools/ci/sync-pr.mjs <branch> --push   # fresh verified sync, when publication is intended

- **Red AND conflicting:** fix the red on the branch first, sync once, then ONE push.
- Verify by diff size: a clean merge where gen rewrote nothing and the PR diff is
  prose or generated files only → `--verify=none --push` (CI re-gates the head);
  else the default `--verify=fast` plus `tooling-fast --changed` (a full ladder
  measured 723 s vs 110 s).
- Generated-file conflicts `sync-pr` cures; hand-written ones it aborts and
  hands back. The temp-branch trap and the hand-resolve recipe:
  `check-changes` [`references/sync-pr.md`](../check-changes/references/sync-pr.md).
  Record the files and resolution as a ticked Plan item with the merge sha.

## 3. A red you did not cause → find out who is on it FIRST

    node tools/ci/who-is-on-it.mjs                  # pushes, paths, live claims
    node tools/ci/who-is-on-it.mjs --claim "<text>" # before you start
    node tools/ci/who-is-on-it.mjs --release        # after

Every session's PR lands on the same deploy branch, so one red there is seen
by all at once. **This overrides "port the fix now and push":** a fix already pushed, a
live claim, or a live host session on it means STAND DOWN and say so. Three
sessions fixed one bug on 2026-09-18 and the result was a revert
(`docs/notes/SHARED-BRANCH-COORDINATION.md`). Also search open PR titles/branches for the failing test name: first claimant fixes, the rest wait.

## 4. Never push to the deploy branch

`claude/f1-game-project-26h3ng` is the only branch that ships, and work lands
there by PR. A deploy is a MERGE of other sessions' work: re-measure on the
merged tree, never force-push. `node tools/ci/deploy.mjs` is the whole protocol.

## 5. Do not re-run a browser group to chase a flake

A retry-pass is a red and is quarantined by name, never skipped or widened (AGENTS.md rule 9); a timeout on a busy box measures the machine (rule 8).

## 6. Validate a fix push with the GATE, not the edit-loop check

    node tools/ci/deploy.mjs --gate-only     # pushes nothing; a dirty tree is fine

Green below never means green above (AGENTS.md rule 3; counts in
`docs/notes/PREPUSH-GATE-LADDER.md`). Push once per VERIFIED batch: a push over
a live run cancels it, and a killed job runs no `if: always()` step, so its
failures are lost. A deliberate ratchet raise is part of a fix: AGENTS.md §Critical conventions.

## 7. "Live" is an ancestry test, not a build number

- A green PR does not prove Pages. Poll by `head_sha`: `node tools/ci/ci-watch.mjs --sha <sha> [--pages]`
  under a `Monitor` (AGENTS.md rule 12); `pages.yml` gates the tip once and publishes exactly that commit.
- **Live means your commit is an ANCESTOR of the live `apex-sha`** — ask `deploy-research` for it; never
  curl github.io from the main context. PR CI, ship-push CI and Pages (`pages.yml`, workflow id `295002043`) are separate verdicts.
- After every push list all check runs on the head (ready-state jobs included) and read every failed log;
  on red name the exact test, assertion and lane. `deploy.mjs --train` prints the last ci/pages conclusions
  and the nightly rota BY JOB (a `cancelled` run can hide a FAILED one; the rota covers the specs `select-specs` never picks).

## 8. CI wake: `running` with 0 failed is not green

On every CI `system_notification` or native "N checks failing" banner, re-read
the **current** tip — not the notification commit (two commands):

    gh pr view <N> --json headRefOid -q .headRefOid
    node tools/ci/ci-watch.mjs --sha <that sha> --once

- `= ci failed` → triage → fix → push → re-subscribe (never "stale" because the
  notif SHA ≠ tip).
- `= ci running` → do **not** claim stale or fixed; stay subscribed or re-arm a
  ≤15m once-timer. **"0 failed" while running is not green.**
- Only "stale / no action" when `= ci passed` on that same `headRefOid`, or a
  proven draft→ready cancel with a live sibling still 0-failed on the same SHA.

Ending the turn on mid-run `0 failed` is how tip reds sit until a human clicks
Fix with Agent.

## 9. Host-neutral watch and claims

Use `--session <unique-id>` with `who-is-on-it.mjs --claim/--release` on hosts without a Claude session variable.
Subscribe with the host's own tool: Claude Code `subscribe_pr_activity`, Cursor `subscribe_github_ci` +
`subscribe_github_pr`; never call a name the host does not list (`agent-fleet` `references/comms.md`). Keep one timer beside it
(`send_later` / `subscribe_timer`) and read CI on every wake: the subscription can drop `check_run` completions. Without
subscription or timers: `references/host-watch.md`. Record missing capabilities as unverified.

## 10. Browser runs, if a fix needs one

Via `node tools/ci/test-bg.mjs <group>` only; AGENTS.md rules 5, 6 and 10 (one run, `--stop`, never in a subagent).
