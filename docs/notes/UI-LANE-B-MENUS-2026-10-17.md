# UI lane B — race setup / settings / career menus (phone landscape)

Survey 2026-10-17 with `tools/ui/menu-mock.mjs` over 28 lane screens at `ios-iphone-landscape` (852x393) and `-844`
(touch), then live checks in the chrome-devtools MCP and Playwright (touch, 844x390). Round 1 only: a first sweep, not
every state of every dialog.

| id | screen | file | severity | verdict | evidence |
|---|---|---|---|---|---|
| B1 | settings › Appearance › ADVANCED summary | `css/appearance-studio.css:153` (`--tap-min`, later @layer) | medium | CONFIRMED | painted 28 tall under touch at 844x390; the touch floor `--tap-paint` (47.7 local, 52 painted) loses on layer order. Fixed in `css/settings.css`; spec in `ui-button-touch.spec.js` fails 26.2 before, passes after |
| B2 | settings › Driving › `#pm-condition-cues` | `js/ui/condition-cue-controls.js:8` | low | NOT-A-BUG | the 14x57 box is the checkbox; its wrapping `<label>` is 397x57 and takes the tap |
| B3 | Garage › Team `#cs-options` | `css/carsetup.css` | low | NOT-A-BUG (outside lane) | 5x0 clipped box is an empty pane, garage lane |
| B4 | settings › Appearance preview label | `js/ui/appearance-studio.js:310` | — | NOT-A-BUG | "Illustrative appearance" flag is an aria-label, not visible text |

Clean in both viewports: select, season-setup, career, settings (all other sub-pages), racesettings, trackdetail,
advanced, audioset, careerguide/hub/history/offers, teampicker, duelpicker, customize.

Not covered yet: dialogs and confirmations opened from these screens, save health, notch insets (`--safe`), UI-scale > 100.

Lesson: a rule in `settings.css` cannot beat `appearance-studio.css` by specificity; `@layer` order decides, so the only
route from an earlier layer is `!important`.
