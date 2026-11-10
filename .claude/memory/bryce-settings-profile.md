---
name: bryce-settings-profile
description: "tests/data/settings-live-export-2026-11-09.json is Bryce's CURRENT Home Screen app settings (UI SIZE 61, HUD/BUTTON at default, custom HUD + title layout); the Oct 5 file is stale"
metadata:
  node_type: memory
  type: user
  originSessionId: 7f4f7d4c-f23b-5688-8570-e3eab0148639
  modified: 2026-11-10T02:50:00.000Z
---

`tests/data/settings-live-export-2026-11-09.json` is the settings export Bryce sent from his installed iPhone Home
Screen app on 2026-11-09 PT (build 25624, mode `all`). It is his real play profile. Read the file; the values that
differ from what everyone assumed: `uiScale` **61** (he changed it), `hudScale` / `hudBtnScale` / `hudBtnOpacity`
**null** (defaults, no longer 155 / 245 / 65), `resMode` "high" in the export (he said in chat he had set MED and that
his earlier screenshots were taken on LOW), `textSize` large, `uiContrast` high, `tlxForceGL` "0", `gfxPreset` medium,
a custom `titleLayout` (wide: buttons x 50, y -42, size 60, width 49; title x -50), a custom `hudLayout` v4 for HELMET
and other cameras, `hudElements` speed / gear / energy / ot / aero off, GAPS off, mirror on, HELMET cam (camMode 19),
steerMode buttons, home scene static.

`tests/data/settings-defaults-export.json` (2026-10-05, build 14012: hudScale 155, hudBtnScale 245, resMode low,
uiScale unset) is the OLD export. About 59 tests and tools pin to it, so it stays as a fixture, but it is no longer
his profile.

**Why:** on 2026-11-09 six sessions tested phone-UI fixes against the October file and could not reproduce his
screenshots; three inferred a stored UI SIZE near 51 %. The live export shows 61 and shows the HUD/BUTTON scales were
reset. Safari on the same phone has separate storage (defaults), measured over the phone bridge at 852x368 landscape.

**How to apply:** seed the live export for HUD / touch / menu / settings work and test that cell first, alongside
[[user-plays-on-phone]] and [[bryce-iphone-tlx-webgpu]]. Treat any export as a snapshot with a date: ask him for a
fresh one (SETTINGS export, pasted or uploaded in chat) before concluding what his phone stores.
