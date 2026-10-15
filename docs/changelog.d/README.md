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

Fold (Merge Desk or the deploy, after the build number is stamped in `version.json`):

```sh
node tools/gen/gen-changelog.mjs --fold     # fragments -> "## <build>" in CHANGELOG.md, fragments deleted
```
