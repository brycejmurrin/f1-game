# AI personality — workstream plan (2026-09-30)

Status: **PLAN** — docs-only PR first; then one draft PR per slice.
Owner: this workstream (Cursor agent). Ship base: `claude/f1-game-project-26h3ng`.
Prior art (do not re-litigate): `docs/notes/AI-PERSONALITY-PLAN-2026-09-16.md`,
`docs/notes/AI-FIELD-RESEARCH.md`, `docs/PHYSICS.md` §Mistakes.

## Goal

Make AI drivers feel like *different people*, not five outputs of one
"goodness" dial; make mistakes legible in a default short race; and make the
rubber band feel like skill/brake-point help with a dead zone — not inert
`vmax` scaling — while keeping `PhysicsConsts.DIFF` values frozen and
easy→hard monotonic.

Out of scope for this workstream (owned elsewhere): AI bunching / stuck
recovery (spacing, `stuckT` / `rescueT` / `isBoxed`), and pace-brake /
parked-player rescue edits in `ai-drive.js` by a parallel agent. Touch those
files only for the minimal personality hooks named below.

## Current state (file/line evidence, tip 2026-09-30)

### Ratings are one axis

`js/data/driver-ratings.js` authors five columns
`[pace, craft, awareness, consistency, experience]` in `BASE` (L11–34).
Pearson *r* over the 22 authored rows (recomputed on tip):

| pair | r |
|---|---|
| craft ~ awareness | **0.934** |
| awareness ~ consistency | **0.957** |
| craft ~ consistency | **0.923** |
| pace ~ craft | 0.865 |
| pace ~ consistency | 0.868 |
| pace ~ experience | 0.458 |

Means: pace 84.0, craft 82.9, awareness 80.0, consistency 81.3, experience 67.6.

`driverSkill()` in `js/game.js` (L1902–1913) normalises craft/awareness/
experience/consistency to 0..1 and draws `skill` from pace only. There is
**no** Aggression or Optimism field on the car or in `AiDrive.traits`
(`js/physics/ai-drive.js` L12–19).

Consumers already monotone in "good":

| axis | seams (non-exhaustive) |
|---|---|
| craft | `brakeTarget` late-brake when attacking (ai-drive ~L371+), `otWant` fire |
| awareness | `stuckThreshold`, `followPad`, `contactGive`, OT awareness mul |
| consistency | skill jitter, `brakeDecision` soft/full, `pacePhase`, `mistakeChance` |
| experience | `steerDamp`, unstuck pull, pass cooldown |

### Mistakes: instrumented, still rare to *see*

Plumbing that *did* ship (2026-09-16 step 1):

- `c.errCount` cleared on new race (`js/game.js` L2231), kept across red-flag
  re-grid (L2299), exposed as `err` on `__apex.cars()` (`js/agent/apex.js`
  L1272), reported by `tools/check/ai-field.mjs` as `mistakes` /
  `mistakesPer100s`.
- Roll site: `js/game.js` ~L5448–5457, once per attack-zone transition, hash
  not `simRnd`, never while alongside.
- Formula: `AiDrive.mistakeChance` base **0.004** × pressure × (1.3−cons) ×
  `DIFF[d].err` (`ai-drive.js` L1054–1056).
- Ladder already carries rate scales (`js/physics/consts.js` L222–235):
  easy `err: 3.5`, normal `1.8`, hard `1.0`. Documented target
  (`docs/PHYSICS.md`): ~3.6 / ~3.3 / ~1.6 **field** mistakes per default
  3-lap race. That is still ~0.15 mistakes **per car** on normal — a player
  watching one rival almost never sees one. `errCount` is not consumed by
  any gameplay/HUD path (instruments + apex only).

### Rubber band: reverse vmax boost, partial disables

`js/game.js` L4724–4739:

