# Barrier run-off lateral teleports — plan (2026-09-30)

Status: **PLAN** — docs-only first; implementation slices follow as separate
draft PRs. Owns the OPEN ledger item from 2026-09-26
(`docs/notes/DEFECT-LEDGER.md`). A path written `js/<new>/…`, `tests/<new>/…`,
or `tools/<new>/…` is a PROPOSED file (drop the `<new>/` segment), not one that
exists yet.

## Goal

Stop the wall clamp from snapping a car ~7–9 m sideways at run-off termini.
A scrape into a tyre-stack / barrier end should meet an along-track end face
(or a short feathered funnel), not a lateral teleport. Fix is systemic in the
barrier tables / clamp, verified with **per-circuit probes** (not a blanket
`barrierGap` / offset edit of every circuit file).

## Current state (measured 2026-09-30 on ship tip)

### Mechanism

| Layer | File:lines | Behaviour |
|---|---|---|
| Default envelope | `js/track/scenery/build-props.js:620–624` | `RUNOFF_DEFAULT = 9`; every node starts `barL/R[k] = hw[k] + 9` |
| Tighten | `build-props.js:626–629` (`markBarrier`) | `lim = max(hw−1.2, hw+gap−WALL_CLEAR)` with `WALL_CLEAR = 1.1` |
| Open tyre stacks | `build-props.js:1495–1557` | Corner outsides at `gap = 2.2` → limit `hw+1.1`; only stack-span nodes marked |
| Sample | `js/track/core/spline.js:197–207` | `wallAt` = `Math.min(arr[i], arr[j])` of bracketing nodes |
| Clamp | `js/game.js:6135–6196` | past wall → `c.x = wallR` / `−wallL` in one step |

Identity of the open-circuit jump:

```
Δ = RUNOFF_DEFAULT − (tyreGap − WALL_CLEAR) = 9 − (2.2 − 1.1) = 7.9 m
```

There is no along-track collider for a stack's end face — only a per-`s`
lateral cap — so crossing the terminus drops `wallAt` by ~7.9 m and the clamp
pulls `x` inward.

`scratch/hunt-phys/p6*` is cited in the ledger but lives under gitignored
`scratch/`; no recoverable blob in history. Baseline below replaces it.

### Baseline (track-build-vm, 2026-09-30)

Script: `artifacts/measure-wall-jumps.mjs` (regenerable; not committed).

| Circuit | street | max adj `\|Δbar\|` | max `wallAt` step | `#` adj Δ≥7 | worst site |
|---|---|---:|---:|---:|---|
| monza | no | **7.90** | **7.90** | 11 | R@0.616: over 9.0 → 1.1 |
| spa | no | **7.90** | **7.90** | 22 | L@0.034: over 9.0 → 1.1 |
| bahrain | no | **7.90** | **7.90** | 17 | L@0.044: over 9.0 → 1.1 |
| silverstone | no | **7.90** | **7.90** | 23 | L@0.068: over 9.0 → 1.1 |
| monaco | yes | **8.96** | **8.96** | 4 | R@0.050 pit taper: 13.71 → 4.74 |

Open circuits: every `|Δ| > 7` inspected is exactly the default↔tyre pair.
Street: large jumps are pit `openBoundary` ↔ street-wall tapers
(`js/track/core/pit.js:418–436`), same clamp symptom, different author.

### Debris interaction

`js/physics/debris-world.js` `wallImpact` / `promoteBarrier` take pre-clamp
`xOver`. A 7.9 m teleport looks like a catastrophic hit and can false-fire
barrier promotion. Removing the lateral snap de-noises that path; do not
retune severity gates to hide the defect.

## Design

Prefer fixing the **data discontinuity** and the **clamp response** over
rewriting `wallAt`'s steady-state semantics.

1. **Feather termini in the barrier tables (primary for open circuits).**
   When a `markBarrier` / `recordBarrier` span ends against a default-runoff
   neighbour (`|Δ| ≥ ~3 m`), ramp the limit over N nodes (~8–16 m of track,
   ~2–4 nodes at `ds ≈ 4`) instead of a one-node cliff. Interior faces of a
   stack stay at the tight limit so Jeddah / street absolute checks keep
   their numbers. Shared helper next to `markBarrier` — one place, every
   emitter that tightens `bar*`.

2. **End-face response at the clamp (primary for residual / pit discontinuities).**
   When `|wallAt(s) − wallAt(s±ds)|` is large and the car sits outside the
   tighter limit, treat the step as an **along-track face**: scrub / bounce
   on `s` (and heading into the face), keep lateral until past the face —
   do not assign `c.x = tighter`. Lives in a **new module** (game.js ratchet
   has **0 lines of slack**: 9913 / 9913). Call site only in `game.js`.

