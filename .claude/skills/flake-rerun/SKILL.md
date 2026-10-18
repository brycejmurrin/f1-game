---
name: flake-rerun
description: "Use when one CI shard is red outside the PR diff and you need evidence before asking Bryce to re-run — same test on ship, sibling shards green; log the request (issue #2394)."
---

# Flake re-run policy

A single red shard on unrelated specs is **not** automatically infra.

## Before asking Bryce for a re-run (yes required)

1. Name the exact test title and assertion from the log (`ci-red-triage`).
2. Confirm **sibling shards** on the same `head_sha` are green.
3. Check the **deploy branch** tip: same test already red there → base red, not your flake.
4. One re-run at most via `tools/ci/ci-rerun.mjs` after Bryce says yes.
5. Record the request and outcome in GitHub issue **#2394** (flake log).

Never widen tolerances, quarantine without listing in the PR, or cancel runs.
A pass that needed a retry is a red (AGENTS.md rule 9) unless Bryce approves rerun.

Related: **check-changes** `references/triage.md`, **steward** §5.
