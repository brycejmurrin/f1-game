# UI lane C — in-race HUD, overlays, Data Hub, Watch (phone landscape)

Viewports: 932x430 and 844x390 (touch), plus 852x393 for F5. Method: DOM numbers first (`layout-audit.mjs`, computed
styles via the chrome-devtools MCP), screenshots only to confirm.

## Findings

| id | screen | file:line | severity | verdict | evidence |
|----|--------|-----------|----------|---------|----------|
| F5 | datastandings / dataresults | css/data.css:428 | low | NOT-A-BUG | 852x393 touch, 8 mocked drivers + 4 constructors: every `.dh-name` has scrollWidth == clientWidth (e.g. "Andrea Kimi Antonelli" 199/199 px). The sweep's ellipsis came from real 22-driver data on the 852 cell and does not reproduce. |

| H1 | race HUD + touch controls | css/hud.css, css/touch-controls.css | — | NOT-A-BUG | 844x390 touch, monza chase+cockpit: `hud-survey` 0 findings; DOM probe: no button < 44px, no clipped text, nothing off-screen; one screenshot shows no collisions (S1-S3 panel sits under BEST, clear of BOOST). |
| H2 | pause sheet | css/overlays.css | — | NOT-A-BUG | 844x390 touch: no tap target < 44px, no text clip; rows reported "off" are below the fold of the scrolling sheet body (by design). |
| H3 | results, resultsseason, datahub, hudpause, quali, loading, standings, hudtouch/buttons/manual | — | — | NOT-A-BUG | `layout-audit` 844 + 852 touch: clipped/offscreen/tap/trunc/starved/xOverflow all 0; `deepScroll 1` on results/resultsseason/datahub is scroll depth, not a defect. |

## Not yet surveyed
Data Hub tabs schedule/telemetry/live/export (audit cells timed out waiting for network — need mocked fetch), strategy
overlay, player tools, Watch/Highlights transport.
