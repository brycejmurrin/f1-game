---
name: check-changes
description: Use when asked did I break anything, run the right tests, validate or pre-push check a change, pick tests for touched files, verify track edits, the shell/cache policy after a js/css edit (tags stay ?v=dev), merging with or pushing to the deploy branch, or triaging a Playwright timeout/hang (machine load vs real failure). verify-agent gives a read-only --fast verdict (--base: was it already red?).
---

# Validate changes before committing/pushing

## Prerequisites

`--fast` needs only Node modules; browser batches need the headless shell.
The SessionStart hook installs both (AGENTS.md §Verification 1); the manual
fallback is `bash tools/env/cloud-agent-install.sh`.

The suite is slow software rendering. **One command composes the rest**
(`pick-tests` selection, inline `verify-track` / `graph-parity` /
`tooling-fast` / `bump-cache --check`, then `test-bg` with **one browser
group per batch**):

```sh
node tools/ci/verify-change.mjs --plan       # what this change needs (JSON)
node tools/ci/verify-change.mjs --fast       # no browsers — default for verify-agent
node tools/ci/verify-change.mjs              # fast gate + start batch 1 (background)
node tools/ci/verify-change.mjs --wait       # every batch — ONLY when the parent asked
# Optional Playwright smoke only — do NOT fork the pre-push path onto quick-validate.mjs
```

`--wait` blocks for the full queue. Subagents and the default loop use
`--fast` or a single started batch, then read `artifacts/logs/*.log` for the
reporter's terminal line `= run <status>  (N/M done, K failed)` — match it with
`grep -E '= run (passed|failed|timedout|interrupted)'` (ERE alternation; a
fixed-string or BRE grep never matches).

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

Pinned flags without re-learning CLIs (Cloud has no `.mcp.json` catalog):

```sh
./tools/mcp/apex-tools-mcp.sh call apex_verify_change_fast '{"dryRun":true}'
./tools/mcp/apex-tools-mcp.sh call apex_pick_tests '{}'
./tools/mcp/apex-tools-mcp.sh call apex_bump_cache_check '{}'
node tools/track/verify-track.cjs monza          # one circuit (plain CLI; no wrap)
./tools/mcp/apex-tools-mcp.sh smoke
```

## Load on demand

- Gate contracts, ratchets, reading a failure → [`references/guards.md`](references/guards.md)
- A test timed out / hangs / passes solo but not loaded (or vice versa) —
  the decision tree and `test-solo.mjs` → [`references/triage.md`](references/triage.md)
- No cache bump after a `js/`/`css/` edit (`?v=dev`; the deploy stamps hashes); `gen-shell` after a manifest change (last
  edit before commit; `--merge <ref>` across lineages) → [`references/bump.md`](references/bump.md)
- Merging with / pushing to the deploy branch, union sweeps, baseline
  grow/shrink rules, Pages concurrency → [`references/deploy.md`](references/deploy.md)
