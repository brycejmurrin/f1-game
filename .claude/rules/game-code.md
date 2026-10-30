---
paths:
  - "js/**"
  - "css/**"
  - "index.html"
  - "sw.js"
---

# Game code — loads with js/, css/ and the shell (moved from AGENTS.md §Critical conventions, 2026-10-26)

- Cache busting is the deploy's job: every asset tag in the committed shell reads `?v=dev` and `pages.yml`
  rewrites them to content hashes while staging. There is no bump after a js/css edit.
- No ES modules — every file is a `"use strict"` IIFE assigning one global (sole exception: the vendored
  three.js island). New file: IIFE + `tools/manifest.cjs` entry (+ HARD_EDGES pair if eval-time destructured)
  + `node tools/gen/gen-shell.mjs`.
- NEW MODULE / GLOBAL checklist (`node tools/ci/pick-tests.mjs` prints it when the diff adds one): the eager shell is at its
  budget (`boot-load-budget.test.mjs`), so put the file in a LAZY list of `tools/manifest.cjs`, not the eager one; add VM
  stubs where `race-session-lazy`, `results-cam` and `ui-sheets-audit` load modules by hand; update `types/game-ctx.d.ts`,
  `docs/agent-index.json` (`npm run gen`) and mind the `agentHelp` size ratchet; a new `tools/perf/*.mjs` needs its
  `docs/agent-output/policies.json` entry. Skipping one costs a CI cycle each (#4108, #4188).
- Circuit edits go in `js/circuits/<id>.js`; engine changes in `js/track/`.
- `tests/data/ratchets.json` ratchets game.js and the other big modules — pay for every added line. The commit
  hook absorbs ≤ 20 lines of growth silently, ≤ 40 with a `Ratchet-Reason:` commit trailer
  (`tools/hooks/ratchet-reason.mjs`; the raise lands as `tests/data/ratchets.d/<branch>.json`); more blocks until
  you extract or shrink. A tree-wide ceiling rises only when Bryce types the raise in the acting session
  (`APEX_RATCHET_RAISE_OK=1 node tools/check/ratchets.mjs --update --fragment --reason="<why>"`; safety ban 1,
  2026-10-22); `--update --lower-only` lowers.
- localStorage keys are prefixed `apex26.`. Logging goes through `Log` (`js/core/log.js`), never bare `console.*`.
- Coordinates: +Y up, metres, radians, arc `s`, lateral `x` +right; +k = LEFT turn (measured). Never flip a
  curvature sign without a rendered lap.
- Frac-keyed def tables must respect `def._sceneryShift` (consume via `bankingProfile` / `buildCenterline`); a
  raw `frac` lands 2/3 of a lap away.
- Physics (AGENTS.md §Physics): `PACE` is a scale — compare speeds through `vTop()`/`vStd()`/`aStd()`
  (`tools/check/vstd-lint.mjs`). A new `Tracks.curvature()` call goes in a legitimate column (AI-only,
  assist-gated, broadcast-only, surface — docs/PHYSICS.md). Read `c.aeroX` (or `aeroDfMult(c)`), never `c.xOn`.
  Immutable numbers live in `js/physics/consts.js`; tunables stay `let`s in game.js;
  `tests/specs/physics-characterization.spec.js` is the master gate near game.js.
