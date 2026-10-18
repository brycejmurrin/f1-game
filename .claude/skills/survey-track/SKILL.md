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
fleet gate below are the PARENT's, after it returns. ONE circuit and a small fix:
the parent may run the surveyor steps below inline instead (same pair-only edits,
same stop at `verify-track`); spawn when circuits run in parallel or the
diagnosis would flood this context.

Several circuits (`$ARGUMENTS` = circuit ids, optional target year; every id in
`Tracks.LIST`): the campaign procedure is [references/campaign.md](references/campaign.md)
(research and budgets: `references/campaign-workflow.md`).

## Hand-back

The surveyor's edits are on its worktree branch, not in this checkout. Its report
names the branch and path; merge it before verifying here
(`git merge --no-ff <surveyor-branch>`, then `verify-track` on the merged tree), and
remove the worktree once merged (`git worktree remove <path>`).

## Baseline audits (parent, before and after)

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

Parent (this session):
1. Read the brief and source pair; run the `audit-circuit` baseline and take the
   captures (aerial/orbit/EYE, obliques) the surveyor will measure against.
2. Spawn one `track-surveyor` with [delegation.md](references/delegation.md).
3. Merge its branch into yours (AGENTS.md rule 10), capture the same framings
   after integration, then browser checks and shipping via **check-changes**.

Surveyor (`.claude/agents/track-surveyor.md` steps 1-5; it never captures):
1. Pick 3-5 fixes, each backed by a measured defect or dated source; request
   missing views in the hand-back.
2. Edit the pair — dressing in `js/circuits/scenery/<id>.js`, the def in
   `js/circuits/<id>.js` — all edits before verifying. New fields, terrain
   consumers, the `TrackDef.fromRaw` copy, engine code, landmark registries,
   baselines and tests belong to the parent.
3. Verify once: `verify-track.cjs <id>` (a THROW strands the game on the menu),
   `coplanar-audit.cjs <id>`, and `float-audit.cjs <id>` if floats were flagged.
4. Return changes, before/after numbers, source/year evidence, baseline deltas
   and uncertainties.

**apex-tools MCP down?** Every `apex_*` route has a CLI under `tools/`: audits
`tools/track/{audit-circuit,ground-audit,clip-audit,coplanar-audit,float-audit}.cjs`,
`centreline-kinks.cjs`, `graph-parity.cjs`, `verify-track.cjs`; `apex_frame_report` =
`tools/shot/frame-report.mjs --track <id>`; multi-shot surveys
`tools/shot/shot-survey.mjs` or `tools/shot/track-session.mjs` (parent only: browser).

## Parent brief and commit recipe

- Brief checklist: every frame incl. storm weather; a "Code & scenery deep-dive"
  section (emitter counts with verified file:line); the branch name; PR base
  `track-survey-assets` (never the deploy branch).
- Commit recipe: survey paths are gitignored, so `git add -f <paths>` ALONE in
  one Bash call, then `git commit` in the next.
- Shots: more than 3 go through `apex_shot_survey` / `apex_track op survey`, not
  a loop of `apex_shot` (a 52-shot serial survey took 56 min).
- **Image budget** → [playwright-probe recipes §Galleries and image budget](../playwright-probe/references/recipes.md#galleries-and-image-budget).

## Load on demand

- Probe flags, Montreal worked example, gotchas, and the PARENT-only steps
  (browser survey, re-survey, ship) → [references/loop.md](references/loop.md);
  the surveyor reads only its "Surveyor steps".

Per-circuit research briefs describe the reference place; verify implementation
claims against source. The baked PBR asset pack ships ON and degrades to the
procedural fallback. A missing baked elevation entry is not a flatness verdict.
