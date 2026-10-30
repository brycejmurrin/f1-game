# UI hunt #3: the in-race screen on the owner's own settings (2026-10-30)

Hunt id UI-HUNT-3-INRACE, tracking issue #4271, PR #4280 (branch `claude/ui-hunt-3-inrace-ftzesj`, the
session's designated branch). Base: deploy tip `7c6d11c6`. Round 2 (PR #4210, `UI-HUNT-2-HUD-2026-10-30.md`)
surveyed shipped defaults; this round seeds the owner's real iPhone export,
`tests/data/settings-defaults-export.json`: HELMET (camMode 19), HUD SIZE 155.25, BUTTON SIZE 245, steer
BUTTONS, TEXT large, contrast HIGH, MIRROR on, map and gaps on, pause look `{btn:115, w:130}`, button and
panel opacity 65.

## Tools added

- `hud-survey.mjs --settings <export>` imports an `apex26-settings-v1` file once per boot
  (`SettingsExport.applySettings`, then a reload, the way `tools/ui/explorer.mjs` seeds one). Every knob a
  cell names still wins; the rest is the file's. Unit cell in `tests/unit/hud-survey.test.mjs`.
- The pause card was measured with `explorer.mjs inspect --screen pause --touch --boot 844x390
  --safe 0,47,21,47 --settings <export>`, which already took a settings file.

## Findings

FIXED = fixed here with before → after; FILED = a `ready` issue; INFO = measured, no defect.

| # | finding | status | evidence (before → after) | fix |
|---|---|---|---|---|
| H3-01 | Pause look CARD WIDTH ≠ 100 turned the split card off: the old 2-column stack, RESUME pinned as a bottom bar, QUIT at y 460–525 of 390 | **FIXED** | explorer inspect, owner's export: `clipped #pm-resume`, QUIT y 460 → `no-findings`, all 14 doors above y 390 (lowest bottom 356); WIDTH 60: clean | `css/overlays.css` split card applies at any width, `--sheet-w: min(760px × width, 100%)`; its door floor takes BUTTON HEIGHT; `css/dialogs.css` bottom-bar RESUME no longer claims the width knob on a compact wide body |
| H3-02 | BUTTON SIZE 245 shrinks SPEED / GEAR / TYRES to the 10 px floor whatever HUD SIZE says | **FIXED** | hud-survey `ui3-isolate` HELMET: default speed 81×40 @14 px; HUD 155 126×62 @21.7 px; BUTTON 245 58×29 @10.1 px; the owner's cell 65×32 @11.5 px | `js/ui/hud.js` steer-dock width budget reserves the cluster at `min(HUD SIZE, 1)`, not `READABLE_Z`: another slider never shrinks a readout below its shipped size. The steer arrows still grow past the pedals. `hud-feel.test.mjs` pins it (base: zBot 0.77, fails) |
| H3-03 | Contrast HIGH (the SHIPPED default) paints the POS cell's dark ink on the dark HC plate: ~1.06:1 | **FIXED** | hud-survey `ui3-bryce-before` `b-helmet.png`: "22/22" near-invisible; `d-helmet.png` (contrast off) dark on white | `:root[data-ui-contrast="high"] :is(.hud-box, #announce)` (1,2,0) outranks design pass 2a's `body:not(.hud-prof-broadcast) #hud-box-pos` (1,1,1); `css/hud.css` keeps the light plate under HIGH CONTRAST, `:root[data-ui-contrast="high"]:has(> body:not(.hud-prof-broadcast)) #hud-box-pos` |
| H3-04 | The iOS install tip shows through the results card (lead 4) | **FIXED** (CSS; not re-captured with the tip forced visible this round) | — | `css/overlays.css`: the pause hide rule also covers `#results` |
| H3-05 | Return paths: knob → default → knob | INFO | `b-helmet` == `b-helmet-last`; `b-helmet-again` steer arrows 1 px lower; `b-chase` == `b-chase-again` | — |
| H3-06 | Monaco, Bahrain night on the owner's knobs | INFO | `b-helmet-monaco`, `b-helmet-bahrain-night` == `b-helmet` box for box | — |
| H3-07 | hud-survey's default cell is `contrast: off` but the game ships HIGH, so no survey measured the shipped contrast; the classifier has no text-contrast check | FILED #4312 | `tools/lib/hud-survey-matrix.mjs` `DEFAULT_CELL.contrast`, `js/ui/appearance-opts.js` `store.get(K_CONTRAST, "high")` | — |

## Final

