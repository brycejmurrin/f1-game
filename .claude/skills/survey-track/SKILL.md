---
name: survey-track
context: fork
agent: track-surveyor
description: "Use when one circuit needs an accuracy or grounding pass (gaps, terrain-over-road, channels/steps, sunk water). Worker analysis is browser-free with parent captures; reusable or parallel multi-track campaigns → track-realism; prop implementation → scenery-dress; geometry hooks only → agent-view."
---

# Survey & update a track

Browser-free worker workflow for one assigned circuit's end-to-end accuracy
pass. The parent owns web research, captures, shared engine work and integration.
For a reusable or parallel multi-track campaign, the parent uses the
[track-realism workflow](../track-realism/SKILL.md).

Runs FORKED as the **track-surveyor** subagent (`context: fork`,
`agent: track-surveyor`): the browser-free measurements and source diagnosis stay in the
fork; the parent captures survey framings. The fork edits only that circuit's
pair of files, and it stops at
`verify-track` — engine work and the fleet gate below are the PARENT's, after
the fork returns.

```sh
node tools/track/verify-track.cjs <id>            # baseline; again after all pair edits
node tools/track/float-audit.cjs <id> --json      # props, not terrain-over-road/water
node tools/track/coplanar-audit.cjs <id>         # when overlapping faces matter
```

For centreline measurements, load `buildContext()` from
`tools/track/verify-track.cjs`, select the def by id, then call
`Tracks.buildCenterline(def, { line: false })`. For retained road/terrain/prop
geometry use `tools/lib/track-build-vm.cjs`; read its API before use. No browser
launch/capture/automation in the fork, including `survey-track.mjs`,
`ground-profile.mjs`, `tools/shot/` commands and cloudBrowser. A numerical-only
output does not make a Chromium-backed tool browser-free.

Related workflows, coordinated by the parent: **scenery-dress** (`js/circuits/scenery/<id>.js` `scenery(api)`),
**new-track** (the def itself — `path`, `turns`/`sectors`, elevation, banking,
widths: a survey that finds the LAYOUT wrong hands over here, not to dressing),
**agent-view** (geometry hooks), **playwright-probe** (`shot.mjs`),
**check-changes** (ship). Subagent: **track-surveyor** (writes only that
circuit's pair — def + scenery closure; no browser runs).

## Where the truth lives

1. **`docs/tracks/<id>.md`** — per-circuit brief (all 52): theme, elevation,
   landmarks-by-lap-position. Start here.
2. No-browser layout check: compare the BUILT centreline's `total`, apexes,
   widths, sectors and elevation against dated evidence. `path.len` is source
   metadata, not built length; the existing OSM comparison normalizes scale,
   rotation and lap origin, so it cannot certify those quantities. Surveyed
   elevation conditionally overrides authored bumps via `TrackDef.fromRaw`
   (`js/track/core/def.js`); absent profiles do not prove flatness. `startFrac`
   and width zones use control-index fractions, built `s/total` arc fractions,
   and turns/sectors racing-space fractions. Respect `_sceneryShift` through
   wrapped helpers; never pre-shift `K(s)`. A wrong LAYOUT → **new-track**.
   Probe flags are NOT findings until confirmed off lat 0
   ([loop.md](references/loop.md), "Artefacts" paragraph).
3. Parent-supplied real-place photos/maps and numerical sources: retain URLs,
   document year and uncertainty. Distinguish source claims from measurements;
   a photograph's perspective does not establish a metre dimension or camber.

## Short loop

1. Read the brief, source pair and parent evidence — select 3–5 fixes supported
   by a measured defect or dated source.
2. Read the parent's baseline captures and record camera framings alongside
   Node VM measurements. Request missing views in the hand-back; the fork
   never captures them. Parent probes may include aerial/orbit/EYE and obliques.
3. Edit dressing in `js/circuits/scenery/<id>.js` (the closure; the def
   `js/circuits/<id>.js` is the other half of the pair). Complete all pair edits
   before verification. New fields, terrain consumers, the `TrackDef.fromRaw`
   copy, shared engine code, landmark registries, baselines and tests belong to
   the parent. Coordinate edits around any live parent browser run.
4. `verify-track.cjs <id>` — a THROW strands the game on the menu.
5. Return changes, before/after numbers, source/year evidence, baseline deltas
   and uncertainties. Parent captures the same framings after integration.
6. The fork stops after verify-track / applicable coplanar / float-audit.
   Parent integration, targeted browser checks and shipping follow
   **check-changes**, after the fork returns. New fields, landmark registries,
   baselines and tests remain parent-owned.

Montreal already ships `flatTerrain: true` + `terrainOuter: 70` — survey
before re-applying that fix.

## Load on demand

- Full loop, probe flags, Montreal worked example, gotchas →
  [references/loop.md](references/loop.md).

Per-circuit research briefs describe the reference place; verify implementation
claims against source. The baked PBR asset pack ships ON and degrades to the
procedural fallback. A missing baked elevation entry is not a flatness verdict.
