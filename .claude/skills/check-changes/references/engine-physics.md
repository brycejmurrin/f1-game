# Engine / physics change (`js/game.js`, `js/physics/`)

AGENTS.md §Verification's engine row: the floor (ONE spec locally); the groups `pick-tests` names run on the
pushed PR (`run-ci`, or `node tools/ci/remote-group.mjs <group>`); name any left unrun as not-run in the PR.

0. Before the edit: check `node tools/ci/pr-board.mjs --json` for an open PR already on `js/game.js` (a path in an open PR's diff belongs to that PR: AGENTS.md §Git branch & deploy).
1. Plan: `node tools/ci/verify-change.mjs --plan <your paths>`; its `batches` are YOUR groups (a
   consts/game.js edit lists many; a single physics file fewer — read the plan, not this page).
2. The one spec: `tests/specs/physics-characterization.spec.js` is the master gate near game.js; for another
   file pick the spec with `node tools/ci/select-specs.mjs --since origin/claude/f1-game-project-26h3ng`. Run it
   in the background: `node tools/ci/test-bg.mjs --spec <file>` (AGENTS.md rules 4-5; never `npm test --` in the
   foreground for a browser spec).
3. The plan's groups: the two most specific on the pushed branch via `remote-group.mjs`, the rest named not-run.
4. Static checks that belong with this change:
   - `node tools/check/ratchets.mjs` — game.js growth over the ratchet (the commit hook's absorb: `.claude/rules/game-code.md`).
   - `node tools/check/vstd-lint.mjs` — PACE compared through `vTop()`/`vStd()`/`aStd()`.
5. Before the push: the pre-push floor (AGENTS.md rule 3 → docs/WORKERS.md §3); the PR's tiers run the rest.
   Draft → ready: skill `ship`.
