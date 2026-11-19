# Engine / physics change (`js/game.js`, `js/physics/`)

`docs/VERIFICATION.md` §By change, engine row: the local floor is `tooling-fast --changed`; the groups `pick-tests`
names run on the pushed PR (every draft push; a whole group, `remote-group.mjs`, is Bryce's opt-in); name
any left unrun as not-run in the PR.

0. Before the edit: check `node tools/ci/pr-board.mjs --json` for open PRs already on `js/game.js`. They do not block you (D-033, AGENTS.md §Git branch & deploy): keep your hunks small, name those PRs in your PR body, and resolve at sync if yours merges second.
1. Plan: `node tools/ci/verify-change.mjs --plan <your paths>`; its `batches` are YOUR groups (a
   consts/game.js edit lists many; a single physics file fewer — read the plan, not this page).
2. The one spec: `tests/specs/physics-characterization.spec.js` is the master gate near game.js; for another
   file `node tools/ci/select-specs.mjs --files <path>` names it (`floor: null` means only the groups cover it;
   `--since <ref>` reads an edit already made). It runs on the
   PR's selected shard, never locally (AGENTS.md rule 5).
3. The plan's groups: the PR's own CI runs the selected shard; the rest named not-run (a whole group is Bryce's opt-in).
4. Static checks that belong with this change:
   - `node tools/check/ratchets.mjs` — game.js growth over the ratchet (the commit hook's absorb: `.claude/rules/game-code.md`).
   - `node tools/check/vstd-lint.mjs` — PACE compared through `vTop()`/`vStd()`/`aStd()`.
5. Before the push: the floor (AGENTS.md rule 3); the PR's tiers run the rest.
   Draft → ready: skill `steward` §Land.