- Boost only when leading human is **ahead** (`gap > 0`); no forward band.
- `bandFactor = min(gap/700, 1) * dd.band` — scales `vmax`, also written to
  `c._bandNow` so `diffCorner` lifts (L5055). Still a speed product term.
- Start disable: `raceT - launchT0 > 8`. Lapping disable: `gap < track.total * 0.5`.
- Cap: `BAND_CEIL` (= 1.0 on tip) keeps easy·band from beating hard.
- **No dead zone** around the player; Melder / Game AI Pro ch.42 pattern
  (skill/brake banding, forward+reverse, dead zone) is documented in
  `docs/notes/AI-FIELD-RESEARCH.md` and not implemented.

Frozen DIFF values (do not edit in this workstream):

```
easy:   { ai: 0.851, band: 0.18, corner: 0.93, err: 3.5 }
normal: { ai: 0.911, band: 0.08, corner: 0.97, err: 1.8 }
hard:   { ai: 1.030, band: 0.02, corner: 1.00, err: 1.0 }
BAND_CEIL = 1
```

### Instruments that exist today

| tool | measures |
|---|---|
| `ai-race.mjs pace` | field median lap / DIFF ladder |
| `ai-race.mjs field` | spread, passes, dwell, **mistakesPer100s** |
| `ai-race.mjs line` | apex depth (tight) |
| `ai-race.mjs human` | contact vs driven player |
| `defend-duel.mjs` | staged defend cells |
| **missing** | ratings Pearson / style zero-mean census; band factor profile (dead zone, fwd/rev, skill vs vmax share) |

## Design rules (bind every slice)

1. **Style ≠ difficulty.** Aggression / Optimism are signed, zero-mean across
   the grid by construction (interleaved alternating-sign over overall-sorted
   grid, same pattern as lane preference), **excluded** from
   `DriverRatings.overall()` and from `DriverRatings.skill()`, and **never**
   appear in the top-speed product (`tierV * skill * dd.ai * band…`).
2. **DIFF ladder frozen.** Do not change `DIFF.*.ai|band|corner|err` or
   `BAND_CEIL` literals. Monotonicity tests stay green by behaviour, not by
   retuning the table.
3. **Instruments before claims.** No PR claims an effect without a before/
   after number from an instrument that would have failed before the change.
4. **Every behaviour change needs a failing-first test** (unit preferred;
   VM/instrument for field effects).
5. **No ratchet raises / quarantine / tolerance loosens.** New logic in new
   modules or existing `ai-drive.js` / `driver-ratings.js`; `js/game.js` growth
   paid by extract.
6. **Coordination.** Do not edit stuck-detection, `isBoxed`, spacing recovery,
   or parked-player rescue beyond reading existing traits. Aggression's
   *spacing* half (`followPad`, `contactGive`) waits until the stuck/bunching
   workstream has landed or is explicitly coordinated in a tiny follow-up PR.

## Ordered slices (each independently shippable)

### Slice 0 — this plan (docs-only) — **S**

- Add `docs/plans/2026-09-30-ai-personality.md` (this file).
- Gate: docs-integrity / tooling-fast; no runtime change.

### Slice 1 — Instruments + baselines — **S**

Ship tools **before** any behaviour claim.

| deliverable | purpose |
|---|---|
| `tools/check/<ai-ratings>.mjs` (proposed; + `ai-race.mjs ratings` dispatch) | Pearson matrix on `BASE`, column means, overall order stability, style zero-mean check (once axes exist) |
| `tools/check/<ai-band>.mjs` (proposed; + `ai-race.mjs band` dispatch) | over a short driven/scripted race: histogram of `_bandNow`, share of frames with band>0, gap at which band engages, vmax multiplier vs skill/corner contribution |
| unit pins | instrument CLI `--help` / JSON shape; ratings Pearson helper pure function |
| baseline dump | `artifacts/ai-personality-baseline/` (gitignored): ratings matrix, `ai-field` mistakes ×3 DIFF ×5 seeds, band profile ×3 DIFF — cited in the Slice 1 PR body |

