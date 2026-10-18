# UI fix: grey-outs, duplicates, layout — 2026-10-18

Bryce, 2026-10-18 ~05:40–06:50Z: "There's way more ui bugs like some things aren't greyed out when they should be,
duplicate label, reorganization etc", "No have it scan all", "Fix that". The findings are LE's audit
(the UI-AUDIT-ALL note on branch `cursor/ui-audit-all-le18`, one GitHub issue per screen, label `area:ui`).
This note is the fix side: the mechanism, and which finding each PR closes. The livery editor is LE's and is not here.

## One mechanism: `SettingDeps` (`js/ui/setting-deps.js`)

Forty-odd "still live when it does nothing" rows are one defect with one fix, not forty one-offs. `SettingDeps.RULES` is
declarative: each rule names the controls it governs, the parent (a control id read from the DOM, or `when()` over a
module's state when the parent lives on another screen) and a short reason.

- Inactive = `disabled` + `aria-disabled="true"`; the value is kept. Never hidden: hiding reflows the sheet under a
  finger (`js/ui/setting-row.js`).
- The reason is an `aria-hidden` suffix inside the control's own one-line label (no reflow at 852×393), referenced by
  the control's `aria-describedby`; a whole section (`<details>`) gets a reason line under its summary.
- `data-dep-off` on the row marks what SettingDeps greyed; it re-enables only those, so an owner's own lock (a DAILY race
  fixing LAPS) is never undone.
- It re-evaluates after any `change` / `input` / `click` (capture phase, deferred one task so an owner's handler has
  painted) and on every settings page entry.

Regression test: `tests/unit/setting-deps.test.mjs` walks every rule — parent off → disabled with a described reason;
parent on → live, value kept; every id exists in `index.html`.

## Rules landed (PR 1)

| Rule | Controls | Parent | Audit row |
|---|---|---|---|
| steer-tilt | TILT SENSITIVITY, TILT RANGE, STEER SMOOTHING, TILT CURVE | STEERING INPUT = TILT | Controls HIGH/MED |
| steer-touch | TOUCH SENSITIVITY, DRAG SMOOTHING, DRAG CURVE | STEERING INPUT = TOUCH | Controls MED |
| sound-engine | the ENGINE TONE fold | SOUND on | Music & sound HIGH |
| layer-* | each engine-layer level slider | its layer pill | Music & sound HIGH |
| line-off | LINE COLOUR, LINE OPACITY | DRIVING LINE ≠ OFF (race settings) | HUD & camera HIGH |

RECALIBRATE TILT was already greyed by `game.js` and is left to it.
