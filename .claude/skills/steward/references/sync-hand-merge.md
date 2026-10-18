# Hand merge after `sync-pr` reports real conflicts

When `sync-pr` aborts on prose or ratchet **form** conflicts:

1. `sync-pr <branch> --plan` → `who-is-on-it.mjs` if the base file is not yours.
2. `git checkout <branch> && git merge origin/claude/f1-game-project-26h3ng` — keep both sides' intent.
3. Generated leftovers: fix at source + `npm run gen` (skill **gen-regen**).
4. `deploy.mjs --gate-only` → plain `git push` (never force).
5. Tick the Plan item with merge sha in the PR body.

`sync-pr` leaves you on `sync-pr-<branch>` without `--push`; inspect before re-running.