Gate: tools run clean; medians match published PHYSICS ranges within noise; no
game behaviour change. **Not claiming** mistake or band improvements yet.

Paths written `tools/check/<ai-ratings>.mjs` mean the real file
`tools/check/<ai-ratings>.mjs` once Slice 1 lands (same `<name>` convention as
other plans under `docs/plans/`).

### Slice 2 — Decorrelate the table — **S** (data-only)

Re-author `DriverRatings.BASE` so pairwise |r| among craft / awareness /
consistency is **&lt; 0.5**, while:

- each column's mean stays within ±1.5 of tip;
- overall ranking (top 5 / bottom 5 by `overall()`) stays recognisable
  (VER/NOR/LEC/HAM/ALO still high; rookies still low);
- pace column mostly untouched (skill product invariant).

Add `tests/unit/<driver-ratings-personality>.test.mjs` (proposed): correlation
caps, means, overall order pins, `skill()` unchanged for a fixed roll when
only style/craft reshuffle (pace held).

Gate (n≥5 where noisy):

- `ai-race.mjs pace` monza/spa/monaco × easy/normal/hard: median within **0.5 %**
  of Slice 1 baseline;
- `ai-field` / `ai-line` medians inside previously published ranges;
- career / quali unit suites green (overall weighting unchanged).

No new decision code. Existing consumers immediately spread.

### Slice 3 — Aggression + Optimism axes — **M**

**Data + wiring, no DIFF edits.**

1. Add style axes to ratings (separate from `AXES` quality list, or tagged
   so career `deltas` / `overall` / `skill` ignore them): `aggression`,
   `optimism`, authored ± range (e.g. −30..+30 or 0..100 with mid=neutral),
   zero-mean by construction helper `DriverRatings.assignStyle(grid)`.
2. Plumb onto the car in `driverSkill()` / `AiDrive.traits` (one new module
   extract if `game.js` would grow — prefer extending traits object only).
3. **Aggression → fire half only** (this slice):
   - `otWant` situation score / attack threshold
   - pass hold / patience (attacker)
   - *not* `followPad` / `contactGive` / stuck paths (deferred; stuck agent)
4. **Optimism → brake / line half:**
   - `brakeTarget` late-brake margin (over-confidence = later markers)
   - optional gather / run-wide bias during mistake late phase only if it
     does not need a rate change (Slice 4 owns rate)

Unit tests: style excluded from `overall`/`skill`; zero-mean sum ≈ 0;
`otWant` monotone in aggression on a fixed ctx; `brakeTarget` monotone in
optimism on a fixed sample set; top-speed product free of style terms
(pin the product expression / a pure helper).

Gate: duel or staged OT instrument — completion monotone in attacker
aggression (pre-register threshold); `ai-human` contact not above baseline
max; pace ladder within 0.5 %.

### Slice 4 — Mistake visibility in short races — **S/M**

Problem restated: even with `DIFF.err`, expected mistakes **per watched car**
in a 3-lap race ≈ 0.15 on normal. Players do not see personality via Poisson
events that rare.

Design (pick after Slice 1 baselines; do **not** edit `DIFF.*.err`):

- Raise the **base** in `mistakeChance` and/or add an Optimism-scaled term so
  short races show ≥1 visible late-brake/gather on easy/normal across the
  *field*, while hard stays near the F1-22 "two lock-ups felt like too many"
  philosophy (hard field total still ~1–2 / race).
- Optionally surface `err` on a debug/HUD path later — not required for this
  slice if the field instrument already proves non-zero and a live `__apex`
  probe shows a late phase.

Tests: unit formula pins; `ai-field` n≥5 (easy n≥15 if median integer-coarse)
shows mistakesPer100s above Slice 1 baseline with ranges non-overlapping on
easy/normal; hard within noise of baseline; replay/determinism green.

### Slice 5 — Rubber band via skill / brake points — **M**

