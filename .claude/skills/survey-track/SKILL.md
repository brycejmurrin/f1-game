---
name: survey-track
description: Use when the user asks to survey a track, make a circuit more accurate/realistic, compare Apex 26 to real-world reference, fix floating trees/props, gaps beside the road, terrain channels/steps/sunk water, or do a picture-driven accuracy pass.
---

# Survey & update a track

Orchestrator for taking one circuit from "roughly dressed" to "reads like the
real place". Work one circuit at a time.

```sh
node tools/survey-track.mjs <id>            # screenshots + flagged ground probe
node tools/verify-track.cjs <id>            # after every edit
node .claude/skills/survey-track/ground-profile.mjs <id>   # numbers only
```

Hands off: **scenery-dress** (`js/circuits/<id>.js` `scenery(api)`),
**debug-tracks** (geometry hooks), **playwright-probe** (`shot.mjs`),
**check-changes** (ship). Subagent: **track-surveyor** (writes only that
circuit file; no browser runs).

## Where the truth lives

1. **`docs/tracks/<id>.md`** — per-circuit brief (all 40): theme, elevation,
   landmarks-by-lap-position. Start here.
2. Real-place photos: `WebSearch` / image search. Treat heights/distances as
   best-effort.

## Short loop

1. Read the brief — 3–5 highest-leverage fixes.
2. `survey-track.mjs <id> before` — aerial + orbit/EYE at 0/25/50/75 % +
   flagged probe (`--` holes, >1 m steps, sag).
3. Edit dressing in `js/circuits/<id>.js`; terrain `def` flags in
   `buildTerrain` **and** `groundYAt`, plus the `LIST` whitelist in
   `js/track/tracks.js`.
4. `verify-track.cjs <id>` — a THROW strands the game on the menu.
5. `survey-track.mjs <id> after` — same framings; flags should clear.
6. `node tools/test-bg.mjs circuit` + **bump-cache**.

Montreal already ships `flatTerrain: true` + `terrainOuter: 70` — survey
before re-applying that fix.

## Load on demand

- Full loop, probe flags, Montreal worked example, gotchas →
  [references/loop.md](references/loop.md).
