# Verified audit fixes

The user requested fixes for the prior audit findings, deeper investigation,
isolated worktrees, and subagent implementation. This batch starts at deploy
commit `7dd2e82f3abb5205683ed7fc2dcb22712081159e`.

The original deploy checkout remains unchanged while its existing structural
test run completes. Implementation uses separate worktrees, with one owner
per source path and a final integration worktree. No direct deploy push is
part of this work.

## Scope

- Verification: preserve failed child/waiter outcomes; make listing distinct
  from execution; reject unsupported CPU options; guard step comparisons.
- MCP lifecycle: honor dry-run before cancellation or session close.
- Data: cancel obsolete initial timing work on selection changes.
- Audio: bound decoded soundtrack loading and reject stale completion.
- Track: retire stale custom-map metadata and bound extreme projection input.
- Replay and UI: restore only the owned car field and invalidate dynamic gates.
- Rendering: remove optional occlusion state queries using tracked GL state,
  with correctness checks and no unmeasured hardware speed claim.

The live camera setter and shared files owned by open PR #3763 are excluded
from concurrent edits. Unverified settings-reset failure leads require a
reproduction before any implementation change.

## Verification

Each owner reproduces the supported failure and runs focused existing tests.
Integration collects the diffs, checks overlap and generated outputs, reviews
the final behavior, and runs the repository's change selection and required
checks. Real browser, hardware, and network coverage are recorded separately.

Interrupted operations, late completions, replacement ownership, repeated
cleanup, and failure recovery are explicit review targets. Findings disproved
by the shipped implementation remain negative evidence, not fixes.
