# UI audit, every screen — 2026-10-18

Bryce, 2026-10-18 ~05:40Z: "There's way more ui bugs like some things aren't greyed out when they should be, duplicate
label, reorganization etc" and "No have it scan all". This note runs three checks over every screen and menu:

1. missing or wrong grey-outs
2. duplicate or inconsistent labels
3. organization problems

The garage paint editor has its own note, `LIVERY-EDITOR-AUDIT-2026-10-18.md` (PR #2809),
and is not repeated here.

## Method

- **Dependency table (source).** A read-only survey of `js/ui/**`, `js/garage/**`, `js/career/**`, `js/data/**`,
  `js/editor/**` and the photo studio found every control that does nothing while another setting is in some state.
  Each row is backed by the `file:line` where the code ignores the control. A row is a defect when the control still
  looks live in that state, or is greyed with no reason the player can see on a phone.
- **Live scan (DOM).** `scratch/ui-scan/scan.mjs` opens every screen in the `tools/ui/menu-screens.mjs` catalog at
  852×393 with touch (Bryce's iPhone 15 in landscape). It records every visible control (label, row, section, disabled
  state, whether it has a visible or announced reason). It then flips every setting-type control (select, range,
  checkbox, switch, pill in a group) and records what moved: localStorage keys, other controls' greyed or hidden state,
  and the screen's text. `scratch/ui-scan/analyze.cjs` turns that into the label, silent-grey and duplicate-setting
  findings below.
- **Severity.**
  - HIGH: the player changes something and nothing happens, with no sign why; or a disabled control gives no reason.
  - MED: the reason exists but only as a hover title or a static help line elsewhere; or one setting has two controls.
  - LOW: wording, case or label duplication that confuses but does not mislead.


Counts: 42 dependency rows from source, 46 controls greyed with no reason on screen (852×393 scan), 13
settings offered twice or labels repeated. The tables below merge them per screen. "Fix" is the shape of the fix,
not a decision on the look: grey with a visible reason line (the paint editor's pattern from #2841), move, merge, or
relabel.

## Settings › Controls

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | TILT SENSITIVITY `#pm-tiltsimple` stays live when STEERING INPUT is not TILT. It is also shown on desktop, where STEERING INPUT itself is hidden. | input.js:333, 1924; settings-controls.css:694-696 | grey + reason "Tilt steering only"; hide where tilt cannot exist |
| HIGH | THROTTLE HOLD / LATCH are ignored under TOUCH steering, which forces auto throttle; the note still says "HOLD: keep your thumb on GAS" | game.js:314, 2948 | grey HOLD/LATCH with reason under TOUCH |
| HIGH | LEFT-HANDED `#pm-mirror` stays live with no touch dock (desktop) | game.js:319, 2945-2950 | hide or grey without touch controls |
| HIGH | RESET THIS CONTROLLER PROFILE is greyed with no reason | scan | reason line ("No controller connected" / "Already default") |
| MED | TILT RANGE / STEER SMOOTHING / TILT CURVE stay live when not TILT; the only cue is the static heading "(tilt mode)" | input.js:333 | grey the group under its heading |
| MED | TOUCH SENSITIVITY / DRAG SMOOTHING / DRAG CURVE / DRAG AT SPEED stay live when not TOUCH; the only cue is the heading "(touch mode)" | input.js:1122, 1141, 1239 | same |
| MED | RECALIBRATE TILT greys when not tilt, and its help line `#pm-calib-help` is hidden in exactly that state | settings-controls.css:149 | show the help line while greyed |
| MED | One setting, two controls: DRIVING HELP is `#pm-helplevel` (Driving aids) and `#pm-help` (Advanced); TILT is FEEL › TILT SENSITIVITY and ADVANCED › TILT RANGE; RACING LINE `#pm-line` duplicates STEER ASSIST `#pm-linemode` | steer-tuning.js:847/758, 837/714, 852/767 | keep one control per setting; the other becomes a link |

## Settings › Driving aids

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| MED | LINE-SPEED CUE stays live while PREDICTIVE CUE is on; only static help explains it | game.js:4826 | grey with that sentence as the reason |
| MED | CONDITION-AWARE BRAKING CUES stays live with PREDICTIVE CUE OFF | brake-cue.js:71, 81 | grey + reason |
| MED | GEARS AUTO greys on touch without tilt; the reason is static help, not tied to the control | game.js:9489; scan | link the help as the reason |

## Settings › HUD & camera

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | STYLE, LAYOUT, MAP, GAPS, MIRROR and PANEL OPACITY stay live with HUD OFF | touch-controls.css:814; mirror-pass.js:277 | grey the HUD fold under HUD OFF |
| HIGH | LINE COLOUR / LINE OPACITY stay live with DRIVING LINE OFF, which is set on another screen (Race settings) | driving-line.js:239 | grey + reason "Driving line is OFF in Race settings" |
| HIGH | TURN CHASING stays live with an off-board camera | vantage.js:539-554 | grey + reason |
| HIGH | HUD switch greyed outside a race with no reason; Phone test recorder SHARE / COPY greyed with no reason | game.js:9001; scan | reason lines |
| MED | BUTTON SIZE / OPACITY stay live with no touch controls (desktop) | game.js:2945-2950 | hide or grey on desktop |
| MED | METRICS PAGE / SIDE / SIZE live with OVERLAY OFF; reason is a hover title only | metrics-overlay.js:552, 948 | visible reason |
| MED | VR RENDERER / VR DRIVING live with VR MODE OFF; title only | xr-plan.js:63; xr-opts.js:160, 174 | visible reason |
| MED | SPEED VIGNETTE (REDUCE MOTION) and PANEL OPACITY (HIGH CONTRAST) are overridden; static help only | feel.js:276; tokens.css:1096 | grey + the existing sentence |
| LOW | Two "SIZE" rows (METRICS and HUD MOVE & SIZE); row labels mix "HUD elements", "Phone test recorder", "Cockpit" with 23 UPPERCASE rows | scan | qualify and uppercase |

## Settings › Graphics

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| MED | UPSCALE does nothing at full RESOLUTION | glx.js:1129; scale.js:236, 292 | grey + reason |

## Settings › Appearance (and Appearance Studio, title layout)

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | Home camera does nothing for the Static / My photo scenes, and the shipped default is My photo | experience.js:406; appearance-studio.js:30 | grey + reason |
| HIGH | TITLE INTRO / REPLAY INTRO do nothing under REDUCE MOTION | title-fx.js:128, 192, 205 | grey + reason |
| HIGH | CAR DRAWING SIZE / LEFT-RIGHT / UP-DOWN do nothing with TITLE ART OFF | title.css:177; title-layout.js:482 | grey + reason |
| HIGH | APPLY PROFILE / DELETE (appearance profile) greyed with no reason | scan | reason line |
| MED | Six settings have two controls on this one page (General fold and Appearance Studio): Theme, Menu accent, Text size, UI size, High contrast, HUD accent. "Accent colour" labels both the menu and the HUD accent. | appearance-studio.js:297-298; index.html:1382-1447 | one control each; qualify the labels |
| MED | HUD style / layout / size also live in HUD & camera; Reduce motion also in Accessibility | appearance-studio.js:297-298; a11y-opts.js:122 | one home per setting |
| MED | EDIT ON TITLE SCREEN and the title-layout width −/+ greyed with no reason | title-layout.js:290, 473 | reason lines |

## Settings › Accessibility

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| LOW | Look-back latch exists twice as two mechanisms (A11Y HOLD/TOGGLE and CAMERA FEEL LOOK BACK LATCH); gas hold exists in A11Y and CONTROLS THROTTLE | a11y-opts.js:143-150; feel.js:400 | cross-reference or merge |

## Music & sound

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | 13 ENGINE TONE level sliders stay live while their own layer pill is off | engine.js (per layer, e.g. 1810, 1883, 1954) | grey each slider with its layer |
| HIGH | The whole ENGINE TONE fold (PROFILE, sliders, layers) stays live with SOUND EFFECTS or master sound off | engine.js:901, 393 | grey the fold + reason |
| HIGH | 8 voice PITCH / RATE sliders, the battle-tone previews and STOP TEST are greyed with no reason | scan | reason lines |
| MED | SPOTTER / RADIO FOCUS / RADIO VOICE / RADIO SOUND stay live with master sound off; the note sits under a different row | radio-voice.js:210, 238; panel.js:342 | grey + reason |
| MED | Two rows are both labelled "VOLUME" (music, effects); every engine layer's slider and pill share one word (TURBO, HARVEST, …) | index.html:1670, 1714, 1913-1979 | qualify ("MUSIC VOLUME", "TURBO LEVEL") |

## Spotify (sheet and Music & sound)

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | CONNECT, DISCONNECT, DEVICE, PLAYLIST, PLAY, PAUSE, CHECK ACCOUNT, OPEN PLAYER and REFRESH DEVICES greyed with no reason (no client id / not connected) | scan | one reason line per state |
| MED | Playlist and device pickers exist on two screens with the same handlers | index.html:2028-2036, 3265-3273 | one home |

## Race settings

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| MED | LAPS / WEATHER / TIME OF DAY greyed for the Daily challenge with no reason | race-settings.js:209-215 | reason "Set by today's challenge" |
| MED | GRID locked to QUALIFYING by Season setup with no reason | race-settings.js:231-240 | reason line |
| LOW | CUSTOM preset greyed with a title; a visible caption exists | race-settings.js:507-517 | — |

## Pause menu / practice

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | RESTART greyed in multiplayer and armed quali with no reason | game.js:9384 | reason line |
| MED | SAVE START / TRY AGAIN / REWIND 10s grey outside practice; the state line `#pm-practice-state` explains it but is not linked to the buttons | driving-coach.js:635-648; scan | aria-describedby to the state line |

## Photo Studio

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | SAVE PHOTO / DOWNLOAD PNG, CHOOSE PHOTO and the saved-photo tiles greyed with no reason | scan | reason ("Take a photo first", …) |
| MED | USE AS MENU BACKGROUND does nothing unless Appearance Scene is My photo; it says so only after the tap | photo-studio.js:451 | grey + reason up front |

## Track designer

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| MED | SPAN WIDTH −/+, TEST HERE, START HERE, DELETE POINT, clear / focus selection are `aria-disabled` with no reason (they need a selected point or span) | designer.js:1532, 1912-1913; scan | one reason line: "Select a point" |

## Garage (team tab) and HUD arrange

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| MED | Locked team card, locked driver chips and EDIT MY TEAM give their reason only as a hover title | setup-sheet.js:347-393 | visible reason |
| MED | HUD arrange visibility row greyed with only a title ("Shown automatically with race events") | hud-arrange.js:186-194 | use its own `hintEl` |

## Data hub and Saves & data

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| HIGH | Data hub export Download greyed with no reason | scan | reason line |
| MED | DOWNLOAD SESSION DATA greyed with no reason; "IMPORT CAREER BACKUP …" label repeated ×3 in one row | scan | reason line; distinct labels |

## Season setup and career

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| LOW | Calendar move up / down disabled at the list ends without a reason (self-evident) | scan | — |
| LOW | Raise the fitted cap: title says "Needs 1,300 cr more"; a visible "SHORT n cr" exists | career-ui.js:1114-1133 | — |

## Regression scripts

`scratch/ui-scan/scan.mjs` + `analyze.cjs` produced the scan rows (artifacts, regenerable). The paint editor's rule now
lives in a test (`livery-design.test.mjs`: every greyed row carries a visible, announced reason). A tree-wide "no
greyed control without a visible reason" spec is the follow-up for each screen's fix PR; the orchestrator assigns the
issues filed from this note.
