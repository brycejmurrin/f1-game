---
name: survey-track
argument-hint: "<circuit ids…> [target year]"
description: "Use when a circuit needs an end-to-end accuracy or grounding pass (gaps, terrain-over-road, channels/steps, sunk water), or a multi-circuit realism campaign (/survey-track spa monza: one surveyor per circuit). Props → scenery-dress; geometry hooks only → agent-view."
---

# Survey & update a track

Runs in the PARENT (no fork): the parent owns web research, captures, shared
engine work and integration, and spawns ONE **track-surveyor** subagent per
circuit with [the delegation prompt](references/delegation.md). The surveyor
does the browser-free measurements and source diagnosis, edits only that
circuit's pair of files in its OWN worktree (`isolation: worktree`, so disjoint
circuits run in parallel), and stops at `verify-track` — engine work and the
fleet gate below are the PARENT's, after it returns.

Several circuits (`$ARGUMENTS` = circuit ids, optional target year; every id in
`Tracks.LIST`): the campaign procedure is [references/campaign.md](references/campaign.md)
(research and budgets: `references/campaign-workflow.md`).

## Hand-back

The surveyor's edits are on its worktree branch, not in this checkout. Its report
names the branch and path; merge it before verifying here
(`git merge --no-ff <surveyor-branch>`, then `verify-track` on the merged tree), and
remove the worktree once merged (`git worktree remove <path>`).

```sh
node tools/track/audit-circuit.cjs <id> --json   # ONE offline call: verify/float/clip/coplanar/props/ground vs baselines
node tools/track/audit-circuit.cjs <id> --checks verify,ground   # a subset; run once as baseline, again after all pair edits
```

`ground` (`ground-audit.cjs`) covers buried/unsupported props; `float-audit` is
props only, so terrain-over-road and sunk water still need the parent's
survey captures. The checks are browser-free.

For centreline measurements, load `buildContext()` from
`tools/track/verify-track.cjs`, select the def by id, then call
`Tracks.buildCenterline(def, { line: false })`. For retained road/terrain/prop
geometry use `tools/lib/track-build-vm.cjs`; read its API before use. No browser
launch/capture/automation in the surveyor, including `survey-track.mjs`,
`ground-profile.mjs`, `tools/shot/` commands and cloudBrowser. A numerical-only
output does not make a Chromium-backed tool browser-free.

Subagent: **track-surveyor** (writes only that circuit's pair). A LAYOUT defect
hands over to **new-track**, not dressing; routing is in the description.

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
   Node VM measurements. Request missing views in the hand-back; the surveyor
   never captures them. Parent probes may include aerial/orbit/EYE and obliques.
3. Edit dressing in `js/circuits/scenery/<id>.js` (the closure; the def
   `js/circuits/<id>.js` is the other half of the pair). Complete all pair edits
   before verification. New fields, terrain consumers, the `TrackDef.fromRaw`
   copy, shared engine code, landmark registries, baselines and tests belong to
   the parent. Coordinate edits around any live parent browser run.
4. `verify-track.cjs <id>` — a THROW strands the game on the menu.
5. Return changes, before/after numbers, source/year evidence, baseline deltas
   and uncertainties. Parent captures the same framings after integration.
6. The surveyor stops after `audit-circuit`. Parent integration, browser checks and
   shipping follow **check-changes**.

Montreal already ships `flatTerrain: true` + `terrainOuter: 70` — survey
before re-applying that fix.

## Parent brief and commit recipe (plan WS6; #2399)

- Brief checklist: every frame incl. storm weather; a "Code & scenery deep-dive"
  section (emitter counts with verified file:line); the branch name; PR base
  `track-survey-assets` (never the deploy branch).
- Commit recipe: survey paths are gitignored, so `git add -f <paths>` ALONE in
  one Bash call, then `git commit` in the next.
- Shots: more than 3 go through `apex_shot_survey` / `apex_track op survey`, not
  a loop of `apex_shot` (a 52-shot serial survey took 56 min).
- **Image budget** (plan WS4; #2399): `Read` at most 8 images, then compact; never re-`Read` an old shot; JPEG ≤ 800 px wide for anything a model will look at. A request over 32 MB kills the session and `/compact` with it.

## Load on demand

- Probe flags, Montreal worked example, gotchas, and the PARENT-only steps
  (browser survey, re-survey, ship) → [references/loop.md](references/loop.md);
  the surveyor reads only its "Surveyor steps".

Per-circuit research briefs describe the reference place; verify implementation
claims against source. The baked PBR asset pack ships ON and degrades to the
procedural fallback. A missing baked elevation entry is not a flatness verdict.