Batch `scratch/ui-hunt-3/verify-batch.sh` (log `artifacts/logs/ui3-verify.log`), tree `79daa73c` (the HC POS selector
then moved to a `:has()` form for `source-integrity`, same cascade):

- **RESUME after Tab, real tap**, owner's export, 844x390 touch, safe 0/47/21/47 (`scratch/ui-hunt-3/pause-click.mjs`,
  peer request on #4280):
  - base `7c6d11c6`: RESUME at 140,290 593×65; `elementFromPoint` at its centre = `DIV.sheet`; the tap times out
    after 15 s; pause stays open.
  - branch: RESUME at 70,49 254×237; hit = `pm-resume`; tap ok; pause closed in 965 ms.
- **layout-audit** base worktree vs branch, `ios-iphone-landscape-844` + `-safari` × pause, hudpause, results, hud,
  hudtouch, hudbuttons (shipped settings): `= diff ok: 12 cells compared, 0 new, 0 fixed, 0 skipped`.
- **hud-survey** `ui3-bryce-after` (owner's export seeded, same 12 cells): 0 → 0 findings.
  - HELMET SPEED 65×32 @11.5 px → 90×44 @16 px; steer arrows 175 → 148 px (1.64× default).
  - chase SPEED 65×32 → 90×44; arrows 166 → 135 px.
  - cockpit, `d-helmet`, `d-chase`: identical, box for box.
  - Return paths still stable; Monaco and Bahrain night == Monza.
  - `b-helmet.png`: POS "22/22" dark on the light plate.
- **hud-survey** `ui3-isolate-after`: BUTTON 245 alone → speed 81×40 @14 px (was 58×29 @10.1), the shipped size.
  HUD 155 and HUD 155 + BUTTON 150 are unchanged.
- **Pause WIDTH 140 + BUTTON HEIGHT 150**: `no-findings`, 14/14 controls.
- **Not measured**: the shipped-look pause and the second export run. The loadavg gate deferred both (exit 75);
  the base-vs-branch layout-audit covers the shipped look.

- **Scripted live drive** (`scratch/ui-hunt-3/live-drive.mjs`, Playwright, the owner's export, 844x390 touch,
  safe 0/47/21/47, `navigator.webdriver` hidden). Steps on Monaco, Monza and Bahrain night: race → lights → 6 s
  rendered → CAM tap → pause tap → Tab → RESUME tap → finish → results → MENU tap.
  - Run 2: every step ok on all three circuits, 0 page errors.
    - CAM went HELMET → chase.
    - RESUME closed the pause in 739–828 ms.
    - Results MENU sat at 300,300 119×57, and the tap reached the title.
  - The in-race pause shot (`drive2/monza-pause.png`) shows the split card fully on screen at Bryce's look.
  - The probe's "lowest button bottom 464" counts a button inside the card that is not painted. Explorer's
    visibility-filtered count is 14/14 above y 390.
  - Run 1, with the 3D loop live, timed out every screenshot and every CAM/pause tap. SwiftShader starves the
    compositor, which measures the machine, not the game.
- **Not run:**
  - The Playwright **MCP** drive and the pit stop.
  - The 20 s chrome-devtools trace for F-07 (#4318).
  - The CI WebKit leg stays Bryce's call (#4271 lead 3).

Filed: #4312 (survey contrast default + contrast check), #4318 (F-07 trace), #4319 (open HUD-CODE-AUDIT rows).

## Reproduce

The owner-profile matrix (save as `scratch/ui-hunt-3/bryce.json`), then
`node tools/shot/hud-survey.mjs --matrix scratch/ui-hunt-3/bryce.json --settings tests/data/settings-defaults-export.json --gl llvmpipe`:

```json
{"cells": [
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-helmet","cam":"helmet"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-chase","cam":"chase"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-cockpit","cam":"cockpit"},
  {"device":"phone-landscape-844x390","steer":"buttons","name":"d-helmet","cam":"helmet"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-helmet-again","cam":"helmet"},
  {"device":"phone-landscape-844x390","steer":"buttons","name":"d-chase","cam":"chase"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-chase-again","cam":"chase"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-helmet-bc","cam":"helmet","profileLive":"broadcast"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-helmet-last","cam":"helmet"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-helmet-monaco","cam":"helmet","track":"monaco"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-chase-monaco","cam":"chase","track":"monaco"},
  {"device":"phone-landscape-844x390","steer":"buttons","hudScale":155.25,"btnScale":245,"textSize":"large","contrast":"high","mirror":"on","map":"on","gaps":"on","name":"b-helmet-bahrain-night","cam":"helmet","track":"bahrain","tod":"night"}
]}
```
