# UI lane C — in-race HUD, overlays, Data Hub, Watch (phone landscape)

Viewports: 932x430 and 844x390 (touch), plus 852x393 for F5. Method: DOM numbers first (`layout-audit.mjs`, computed
styles via the chrome-devtools MCP), screenshots only to confirm.

## Findings

| id | screen | file:line | severity | verdict | evidence |
|----|--------|-----------|----------|---------|----------|
| F5 | datastandings / dataresults | css/data.css:428 | low | NOT-A-BUG | 852x393 touch, 8 mocked drivers + 4 constructors: every `.dh-name` has scrollWidth == clientWidth (e.g. "Andrea Kimi Antonelli" 199/199 px). The sweep's ellipsis came from real 22-driver data on the 852 cell and does not reproduce. |

## Not yet surveyed
Race HUD, touch controls, pause/results/quali sheets, strategy overlay, player tools, loading card, Watch transport
(layout-audit run in `artifacts/logs/laneC-audit.log`).
