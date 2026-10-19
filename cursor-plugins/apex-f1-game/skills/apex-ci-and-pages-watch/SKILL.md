---
name: Apex CI and Pages watch
description: >-
  Use this when watching Apex (f1-game) GitHub Actions CI or Deploy to GitHub
  Pages, diagnosing a red check, reading failed job logs, or deciding whether to
  merge or redeploy.
---
# Apex CI and Pages watch

Repo: `brycejmurrin/f1-game`. Current local gate meanings: [`docs/VERIFICATION.md`](../../../../docs/VERIFICATION.md). Ship / deploy branch: `claude/f1-game-project-26h3ng`. Prefer GitHub MCP (`user-GitHub-xai`) over a broken local `gh` token.

## Canonical checkout policy

Resolve these paths from the target checkout root, not the installed plugin
folder: [AGENTS.md](../../../../AGENTS.md),
[fleet-core](../../../../.claude/rules/fleet-core.md), and
[merge authority](../../../../.claude/skills/agent-fleet/references/role-merge-holder.md).
Read them at that checkout revision for merge authorization, ready transitions,
queue/push policy and merge pacing. This adapter supplies watch mechanics; it
adds no authority or policy fallback.

Without a checkout, use GitHub MCP to resolve the requested source ref to a
commit SHA and read those same paths at that SHA. Cite the revision. Until
those reads succeed, checkout policy is **unverified**; the installed plugin is
a versioned adapter, not a verified policy snapshot or authorization.

## What to watch (do not conflate)

Use the checkout's [verification reference](../../../../docs/VERIFICATION.md)
for the current PR-CI and Pages release-gate topology and triggers. Keep the
PR tip, Pages run and live site as separate observations; a green PR does not
prove a release is live. Confirm the live SHA through Pages `verify-live`,
`version.json` or deploy-research.

## Watcher (no sleep / `gh run view` loops)

Use `node tools/ci/ci-watch.mjs --sha <head> [--pages] [--once]` (rule 12). Match **head_sha**. Re-arm on expiry until the `= ci …` line. Ignore cancelled twins superseded by a newer run on the same SHA (draft/ready dedupe).

For sync eligibility and procedure, read the canonical checkout policy above
and its `sync-pr.mjs` reference. After a merge, watch the release checks named
by the verification reference for the resulting SHA.

`node tools/ci/queue-depth.mjs` reports queue information. Interpret it through
AGENTS.md; this adapter maintains no separate queue hold or push rule.

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

Pre-push for a fix: `npm run test:tooling-fast` plus pick-tests Structural guards. Push once per green local cycle.

## Deploy / redeploy

- Local protocol and dispatch eligibility: read AGENTS.md and `docs/VERIFICATION.md`; `node tools/ci/deploy.mjs` is the checkout entrypoint.
- Manual: `actions_run_trigger` `run_workflow` on workflow `295002043`, `ref: claude/f1-game-project-26h3ng`. One green tip → one train; do not dual-dispatch Pages.
- After dispatch, watch that Pages run with `ci-watch.mjs --sha <sha> --pages`. On failure, read **nested** failed jobs (`ci / Selected specs…`), not only the Pages wrapper conclusion.
- Geometry pushed to ship: also run / expect `test:sweeps`. Sweeps are not in tooling-fast.

## Report shape to the user

Lead with: merged or not, head SHA, which run URL, green or red. If red: failing test name + Expected/Received (or timeout). Name the check or Pages release job that failed. Next action in one sentence. Handoff: paths, PR/bc, OWNED, ranked next ≤3, blockers.

Never narrate cancelled superseded runs as the verdict. Never declare deploy live until Pages succeeded (or verify-live / version confirms the merge commit).
