# Commit-guard verdict cache (#2889 slice 1)

Date: 2026-10-19. Branch: `cursor/commit-guard-cache-3b9b`.

## What landed (slice 1)

Outside `.claude/` (slice 2 waits on #2899):

1. `tools/ci/guards-verdict.mjs` — `run` / `check` against `artifacts/pre-commit-guards.ok`
   (raw `git write-tree` hash, **10-minute** freshness — same file and format
   `bash-guard.sh` already reuses for concurrent PreToolUse copies).
2. `package.json` `test:guards` → `node tools/ci/guards-verdict.mjs run` (groups.json
   keeps the curated file list; `kind: "command"` so gen does not rewrite the
   helper away).
3. `.githooks/pre-commit` — `check` before the suite; on a hit print
   `guards: cache hit <tree>` and skip. Optional `git config apex.guardTimeout`
   then `APEX_GUARD_TIMEOUT`; when neither is set, no new default timeout.
4. Unit coverage in `tests/unit/pre-commit-guards.test.mjs`.

`APEX_SKIP_GUARDS` and the CLAUDECODE early exit are unchanged. Docs-only and
ratchet auto-raise paths are unchanged.

## Before / after (this box, idle loadavg ≈ 0.3)

| Path | Wall time |
|---|---|
| Full `npm run test:guards` (35 files, node --test parallel) | **~62 s** |
| Heaviest single file `tests/unit/ci-coverage.test.mjs` alone | **~62 s** |
| Serial sum of all 35 files (one process each) | ~122 s |
| Cache hit (hook `check` after a green `run` on the same tree) | **≪ 1 s** |

So a foreground `npm run test:guards` then `git commit` on the same staged tree
no longer pays the ~62 s suite a second time — that was the double-run cost in
issue #2889 (837 tool-min on commits across 85 sessions).

## Staged-path scoping — skipped (Refs)

Issue acceptance wanted the hook ≤ 30 s for a typical one-file code commit by
running only path-bound guards (pick-tests routing). Measured on this idle box:

- The full floor is already ~62 s.
- `ci-coverage.test.mjs` alone is ~62 s — any staged set that routes through
  tools/CI/docs coverage still blows the 30 s target.
- A safe path-bound subset that still includes the cross-file contracts the
  commit gate exists for cannot reach ≤ 30 s without dropping files the gate
  is meant to run.

**Decision:** skip scoping in slice 1; keep the full list in the hook and in CI.
Revisit after #2647 / further suite splits, or as a later Refs slice with a
new measurement. Numbers above are the evidence.

## Slice 2 (blocked on #2899)

- `.claude/hooks/bash-guard.sh` reads the same cache via `guards-verdict check`
  and honour `apex.guardTimeout` (today it only reads `APEX_GUARD_TIMEOUT` /
  load bump).
- `docs/TESTING.md` ladder line for the measured per-commit cost.

## MERGE-HOLD

This PR changes the commit gate. Body carries
`MERGE-HOLD: Bryce review — changes the commit gate …` until Bryce approves.
