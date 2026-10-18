---
name: gen-regen
description: "Use when gen:check fails, agent-index declaredTests drift, impact-map missing keys, ARCHITECTURE.md module table stale, or a merge left generated files conflicted — run npm run gen and commit outputs, not a CI rerun."
---

# Regenerate committed generated files

Symptoms that mean **regen**, not "re-run CI":

- `npm run gen:check` red on `gen-agent-index.mjs`, `gen-arch-table.mjs`, or shell groups
- `tests/unit/agent-indexes.test.mjs` — `declaredTests` count mismatch (e.g. 587 vs 589)
- `tests/data/impact-map.json` missing a route key the diff touched
- `docs/ARCHITECTURE.md` module table out of sync with `tools/manifest.cjs`
- Merge conflict only in generated paths (`package.json` test scripts, `docs/agent-index.json`, ratchets deltas cured by `sync-pr` but still dirty)

## Procedure

1. On the PR branch (or a local merge of `origin/claude/f1-game-project-26h3ng` + PR):
   ```sh
   npm run gen
   npm run gen:check
   ```
2. Commit **only** generated outputs (never hand-edit them — `protect-files.sh`).
3. `npm run test:tooling-fast` or `tooling-fast --changed` before push.
4. If two merges in a row went red on index drift, regen on the **second** PR before merge (Level 3 merge holder runs `gen:check` on the merge result first).

Generators live in `package.json` scripts `gen` and `gen:docs`; list: `npm run gen --silent` is not a thing — read `package.json` `gen` chain.

Related: **check-changes** `references/bump.md`, **steward** §2 generated conflicts, agent `ci-red-triage` stale-gen row.