3. **Per-circuit probes (verification, not the fix).**
   A unit fleet probe (and optional `__apex` / agent helper) reports max adj
   `Δbar` and max one-step clamp Δx per circuit. Caps are ratcheted down as
   slices land. **Not** per-circuit authored offsets in `js/circuits/*.js`.

4. **`wallAt` linear interpolation — deferred / optional.**
   Replacing `Math.min` with lerp reduces the early snap inside a segment
   but still spans 7.9 m over ~4 m of track without (1)/(2). Touches every
   consumer (AI clearances, incident clamp, debris panels, retire). Only if
   S2+S3 leave a residual that probes still flag.

### Explicit non-goals (this workstream does NOT)

- Blanket `barrierGap` / `RUNOFF_DEFAULT` edits across circuit files.
- Loosening elevation, props-over-road, AI wall-scrub, Jeddah face, or
  collision specs / tolerances / timeouts.
- Raising file-size ratchets or growing quarantine / suppression lists.
- Reworking breakable-barrier Rapier collision (R3) or debris severity tables.
- Owning `claude/barrier-wrap-dedupe` (start-line wrap "already laid" in
  `structures.js`) — coordinate only; do not re-edit that path unless a
  feather helper must share a call.
- Owning `cursor/carve-headroom-*` game.js extracts — if they land a
  `player-wall` module first, hook the end-face helper there instead of a
  second extract.

## Ordered slices

