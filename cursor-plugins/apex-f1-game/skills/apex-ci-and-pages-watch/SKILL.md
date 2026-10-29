---
name: Apex CI and Pages watch
description: >-
  Use this when watching Apex (f1-game) GitHub Actions CI or Deploy to GitHub
  Pages, diagnosing a red check, reading failed job logs, or deciding whether a
  PR or a Pages train is green.
---
# Apex CI and Pages watch

Repo: `brycejmurrin/f1-game`. Current local gate meanings: [`docs/VERIFICATION.md`](../../../../docs/VERIFICATION.md). Ship / deploy branch: `claude/f1-game-project-26h3ng`. Prefer GitHub MCP (`user-GitHub-xai`) over a broken local `gh` token.

**Authority and readiness:** follow `AGENTS.md` §Coordination and `docs/WORKERS.md`. GitHub lands PRs: a worker flips its PR ready and adds the `land` label, and `land.yml` runs the `gate` check and arms auto-merge; no session merges or arms. Draft→ready requires a green tip and successful `ready-gate.mjs --pr <n>`. There is no fixed ready-PR cap. This watch skill observes and reports; it does not grant merge, arm, readiness, or cancellation authority.

## What to watch (do not conflate)

1. **PR CI** — workflow `CI` (`ci.yml`), event `pull_request`, head = PR branch. This is the merge gate for the PR tip.
2. **Pages train** — workflow `Deploy to GitHub Pages` (`pages.yml`). A deploy-branch push starts it directly; `workflow_dispatch` requests deployment explicitly. It calls reusable `ci.yml` with its selected `before_sha`, so it can fail on specs the PR never ran. There is no separate ship-push CI run.
3. **Live site** — https://brycejmurrin.github.io/f1-game/ — confirm via Pages `verify-live` / `version.json` / deploy-research. Do not trust github.io from the box browser.

A green PR CI does **not** prove Pages will pass. Pages diffs against `before_sha` (live tip) and re-runs the full release gate.

## Watcher (no sleep / `gh run view` loops)

Use `node tools/ci/ci-watch.mjs --sha <head> [--pages] [--once]` (AGENTS.md rule 13). Match **head_sha**. Watch only while CI runs on your own head (`docs/WORKERS.md` §4): a Cursor run ends at ready, and a red after it is a dispatcher follow-up turn. Ignore cancelled twins superseded by a newer run on the same SHA (draft/ready dedupe).

Sync by **merging** `origin/claude/f1-game-project-26h3ng` (`sync-pr.mjs`), never rebase or force-push, and only when AGENTS.md §Git branch & deploy says so: GitHub reports CONFLICTING/DIRTY or the `gate` check refuses the base distance; never for clean-behind. After a merge, Pages and its nested release gate are the verdict, not the closed PR.

`node tools/ci/queue-depth.mjs` reports capacity only. Either queue verdict exits 0; it does not hold a launch, sync, or push. Use the current canonical launch and merge policies for actual gates.

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
| Boot / `__apex` timeout under CI | Three/TLX default (WebGPU path) under llvmpipe, or dead `DISPLAY` | Reverting player default without checking fixtures |
| PR green, Pages red | Pages `before_sha` selects specs not in the PR matrix | Merging then ignoring Pages |
| `tooling-fast` green locally, Pages red | Pages runs more node suites + sweeps than tooling-fast | Treating the local floor as the whole gate |

Product defaults live in `js/data/settings-defaults.js`. Align tests to intentional defaults; do not “fix” CI by changing player defaults unless product says so.

Pre-push for a fix: the local floor in `docs/WORKERS.md` §3; the PR's CI tiers run the rest. Push once per green local cycle.

## Deploy / redeploy

- A deploy is a PR landing: the `land` label → `land.yml` → GitHub's merge commit on the deploy branch starts the Pages train. No session pushes to the deploy branch (refused) or runs plain `deploy.mjs`.
- Manual "deploy now" is Bryce's: `actions_run_trigger` `run_workflow` on workflow `295002043`, `ref: claude/f1-game-project-26h3ng`. `pages.yml`'s concurrency group keeps one running and one pending train.
- After dispatch, watch that Pages run with `ci-watch.mjs --sha <sha> --pages`. On failure, read **nested** failed jobs (`ci / Selected specs…`), not only the Pages wrapper conclusion.
- Geometry pushed to ship: also run / expect `test:sweeps`. Sweeps are not in tooling-fast.

## Report shape to the user

Lead with: merged or not, head SHA, which run URL, green or red. If red: failing test name + Expected/Received (or timeout). Say whether PR CI or Pages’ release gate/publication failed. Next action in one sentence. On your own PR, the hand-off is its ```handoff block (`docs/WORKERS.md` §The Hand-off block).

Never narrate cancelled superseded runs as the verdict. Never declare deploy live until Pages succeeded (or verify-live / version confirms the merge commit).
