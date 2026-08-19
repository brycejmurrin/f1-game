---
name: check-changes
description: Use when the user asks did I break anything, run the right tests, validate changes, ready to push, pre-commit/pre-push checks, test selection for touched files, verify track edits, or confirm cache bump before shipping Apex 26 changes. For Playwright timeouts/hangs use test-timeout-triage; spawn verify-agent for a read-only --fast JSON verdict.
---

# Validate changes before committing/pushing

## Prerequisites

For browser-backed batches, ensure Playwright is installed first:

```bash
bash .claude/skills/apex-env-setup/scripts/ensure-apex-env.sh
# or: bash tools/cloud-agent-install.sh
```

`--fast` mode needs only Node modules (no browsers). Full batches need Chromium. See **apex-env-setup**.

The suite is slow software rendering. **One command composes the rest**
(`pick-tests` selection, inline `verify-track` / `graph-parity` /
`tooling-fast` / `bump-cache --check`, then `test-bg` with **one browser
group per batch**):

```sh
node tools/verify-change.mjs --plan       # what this change needs (JSON)
node tools/verify-change.mjs --fast       # no browsers — default for verify-agent
node tools/verify-change.mjs              # fast gate + start batch 1 (background)
node tools/verify-change.mjs --wait       # every batch — ONLY when the parent asked
```

`--wait` blocks for the full queue. Subagents and the default loop use
`--fast` or a single started batch, then read
`artifacts/logs/*.log` for `= run (passed|failed|timedout|interrupted)`.

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

Pinned flags without re-learning CLIs (Cloud has no `.mcp.json` catalog):

```sh
./tools/apex-tools-mcp.sh call apex_verify_change_fast '{"dryRun":true}'
./tools/apex-tools-mcp.sh call apex_pick_tests '{}'
./tools/apex-tools-mcp.sh call apex_verify_track '{"id":"monza"}'
./tools/apex-tools-mcp.sh smoke
```

Gate contracts and ratchet details: [`references/guards.md`](references/guards.md)
