# Plan: logo-only mark colours

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Paint sheet offers only logo/logo2/logo3 for marks; crestInk/plateInk rows gone; lettering auto.

**Architecture:** UI + draft tables drop two colour keys; atlas keeps reading them if present on stored liv for back-compat; stop routing mark halos / starfield through crestInk.

**Tech stack:** IIFE modules (`js/car/liverytex.js`, `js/garage/setup-sheet.js`), node:test unit suites.

### Task 1: Draft + sheet — drop crestInk / plateInk selectors

**Files:**
- Modify: `js/garage/setup-sheet.js` (`LIV_DRAFT_COLORS`, `LIV_ROW_HINT`, colorRow calls)
- Modify: `tests/unit/team-livery.test.mjs` (draft colour list expectations)

**Step 1:** Remove `crestInk`, `plateInk` from `LIV_DRAFT_COLORS` and `LIV_ROW_HINT`; remove their `colorRow` lines. Keep `plateTint`.

**Step 2:** Update team-livery tests that enumerate draft colours / paint-row hints.

**Step 3:** `node --test tests/unit/team-livery.test.mjs` — pass.

### Task 2: Atlas — lettering auto; marks ignore crestInk for halos/starfield

**Files:**
- Modify: `js/car/liverytex.js`
- Modify: `tests/unit/fin-design.test.mjs` / `livery-contrast.test.mjs` as needed

**Step 1:** `inkCrest` / `inkFlank` / `inkMark` = `colors.crestInk || inkOn(...)` stays for stored-liv back-compat OR document that we keep the read. Starfield: remove crestInk from fallback chain. Mark `markHalo(..., inkCrest)` for crown logos → use `inkOn([coverPaint])` (or keep crestInk only when set — design says stored still read; keep `colors.crestInk || inkOn`).

Actually design: lettering uses inkOn; stored crestInk still read. So keep `colors.crestInk || inkOn` for lettering. Starfield: no crestInk. Image markHalo for flank already uses inkMark which is crestInk||auto — that's lettering-adjacent halo for uploaded art; OK to keep reading crestInk if set.

**Step 2:** Fix any test that requires crestInk row in the sheet.

**Step 3:** Run fin-design, crest-marks, livery-contrast, team-livery.

### Task 3: resolveLivery + docs hints

**Files:**
- `js/game.js` — keep crestInk/plateInk in resolveLivery for stored liv (do not remove reads)
- Spec already written; short note in PR body

### Task 4: Verify + push

`npm run test:tooling-fast` via verify-change --fast; push branch; update PR #120.