Each slice is its own draft PR into `claude/f1-game-project-26h3ng`, small,
independently shippable. Mark ready only when full-tier CI is green on that
exact head. Do **not** merge (Bryce's merge worker).

### Slice 0 — this plan (docs-only) — S

- Add `docs/plans/2026-09-30-barrier-runoff-teleports.md` (+ README index line).
- Verify: docs-integrity / tooling-fast; no `js/` / `css/`.

### Slice 1 — regression probe helper — S

- New `tests/<new>/unit/barrier-runoff-jumps.test.mjs` and optional
  `tools/<new>/track/barrier-jumps.cjs` (tiny pure helper):
  - Export `maxBarrierJump(barArr)` / `maxAdjOver(track)` and pin helper math
    on a **synthetic** bar array (cliff of 7.9 must be detected; a 3-node
    feather must score under 3). No fleet upper-bound assert yet — a tip-red
    fleet cap cannot land before the fix.
  - Fleet caps land in Slice 2 in the **same** commit as feathering (that
    test would fail before the feather change).
- Verify: `node --test` on the new unit file; `deploy.mjs --gate-only` before
  push.
- Measurement: helper detects synthetic 7.9 cliff and 2.0 feather.

### Slice 2 — feather open-circuit tyre / recordBarrier termini — M

- Add `featherBarrierEnds(arr, hw, opts)` (or inline after open-circuit stack
  pass + after `recordBarrier` spans) in `build-props.js` near `markBarrier`.
  Ramp from tight → runoff over `FEATHER_NODES` (start at 3 ≈ 12 m; tune to
  probe).
- Do **not** feather street continuous walls (already tight). Pit tapers left
  to S3 unless a one-line shared feather at `openBoundary` edges is cheap and
  probe-proven.
- Test: fleet probe on monza/spa/bahrain/silverstone:
  `maxAdjOver < 3.0` (or measured after); interior tyre face still
  `wallAt ≈ hw+1.1` at a known corner mid-stack; `track-foundation`
  thin-prop / `baku-migration` `tightFraction` unchanged; `collision-ai-fixes-vm`
  Jeddah + Monza pushIn green without tolerance edits.
- Verify: unit above + `collision-ai-fixes-vm` + `track-foundation` subset;
  name browser collision group as not-run if Actions covers it via select.
- Measurement (before → after on same tip): monza/spa/bahrain/silverstone
  max adj Δ and max wallAt step.

### Slice 3 — clamp end-face for residual discontinuities — M

- New module e.g. `js/<new>/physics/wall-end-face.js` (IIFE + `manifest.cjs` +
  `gen-shell`): given `(c, wallR, wallL, track, dt, …)` detect a steep
  along-track wall slope at the contact side and, when `|x|` exceeds the
  **tighter** upcoming limit, apply end-face response instead of
  `c.x = wall`. Steady walls (slope ≈ 0) keep today's clamp.
- Wire one call from the existing wall block in `game.js`; extract enough
  surrounding lines if needed so the ratchet does not rise (pair with
  carve-headroom if their wall extract landed).
- Test that **fails before**: park a car at monza R@0.616 with `x = hw+8`
  (inside runoff, outside post-terminus limit), step across the terminus —
  before: `|Δx| ≥ 7`; after: `|Δx| < 1.5` and speed scrubbed / `s` resisted.
  Prefer game-vm twin so it stays in tooling-fast.
- Re-verify: `collisions-deep-vm`, `physics-fixes` wall scrub,
  `incident-gate`, `mechanics-integration` `wasOnWall` / `wallHits`,
  `collision-ai-fixes-vm`. Elevation / props suites only if S2 touched
  geometry that select-specs would pull in (S3 should not).
- Measurement: residual max clamp Δx on monaco pit taper + one open circuit
  after S2; debris false-promote rate with `apex26.breakBarriers` on a scrape
  across a terminus (spot check).

### Slice 4 — optional `wallAt` lerp + fleet probe ratchet — S (only if needed)

- If S2+S3 leave probes with max step > 2 m on any permanent circuit, change
  `wallAt` to linear interpolate **within** a segment (keep segment endpoints
  as the barrier table values). Re-check Jeddah `wallAt ≈ hw+barrierGap−1.1`
  and autopilot `maxWall`.
- Fleet probe becomes a permanent ratchet: `maxAdjOver ≤ cap` per class
  (open / street), lowered only, never raised.

## Tests that must stay green (no loosening)

| Path | Pins |
|---|---|
| `tests/unit/collision-ai-fixes-vm.test.mjs` (+ browser twin) | Monza pushIn scrub; Jeddah `wallAt` / cannot pass face |
| `tests/specs/physics-fixes.spec.js` | Wall scrub scales with steer-into |
| `tests/unit/collisions-deep-vm.test.mjs` (+ browser twin) | Driver↔wall; street pin; sandwich |
| `tests/unit/incident-gate.test.mjs` | R2 postStep clamps to `wallAt` |
| `tests/unit/track-foundation.test.mjs` | Thin props ≠ invisible walls; sceneryRange↔recordBarrier |
| `tests/unit/baku-migration.test.mjs` | `tightFraction(bar*)` off-pit |
| `tests/unit/pit-lane.test.mjs` / `pit-complex.test.mjs` | Pit boundary vs `bar*` |
| `tests/unit/ai-drive.test.mjs` | `wallHitLoss` / `wallSteerScrub` / `wallAiScrub` |
| `tests/unit/mechanics-integration-vm.test.mjs` | `wasOnWall` / `wallHits` debounce |
| Elevation / props | `elevation-tracks-vm`, `terrain-over-road`, `props-over-road` — re-run if barrier rebuild shifts meshes; never widen caps |

## Risks

| Risk | Mitigation |
|---|---|
| Feather softens a corner approach and changes AI line / scrub | Cap feather length; keep mid-stack face; AI scrub specs green |
| End-face lets cars past a visual panel for one node | Only engage when `|Δbar|` exceeds threshold; otherwise old clamp |
| `game.js` ratchet (0 slack) / carve-headroom race | New module; call site only; if carve lands first, attach there |
| `barrier-wrap-dedupe` editing `structures.js` | Orthogonal; avoid that file; feather sits in `build-props.js` |
| Geometry sweeps / props after bar table change | S2 is physics-table only (same meshes); confirm byte-identical props buffers on monza before/after if unsure |
| False debris on termini until fix | S2 alone should drop `xOver` at open termini; measure once |

## Concurrent coordination

- **`claude/barrier-wrap-dedupe`**: wrap start-line "already laid" in
  `structures.js` — do not touch; feather after marks are applied.
- **`cursor/carve-headroom-*`**: extracting player forces / wall from
  `game.js` — S3 prefers a sibling module; rebase call site onto their
  extract if merged first.
- Sync to ship only on conflict or tip-red required check (AGENTS.md
  concurrent-PR protocol).

## Success criteria

- Open permanent circuits: max adj `|Δ(bar−hw)|` at tyre termini **< 3 m**
  (feathered), and a car scraping across a terminus moves laterally **< 1.5 m**
  in one physics step.
- Monaco pit taper: either feathered or end-faced so clamp Δx **< 2 m**.
- All listed must-keep tests green with **unchanged** assertions.
- Ledger OPEN item closed with before/after table in the final slice PR body.

## Implementation order after this PR

1. Slice 1 (probe helper) → draft PR → CI green → ready.
2. Slice 2 (feather) → draft PR → CI green → ready.
3. Slice 3 (end-face module) → draft PR → CI green → ready.
4. Slice 4 only if probes still red.
5. Final report: PR links, head SHAs, shipped vs deferred, before/after
   measurements; update DEFECT-LEDGER when the last required slice is ready.
