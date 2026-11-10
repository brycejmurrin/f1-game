---
name: bryce-settings-profile
description: "tests/data/settings-live-export-2026-11-10.json is Bryce's CURRENT Home Screen app settings (UI SIZE 70, BUTTON 143, per-screen looks set); he says the shipped phone sizes are too big"
metadata:
  node_type: memory
  type: user
  originSessionId: 7f4f7d4c-f23b-5688-8570-e3eab0148639
  modified: 2026-11-10T10:15:00.000Z
---

`tests/data/settings-live-export-2026-11-10.json` is the settings export Bryce sent from his installed iPhone Home
Screen app on 2026-11-10 (exportedAt 10:09:48Z, build 25715, mode `all`). It is his real play profile. Read the file.
In his words it holds "the settings I need to set to make it look playable and not way too big like you have it", so
the shipped phone sizes are too big for him, and this file is the target, not just a fixture.

Values to know: `uiScale` **70** (the touch default is 109 %), `hudBtnScale` **143.25**, `hudScale` null, `resMode`
"high", `gfxPreset` "high", `tlxForceGL` "0", `textSize` large, `uiContrast` **off**, `homeScene` static, HELMET cam
(camMode 19), steerMode buttons. Per-screen looks: pause `{btn 115, w 115}`, select `{w 125, tile 95}`, race
`{w 120, btn 90}`, garage `{btn 80, pw 110, stats hide}`, designer `{size 75}`; `layoutPreset` "shipped" with a custom
`titleLayout` (wide: buttons x 2, y 1, size 123, width 0). `hudElements` speed / gear / energy / ot / aero off, and a
custom `hudLayout` v4 for HELMET and other cameras.

`tests/data/settings-live-export-2026-11-09.json` (UI SIZE 61, buttons at default, gfx medium, high contrast) is the
previous snapshot; `tests/data/settings-defaults-export.json` (2026-10-05) is older still. Both stay as fixtures.

**Why:** on 2026-11-09 six sessions tested phone-UI fixes against a stale export and could not reproduce his
screenshots. His settings move day to day (UI SIZE 61 → 70 in one day), so a dated snapshot is the only truth.

**How to apply:** seed the newest live export for HUD / touch / menu / settings work and test that cell first, alongside
[[user-plays-on-phone]] and [[bryce-iphone-tlx-webgpu]]. When choosing phone defaults, move them toward this file's
sizes. Treat any export as a snapshot with a date: ask him for a fresh one (SETTINGS export, pasted or uploaded in
chat) before concluding what his phone stores.
