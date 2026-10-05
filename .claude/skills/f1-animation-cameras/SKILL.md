---
name: f1-animation-cameras
description: "Use when animation or camera motion needs work: garage pit-work arrivals, Flyby, broadcast cameras, follow-target blends, chase rigs, camera tuners, cuts that jump. Replay snaps after a seek → replay-camera; still shots/camera modes → playwright-probe."
---

# Animation and cameras in f1-game

Start with [the local game guide](references/game.md), then trace the named
motion or camera owner. Separate car/world state from camera interpolation;
measure the transition that prompted the change with a deterministic fixture.

`node tools/check/skill-smoke.mjs --skill f1-animation-cameras --check` exercises
the local chase-rig contract. Replay transitions use **replay-camera**; camera
modes and still framing use **playwright-probe** `references/cameras.md`.
Flyby framing (cover, occlusion, sky, motion) has a no-browser node-VM report:
`node tools/shot/frame-report.mjs --track monza --frames 6` (MCP `apex_frame_report`).
WATCH/HIGHLIGHTS loading the wrong driver or race is **data-hub**. Garage mesh/ownership uses **garage-parts-livery**. The parent owns every
browser; subagents can inspect fixture, source and recorded evidence.

The local guide is usable without a hosted skill package. External host skill
resources still require that host's callable adapter; local files do not repair
an inaccessible connector. `doctor.mjs --json --catalog <catalog.json>` records
which external capabilities were supplied and which remain unverified.
