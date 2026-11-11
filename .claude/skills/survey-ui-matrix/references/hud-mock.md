## Fastest look at the RACE HUD layout: `tools/shot/hud-mock.mjs` / MCP `apex_hud_mock`

The HUD on BLACK with every widget mocked (radio card, flag, limits chip, damage), a labelled box per
element (readouts cyan, taps yellow, overlapping pairs RED), report.json + index.md + sheet.jpg. One race
boot per pointer type, then DOM-only cells. Use it FIRST to see a layout or to before/after a CSS change;
use the hud-survey reference (SKILL.md §References) when the 3D frame behind matters (occlusion).

```sh
node tools/shot/hud-mock.mjs                                              # phone 844x390: 5 cams x shipped/all-on
node tools/shot/hud-mock.mjs --devices phone-se-667x375,phone-max-932x430 --cams cockpit,chase --hud-scale 70,200
node tools/shot/hud-mock.mjs --matrix scratch/cells.json                  # hud-survey cell schema
```
Approximate by design: the mirror frame follows its own show rule (no rendered frame, no side placement).
`--format jpeg` is ~5x smaller; a cell whose definition AND `js/` `css/` `index.html` are unchanged is served from
`artifacts/ui-mock-cache` (`--no-cache` re-shoots), so a re-run after a docs/tools edit is near-free.
