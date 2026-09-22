---
name: check-changes
description: Use when asked did I break anything, run the right tests, validate or pre-push check a change, pick tests for touched files, verify track edits, the shell/cache policy after a js/css edit (tags stay ?v=dev), merging with or pushing to the deploy branch, or triaging a Playwright timeout/hang (machine load vs real failure). verify-agent gives a read-only --fast verdict (--base: was it already red?). A red GitHub Actions run (ci.yml / pages.yml) is ci-red-triage, not this skill.
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

**BEFORE A PUSH, `--fast` IS NOT THE TOP RUNG.** AGENTS.md rule 3 is a ladder
and `verify-change` sits on rung 2: `test:tooling-fast` is 208 of 278 unit
files, and the other 70 have taken deploys red three times. The only pre-push
check that runs what the deploy runs is

```sh
node tools/ci/deploy.mjs --gate-only         # pushes NOTHING; a dirty tree is fine
```

Use `verify-change --fast` in the edit loop and for a subagent verdict; run
`--gate-only` once before you push. Green on rung 2 never means green on
rung 3 (`docs/notes/PREPUSH-GATE-LADDER.md`).

`--wait` blocks for the full queue. Subagents and the default loop use
`--fast` or a single started batch, then read `artifacts/logs/*.log` for the
reporter's terminal line `= run <status>  (N/M done, K failed)` — match it with
`grep -E '= run (passed|failed|timedout|interrupted)'` (ERE alternation; a
fixed-string or BRE grep never matches).

Push once per VERIFIED BATCH: a push over a live run cancels it, and a killed
job runs no `if: always()` step, so its failures are lost (9 of 59 sampled runs
were cancelled by a newer push; two of three inspected hid a real failure).
`verify-change` says so at verdict time when it can see a live run.

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

Pinned flags without re-learning CLIs (Cloud has no `.mcp.json` catalog):

```sh
./tools/mcp/apex-tools-mcp.sh call apex_verify_change_fast '{"dryRun":true}'
./tools/mcp/apex-tools-mcp.sh call apex_pick_tests '{}'
./tools/mcp/apex-tools-mcp.sh call apex_bump_cache_check '{}'
node tools/track/verify-track.cjs monza          # one circuit (plain CLI; no wrap)
./tools/mcp/apex-tools-mcp.sh smoke
```

## After `sync-pr.mjs`: you are NOT on your own branch

`sync-pr.mjs <branch>` verifies on a temp branch and **checks it out**. Without
`--push` it pushes nothing and returns with `HEAD` on `sync-pr-<branch>`. Its
last line says so; the trap is that everything looks finished.

```sh
node tools/ci/sync-pr.mjs <branch>              # verifies, leaves HEAD on sync-pr-<branch>
git rev-parse --abbrev-ref HEAD                 # CHECK THIS before anything else
git checkout <branch> && git merge --ff-only sync-pr-<branch>
git branch -D sync-pr-<branch>                  # then push / deploy as normal
```

Why it matters: running `deploy.mjs` from the temp branch pushes the RIGHT tree
to the deploy branch and leaves your own branch behind without the sync merge —
so what shipped and what your branch says shipped disagree. `--push` avoids the
dance entirely when you already intend to publish.

## Load on demand

- Gate contracts, ratchets, reading a failure → [`references/guards.md`](references/guards.md)
- A test timed out / hangs / passes solo but not loaded (or vice versa) —
  the decision tree and `test-solo.mjs` → [`references/triage.md`](references/triage.md)
- No cache bump after a `js/`/`css/` edit (`?v=dev`; the deploy stamps hashes); `gen-shell` after a manifest change (last
  edit before commit; `--merge <ref>` across lineages) → [`references/bump.md`](references/bump.md)
- Merging with / pushing to the deploy branch, union sweeps, baseline
  grow/shrink rules, Pages concurrency → [`references/deploy.md`](references/deploy.md)
