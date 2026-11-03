# UI hunt: in-race HUD and touch controls at 844x390 (2026-10-29)

Read-only bug hunt on the owner's setup: iPhone landscape 844x390, touch first,
47/47/0/21 px safe-area insets injected the way `hud-survey` does it. Tree
`b67866b6` (deploy tip). Dispatcher-launched lane; no code edited.

## What ran

| run | scope | verdict |
|---|---|---|
| `hud-survey` (llvmpipe, measure + shots) | 20 cells: chase / cockpit / TV / heli × standard / minimal / broadcast × UI 80/100/125 × HUD 150 × BUTTON 150 × TEXT LARGER × night × steer buttons × notch-left | `= hud-survey done: 20/20`, 0 findings |
| `hud-survey`, onboard | 12 cells: HELMET (the shipped default cam, index 19) / VISOR / HOOD / T-CAM × the same knobs, plus iPhone SE | 12/12, 9 "missing speed" (all a stale rule, row 7) |
| `hud-survey`, isolation | 7 cells in one boot: BUTTON SIZE first, HUD 150 → back to default | 7/7; this run confirmed rows 5 and 6 |
| live drive ×2 (`scratch/ui-hunt/drive.mjs`, CDP touch on the real buttons) | Monza day and Bahrain night: start lights → GAS held → pause with a second finger → RESUME → cross the line → pit arm → CAM taps → BUTTON SIZE 100/150/200/300 → `finishRace` → results → MENU | no page errors, no NaN / undefined / Infinity in any HUD text |
| gesture trace (`scratch/ui-hunt/verify.mjs`) | CAM button 80 / 700 / 1200 ms presses with an event log, picker geometry, picker after race end | rows 1–3 |

The evidence is under ignored `artifacts/` on the session box and has not been published:
`artifacts/hud-survey/hunt-844{,-onboard,-btn}/` (report.json, sheets), `artifacts/ui-hunt/{monza,bahrain,verify2}/`
(events.json plus numbered PNGs). To reproduce, run the two scratch scripts (`node scratch/ui-hunt/drive.mjs <track>`,
with a static server on :3457) and the matrix files `scratch/ui-hunt/*.json`
(`node tools/shot/hud-survey.mjs --matrix <file> --gl llvmpipe`).

## Ranked findings

Severity: P1 = a player loses a control or is blocked from it; P2 = wrong or inconsistent on screen;
P3 = legibility or polish; info = recorded, no action.

