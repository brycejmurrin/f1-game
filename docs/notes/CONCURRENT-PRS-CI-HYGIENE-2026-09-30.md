# Concurrent PRs / CI hygiene (2026-09-30)

Canonical short pointer: AGENTS.md §Concurrent PRs. Full CI/docs detail:
docs/TESTING.md §Merge train, §CI aggregator, §What runs on PRs versus nightly,
§Flaky tests.

## Concurrent PRs (full)

- Agents open DRAFT PRs and mark ready only when the change is final.
  Keep about six or fewer ready PRs open at a time; batch small ones.
- Own notes file per PR: `docs/notes/<topic>.md` (session log stays in the
  PR body — this file holds durable design evidence for the topic).
- Sync once with `node tools/ci/sync-pr.mjs <branch>` then `--push` before
  the final CI run (in addition to SYNC ONLY WHEN YOU MUST for conflicts /
  tip reds). `tools/ci/behind-ship.mjs` warns when a PR head is >10 commits
  behind ship; it never fails the job.
- Sorted shared files (`tests/data/ratchets.json`, `tests/groups.json`): use
  the normalize command from the merge-hygiene PR (#484) when merged —
  `--fix` on those JSON lists, then `node tools/gen/gen-test-groups.mjs`.
  Do not hand-reshape those lists into conflict hunks.
- No ratchet raises without the sanctioned route (`tools/check/ratchets.mjs
  --update` / the commit hook's ≤40-line absorb). Never loosen ratchets or
  tests to get green.
- Report the head SHA and check counts; do not merge the PR from the agent.
  On an expired / failed token, stop and report — do not invent a workaround.
- Do not add auto-update-branch bots or a require-up-to-date protection rule.

## Flaky tests (full)

Playwright retries default to 1 in CI when unset (`playwright.config.js`;
a job may set `--retries=0`, as the change-aware `selected` gate does). A pass
that needed a retry is still a red under `APEX_FAIL_ON_FLAKY=1` unless the
spec is listed in `tests/data/flaky-quarantine.json` — the one `@quarantine`
ledger. Quarantined specs still run and print flakes; they are excluded from
blocking required runs. Agents fix real failures; re-run a failed CI job at
most once and only for timeout / infra errors; never skip a test to get green.
Leaving quarantine: delete the row in the same commit as the fix.

## What this PR adds

- AGENTS.md §Concurrent PRs (compressed; detail here + TESTING.md).
- TESTING.md: merge train, `CI` aggregator (#480), `Selected specs (verdict)`
  (#507), PR vs nightly, flaky policy.
- `tools/ci/behind-ship.mjs`: non-blocking behind-count vs ship; `::warning::`
  over 10 commits; wired into Structural guards on `pull_request` only.
- Workflow hygiene: per-PR concurrency + cancel-in-progress on every
  `pull_request` workflow; heavy jobs (geometry sweeps, wide smoke, real-GPU
  renderer, emulated XR, desktop pack-smoke) stay off draft PRs.

## Normalize command (merge-hygiene #484)

#484 merged. Normalize then regenerate:

```sh
node tools/check/merge-hygiene.mjs            # check
node tools/check/merge-hygiene.mjs --fix     # rewrite ratchets.json + groups.json
node tools/gen/gen-test-groups.mjs
```
