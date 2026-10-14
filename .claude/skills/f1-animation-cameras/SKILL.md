---
name: f1-animation-cameras
description: "Use when animation or camera motion needs work: garage pit-work arrivals, Flyby, broadcast cameras, follow-target blends, chase rigs, camera tuners, cuts that jump, WATCH/HIGHLIGHTS replay camera snaps, a stale follow anchor after a seek, follow change or exit. Lag measurement, stills, camera modes → playwright-probe."
---

# Animation and cameras in f1-game

Start with [the local game guide](references/game.md), then trace the named
motion or camera owner. Separate car/world state from camera interpolation;
measure the transition that prompted the change with a deterministic fixture.

`node tools/check/skill-smoke.mjs --skill f1-animation-cameras --check` exercises
the local chase-rig contract. Replay snaps and stale follow anchors (entry → seek →
follow → exit → reentry): [references/replay.md](references/replay.md)
(anchor owners `references/replay-diagnosis.md`, evidence contract `references/replay-workflow.md`). Camera
modes, still framing and measuring camera lag use **playwright-probe** `references/cameras.md`.
Flyby framing (cover, occlusion, sky, motion) has a no-browser node-VM report:
`node tools/shot/frame-report.mjs --track monza --frames 6` (MCP `apex_frame_report`); it covers Flyby only, not the director or mode cuts.
WATCH/HIGHLIGHTS loading the wrong driver or race is **data-hub**. Garage mesh/ownership uses **garage-parts-livery**. The parent owns every
browser; subagents can inspect fixture, source and recorded evidence.

Camera file owners and the cut-jump recipe: [references/cut-jump.md](references/cut-jump.md).
Host-adapter or connector gaps: `node tools/check/doctor.mjs --json --catalog <catalog.json>`.