| # | sev | screen / cell | repro | evidence | suspected file:line | fix idea |
|---|---|---|---|---|---|---|
| 1 | **P1** | CAM picker, 844x390, any cam | In a race, long-press CAM. The grid spans y 59–461 in a 390 px viewport with `overflow-y: visible`, so 5 of its 20 buttons are offscreen and cannot be reached: RIVAL LOCK, PIT WALL, DRONE, TV and **HELMET** (the shipped default). | `verify2/events.json` `picker-geo` (`rect [451,59,731,461]`, `vh 390`, `offscreen [...]`); `verify2/01-picker-hold1200.png`; `bahrain/10-cam-far.png` | `css/touch-controls.css:944-965` (no max-height); compact width `:983-987` | `max-height: calc(100dvh - top - var(--sab) - 8px); overflow-y: auto`, or use the free width left of PAUSE (4–5 columns in landscape) so 20 cams fit in 4 rows |
| 2 | **P1** | race end → results | Open the CAM picker, then let the race end (`finishRace`, or cross the line). The picker stays `hidden=false, display:flex` and shows through the translucent results card, under MENU / RACE AGAIN. | `verify2/events.json` `picker-after-finish`; `bahrain/12-results.png` (the CHASE…DRONE grid behind the rows) | `js/camera/cam-picker.js:70-83`: `show()` refuses outside race/count, but nothing hides it on a state change. `css/hud.css:1724` hides it only under `.screen.dim`, and results is not `.dim` | call `hideCamPicker()` from endRace / showResults (or on every `state` change away from race/count), plus a CSS twin such as `body:not(.in-race) #campicker { display: none }` |
| 3 | P2 | CAM button, loaded main thread | A short tap opened the picker (Bahrain, third 80 ms CDP tap), while a 700 ms press cycled the camera. The trace shows the browser delivering pointerdown and pointerup up to 4 s late (`ts61322 → ts65427`). The 340 ms hold is a bare `setTimeout` raced against pointerup, so a tap whose pointerup queues behind a long frame counts as a hold. Software GL here exaggerates the delay. An iPhone long frame (the 0.7–0.9 s first-BOOST stall in `TOUCH-BOOST-FIRST-PRESS-2026-10-23.md`) is enough to trip it. | `verify2/events.json` `gesture-*`; `bahrain/events.json` `cam-tap` (third tap → `campicker` open) | `js/camera/cam-picker.js:96-101` | decide hold from event times: keep `downTs = e.timeStamp`; in pointerup, if `e.timeStamp - downTs < HOLD_MS` and the timer opened the picker, hide it and cycle (or check `performance.now()` against `downTs` inside the timer) |
| 4 | P2 | CAM picker labels | Compact width (280 px, 3 columns): OVERHEAD, CINEMATIC and TRACKSIDE overflow their buttons. | `verify2/events.json` `picker-geo.clipped`; visible in `bahrain/10-cam-far.png` ("CINEMATIC" runs past its edge) | `css/touch-controls.css:983-987` and `:966-976` | a wider grid (row 1 fix), or `font-size: var(--fs-nano)` / `text-overflow` for long ids |
| 5 | P2 | HUD fit is path-dependent | Fresh boot, chase cam: STRATEGY sits at x 57 and RELATIVE at x 242. Set HUD SIZE 150, then back to default: the two panels swap (STRATEGY x 196, RELATIVE x 57) and stay swapped through later BUTTON SIZE changes and a switch to HELMET. Same knobs, different layout, until reload. | `hunt-844-btn/report.json`, cells `b-std` vs `d-std-after-hud150`, `e-*`, `f-*`, `g-*`; `hunt-844-onboard` `p844-helmet-std` vs `p844-helmet-after-hud150-reset` | `js/ui/hud.js:884` `_tyreRestack` and `:1190-1256` (`hud-tyre-stack` / `data-limits-left` restack state that a scale change does not clear). Medium confidence | drop the stored restack on a scale / fit-key change, and add a cell to `hud-fit-idempotent.test.mjs`: fit at 100 → 150 → 100 gives the same rects as a fit at 100 alone. Same family as F-04, different elements |
| 6 | P2 | BUTTON SIZE slider | Live (Bahrain, chase): GAS is 72 px at 100 %, 108 at 150, 144 at 200, then **85 at 300**, where `--hud-z-dock` caps at 1.175. In the survey boot, 100 / 150 / 200 all gave 85 px (dock 1.175 already written). The slider is non-monotonic and its default size depends on history (72 vs 85 px). | `bahrain/events.json` `btnScale` rows; `hunt-844-btn/report.json` cells `a-*`, `e-*`, `f-*` (`gas 700,263,785,348`) | `js/ui/hud.js:1357` (`dockZ = min(max(floor, btn), max(0.4, capDock))`), `:1450` (`set("--hud-z-dock", …)`) | publish the cap as the slider's effective maximum (grey out or label it "max for this screen"), and make `--hud-z-dock` a pure function of (viewport, btnScale) so 200 % can never beat 300 %. Related to F-11 |
| 7 | P2 (tooling) | `hud-survey` | Every touch HELMET cell reports `high missing: speed`. The CSS hides the floating SPEED on purpose when the wheel has an LCD (`body[data-helmet-cam][data-wheel-lcd]`), and the survey's rule only knows `cockpit-cam`. In addition, **HELMET, the shipped default cam, is in neither the quick matrix nor the full one** (FULL_DIMS cams: chase, cockpit, visor, hood, heli, tv), so the default view is never surveyed. | `hunt-844-onboard/findings.md` (9 rows) | `tools/lib/hud-survey-matrix.mjs:757-760` (`camRule("speed", …)`), `:282` (FULL_DIMS cam list), QUICK `:265-278` | add the `data-helmet-cam && data-wheel-lcd && touch` branch (mirroring `js/ui/hud-layout.js:1078`); add `helmet` to FULL_DIMS and a `phoneL-helmet` QUICK cell |
| 8 | P2 (device check) | HELMET default, phone | A fresh phone install races in HELMET (`camMode` default 19). Touch HELMET hides the floating SPEED and relies on the wheel LCD in the 3D frame. The comment at `css/track-detail.css:221-230` records that LCD at "a few pixels" on 844x390, later readable at 852x393. This container renders a black 3D frame under llvmpipe, so the LCD's legibility is **unmeasured**. | `monza/03-race-start.png` (gear + ERS, no speed); `css/track-detail.css:231` | `css/track-detail.css:231` | check on Bryce's iPhone (TLX WebGPU): is the LCD speed readable at arm's length? If not, keep the floating speed on touch HELMET |
| 9 | P3 | BROADCAST profile, 844x390 | `--hud-z-top` / `--hud-z-bot` are capped at 0.72: POS / LAP / TIME paint at 10.1 px, and the gap tower, STRATEGY and RELATIVE rows look about 7 px in the shots. The survey's 10 px floor passes it, and the tower / strategy rows are not font-measured. | `hunt-844` cells `p844-chase-bc`, `p844-tv-bc`; `hunt-844-onboard` `p844-helmet-bc` | `js/ui/hud.js:1422` (0.4 floor off portrait) | STILL REPRODUCES in part: F-05 (fixed for STANDARD, which now paints 14 px). Floor the landscape-phone top band at a readable zoom, or drop columns before shrinking, as the portrait path already does with `READABLE_Z` |
| 10 | P3 | radio card, chase, race start | The radio card is squeezed into a ~105 px column between the gap chips and the sectors plate. "VERSTAPPEN · RADIO "TYRES ARE COLD — TAKE…" is cut off at the bottom. | `artifacts/ui-hunt/verify/01-picker-open.png` | `js/ui/hud-radio-lane.js` (lane width), `js/ui/hud.js` `announceLane` | related to F-02 / F-06 (lane allocation). Set a minimum lane width and fall back to the centred slot when the lane is narrower than one line of the longest word pair |
| 11 | P3 | RELATIVE at HUD 150 / TEXT LARGER, HELMET | RELATIVE collapses to its self row ("P22 VER S", 22 px tall), so the box carries no rival. | `hunt-844-onboard` `p844-helmet-hud150` (rel 242,239–386,261), `-textlarger` | `js/ui/hud-relative.js:184-235` `fitRows` | keep at least ahead + self + behind, or hide the box (`data-col-drop`) rather than show one row |
| 12 | P3 | tyre laps / pit loss text | "~5L" (tyre bar) and "~23 s" (STRATEGY PIT LOSS) use a tilde that, at `--fs-micro` on 1x DPR, reads as a minus sign: "PIT LOSS -23 s", "S -5L". | `artifacts/ui-hunt/tilde-crop.png`; every sheet | `js/ui/hud-strategy.js:43,47`; `js/ui/hud.js:1859` | drop the tilde, or use "≈" / "5 L LEFT"; for the loss, "23 s" alone |
| 13 | P3 | results, 844x390 | The sticky / expanded player row (with TYRE STINTS) paints over the next row's name (P15 HAM is under the P14 row). | `bahrain/12-results.png` | results table CSS (`#results-table` sticky self row) | give the sticky row an opaque background and reserve its height, or un-stick it on short landscapes |
| 14 | P3 | results opens on the player | Results opens scrolled about 1260 px down to the player's row. On a phone the winner, podium and SHARE CARD block are offscreen with no cue. | `verify/events.json` `results-rows` (first rows at y −1264) | results screen scroll-into-view | intended (find yourself) but uncued: a "▲ WINNER" chip, or open at the top with the self row pinned |
| 15 | info | pause with GAS held | Pausing with a second finger while GAS is held releases the throttle (good). After RESUME with the finger still on GAS, throttle stays 0 until a fresh press. Safe, but the driver may think GAS is dead for a moment. | `bahrain/events.json` `paused-gas-still-held`, `resumed-finger-still-on-gas` | `js/input/hold-buttons.js:22-37` (`reset()` clears sets on blur/pause) | none needed; optionally a one-line toast "lift and press GAS" |
| 16 | info (tooling) | Playwright MCP vs stall watchdog | The `playwright-official` MCP browser does not set `navigator.webdriver`, so the stall watchdog reloads the page about 20 s into a race on software GL (`apex26.stallReloads=1`, nav type `reload`). That looks like a crash to a hunter. | this session, first MCP drive | `js/perf/loop-health.js:87-95` `watching()` | document it in `mcp-probe` / `survey-ui-matrix` setup: add an init script that sets `navigator.webdriver`. Only a force-ON switch exists today (`?stallwatch=1`); a `?stallwatch=0` off-switch would help |
| 17 | info | F-10 (TEXT SIZE vs touch speed tiers) | Now fixed: the touch tiers multiply by `--hud-text-boost`. | `css/touch-controls.css:393,404`; `p844-chase-textlarger` | — | close F-10 in the audit |

