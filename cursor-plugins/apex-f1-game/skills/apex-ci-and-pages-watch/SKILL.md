---
name: Apex CI and Pages watch
description: >-
  Use this when watching Apex (f1-game) GitHub Actions CI or Deploy to GitHub
  Pages, diagnosing a red check, reading failed job logs, or deciding whether to
  merge or redeploy.
---
# Apex CI and Pages watch

Repo: `brycejmurrin/f1-game`. Ship / deploy branch: `claude/f1-game-project-26h3ng`. Prefer GitHub MCP (`user-GitHub-xai`) over a broken local `gh` token.

## What to watch (do not conflate)

1. **PR CI** — workflow `CI` (`ci.yml`), event `pull_request`, head = PR branch. This is the merge gate for the PR tip.
2. **Ship push CI** — same `CI` workflow, event `push`, branch = ship tip. Change-aware; may select different Playwright specs than the PR run.
3. **Pages train** — workflow `Deploy to GitHub Pages` (`pages.yml`, id `295002043`). Started by a green FAST ship CI poke, or by `workflow_dispatch`. It **calls** `ci.yml` with a `concurrency_key` and `before_sha` (often the last live tip), so it can fail on specs the PR never ran.
4. **Live site** — https://brycejmurrin.github.io/f1-game/ — confirm via Pages `verify-live` / `version.json` / deploy-research. Do not trust github.io from the box browser.

A green PR CI does **not** prove Pages will pass. Pages diffs against `before_sha` (live tip) and re-runs the full release gate.

## Polling loop

1. `pull_request_read` method `get` — `mergeable_state`, head SHA, draft/merged.
2. `actions_list` — filter by `branch` and ideally `event` (`pull_request` vs `push`). Match **head_sha**, not only run number.
3. `actions_get` method `get_workflow_run` with `resource_id` = run id (string). Wait for `status: completed` then read `conclusion`.
4. `pull_request_read` method `get_check_runs` — find jobs still `in_progress` or `failure`. Ignore cancelled twins superseded by a newer run on the same SHA.
5. Sleep with `AwaitShell` (60–180s). Do not claim green until the run for the **current** head SHA is success.

Ship tip moves often. If `mergeable_state` is `dirty`, update the branch or resolve conflicts before merge. After merge, watch **ship** CI and Pages, not the closed PR.

## Reading failures (required path)

1. `get_job_logs` with `run_id`, `failed_only: true`, `return_content: true`.
2. If truncated, call again with the failed `job_id` and `return_content: true`.
3. Persist full text to `/workspace/<run>-failed.log` and grep locally for:
   - `x FAIL`, `Error:`, `Expected:`, `Received:`, `Timeout`, `timed out`, `setting up context`
   - `not ok` (node:test), `AssertionError`
   - renderer noise only if relevant: `WebGL`, `three`, `gfxBackend`, `Sorry`
4. Download Playwright artifacts from the run when present (`playwright-artifacts-*`) — they hold the real assertion and attachments.
5. Name the **failing test title**, the **exact assertion**, and whether the job was Selected specs, Per-circuit geometry sweeps, Pure-node, Smoke, or Pages’ nested `ci / …` job.

## Diagnose before fixing (common Apex traps)

| Symptom | Likely cause | Wrong fix |
|---|---|---|
| Selected specs: `caution().enabled` expected true, got false | `js/data/settings-defaults.js` ships `"caution": false`; Playwright still asserts ON | Pinning WebGL2 / bumping `BOOT_MS` / flake re-run |
| Per-circuit geometry sweeps: `debris-hazard-hint` float ULP | Suzuka arc `assert.equal` on floats | Blaming the last feature PR blindly |
| Boot / `__apex` timeout under CI | Three/TLX default under llvmpipe, or dead `DISPLAY` | Reverting player default without checking fixtures |
| PR green, Pages red | Pages `before_sha` selects specs not in the PR matrix | Merging then ignoring Pages |
| `tooling-fast` green locally, Pages red | Pages runs more node suites + sweeps than tooling-fast | Skipping `deploy.mjs` Pages-gate suites |

Product defaults live in `js/data/settings-defaults.js`. Align tests to intentional defaults; do not “fix” CI by changing player defaults unless product says so.

## Deploy / redeploy

- Preferred local protocol: `node tools/ci/deploy.mjs` (see AGENTS.md). Green FAST ship CI should poke Pages.
- Manual: `actions_run_trigger` `run_workflow` on workflow `295002043`, `ref: claude/f1-game-project-26h3ng`.
- After dispatch, poll that Pages run to completion. On failure, read **nested** failed jobs (`ci / Selected specs…`), not only the Pages wrapper conclusion.
- Geometry pushed to ship: also run / expect `test:sweeps`. Sweeps are not in tooling-fast.

## Report shape to the user

Lead with: merged or not, head SHA, which run URL, green or red. If red: failing test name + Expected/Received (or timeout). Say whether PR CI, ship CI, or Pages failed. Next action in one sentence.

Never narrate cancelled superseded runs as the verdict. Never declare deploy live until Pages succeeded (or verify-live / version confirms the merge commit).
