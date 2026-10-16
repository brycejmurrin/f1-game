# After `sync-pr.mjs`: you are NOT on your own branch

`sync-pr.mjs <branch>` verifies on a temp branch and **checks it out**. Without
`--push` it pushes nothing and returns with `HEAD` on `sync-pr-<branch>`. Its
last line says so; the trap is that everything looks finished. An existing
temp branch is preserved and a fresh sync refuses. Do not rerun `--push` on an
existing result: use the printed manual push command after reviewing it, or
inspect/rename the branch before a fresh sync. `--plan` reads cached refs only;
`conflicts:null`/`conflictsChecked:false` means conflicts were not checked.
Verify is `--verify=fast` by default (tooling-fast `--jobs=3` + the node suites
`node-plan.mjs` needs for the branch's own diff; `full` = every suite, `none` =
clean merge only), each stage timed; a stopped stage prints
`sync-pr.mjs <branch> --resume --from=<stage>`, which re-verifies the kept temp
branch without a new merge. `--push` publishes at once (no queue hold since 2026-10-16).

```sh
node tools/ci/sync-pr.mjs <branch>              # verifies, leaves HEAD on sync-pr-<branch>
git rev-parse --abbrev-ref HEAD                 # CHECK THIS before anything else
git checkout <branch> && git merge --ff-only sync-pr-<branch>
git branch -D sync-pr-<branch>                  # then push / deploy as normal
```

Why it matters: running `deploy.mjs` from the temp branch pushes the RIGHT tree
to the deploy branch and leaves your own branch behind without the sync merge —
so what shipped and what your branch says shipped disagree. `--push` avoids the
dance entirely when you already intend to publish.
