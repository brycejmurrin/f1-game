---
name: bryce-desktop-macbook
description: "The owner's desktop is a 16-inch MacBook Pro (2024, M4): full display 1728x1117 CSS px at DPR 2 (3456x2234 panel); menus default to UI SIZE 115% there"
metadata:
  node_type: memory
  type: user
  source: user (2026-11-20 "save the new phone and desktop pixel layouts 5977"), PR #5977
  modified: 2026-11-25T01:30:00Z
---

The owner's desktop is a **16-inch MacBook Pro (2024, M4 Pro or M4 Max)** (PR #5977, Bryce 2026-11-20). Pixel layout:
- Panel 3456 x 2234. The default Retina setting gives a logical desktop of 1728 x 1117 CSS px at DPR 2.
- A real browser window is smaller (browser chrome, macOS menu bar, window size). To reproduce one exactly, record
  `innerWidth`, `innerHeight` and `devicePixelRatio` on the machine.
- From #5977: a fine-pointer viewport of at least 1600 x 900 CSS px defaults menus to UI SIZE 115%. A saved UI SIZE
  wins, and resetting it restores the viewport default.
- Full-display capture after #5977: `node tools/ui/layout-audit.mjs --screen=<screen> --viewport=desktop-macbook-pro-16-m4`.

He also plays the desktop with his phone as the controller (phone-as-controller pairing, 2026-11-20 report).

Measured over Claude Link on 2026-11-25 (#6416, #6417): he runs Chrome 159 and the installed app at **175% page zoom**
(dpr 3.5, CSS viewport ~987 px wide) with **RESOLUTION MAX** stored, both by choice. When told MAX costs ~45 fps in a
race (vs ~120 at lower resolution on the 120 Hz panel), he said: "I set max but don't worry about it." Don't flag MAX
or the zoom as problems; measure desktop defaults (AUTO) separately.

**How to apply:** a desktop UI report reproduces at 1728x1117 @2x with a mouse first, not the 1280x720 default. Phone
layout: [User plays on a phone](user-plays-on-phone.md).
