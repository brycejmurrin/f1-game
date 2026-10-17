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
| H4 | resultsseason | css/overlays.css | — | NOT-A-BUG | explorer `inspect` (touch, safe 0,59,21,59) at 932x430 flagged `#res-menu`, `#res-next` and 4 TYRE STINTS summaries "not-hit-testable"; live at 932x430 touch (no insets) `elementFromPoint` on both buttons returns the button, `pointer-events: auto`, rects inside the 932x430 root. Inspector artifact (flag appears once, on the 932 cell only, not on 844). |
| H5 | datahub (all 6 tabs) | css/menu-destinations.css:64 | low | CONFIRMED-OUT-OF-LANE | `Developer tools` `<summary>` is 27px tall (778x27 at 932, 690x27 at 844) under touch although the rule sets `min-height: var(--tap-min)`; so `--tap-min` resolves to ~27px in this compact shape. Dev-tools disclosure, not a primary control. The file is the Home lane's and the token is shared (css/tokens.css): proposed to the orchestrator, not edited here. |
| H6 | loading, standings, quali, hudtouch, hudbuttons, hudmanual, hud, hudpause, pause, results | — | — | NOT-A-BUG | explorer `inspect --touch --safe 0,59,21,59` at 932x430 and 844x390: `clean`. |

## Not surveyed
Strategy overlay, player tools and Watch/Highlights transport have no screen in the explorer catalog and need live data
(Watch needs a loaded session); not measured this round. Data Hub tab content was measured against the live (empty,
network-less) panels only; F5 was judged on mocked standings.
