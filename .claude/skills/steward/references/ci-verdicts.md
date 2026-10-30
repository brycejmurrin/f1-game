# Reading CI after a push or a wake

Read when a CI notification or "N checks failing" banner arrives, `ci-watch` prints a verdict other than
`passed`/`failed`, or you need the `gate` status or a "live?" answer.

## Re-read the current tip

On every CI `system_notification` or native "N checks failing" banner, re-read the **current** tip, not the
notification commit (two commands):

    gh api repos/brycejmurrin/f1-game/pulls/<N> -q .head.sha   # no gh: pr-board.mjs --pr <N>, or MCP pull_request_read
    node tools/ci/ci-watch.mjs --sha <that sha> --once

After every push list all check runs on the head (ready-state jobs included) and read every failed log; on red name
the exact test, assertion and lane. `deploy.mjs --train` prints the last ci/pages conclusions and the nightly rota BY
JOB (a `cancelled` run can hide a FAILED one; the rota covers the specs `select-specs` never picks).

## Verdicts

- `= ci failed` → triage → fix → push → re-subscribe (never "stale" because the notification SHA ≠ tip).
- `= ci running` → do **not** claim stale or fixed; stay subscribed (no timer, AGENTS.md rule 13). **"0 failed"
  while running is not green.** Ending the turn on mid-run `0 failed` leaves a tip red sitting until a human acts.
- `= ci hollow` → only the draft skip skeleton ran, not verification; report it and use the authorized draft CI
  route when actual CI is needed.
- `= ci none` / `unknown` → no run observed / API evidence unavailable; neither proves a pass.
- `superseded` → follow the named current head or replacement run before concluding anything about that tree.
- `= ci blocked` → the PR conflicts, so GitHub starts no run: `sync-pr.mjs <branch>`, then push.
- `= ci none-yet` → no run 10 min after the push: on a draft, add `run-ci`; else read its `mergeable_state`.
- `= ci cancelled-external` → someone cancelled it (not a timeout): re-run once (`ci-rerun.mjs`) or re-push.
- `= ci timeout` → the WATCH gave up, not CI: re-read with `--once`.
- Only "stale / no action" when `= ci passed` on that same `headRefOid`, or a proven draft→ready cancel with a live
  sibling still 0-failed on the same SHA.

## The `gate` status

`gate` is a COMMIT STATUS posted by `land.yml`, not a workflow run, so ci-watch never shows it. Read it with
`gh api repos/<owner>/<repo>/commits/<sha>/statuses` (the newest `context: gate`; its description and the linked
run's summary name the failing merge-gate row).

## "Live" is an ancestry test

- A green PR does not prove Pages. PR CI and Pages (`pages.yml`) are separate verdicts; `pages.yml` gates the tip
  once and publishes exactly that commit, and the deploy push starts Pages' reusable CI gate, not a separate
  ship-push CI run. `ci-watch.mjs --pages` watches it after a deploy-branch push.
- **Live means your commit is an ANCESTOR of the live `apex-sha`**: ask agent `deploy-research`; never curl
  github.io from the main context.
