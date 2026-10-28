---
name: survey-track
argument-hint: "<circuit ids…> [target year]"
description: "Use when a circuit is unlike the real place: a realism or accuracy pass vs satellite imagery, photos, onboard footage or OSM; layout/elevation survey; terrain-over-road, gaps, channels, sunk water; a multi-circuit campaign (/survey-track spa monza). New circuit → new-track; props → scenery-dress; geometry hooks → agent-view."
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
names the branch and path. Per surveyor, in turn:

1. Scope check BEFORE merging: `git diff --name-only <base>..<surveyor-branch>` (`<base>` = the
   delegation prompt's `Start SHA`) lists only its
   assigned pair (`js/circuits/<id>.js`, `js/circuits/scenery/<id>.js`) plus `scratch/`/`artifacts/`.
   Anything else = reject that file and say so (the hook cannot bind the circuit id).
2. `git merge --no-ff <surveyor-branch>`, then `verify-track <id>` on the merged tree.
3. `git worktree remove <path>`.

A campaign merges the branches one at a time in that loop (disjoint pairs do not conflict). After the
last merge (one circuit or a campaign) the PARENT regenerates `tools/shot/scenery-locations.json` once
(`node tools/shot/gen-scenery-locations.cjs`; not part of `npm run gen`) — the one home for that step —
then runs the gate.

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
`ground-profile.mjs` (in this skill's folder: a PARENT-run browser script), `tools/shot/` commands
and cloudBrowser. A numerical-only
output does not make a Chromium-backed tool browser-free.

Subagent: **track-surveyor** (writes only that circuit's pair). A LAYOUT defect
hands over to **new-track**, not dressing; routing is in the description.

## Where the truth lives

1. **`docs/tracks/<id>.md`** — per-circuit brief (one per circuit): theme, elevation,
   landmarks-by-lap-position. Start here.
2. No-browser layout check (built `total`, apexes, widths, sectors, elevation vs dated
   evidence; which fraction space each field uses) → [loop.md](references/loop.md) §Layout check.
   A wrong LAYOUT → **new-track**. Probe flags are NOT findings until confirmed off lat 0
   ([loop.md](references/loop.md), "Artefacts" paragraph).
3. Parent-supplied real-place photos/maps and numerical sources: retain URLs,
   document year and uncertainty. Distinguish source claims from measurements;
   a photograph's perspective does not establish a metre dimension or camber.

## Short loop

Parent (this session):
1. Read the brief and source pair; run the `audit-circuit` baseline and take the
   captures the surveyor will measure against: `node tools/track/survey-track.mjs <id> before`
   (aerial/orbit/EYE; add `--oblique` for a satellite comparison — [loop.md](references/loop.md) §2);
   any HUD or driver-view capture at 844×390 landscape first (AGENTS.md §Coordination).
2. **Build the evidence packet** — the delegation prompt cites it, so it must exist first:
   research dated satellite/OSM/official-map/onboard sources (WebSearch/WebFetch; cite URLs, year,
   uncertainty) and fill [evidence-template.json](references/evidence-template.json) into
   `scratch/survey-track/<id>/evidence.json` (same packet as [campaign.md](references/campaign.md) step 2).
3. Commit (do not push) any prerequisite edits — the surveyor's worktree starts at your HEAD
   (AGENTS.md rule 10) and sees no uncommitted change; that sha is the prompt's `Start SHA`.
4. Spawn one `track-surveyor` with [delegation.md](references/delegation.md). `scratch/` and
   `artifacts/` are gitignored and NOT in its worktree: pass the evidence packet and the
   `scratch/captures/survey-track/<id>/` shots as ABSOLUTE main-checkout paths (Read works across checkouts).
5. Merge its branch into yours (§Hand-back), capture the same framings after integration
   (`survey-track.mjs <id> after`), then browser checks and shipping via **check-changes**.

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

**apex-tools MCP down?** Every `apex_*` route has a CLI under `tools/` (map: `docs/AGENT-SURFACE.md`);
the surveys `tools/shot/shot-survey.mjs` / `track-session.mjs` are browser (parent only).

## Parent brief and evidence publication

- Brief checklist: every frame incl. storm weather; a "Code & scenery deep-dive"
  section (emitter counts with verified file:line); the source branch/commit and
  published evidence URL.
- New capture output stays under ignored `artifacts/` or `scratch/`. Publish with
  `node tools/shot/publish-evidence.mjs --dir artifacts/<capture> --label <slug> --publish`
  and link the release assets; do not force-add images to a survey branch.
  See `docs/EVIDENCE-STORAGE.md` for plan, local packaging, retries and retention.
- Existing survey PRs keep their `track-survey-assets` base and pinned links.
  Code/scenery fixes use a separate image-free deploy-branch PR.
- Shots: more than 3 go through `apex_shot_survey` / `apex_track op survey`, not
  a loop of `apex_shot` (a serial loop costs a browser boot per shot).
- **Image budget** → [playwright-probe recipes §Galleries and image budget](../playwright-probe/references/recipes.md#galleries-and-image-budget).

## Load on demand

- Probe flags, Montreal worked example, gotchas, and the PARENT-only steps
  (browser survey, re-survey, ship) → [references/loop.md](references/loop.md);
  the surveyor reads only its steps 1, 3 and 4 (loop.md's header line).

Per-circuit research briefs describe the reference place; verify implementation
claims against source. The baked PBR asset pack ships ON and degrades to the
procedural fallback. A missing baked elevation entry is not a flatness verdict.
