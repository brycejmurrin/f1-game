# UI lane A — garage and studio screens, phone landscape (2026-10-17)

Scope: Garage (team / engine / parts / livery / wheels), car setup, cockpit preview, Photo Studio, Appearance Studio,
Track Designer. Shapes: 844x390 touch (`menu-mock.mjs`, `ios-iphone-landscape-844`) and 932x430 with notch insets
`--safe=59,0,59,21` (`menu-fit.mjs`). Live checks: chrome-devtools MCP at 844x390x3 mobile+touch.

| id | screen | file:line | severity | verdict | evidence |
|---|---|---|---|---|---|
| A1 | Appearance Studio, ADVANCED summary | css/appearance-studio.css:153 | medium (tap target) | CONFIRMED, owned by #2632 | `min-height: var(--tap-min)`; `--tap-min` is 24px, so the summary paints 28px tall at 844x390 touch (floor 44). Fix and failing-then-passing spec were prepared, then reverted unpushed when the orchestrator assigned this rule to #2632. |
| A2 | Settings > Appearance | (settings panel, #2632 area) | low | CONFIRMED, not mine | `menu-fit` 932x430: `hOverflow: button 73>66`. Left to the #2632 owner. |
| A3 | Track Designer step chips | css/editor.css:454 | — | NOT-A-BUG | menu-mock flagged "clipped 6 0". Live: strip is a deliberate `overflow-x: auto` scroller, all five labels fully visible, chips 52px tall. |
| A4 | Garage / team / wheels `#cs-options` | css/carsetup.css | — | NOT-A-BUG | menu-mock "clipped 5 0": scrollWidth 416 vs clientWidth 411 with `overflow-x: hidden`, but no descendant extends past the right edge and the screenshot shows nothing cut; the tab strip's partial chip is its scroll cue. |
| A5 | Garage livery, Photo Studio, photo controls, customize, advanced | — | — | clean | 0 tap, off-screen, clipped or small-text rows at 844x390. |
| A6 | Cockpit preview (Settings > Display) | css/cockpit-preview.css | — | clean | buttons 57px tall, 156px wide, no overflow; frame 164px tall. |
| A7 | Garage, Photo Studio, Track Designer at 932x430 + notch insets | — | — | clean | `menu-fit` reported nothing for them. |

Result: no new defect in lane A beyond A1, which #2632 owns. No PR opened from this lane.
