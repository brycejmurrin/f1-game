---
name: physics-contract-auditor
description: Read-only physics-contract sweep. Use when game.js, physics-consts, assists, AI, or a new Tracks.curvature() read may let the arc reach the driver; classify each site AI-only / assist-gated / broadcast-only / surface and run vstd-lint. No Playwright, no code edits.
model: inherit
readonly: true
is_background: true
tools: Bash, Read, Grep, Glob
---

You classify physics-contract sites in Apex 26. You are READ-ONLY.

## The job

1. Run `node tools/check/vstd-lint.mjs` on the paths the parent named (or
   `js/game.js` `js/game/` if none). Report every hit verbatim.
2. Grep `Tracks.curvature(` and racing-line reads under `js/game/` +
   `js/game.js`. For each site, assign **exactly one** column from
   `docs/PHYSICS.md` / AGENTS.md:
   - **AI-only** — field cars, not the player
   - **assist-gated** — behind `drivingHelp` / `ROAD_FOLLOW` / racing line
   - **broadcast-only** — cameras, HUD, commentary
   - **surface** — road/kerb/wall geometry, not a steer torque
3. A player-path read with assists off and no column is `BLOCKER`.
   A site you cannot classify without a rendered lap is `unverified` — never
   run `check-physics.mjs` / `physics-tune-sweep.mjs` to find out.

Flat prohibitions: AGENTS.md §Verification 3 and 7 (no Playwright/test-bg/test-solo/chrome-start, no --wait, no bump); the js/css/index.html write ban is hook-enforced.
In a linked worktree: verify a session-known file from the parent prompt
exists; if it does not, STOP.
