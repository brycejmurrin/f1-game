# Changelog fragments

One file per PR: `docs/changelog.d/<pr-number-or-slug>.md`. Never edit `CHANGELOG.md` in a PR — it is
written only by the fold step, so no two PRs touch the same file and a merge never dirties another PR.

Each non-empty line is one player-facing entry:

```
Fixed: Blue flags no longer count a lapped car twice (#2163).
New: A second sentence-long entry.
```

Categories: `New`, `Improved`, `Fixed`, `Removed` (same rules as the header of `CHANGELOG.md`: player-visible
only, no refactors, CI or tooling). A PR with no player-facing change adds no fragment and says
`CHANGELOG: no player-facing change` in its body.

Check: `node tools/gen/gen-changelog.mjs --check` (part of `npm run gen:check`).

Fold: Merge Desk opens one fold PR (`npm run fold` on a fresh branch off the deploy tip) when the
fragments pile up, at most daily. A fold PR conflicts with no open PR, because no PR edits CHANGELOG.md or
another PR's fragment. It folds the ratchet raise fragments too (`tests/data/ratchets.d/`,
`docs/notes/RATCHET-FRAGMENTS-2026-10-15.md`):

```sh
npm run fold     # gen-changelog --fold (fragments -> "## <build>" from version.json) + ratchets.mjs --fold
```
