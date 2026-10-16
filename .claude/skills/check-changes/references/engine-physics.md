# Engine / physics change (`js/game.js`, `js/physics/`)

`verify-change --plan <paths>` lists more browser groups than AGENTS.md §Verification allows.
Cap: two browser groups, the two most specific, and the rest named not-run in the PR.

0. Before the edit: `node tools/ci/who-is-on-it.mjs --claim "<text>"` (required for `js/game.js`, AGENTS.md §Concurrent PRs; `--release` after).
1. Plan: `node tools/ci/verify-change.mjs --plan js/physics/consts.js js/game.js`
   (a consts/game.js edit lists circuits, collisions, hooks, physics-core, tiny, tooling-fast).
2. Run `physics-core` and `collisions` (`node tools/ci/test-bg.mjs <group>`, one at a time, AGENTS.md rules 4-5).
   Name `circuits`, `hooks`, `tiny` as not-run unless the diff touches them.
3. `tests/specs/physics-characterization.spec.js` is the master gate near game.js; run it
   alone first when you only need a quick signal (`npm test -- tests/specs/physics-characterization.spec.js`).
4. Static checks that belong with this change:
   - `node tools/check/ratchets.mjs` — game.js growth over the ratchet (the commit hook absorbs <= 40 lines).
   - `node tools/check/vstd-lint.mjs` — PACE compared through `vTop()`/`vStd()`/`aStd()`.
5. Before the push: `npm run test:tooling-fast`, then `node tools/ci/deploy.mjs --gate-only` (SKILL.md ladder).
   Before draft to ready: `node tools/ci/ready-gate.mjs` must exit 0.