Rework the L4724–4739 block (extract `js/physics/<ai-band>.js` proposed, or
similar, so `game.js` does not grow):

| Melder rule | this slice |
|---|---|
| dead zone around player | no band while \|gap\| &lt; G₀ (tune from instrument) |
| forward + reverse | slow cars ahead *and* help cars behind, both via skill/brake — not only reverse vmax |
| band skill / brake points | primary: temporary skill and/or `diffCorner` / brake margin; **retire inert vmax scaling** as the main lever (vmax band factor → 0 or vestigial) |
| disable at start / lapping | keep / sharpen existing `launchT0+8` and half-lap guards |
| DIFF.band magnitudes | **reuse** existing `dd.band` numbers as authority for the new mechanism; do not change the table |

Gates:

- easy→hard still monotone on `ai-pace` (three circuits);
- proposed band instrument: dead-zone share &gt; 0 near player; forward frames
  &gt; 0 when AI ahead; vmax contribution → ~0;
- `BAND_CEIL` / monotonicity unit tests still pass without editing DIFF;
- no stuck/spacing edits.

### Deferred (explicitly NOT this workstream)

- Aggression spacing half (`followPad`, `contactGive`) — after stuck/bunching PR lands.
- Composure / energy bias / line-style / tyre-care / quali bias from the
  2026-09-16 ranking (§5 items 3–7) — later workstreams.
- Learning / Drivatar / Sophy.
- Changing `DIFF` literals or raising ratchets/quarantine.
- Stuck detection, rescue teleport, queue spacing, parked-player rescue.

## Risks

| risk | mitigation |
|---|---|
| Decorrelation quietly moves mean pace | pace gate 0.5 %; skill() pinned to pace |
| Aggression raises contact / cautions | Slice 3 fire-half only; `ai-human` ceiling |
| Style leaks into vmax | unit pin on speed product; code review grep |
| Mistake rate retune fights DIFF.err story | change base/optimism term only; leave `err` alone |
| Band skill help looks like cheat on hard | hard `dd.band` is 0.02 — tiny; instrument |
| Merge conflicts on `ai-drive.js` / `game.js` | small PRs; claim via `who-is-on-it`; sync only on conflict/red tip |
| Parallel stuck agent | no edits to stuck/spacing; aggression spacing deferred |

## Test / measurement cheat-sheet

```sh
node tools/check/ai-race.mjs ratings   # Slice 1+
node tools/check/ai-race.mjs band      # Slice 1+; [--diff easy|normal|hard] [--track monza]
node tools/check/ai-race.mjs pace      [--track monza]
node tools/check/ai-race.mjs field     [--runs 5] [--diff normal]
node tools/check/ai-race.mjs line      [--track monza]
node tools/check/ai-race.mjs human     [--runs 3]
node --test tests/unit/ai-drive.test.mjs
node --test tests/unit/<driver-ratings-personality>.test.mjs   # Slice 2+
node tools/ci/tooling-fast.mjs --jobs=3
node tools/ci/deploy.mjs --gate-only
```

(`ai-race.mjs ratings|band` and the personality unit file are proposed until
their slices land; existing `pace|field|line|human` already run today.)

Browser groups: only if a slice touches a browser-covered path
(`pick-tests.mjs`); prefer unit + VM instruments. Cap at two browser groups;
name the rest not-run in the PR.

## PR protocol for this workstream

1. Slice 0 docs-only draft PR → green → undraft (Bryce merge worker merges).
2. Each later slice: own `cursor/ai-personality-<slug>-7b75` branch, draft PR
   into ship, watch CI on exact head, fix root causes, undraft when full tier
   green. **Do not merge.**
3. After every push: `ci-watch.mjs --sha <head>`; refresh PR body from
   `.github/pull_request_template.md` with session-status, Verified / Not run.
4. Final report (end of workstream): PR links, head SHAs, shipped vs deferred,
   before/after instrument tables.
