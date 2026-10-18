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

## Rules landed (PR #2857)

LE's dependency table row numbers in brackets; issues #2843–#2853.

| Rule | Controls | Inert when | Row |
|---|---|---|---|
| steer-tilt | TILT SENSITIVITY, STEER SMOOTHING, TILT CURVE | STEERING INPUT ≠ TILT | 1–2 |
| steer-touch(-speed) | TOUCH SENSITIVITY, DRAG SMOOTHING, DRAG CURVE, DRAG AT SPEED | STEERING INPUT ≠ TOUCH | 3 |
| throttle-touch | THROTTLE | STEERING INPUT = TOUCH (always AUTO) | 12 |
| touch-dock | BUTTON SIZE, BUTTON OPACITY, LEFT-HANDED | no touch controls | 13–14 |
| cue-line / cue-condition | LINE-SPEED CUE / CONDITION-AWARE CUES | PREDICTIVE CUE on / off | 10–11 |
| hud-off | STYLE, LAYOUT, MAP, GAPS, MIRROR, PANEL OPACITY | HUD OFF | 4–5 |
| panel-contrast | PANEL OPACITY | HIGH CONTRAST | 24 |
| line-off | LINE COLOUR, LINE OPACITY | DRIVING LINE OFF (race settings) | 6 |
| metrics-off / xr-off | METRICS PAGE/SIDE/SIZE; VR RENDERER/DRIVING | OVERLAY OFF; VR MODE OFF | 34–35 |
| upscale-full | UPSCALE | RESOLUTION HIGH | 23 |
| sound-engine | the ENGINE TONE fold | SOUND EFFECTS off or the master speaker muted | 8 |
| sound-radio | SPOTTER, RADIO FOCUS, RADIO VOICE, RADIO SOUND | master speaker muted | 9 |
| layer-* | each engine-layer level slider | its layer pill off | 7 |
| titleart-off | CAR DRAWING SIZE / LEFT-RIGHT / UP-DOWN | TITLE ART OFF | 18 |
| intro-motion / vignette-motion | TITLE INTRO, REPLAY INTRO; SPEED VIGNETTE | REDUCE MOTION (effective) | 17, 21 |

RECALIBRATE TILT (row 15) was already greyed by `game.js`; its help line now stays visible while greyed, since it is
the reason (`css/settings-controls.css`).

Two rules can govern one control (PANEL OPACITY). The first rule that greys it owns the row, and only that rule can lift
its grey. A later rule in the same pass greys it again if it still applies (unit test).

## Not in this PR

- Controls greyed by their owner with no reason (Spotify, Photo Studio, race settings DAILY/season, RESTART, Data hub,
  saves): next PR, the same module with owner-state reason rules.
- Rows 19 (home camera), 22 (TURN CHASING), 37 (USE AS MENU BACKGROUND): the parent is a camera or store state on another
  screen; they land with their screen's PR.
- Duplicates and labels: their own PRs. The Appearance Studio regroup goes to the orchestrator first, as options with
  phone screenshots.