## Not run / unverified

- **A real flying lap.** No autopilot: the drive used `jump(0.985)` and GAS. After the line, TIME reset but LAP stayed
  "1/2". That is probably the jump harness (a jumped lap is not counted), so it is **not** reported as a bug.
  Unverified.
- **Pit entry through the lane.** `pit({arm:true})` latched the stop (HUD: "▶ STAY IN LANE · BOX BOX — S"), but
  `pit().lane` stayed `null`, so the drive never entered the lane. The pit-lane HUD is unmeasured.
- **3D-frame occlusion and the wheel LCD.** llvmpipe paints a black `#game` in these captures (row 8).
- **WebKit / iOS Safari.** Chromium only. F-01 (no `currentCSSZoom` before iOS 26.4) cannot reproduce here.
- **TV director cuts and the start-light visuals.** Lights were sampled as DOM state only (`#lights` lit-count 4–5,
  then hidden at `race`).
- The start sequence, HUD after MENU (hidden, `body` drops `in-race`) and console errors (none in both drives)
  were checked and are clean.

## Dedupe

Checked against `docs/notes/HUD-CODE-AUDIT-2026-10-10.md` F-01..F-25, DEFECT-LEDGER ~1819-1829 and ~614,
`HELMET-VISOR-HUD-2026-10-05.md`, `TOUCH-BOOST-FIRST-PRESS-2026-10-23.md` and `HUD-TABULAR-DIGITS.md`.
Row 9 is a partial re-repro of F-05. Rows 6 and 10 sit beside F-11 and F-02/F-06. The other rows are new.

