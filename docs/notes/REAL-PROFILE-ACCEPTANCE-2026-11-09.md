# Bryce's real phone profile — acceptance of the 2026-11-09 complaints

Kind: measurement · Re-measure-by: 2027-02-01 · Lane: PR `cursor/real-profile-acceptance-01db`

**Outcome, 2026-11-10: only the garage bar cap landed from this lane (PR #5297).** The default BUTTON SIZE 1.25 → 1
and `--tap` 54 → 58 described below were measured, passed CI, and were then DROPPED before landing: his 2026-11-10
export (`tests/data/settings-live-export-2026-11-10.json`) stores BUTTON SIZE 143 % and UI SIZE 70, so buttons at the
old default were not what he wanted smaller, and a stored size wins over any default anyway. Bryce chose "keep the
garage fix only" (relayed by the orchestrator's question tool, 21:09Z); the default sizes are #5358's to decide. Every
"after" number for the dock below is what a 100 % default WOULD paint, kept as evidence for that lane; the tree still
paints the "before" column. `tests/specs/real-profile-dock.spec.js` now holds only the garage bar.

Re-measured 2026-11-11 after the tip floored a phone's stored UI SIZE at 70 (`UI_PHONE_MIN`): at 852×393 + insets the
cap still does the work. His 2026-11-09 export (61 → 70 on boot): bar 424 → 288 (CAMERA 224 → 156, PHOTO 194 → 126).
His 2026-11-10 export (UI SIZE 70): bar 395 → 288 (210 → 156, 179 → 126). All chips 44 tall. The spec seeds the
2026-11-10 export for that reason; the 446 px of the original report needs UI SIZE 61, which a phone can no longer store.

First test of the owner's LIVE settings export (`tests/data/settings-live-export-2026-11-09.json`: UI SIZE 61,
HUD / BUTTON SIZE unset, TEXT large, custom v4 `hudLayout`, HELMET, BUTTONS steering). Six sessions earlier that day
tested the October file (HUD 155, BUTTON 245), which he no longer has.

Method: Chromium (software GPU), `npx serve`, iPhone UA, DPR 3, touch, `SettingsExport.applySettings(export)` then
reload (193 keys applied, 0 skipped), `Emulation.setSafeAreaInsetsOverride`. Windows: **A** 852×393 insets 59/59/21
with `navigator.standalone` and `(display-mode: standalone)` forced true; **B** 852×368 (his Safari tab over the phone
bridge); **C** 844×390 insets 47/47/21. Rects are painted CSS px from `getBoundingClientRect`. Not measured: a real
iPhone. His numbers come from 2000×923 screenshots (1 CSS px ≈ 2.35 image px).

## Ranked scorecard

| # | Complaint (his number) | Reproduced at his profile, window A (tip `01dbfc6`) | Fixed by | State |
|---|---|---|---|---|
| 1 | Race HUD "way too large": BOOST / OT / AERO / BRAKE / GAS ≈ 85, steer pad ≈ 185×100 | **Exact**: 85.4×85.4, pad 187×102. Same on a FRESH profile: it is the default, not a setting | this PR (default BUTTON SIZE 1.25 → 1) | fixed here: 72×72, pad 149×81 |
| 1b | minimap ≈ 127, timing strip ≈ 302×45, CAM / PAUSE | **Exact**: 128×128, 302×44, CAM 78×44, PAUSE 44×44 | nobody | open: these are his own `hudLayout` sizes at HUD SIZE 100 (tower 80 %); B paints the map 110 |
| 2 | ARRANGE HUD bar ≈ 715×217, selects ≈ 135×100 / 62×100 as empty boxes | Yes: bar 718×188 mid-screen, native selects 139×85 / 67×85 | #5203 @`eb41c62` | fixed there: bar 718×52 docked at the bottom, selects 128×44 / 76×44, `appearance: none` |
| 3 | Title: 13 uneven upright rows, not the 8-row italic menu | Partly: 11 rows, 17 upright buttons, **only at 393 tall**; B (368) paints 7 rows 2/2/2/2/2/3/4 | #5213 @`70352f5` | shape fixed (8 italic rows at A and B); **new finding**: his stored layout (buttons size 60, y −42) × UI 61 paints rows 18.6 px tall in y 8..175. Paint floor being added on #5213 |
| 4 | Pause sheet ≈ 215 wide, scrolls, no RESUME | Yes, **only at 393 tall**: sheet 256×356, scrolls 662 in 439, a DIV paints over RESUME; B: 464 wide, no scroll | #5207 (merged `6c356f1`) | fixed: 611×167, no scroller, RESUME 214×51 first and hittable, A and B |
| 5 | Garage CAMERA ≈ 108×51, PHOTO ≈ 80×71, ACTIVE AERO ≈ 266×51 | **Exact**: 109.8×52, 80.9×72.1, 267.4×52 | #5204 (merged `12632af`) + this PR | #5204 made all three 44 tall but stretched them: 234 / 206 / 446 wide at UI 61. Fixed here: bar capped at 288 (155 / 127 / 288) |
| 6 | Sliders "wonky and backwards" | not measured here | #5229 @`eb625b3` | open on #5229. It leaves his stored UI SIZE 61 alone (`--ui-scale` 0.61) and moves none of the rects above |
| 6b | 3D looked blocky | n/a: he was on RESOLUTION LOW, now HIGH (explicit) | #5205 | not his case any more; HUD rects identical on #5205 |

