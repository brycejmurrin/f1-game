---
name: survey-track
description: Use when the user asks to survey a track, make a circuit more accurate/realistic, compare Apex 26 to real-world reference, or do a picture-driven accuracy pass (gaps, terrain channels/steps, sunk water). Orchestrate first; scenery(api) prop edits after the survey flags them → scenery-dress. Geometry hooks only → debug-tracks.
---

# Survey & update a track

Orchestrator for taking one circuit from "roughly dressed" to "reads like the
real place". Work one circuit at a time.

```sh
node tools/survey-track.mjs <id>            # screenshots + flagged ground probe
node tools/survey-track.mjs <id> --oblique  # plus bounds-fitted topdown + N/E/S/W
# --oblique may sit anywhere; a comma-list after <id> is fracs (no label required):
#   survey-track.mjs monaco --oblique 0.1,0.5
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
   flagged probe (`--` holes, >1 m steps, sag). Add `--oblique` when you need
   a bounds-fitted topdown and N/E/S/W high obliques (floating props, floor voids).
3. Edit dressing in `js/circuits/<id>.js`. New terrain `def` flags need
   `buildTerrain` **and** `groundYAt` plus the `LIST` whitelist in
   `js/track/tracks.js` — that is **engine** work (parent / not
   **track-surveyor**).
4. `verify-track.cjs <id>` — a THROW strands the game on the menu.
5. `survey-track.mjs <id> after` — same framings; flags should clear.
6. Parent ship: `node tools/test-bg.mjs circuits` + `node tools/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`). The
   **track-surveyor** subagent stops at verify-track / coplanar / float-audit.

Montreal already ships `flatTerrain: true` + `terrainOuter: 70` — survey
before re-applying that fix.

## Load on demand

- Full loop, probe flags, Montreal worked example, gotchas →
  [references/loop.md](references/loop.md).
