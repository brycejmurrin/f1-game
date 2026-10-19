# Repository size — October 2026

What makes a clone of this repository big, measured on FULL history with
`.github/workflows/repo-size.yml` (`tools/ci/repo-size.mjs`). Dated: re-run the
workflow for current numbers.

## The numbers (2026-10-02, 349 refs)

| | packed |
|---|---|
| full clone, every branch | **1,080 MB** (4,233 MB raw, 114,969 objects) |
| history only — file versions not in today's tree | **892 MB (82.5%)**, 46,173 versions |
| today's tree | ~190 MB |
| a blobless clone (`--filter=blob:none`) of the whole history | **15.6 MB** before checkout |

By type, PNG is **971 MB (90%)**. By directory, `tests/` is 782 MB, `docs/`
159 MB, `assets/` 98 MB, all code ~20 MB.

The history-only bytes, by path:

| path | packed |
|---|---|
| `tests/ui-screenshots/lap-audit` | 376 MB |
| `tests/specs/menu-baseline.spec.js-snapshots` (re-blessed baselines) | 29 MB |
| `tests/ui-screenshots/baku-audit` | 18 MB |
| `assets/pack/mat-*` (older texture packs) | ~28 MB |
| `docs/look-survey/*_grid.png` (older survey sheets) | ~30 MB |

## How it got there

One burst. On 2026-06-20..21 a full-lap visual audit committed
`tests/ui-screenshots/lap-audit/*.png` **1,728 times** (1,517 distinct test PNG
paths ever, 5,297 PNG version commits under `tests/`). The files were deleted
later; deleting a file does not shrink history, so every full clone still
downloads every version. Branch deletion cannot help either: the bytes are in
the deploy branch's own history.

`tests/unit/committed-images.test.mjs` (guard rung, since #761) now fails the
first commit that puts an image under `tests/` outside a Playwright
`*-snapshots/` dir, or any image over 4 MB outside `assets/`;
`tests/ui-screenshots/` is gitignored.

## Measuring it: never from an agent container

Agent containers clone SHALLOW (~50 commits). A shallow clone's cut-off
commits look like roots: on 2026-10-01 that read as "the deploy branch was
restarted on 2026-09-29" and sized the repo at 193 MB of "post-restart"
history inside 1.1 GB. Neither was true. `repo-size.mjs` refuses a shallow
clone; `git rev-parse --is-shallow-repository` says which you have.

## Cloning cheaply (no rewrite needed)

```sh
git clone --filter=blob:none https://github.com/brycejmurrin/f1-game.git
```

A **blobless** clone has every commit and tree (full history, `git log`,
`blame` by commit, branches) but downloads file contents only when a checkout
or diff needs them: ~15.6 MB plus today's tree, against 1,080 MB. `git log -p`
or `blame` on old versions fetches those blobs on demand. For a throwaway
checkout, `--depth 1` is smaller still.

## A history rewrite — not done

Removing the history-only screenshots (`git filter-repo`) would cut a full clone
to roughly 300 MB (all of it: ~190 MB). It changes every commit sha, so every
open PR, every clone and fork, and the deploy checks that look up the live
`apex-sha` would have to be rebuilt. Blobless clones get nearly all of the
benefit for none of that, so the rewrite stays parked unless full-clone size
causes a concrete problem they do not solve.

## 2026-10-15: survey images off the deploy branch

The deploy branch's tree was ~328 MB (`git ls-tree -r -l` sum). 146 survey and
screenshot images under `docs/archive/slider-effect/`, `docs/look-survey/` and
`artifacts/shots/` (~123 MB) were already byte-identical on
`track-survey-assets` (commit `cb0cb2c3`), so they were removed from the deploy
branch and their doc links pinned to that commit. History is not rewritten:
this shrinks the tip and every shallow or blobless clone, not a full clone.
`tests/unit/committed-images.test.mjs` now refuses a new image under `docs/` or
`artifacts/` outside a shrink-only allow-list.

## 2026-10-19: conservative local rewrite rehearsal

A full mirror at deploy commit `24cb26e2380f3e954007e5b9b537dbc12da9f3ad`
contained 2,756 advertised refs and six open PRs. The rehearsal removed 4,196
obsolete generated-image blobs while protecting all 266 branch/tag/archive tip
trees, the six open PR head trees and 40 resolvable pinned targets. Every one of
24,387 mapped commits was checked for parent topology, authors, committers, dates
and messages; all 59,534 historical file deletions were approved image candidates.
The independent rewritten mirror passed full `git fsck`.

| Standalone pack scope | Before bytes | After bytes | Result |
| --- | ---: | ---: | --- |
| Ordinary branches and tags | 2,497,418,538 | 1,707,507,791 | 753.32 MiB smaller; 31.63% |
| All refs, including locally rewritten PR refs | 2,860,880,277 | 1,902,436,896 | 914.04 MiB smaller; 33.50% |
| Rewritten writable refs plus original GitHub PR refs | 2,860,880,277 | 2,869,006,992 | 7.75 MiB larger |

Measurements used standalone, non-thin `git pack-objects --threads=2 --stdout
--revs --quiet` streams. Physical `count-objects` subtraction is misleading when
an input mirror borrows objects through alternates. These pack sizes measure
reachable transfer scopes, not GitHub's physical storage or garbage collection.

The original GitHub-owned PR refs still reach **4,194 of the 4,196 candidates**.
Clients cannot force-push those refs. Rewriting writable refs therefore cannot
promise hosted reclamation. The hypothetical rewrite changes 19,905 commit IDs,
including all six open PR heads and their deploy base; unchanged file trees do
not preserve review/check identity or guarantee unchanged merge-base behavior.
All 40 pinned commit URLs would need remapping. Standard filtering also strips
**18,599 commit signatures**; identity, date and message preservation does not
preserve cryptographic signatures.

The rehearsal stayed local, has no remote configured, and left its source refs
byte-identical (inventory SHA-256
`04326f3d4cc482f29b5a7581858847a67558975a4b744dd479d5a20808b29992`).
Original mirrors and recovery bundles were retained. Subsequent remote changes,
external consumers, dynamic links, forks, caches and server retention remain
outside this snapshot's proof. This is evidence against a routine remote rewrite
while open PRs must remain unaffected.

[Historical evidence catalog](../evidence/historical-catalog.json) records the
separate retention migration. Verified release bundles and updated links improve
future storage policy; they do not reclaim these historical bytes or authorize
purging recovery refs. For smaller working clones now, use the partial-clone
command above or a shallow checkout when full history is unnecessary.

GitHub's [history-removal documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
confirms that PR references, caches, clones and forks can retain rewritten commits.
It also explicitly says Support will not remove non-sensitive data. These survey
images are a storage issue; the sensitive-data purge process is not a promised
route to reclaiming them.
