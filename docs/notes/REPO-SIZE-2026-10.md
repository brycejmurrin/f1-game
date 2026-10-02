# Repository size — 2026-10-01/02

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
