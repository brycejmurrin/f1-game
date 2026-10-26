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

Check: `node tools/gen/gen-changelog.mjs --check` (part of `npm run gen:check`, so `test:tooling-fast` and CI
reject a malformed fragment).

Fold: `.github/workflows/changelog-fold.yml` owns it. Weekly (Mondays, and on dispatch) it runs `npm run fold`
on the deploy tip, pushes `bot/changelog-fold`, opens one fold PR and dispatches `ci.yml` on it (a PR opened
with `GITHUB_TOKEN` starts no CI of its own). A fold PR conflicts with no open PR, because no PR edits
CHANGELOG.md or another PR's fragment. The heading is the tip's STAMPED build (2000 + commit count, the number
Pages stamps), never `version.json`'s placeholder 1695:

```sh
npm run fold                                          # gen-changelog --fold: fragments -> "## <stamped build>"
node tools/gen/gen-changelog.mjs --fold --build 4321  # explicit heading (a shallow clone cannot count commits)
```

The ratchet raise fragments (`tests/data/ratchets.d/`) fold separately, daily, in
`.github/workflows/ratchets-fold.yml`.
