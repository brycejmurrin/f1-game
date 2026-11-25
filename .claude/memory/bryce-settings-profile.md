---
name: bryce-settings-profile
description: "tests/data/settings-live-export-2026-11-25.json is Bryce's CURRENT Home Screen app settings (UI SIZE shipped, BUTTON 130, separate portrait/landscape shapes, exported in landscape); 11-10 had UI SIZE 70 — his sizes move, the newest dated file wins"
metadata:
  node_type: memory
  type: user
  originSessionId: 7f4f7d4c-f23b-5688-8570-e3eab0148639
  modified: 2026-11-25T10:45:00.000Z
---

`tests/data/settings-live-export-2026-11-25.json` is the settings export Bryce sent from his installed iPhone Home
Screen app on 2026-11-25 (exportedAt 10:32:13Z, build 29497, mode `all`, sent in session chat for #6583; it replaced
his 10:22Z export, made in portrait, ten minutes later). It is his
real play profile. Read the file. On 2026-11-10 he said the shipped phone sizes were "way too big"; that file
(`settings-live-export-2026-11-10.json`, UI SIZE 70, BUTTON 143.25) stays as the previous snapshot.

**Read the shapes first.** `appearanceShapes` is `{mode:"separate", live:"wide"}`: he exported in LANDSCAPE, so the
top-level keys are his landscape (iPhone 15 852×393) profile and `appearanceShapes.park` holds his PORTRAIT values. An
export made in portrait swaps the two (`live:"tall"`); check `live` before seeding.

Values to know (2026-11-25): `uiScale` **null** (shipped) in both shapes, `hudBtnScale` **130** in both,
`hudBtnShape` square, `hudPanelOpacity` 100, `portraitOk` "1", `gfxBackend` "three", `resMode` / `gfxPreset` "high",
`gfxSsao` "0", `textSize` normal, `uiContrast` **high**, `homeScene` photo, `appIcon` "A", HELMET cam (camMode 19,
visor clear, `cockpitSeat` fwd), steerMode buttons, a DualSense in `padProfiles`, `lightTune` set (103 KB, monaco
night and others). Steering moved: `steerRate` 6, `steerExpo` 7, `steerSpeed` 4, `adaptiveButtons` 10, `pace` **17**
(was 11), preset "custom". Landscape looks (top level): pause layout sidebar, race `{w 120, btn 90}`, garage `{btn 90, pw 125, ph 100,
stats hide}`, career `{dim soft}`, popups `{btn 135}`, datahub `{w 130}`, designer `{size 75, text large}`; portrait
(`park`) has garage `{btn 100, pw 115, ph 60}`, designer text small, pause layout grid. Title layout: wide buttons y 4 size
100, title size 85, art size 76; tall buttons size 105, art size 130. The file also carries 33 TT boards and 2 custom
circuits.

Changed vs 2026-11-10: UI SIZE 70 → shipped, BUTTON 143.25 → 130, contrast off → high, text large → normal, home
scene static → photo, pace 11 → 17, music on → off, and a second (portrait) shape now exists. The 11-10 per-screen
looks (pause, select) are gone or moved into the shapes. Older snapshots: `settings-live-export-2026-11-09.json` (UI
SIZE 61) and `settings-defaults-export.json` (2026-10-05).

**Why:** on 2026-11-09 six sessions tested phone-UI fixes against a stale export and could not reproduce his
screenshots. His settings move between snapshots (UI SIZE 61 → 70 → shipped), so a dated snapshot is the only truth.
`tools/lib/bryce-phone.mjs` still pins the 11-10 file (a code change, not made in the #6583 intake).

**How to apply:** seed the newest live export (the shape `live` names is the top level) for HUD / touch / menu / settings
work and test that cell first, alongside [[user-plays-on-phone]] and [[bryce-iphone-tlx-webgpu]]. Treat any export as
a snapshot with a date: ask him for a fresh one (SAVES & DATA › SAVE ALL SETTINGS, pasted or attached in chat or on
an intake issue) before concluding what his phone stores.
