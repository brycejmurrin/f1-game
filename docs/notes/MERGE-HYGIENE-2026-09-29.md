# Merge hygiene — concurrent-PR conflict hotspots (2026-09-29)

Measured from 60 first-parent `Merge pull request` commits into
`claude/f1-game-project-26h3ng` (PR #358–#479) plus 115 recent
`sync-pr` / `merge(ship)` commits where both parents touched the same path.

## What actually conflicts

| File | Both-parent | Same-line | Shape / why |
|------|------------:|----------:|-------------|
| `tests/unit/scenery-api-contract.test.mjs` | 50 | 28 | unsorted `expected` map; waves append at the **tail** |
| `docs/TESTING.md` / `AGENTS.md` / `PREPUSH-GATE-LADDER.md` | 22–23 | ~100% | generated ladder digits on the **same** lines |
| `tests/data/ratchets.json` | 17 | 16 | pretty JSON; both raise `js/game.js.lines` |
| `tests/groups.json` | 13 | 0 | already one path/line; inserts usually **disjoint** |
| `tools/ci/tooling-fast.mjs` | 10 | 0 | generated from groups; same pattern |
| `tools/manifest.cjs` | 2 | 0 | `CIRCUITS` packed **multi-id per line** (adjacent append risk) |

`merge=union` is already correct for `docs/notes/CEILING-HISTORY.md` (append-only
journal). It is **never** safe for JSON or order/comma-sensitive lists — union
keeps both ceiling numbers and corrupts the file.

## What this change does

1. `tools/check/merge-hygiene.mjs` — `--check` / `--fix` keeps
   `tests/data/ratchets.json` and `tests/groups.json` one-entry-per-line with
   stably sorted keys (toolingFast notes stay glued to the next path, then
   sort by path; group `files`/`flags` sorted). Wired into `test:guards`.
2. `ratchets.mjs --update` writes through the same normalizer.
3. `manifest.cjs` `CIRCUITS`: one id per line, **section order preserved**
   (never alpha-sorted — picker / `Tracks.LIST` positional indices).
4. Doc convention (also in `AGENTS.md` §Critical conventions): put measured
   notes in `docs/notes/<topic>.md`; do not lengthen the shared ladder docs.

## What it does **not** fix (named, not deferred silently)

- Same-line `js/game.js.lines` raises still need re-measure
  (`deploy.mjs` / `sync-pr.mjs` already cure ratchets).
- Ladder figure lines still need `gen-ladder-figures.mjs` (already cured on
  merge). Put prose in a private note instead of editing those lines.
- Scenery-wave `expected` tail appends remain the loudest hotspot; sorting
  that map is a separate, larger PR (many in-flight wave PRs touch it).

## Commands

```sh
node tools/check/merge-hygiene.mjs            # check
node tools/check/merge-hygiene.mjs --fix     # rewrite
node tools/gen/gen-test-groups.mjs            # after groups.json --fix
```