## Status (2026-10-30)

Each row is either closed by a merged change or owned by an open PR (a path in an open PR's diff is that PR's).

| # | status | where |
|---|---|---|
| 1 | FIXED | `b297b033` (#4194): `#campicker` gets `max-height` + `overflow-y: auto`, so HELMET / TV are reachable |
| 2 | FIXED | `b297b033`: `body:not(.in-race) #campicker { display: none }` (`css/hud.css`) |
| 3 | FIXED | `b297b033`: `cam-picker.js` judges the hold by `e.timeStamp` |
| 4 | FIXED | `b297b033`: picker buttons `min-width: max-content`, and the row wraps |
| 5 | in #4210 | fit idempotence (100 → 150 → 100 == fresh), unit-pinned |
| 6 | FIXED | #4220: the steer dock follows BUTTON SIZE past the pedal cap (158 px at 245 %), plus a "fits N%" readout. #4210 also changes the dock clamp |
| 7 | in #4210 | HELMET in QUICK + FULL_DIMS; touch-HELMET speed is now expected (#4210 un-hides it) |
| 8 | in #4210 | the GEAR pill covered the LCD speed digits, so the floating speed is shown again |
| 9 | in #4210 | BROADCAST stack floor 11/14 (tower 10.08 → 11.06 px) |
| 10 | in #4210 | radio slot width + `RADIO_UNDER_MIN` lane collapse |
| 11 | in #4210 | REL never collapses to the self row alone |
| 12 | FIXED | `b297b033`: no tilde in the tyre / pit-loss text |
| 13 | in #4210 | results sticky self-row scope |
| 14 | in #4210 | results open at the top with a winner chip |
| 15 | no action | a finger held on GAS through RESUME stays released until a new press. That is the safe behaviour |
| 16 | FIXED | this note's PR: `?stallwatch=0` / `apex26.stallWatch=0` turns the watchdog off, and survey-ui-matrix setup navigates with it |
| 17 | FIXED | F-10 confirmed fixed (#4210's lane note re-reads it) |

The line-colour, BUTTON SHAPE and REPOSITION-toolbar asks that followed this hunt shipped in #4220.
