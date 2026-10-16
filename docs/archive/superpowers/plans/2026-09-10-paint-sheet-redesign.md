# Paint sheet redesign Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Slim the garage paint sheet to zone colours + design-gated fills; migrate away ridge/airbox/crestInk/plateInk.

**Architecture:** Keep six design-fill keys; migrate-on-load strips four dead keys; setup-sheet deps grey unused fill rows; matching chips include live tints; liverytex stops reading dead keys.

**Tech Stack:** IIFE modules (`liverytex.js`, `liveries.js`, `setup-sheet.js`, `game.js`, `teams.js`); node:test unit suites.

## Global Constraints

- Authored colour picks stay exact (no contrast re-pick).
- Stock liveries must render identically after migrate (Williams ridge → spineTint).
- No new TOP/SIDE designs; no mesh geometry changes.
- Draft lockstep: `LIV_DRAFT_COLORS` + `Liveries.forTeam` copy list + `game.js` resolve stay in sync (`team-livery.test.mjs`).

---

### Task 1: Migrate + stop reading dead keys

**Files:** `js/car/liverytex.js`, `js/car/liveries.js`, `js/game.js`, `js/data/teams.js`, `js/garage/setup-sheet.js` (draft list only)

- [ ] Add `Liveries.migratePaint(liv)` (or inline in resolve): ridge→spineTint, airbox→cover, delete crestInk/plateInk/ridgeTint/airboxTint
- [ ] Call migrate from `resolveLivery` / garage draft path
- [ ] `ridgeFill`: ignore ridgeTint; use band only
- [ ] `airboxMeshColour`: ignore airboxTint; wrap→sun else cover
- [ ] Lettering: remove crestInk/plateInk reads
- [ ] Williams stock: `spineTint` = former ridge; drop ridgeTint
- [ ] Remove dead keys from LIV_DRAFT_COLORS, copy lists, hints, colorRows
- [ ] Commit

### Task 2: Gate design fills + palette

**Files:** `js/garage/setup-sheet.js`

- [ ] Relabel BAND / SADDLE / FLANK FILL / SUN / 2ND BAND / PLATE
- [ ] `deps.push` for each fill row with live-when predicates from spec
- [ ] Extend `PAL_KEYS` with design fills (and sync with live rows)
- [ ] Commit

### Task 3: Tests + docs

**Files:** `tests/unit/team-livery.test.mjs`, `fin-design.test.mjs`, `livery-contrast.test.mjs`, `car-multi-shot-tools.test.mjs`, skill refs

- [ ] Update lockstep / FIELDS expectations
- [ ] Replace airboxTint / ridgeTint unit expectations
- [ ] Williams asserts spineTint not ridgeTint
- [ ] Update `livery-fields.md` briefly
- [ ] Run unit suites + `verify-change --fast`
- [ ] Commit + push + update PR