#5208 (safe-area) at `de6cdd4` changes none of the rects above at his profile.

## The dock, before and after (BUTTONS steering, BUTTON SIZE unset)

| window | button before → after | steer pad | taps column (BOOST / OT / AERO) |
|---|---|---|---|
| A 852×393 | 85.4 → 72 | 187×102 → 149×81 | 85×280 from y 82 → 72×236 from y 126 |
| B 852×368 | 76.7 → 64 | 167×92 → 133×73 | 77×254 from y 83 → 64×212 from y 125 |
| C 844×390 | 85 → 72 | 187×102 → 149×81 | 85×277 from y 82 → 72×236 from y 123 |

Why it was 85: in BUTTONS mode every dock button is the 72 px `--hold`; the 1.25 default asked for 90 and fitHud's
height cap (1.186) stopped it where the 3-high column filled all the room under CAM / PAUSE. A stored BUTTON SIZE
still wins: 125 % seeded on top of his export paints 85.4 again. `--tap` went 54 → 58 (57 on the small tier) so a
tilt / drag player's BOOST / OT / AERO stay over the ~15 mm floor at the new default.

No dock button overlaps a readout of his layout in A, B or C, before or after.

Re-measured 2026-11-10 by the PR's second owner (same method): A, B and C paint exactly the "after" column above.
Drag steering (his export + `steerMode: "touch"`), the mode that paints the small `--tap` rung:

| window | tap at the 100 % default | tap at BUTTON SIZE 200 % (fitHud-capped) | 200 % column |
|---|---|---|---|
| A 852×393 | 58 | 84.2 | y 94..362 of 372 |
| B 852×368 | 57 | 77.6 | y 90..337 of 347 |
| C 844×390 | 58 | 83.5 | y 93..359 of 359 |

The cap, not the raw slider, is what fits 200 % on these phones (three 58 px taps at 2× are 369 px). At 200 % in
drag mode BOOST overlaps his sector plate by 5 px (his stored +4.8 % offset). The cap is a height cap, so the old
54 px tap should land on the same rect; that was not measured on the old tree.

The garage cap also moves a profile that is not his: 844×390 with a mouse pointer and UI SIZE 100 % (the
`menu-baseline.spec.js` garage shot) paints the bar 288 wide at x 120 where it was 392 at x 16 (CAMERA 207 → 155,
PHOTO 179 → 127, ACTIVE AERO 392 → 288, all 44 tall; measured 2026-11-10 by deleting the rule in the live page).
That golden was re-blessed with the image CI itself rendered. A fresh TOUCH profile (UI 109 %) is unchanged at 255.

## Findings nobody asked for

1. **Title and pause broke only at 393 tall.** 852×368 was fine on the same tree. A test at one phone height is not a
   test of his phone.
2. **A fresh phone's readouts shrink with the default.** The top-right band hangs from the effective BUTTON SIZE
   (`--hud-btn-z`, css/hud.css), and fitHud fits the timing strip above the sector plate that hangs from it. Fresh
   profile, window A: strip box 88×54 → 77×47, minimap 109 → 95, sector plate 45×73 → 40×63. His profile does not move
   (his tower is already 80 %).
3. **His sector plate sits 31 px inside the right inset** (x 770..824 of 852, inset 59): his own stored offset
   (+4.8 %). Not moved here.
4. ARRANGE HUD reports `OVERLAP: FLAGS × GEAR, SPEED` on his layout (pieces he has switched off or that show on
   events). Not changed here.
5. Playwright's `locator.tap()` on PAUSE times out under software rendering on every tree ("waiting for stable");
   a raw `touchscreen.tap` opens the sheet. A harness limit, not a game bug.
