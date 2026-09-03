---
name: check-changes
description: Use when the user asks did I break anything, run the right tests, validate changes, ready to push, pre-commit/pre-push checks, test selection for touched files, verify track edits, bump the version / cache bust after a js/css edit, merge with or push to the deploy branch, or when a Playwright test times out (timeout) or hangs and the question is machine-load vs real failure. Spawn verify-agent for a read-only --fast JSON verdict (--base <ref> for "was it already red?"). Live version.json is deploy-research.
---

# Validate changes before committing/pushing

## Prerequisites

`--fast` needs only Node modules; browser batches need the headless shell
(AGENTS.md §Verification 1): `bash tools/env/cloud-agent-install.sh`, or
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` then
`npx playwright install chromium-headless-shell`.

The suite is slow software rendering. **One command composes the rest**
(`pick-tests` selection, inline `verify-track` / `graph-parity` /
`tooling-fast` / `bump-cache --check`, then `test-bg` with **one browser
group per batch**):

```sh
node tools/ci/verify-change.mjs --plan       # what this change needs (JSON)
node tools/ci/verify-change.mjs --fast       # no browsers — default for verify-agent
node tools/ci/verify-change.mjs              # fast gate + start batch 1 (background)
node tools/ci/verify-change.mjs --wait       # every batch — ONLY when the parent asked
```

`--wait` blocks for the full queue. Subagents and the default loop use
`--fast` or a single started batch, then read `artifacts/logs/*.log` for the
reporter's terminal line `= run <status>  (N/M done, K failed)` — match it with
`grep -E '= run (passed|failed|timedout|interrupted)'` (ERE alternation; a
fixed-string or BRE grep never matches).

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

Pinned flags without re-learning CLIs (Cloud has no `.mcp.json` catalog):

```sh
./tools/apex-tools-mcp.sh call apex_verify_change_fast '{"dryRun":true}'
./tools/apex-tools-mcp.sh call apex_pick_tests '{}'
./tools/apex-tools-mcp.sh call apex_bump_cache_check '{}'
node tools/verify-track.cjs monza          # one circuit (plain CLI; no wrap)
./tools/apex-tools-mcp.sh smoke
```

## Load on demand

- Gate contracts, ratchets, reading a failure → [`references/guards.md`](references/guards.md)
- A test timed out / hangs / passes solo but not loaded (or vice versa) —
  the decision tree and `test-solo.mjs` → [`references/triage.md`](references/triage.md)
- No cache bump after a `js/`/`css/` edit (`?v=dev`; the deploy stamps hashes); `gen-shell` after a manifest change (last
  edit before commit; `--merge <ref>` across lineages) → [`references/bump.md`](references/bump.md)
- Merging with / pushing to the deploy branch, union sweeps, baseline
  grow/shrink rules, Pages concurrency → [`references/deploy.md`](references/deploy.md)
