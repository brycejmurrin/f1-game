---
name: survey-track
argument-hint: "<circuit ids…> [target year]"
description: "Use when a circuit doesn't match the real place (wrong corners, floating props, re-survey): an accuracy pass against satellite, photos, onboards or OSM, layout or elevation, terrain over the road, or a multi-circuit campaign. Not for: a new circuit → new-track; props → scenery-dress; geometry readouts → agent-view."
---

# Survey & update a track

Runs in the PARENT (no fork): the parent owns web research, captures, shared engine work and
integration, and spawns ONE **track-surveyor** subagent per circuit. The surveyor edits only that
circuit's pair (`js/circuits/<id>.js`, `js/circuits/scenery/<id>.js`) in its OWN worktree
(`isolation: worktree`, so disjoint circuits run in parallel) and stops at `verify-track`; engine
work and the fleet gate are the parent's, after it returns. ONE circuit and a small fix: the parent
may run the surveyor's steps inline (same pair-only edits, same stop at `verify-track`); spawn when
circuits run in parallel or the diagnosis would flood this context.

## Gotchas

- Probe flags are NOT findings until confirmed off lat 0: `⚠ STEP` / `groundCliffs` at lat 0 fall
  through the ribbon to `floorY` ([loop.md](references/loop.md) §2, "Artefacts").
- `ground-profile.mjs` (this folder), `survey-track.mjs`, `tools/shot/` commands and cloudBrowser all
  boot Chromium: PARENT only. A numerical-only output does not make a tool browser-free.
- `scratch/` and `artifacts/` are gitignored and absent from the surveyor's worktree: pass the
  evidence packet and captures as ABSOLUTE main-checkout paths.
- The surveyor's worktree starts at your HEAD: commit prerequisite edits first (do not push).
- A wrong LAYOUT is **new-track** work, not dressing. A missing baked elevation entry is not a
  flatness verdict; a photograph's perspective does not establish a metre dimension or camber.
- Per-circuit research briefs describe the reference place; verify implementation claims against source.

## Workflow (parent)

1. Read `docs/tracks/<id>.md` (the per-circuit brief: theme, elevation, landmarks-by-lap-position)
   and the source pair. Several circuits (`$ARGUMENTS` = circuit ids in `Tracks.LIST`, optional
   target year): follow [campaign.md](references/campaign.md) instead.
2. Baseline, browser-free (run again after all pair edits):
   ```sh
   node tools/track/audit-circuit.cjs <id> --json                  # verify/float/clip/coplanar/props/ground vs baselines
   node tools/track/audit-circuit.cjs <id> --checks verify,ground  # a subset
   ```
   `ground` covers buried/unsupported props; `float-audit` is props only, so terrain-over-road and
   sunk water still need survey captures. Layout numbers: [loop.md](references/loop.md) §Layout check.
3. Capture: `node tools/track/survey-track.mjs <id> before` (aerial/orbit/EYE; `--oblique` for a
   satellite comparison, [loop.md](references/loop.md) §2); any HUD or driver-view capture at
   844×390 landscape first.
4. Build the evidence packet (the delegation prompt cites it): research dated satellite/OSM/
   official-map/onboard sources (WebSearch/WebFetch; cite URLs, year, uncertainty; separate source
   claims from measurements) and fill [evidence-template.json](references/evidence-template.json)
   into `scratch/survey-track/<id>/evidence.json`.
5. Commit prerequisites; that sha is the prompt's `Start SHA`. Spawn one `track-surveyor` with
   [delegation.md](references/delegation.md), passing the packet and
   `scratch/captures/survey-track/<id>/` as absolute main-checkout paths.
   Surveyor: follow `.claude/agents/track-surveyor.md`; its steps are the contract, not restated here.
6. Hand-back (below), then `survey-track.mjs <id> after` with the same framings, then the
   PARENT steps 5–6 in [loop.md](references/loop.md) and shipping via **check-changes**.
7. Update `docs/tracks/<id>.md` from the surveyor's report; publish evidence per
   [publishing.md](references/publishing.md).

## Hand-back

The surveyor's edits are on its worktree branch, not in this checkout. Its report names the branch
and path. Per surveyor, in turn:

1. Scope check BEFORE merging: `git diff --name-only <base>..<surveyor-branch>` (`<base>` = the
   delegation prompt's `Start SHA`) lists only its assigned pair plus `scratch/`/`artifacts/`.
   Anything else = reject that file and say so (the hook cannot bind the circuit id).
2. `git merge --no-ff <surveyor-branch>`, then `verify-track <id>` on the merged tree.
3. `git worktree remove <path>`.

A campaign merges the branches one at a time in that loop (disjoint pairs do not conflict). After
the last merge (one circuit or a campaign) the PARENT regenerates `tools/shot/scenery-locations.json`
once (`node tools/shot/gen-scenery-locations.cjs`; not part of `npm run gen`) — the one home for
that step — then runs the gate.

## References

- [references/loop.md](references/loop.md) — read when reading a probe table, checking layout
  numbers without a browser, editing terrain `def` flags, or running the PARENT survey, re-survey
  and test/ship steps.
- [references/delegation.md](references/delegation.md) — read when spawning a track-surveyor (the
  prompt to fill).
- [references/evidence-template.json](references/evidence-template.json) — read when building a
  circuit's evidence packet.
- [references/campaign.md](references/campaign.md) — read when `$ARGUMENTS` names several circuits
  or a reusable realism campaign.
- [references/campaign-workflow.md](references/campaign-workflow.md) — read during a campaign for
  research, ownership, budgets and acceptance.
- [references/publishing.md](references/publishing.md) — read when writing the parent brief,
  publishing captures, batching more than 3 shots, or when apex-tools MCP is down.
- [playwright-probe recipes §Galleries and image budget](../playwright-probe/references/recipes.md#galleries-and-image-budget)
  — read before attaching a gallery of images.
- [agent-view track-geometry](../agent-view/references/track-geometry.md) — read for deeper
  geometry hooks (`groundY`, corners, grade).
- [check-changes bump](../check-changes/references/bump.md) — read after any `js/*`/`css/*` edit
  (`gen-shell.mjs --check`: `?v=dev`, no bump).
